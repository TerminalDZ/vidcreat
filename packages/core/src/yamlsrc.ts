/** YAML parsing that keeps source positions, so every issue can point at file:line:col. */
import { isMap, isSeq, LineCounter, parseDocument, type Document, type Node } from 'yaml';
import type { Issue, SourcePos } from './types.js';

export interface YamlSource {
  file: string;
  doc: Document.Parsed;
  lines: LineCounter;
  data: unknown;
  errors: Issue[];
}

export function parseYaml(text: string, file: string): YamlSource {
  const lines = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lines, prettyErrors: true, uniqueKeys: true });
  const errors: Issue[] = [];
  for (const e of [...doc.errors, ...doc.warnings]) {
    const pos = e.linePos?.[0];
    errors.push({
      rule: 'V-1',
      level: doc.errors.includes(e as never) ? 'error' : 'warn',
      message: `YAML ${e.code === 'DUPLICATE_KEY' ? 'duplicate key' : 'syntax error'}: ${e.message.split('\n')[0]}`,
      hint: 'Check indentation and quoting; strings containing ":" or "#" must be quoted.',
      file,
      line: pos?.line,
      col: pos?.col,
    });
  }
  const data = doc.errors.length ? undefined : doc.toJS({ maxAliasCount: 100 });
  return { file, doc, lines, data, errors };
}

/** Position of the node at `path` (walks up to the nearest existing ancestor). */
export function posAt(src: YamlSource, path: (string | number)[], key = false): SourcePos | undefined {
  for (let n = path.length; n >= 0; n--) {
    const p = path.slice(0, n);
    let node: unknown = p.length ? src.doc.getIn(p, true) : src.doc.contents;
    if (key && n === path.length && n > 0) {
      // Prefer the key's own position for "unknown key" style issues.
      const parent = src.doc.getIn(path.slice(0, -1), true);
      if (isMap(parent)) {
        const pair = parent.items.find((it) => (it.key as { value?: unknown })?.value === path[n - 1]);
        if (pair?.key) node = pair.key;
      }
    }
    const range = (node as Node | undefined)?.range;
    if (range) {
      const lp = src.lines.linePos(range[0]);
      return { line: lp.line, col: lp.col };
    }
  }
  return undefined;
}

/** Position of an unknown key inside the map at `path`. */
export function keyPos(src: YamlSource, path: (string | number)[], keyName: string): SourcePos | undefined {
  const parent = path.length ? src.doc.getIn(path, true) : src.doc.contents;
  if (isMap(parent)) {
    const pair = parent.items.find((it) => (it.key as { value?: unknown })?.value === keyName);
    const range = (pair?.key as Node | undefined)?.range;
    if (range) {
      const lp = src.lines.linePos(range[0]);
      return { line: lp.line, col: lp.col };
    }
  }
  return posAt(src, path);
}

export const isYamlSeq = isSeq;

export function formatPath(path: (string | number)[]): string {
  return path.map((p, i) => (typeof p === 'number' ? `[${p}]` : i ? `.${p}` : p)).join('');
}
