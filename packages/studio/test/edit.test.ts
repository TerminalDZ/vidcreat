import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { applyOps, EditError, History, parseOps } from '../src/server/edit.js';

const SRC = `# my episode
meta:
  id: ep1 # keep me
  title: 'Old'
script:
  - text: 'Hello there'
scenes:
  - id: one
    at: l1
    elements:
      - use: title
        id: t1
        props: { text: 'Hi' }
        enter: { at: l1, anim: pop }
      - use: chip
        id: c1
        props: { text: 'x' }
`;

describe('applyOps', () => {
  it('sets scalars in place and keeps comments and quoting', () => {
    const out = applyOps(SRC, [{ op: 'set', path: ['meta', 'title'], value: 'New' }]);
    expect(out).toContain('# my episode');
    expect(out).toContain('id: ep1 # keep me');
    expect(out).toContain("title: 'New'");
  });

  it('creates missing containers as compact flow maps', () => {
    const out = applyOps(SRC, [{ op: 'set', path: ['scenes', 0, 'elements', 0, 'place', 'x'], value: 40 }]);
    expect(out).toMatch(/place: \{ ?x: 40 ?\}/);
    expect(parse(out).scenes[0].elements[0].place).toEqual({ x: 40 });
  });

  it('replaces whole values, deletes and prunes empty containers', () => {
    let out = applyOps(SRC, [
      { op: 'set', path: ['scenes', 0, 'elements', 0, 'place'], value: { x: 1, y: 2, w: 3, h: 4 } },
    ]);
    expect(parse(out).scenes[0].elements[0].place).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    out = applyOps(out, [
      { op: 'delete', path: ['scenes', 0, 'elements', 0, 'enter', 'at'] },
      { op: 'delete', path: ['scenes', 0, 'elements', 0, 'enter', 'anim'] },
    ]);
    expect(parse(out).scenes[0].elements[0].enter).toBeUndefined();
  });

  it('inserts and moves list items', () => {
    let out = applyOps(SRC, [
      {
        op: 'insert',
        path: ['scenes', 0, 'elements'],
        index: 0,
        value: { use: 'label', id: 'l0', props: { text: 'L' } },
      },
    ]);
    expect(parse(out).scenes[0].elements.map((e: { id: string }) => e.id)).toEqual(['l0', 't1', 'c1']);
    expect(out).toMatch(/- use: label\n\s+id: l0/); // elements are block maps
    out = applyOps(out, [{ op: 'move', path: ['scenes', 0, 'elements'], from: 0, to: 2 }]);
    expect(parse(out).scenes[0].elements.map((e: { id: string }) => e.id)).toEqual(['t1', 'c1', 'l0']);
    out = applyOps(out, [
      { op: 'insert', path: ['scenes', 0, 'elements', 0, 'fx'], value: { at: 'l1', do: 'pulse' } },
    ]);
    expect(parse(out).scenes[0].elements[0].fx).toEqual([{ at: 'l1', do: 'pulse' }]);
  });

  it('rejects broken documents and bad paths', () => {
    expect(() => applyOps('a: [', [{ op: 'set', path: ['a'], value: 1 }])).toThrow(EditError);
    expect(() => applyOps(SRC, [{ op: 'move', path: ['meta'], from: 0, to: 1 }])).toThrow(/not a list/);
    expect(() => parseOps({ ops: [{ op: 'set', path: ['a b'], value: 1 }] })).toThrow(/Invalid path/);
    expect(() => parseOps({ ops: [{ op: 'set', path: [], value: 1 }] })).toThrow();
    expect(() => parseOps({ ops: [{ op: 'nuke', path: ['a'] }] })).toThrow(/Unknown op/);
    expect(() => parseOps({ ops: [] })).toThrow();
  });
});

describe('History', () => {
  it('undoes and redoes writes, and refuses when the file changed outside', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'rf-hist-'));
    const f = path.join(dir, 'episode.yaml');
    writeFileSync(f, 'a: 1\n');
    const h = new History();
    h.write(f, 'a: 2\n', 'two');
    h.write(f, 'a: 3\n', 'three');
    expect(h.counts).toMatchObject({ undo: 2, redo: 0, undoLabel: 'three' });
    expect(h.undo()).toBe('three');
    expect(readFileSync(f, 'utf8')).toBe('a: 2\n');
    expect(h.redo()).toBe('three');
    expect(readFileSync(f, 'utf8')).toBe('a: 3\n');
    expect(h.undo()).toBe('three');
    h.write(f, 'a: 9\n', 'nine'); // a new edit clears redo
    expect(h.counts.redo).toBe(0);
    writeFileSync(f, 'a: 100\n'); // edited in another editor
    expect(() => h.undo()).toThrow(/changed outside/);
    expect(h.counts.undo).toBe(0);
    expect(readFileSync(f, 'utf8')).toBe('a: 100\n');
  });
});
