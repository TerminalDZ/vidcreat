/**
 * Structured editing of episode.yaml for the visual editor. Operations address nodes by path
 * (`['scenes', 2, 'elements', 0, 'place', 'x']`) and are applied to the YAML document model, so
 * comments, key order and quoting of untouched values survive. Every write is recorded in an
 * undo/redo history that also covers cues.json.
 */
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isCollection, isMap, isScalar, isSeq, parseDocument, type Document, type Node } from 'yaml';

export type EditPath = (string | number)[];

export type EditOp =
  | { op: 'set'; path: EditPath; value: unknown }
  | { op: 'delete'; path: EditPath }
  | { op: 'insert'; path: EditPath; index?: number; value: unknown }
  | { op: 'move'; path: EditPath; from: number; to: number };

export class EditError extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);
  }
}

const KEY = /^[$A-Za-z0-9_-]{1,64}$/;
/** Containers that are removed when an edit leaves them empty. */
const PRUNE = new Set(['enter', 'exit', 'place', 'size', 'publish']);

function checkPath(p: unknown, what = 'path'): EditPath {
  if (!Array.isArray(p) || p.length > 16) throw new EditError(`Invalid ${what}`);
  for (const k of p) {
    if (typeof k === 'number' ? !Number.isInteger(k) || k < 0 : typeof k !== 'string' || !KEY.test(k))
      throw new EditError(`Invalid ${what} segment ${JSON.stringify(k)}`);
  }
  return p as EditPath;
}

export function parseOps(body: unknown): EditOp[] {
  const ops = (body as { ops?: unknown })?.ops;
  if (!Array.isArray(ops) || !ops.length || ops.length > 200) throw new EditError('Expected { ops: [...] }');
  return ops.map((o: Record<string, unknown>) => {
    const p = checkPath(o?.path);
    switch (o?.op) {
      case 'set':
        if (!p.length) throw new EditError('Cannot replace the whole document');
        return { op: 'set', path: p, value: o.value };
      case 'delete':
        if (!p.length) throw new EditError('Cannot delete the whole document');
        return { op: 'delete', path: p };
      case 'insert':
        return {
          op: 'insert',
          path: p,
          index: typeof o.index === 'number' ? o.index : undefined,
          value: o.value,
        };
      case 'move':
        if (typeof o.from !== 'number' || typeof o.to !== 'number') throw new EditError('move needs from/to');
        return { op: 'move', path: p, from: o.from, to: o.to };
      default:
        throw new EditError(`Unknown op ${JSON.stringify(o?.op)}`);
    }
  });
}

/** Builds a node; small scalar-only maps and lists use the compact flow style ({ x: 1, y: 2 }). */
function makeNode(doc: Document, value: unknown): Node {
  const node = doc.createNode(value) as Node;
  const compact = (n: unknown): boolean => {
    if (!isCollection(n)) return true;
    const items = n.items.map((it) => (isMap(n) ? (it as { value: unknown }).value : it));
    const flat = items.every((v) => isScalar(v) || (isCollection(v) && compact(v) && v.items.length <= 4));
    if (flat && JSON.stringify(n.toJSON()).length <= 90) n.flow = true;
    for (const v of items) compact(v);
    return flat;
  };
  compact(node);
  return node;
}

function getNode(doc: Document, p: EditPath): unknown {
  return p.length ? doc.getIn(p, true) : doc.contents;
}

