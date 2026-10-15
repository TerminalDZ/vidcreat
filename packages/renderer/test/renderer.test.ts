import { writeFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { everyTimes, mp4Atoms, shareVideoKbps, splitRanges } from '../src/index.js';

describe('renderer helpers', () => {
  it('implements the share bitrate formula (FR-REN-6)', () => {
    expect(shareVideoKbps(28, 120)).toBe(Math.floor((28 * 8192 * 0.97) / 120) - 128);
    expect(shareVideoKbps(28, 60, 128)).toBe(3580);
  });
  it('splits frames into contiguous ranges covering everything once (FR-REN-1)', () => {
    const r = splitRanges(0, 3601, 7, (i) => `s${i}`);
    expect(r[0].from).toBe(0);
    expect(r[r.length - 1].to).toBe(3601);
    for (let i = 1; i < r.length; i++) expect(r[i].from).toBe(r[i - 1].to);
    expect(splitRanges(10, 12, 8, String)).toHaveLength(2);
  });
  it('lists snap times', () => {
    expect(everyTimes(12, 5)).toEqual([0, 5, 10]);
  });
  it('reads top-level MP4 atoms (faststart check)', () => {
    const atom = (type: string, size: number) => {
      const b = Buffer.alloc(size);
      b.writeUInt32BE(size, 0);
      b.write(type, 4, 'latin1');
      return b;
    };
    const f = path.join(mkdtempSync(path.join(os.tmpdir(), 'rf-')), 'x.mp4');
    writeFileSync(f, Buffer.concat([atom('ftyp', 24), atom('moov', 40), atom('mdat', 64)]));
    expect(mp4Atoms(f)).toEqual(['ftyp', 'moov', 'mdat']);
  });
});
