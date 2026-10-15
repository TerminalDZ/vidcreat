import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { compileEpisode, episodePaths, INSTALL_ROOT, type Timeline } from '@reelforge/core';

export const ROOT = INSTALL_ROOT;
export const UPDATE = Boolean(process.env.UPDATE_GOLDEN);

export function timelineOf(rel: string): Timeline {
  const r = compileEpisode(episodePaths(path.join(ROOT, rel), ROOT), { voice: null });
  if (!r.timeline) throw new Error(`cannot compile ${rel}: ${r.issues.map((i) => i.message).join('; ')}`);
  return r.timeline;
}

/** 2× box-filter downscale (golden PNGs are stored at 540×960). */
export function downscale(png: PNG): PNG {
  const w = png.width >> 1;
  const h = png.height >> 1;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 4; c++) {
        const p = (yy: number, xx: number) => png.data[((yy * png.width + xx) << 2) + c];
        out.data[((y * w + x) << 2) + c] =
          (p(2 * y, 2 * x) + p(2 * y, 2 * x + 1) + p(2 * y + 1, 2 * x) + p(2 * y + 1, 2 * x + 1) + 2) >> 2;
      }
  return out;
}

/**
 * Compares a frame with its golden PNG (pixelmatch threshold 0.1, ≤ 0.2% differing pixels).
 * With UPDATE_GOLDEN=1 (or a missing golden) the reference is (re)written.
 */
export function matchGolden(frame: Buffer, file: string): { ratio: number; written: boolean } {
  const img = downscale(PNG.sync.read(frame));
  if (UPDATE || !existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, PNG.sync.write(img));
    return { ratio: 0, written: true };
  }
  const ref = PNG.sync.read(readFileSync(file));
  if (ref.width !== img.width || ref.height !== img.height) return { ratio: 1, written: false };
  const diff = new PNG({ width: img.width, height: img.height });
  const n = pixelmatch(img.data, ref.data, diff.data, img.width, img.height, { threshold: 0.1 });
  const ratio = n / (img.width * img.height);
  if (ratio > 0.002) writeFileSync(file.replace(/\.png$/, '.diff.png'), PNG.sync.write(diff));
  return { ratio, written: false };
}