function applyOne(doc: Document, op: EditOp): void {
  const { path: p } = op;
  if (op.op === 'set') {
    // Create missing ancestors as one compact node: place: { x: 10 } rather than a block map.
    for (let k = 1; k < p.length; k++) {
      const parent = getNode(doc, p.slice(0, k));
      if (parent === undefined || parent === null || isScalar(parent)) {
        if (typeof p[k] === 'number') throw new EditError(`Missing list at ${p.slice(0, k).join('.')}`);
        let value: unknown = op.value;
        for (let j = p.length - 1; j >= k; j--) value = { [p[j]]: value };
        setAt(doc, p.slice(0, k), value);
        return;
      }
      if (!isCollection(parent)) throw new EditError(`Cannot edit inside ${p.slice(0, k).join('.')}`);
    }
    setAt(doc, p, op.value);
    return;
  }
  if (op.op === 'delete') {
    if (getNode(doc, p) === undefined) return;
    doc.deleteIn(p);
    // Drop containers the edit left empty (enter: {} is noise).
    for (let k = p.length - 1; k > 0; k--) {
      const key = p[k - 1];
      const n = getNode(doc, p.slice(0, k));
      if (typeof key === 'string' && PRUNE.has(key) && isCollection(n) && n.items.length === 0)
        doc.deleteIn(p.slice(0, k));
      else break;
    }
    return;
  }
  let seq = getNode(doc, p);
  if (seq === undefined && op.op === 'insert') {
    setAt(doc, p, []);
    seq = getNode(doc, p);
  }
  if (!isSeq(seq)) throw new EditError(`${p.join('.') || 'document'} is not a list`);
  if (op.op === 'insert') {
    const i = Math.max(0, Math.min(seq.items.length, op.index ?? seq.items.length));
    const node = makeNode(doc, op.value);
    // Elements and scenes read best as block maps, even when small.
    if (isMap(node) && (p.at(-1) === 'elements' || p.at(-1) === 'scenes')) node.flow = false;
    seq.items.splice(i, 0, node);
    return;
  }
  const n = seq.items.length;
  if (op.from < 0 || op.from >= n || op.to < 0 || op.to >= n) throw new EditError('move index out of range');
  const [item] = seq.items.splice(op.from, 1);
  seq.items.splice(op.to, 0, item);
}

function setAt(doc: Document, p: EditPath, value: unknown): void {
  const existing = getNode(doc, p);
  const scalarValue = value === null || ['string', 'number', 'boolean'].includes(typeof value);
  if (isScalar(existing) && scalarValue) {
    existing.value = value; // keeps quoting style and comments
    return;
  }
  if (p.length === 1) {
    (doc as Document).set(p[0], makeNode(doc, value));
    return;
  }
  const parent = getNode(doc, p.slice(0, -1));
  const key = p[p.length - 1];
  if (isSeq(parent) && typeof key === 'number') {
    if (key > parent.items.length) throw new EditError('list index out of range');
    parent.items[key] = makeNode(doc, value);
    return;
  }
  if (isMap(parent)) {
    parent.set(key, makeNode(doc, value));
    return;
  }
  throw new EditError(`Cannot set ${p.join('.')}`);
}

/** Applies the operations to the YAML text and returns the new text. */
export function applyOps(text: string, ops: EditOp[]): string {
  const doc = parseDocument(text);
  if (doc.errors.length)
    throw new EditError('episode.yaml has syntax errors; fix them in your editor first', 409);
  for (const op of ops) applyOne(doc, op);
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}

interface Change {
  file: string;
  before: string | null;
  after: string;
  label: string;
}

/** Undo/redo history across the files the studio writes (episode.yaml, cues.json). */
export class History {
  private undoStack: Change[] = [];
  private redoStack: Change[] = [];
  constructor(private limit = 200) {}

  get counts() {
    return {
      undo: this.undoStack.length,
      redo: this.redoStack.length,
      undoLabel: this.undoStack.at(-1)?.label,
      redoLabel: this.redoStack.at(-1)?.label,
    };
  }

  /** Writes `after` atomically and records the change. */
  write(file: string, after: string, label: string): void {
    const before = existsSync(file) ? readFileSync(file, 'utf8') : null;
    if (before === after) return;
    atomicWrite(file, after);
    this.undoStack.push({ file, before, after, label });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(): string | null {
    return this.step(this.undoStack, this.redoStack, 'undo');
  }

  redo(): string | null {
    return this.step(this.redoStack, this.undoStack, 'redo');
  }

  private step(from: Change[], to: Change[], dir: 'undo' | 'redo'): string | null {
    const c = from.pop();
    if (!c) return null;
    const current = existsSync(c.file) ? readFileSync(c.file, 'utf8') : null;
    const expected = dir === 'undo' ? c.after : c.before;
    if (current !== expected) {
      // The file was edited outside the studio: older history no longer applies.
      this.undoStack = [];
      this.redoStack = [];
      throw new EditError(`${path.basename(c.file)} changed outside the studio; history was cleared`, 409);
    }
    const target = dir === 'undo' ? c.before : c.after;
    // A change that created the file is undone by removing it again.
    if (target === null) rmSync(c.file, { force: true });
    else atomicWrite(c.file, target);
    to.push(c);
    return c.label;
  }
}

function atomicWrite(file: string, text: string): void {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}
