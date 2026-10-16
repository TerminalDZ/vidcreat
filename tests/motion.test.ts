/**
 * Rendered motion is smooth: slow movements advance by sub-pixel amounts every frame instead of
 * snapping to whole pixels (which reads as stutter), and the mask of `reveal` keeps text below
 * its final edge hidden. Positions are measured from the pixels by 1-D cross-correlation.
 */
import path from 'node:path';
import type { Browser } from 'playwright';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCapturer, launchBrowser, openRuntime } from '@reelforge/renderer';
import { timelineOf } from './helpers.js';

let browser: Browser;
beforeAll(async () => {
  browser = await launchBrowser();
});
afterAll(async () => {
  await browser?.close();
});

type Box = { x0: number; y0: number; x1: number; y1: number };

/** Normalized brightness profile of a region, summed across `axis` ('y' → profile along y). */
function profile(png: PNG, b: Box, along: 'x' | 'y'): number[] {
  const n = along === 'y' ? b.y1 - b.y0 : b.x1 - b.x0;
  const out = new Array<number>(n).fill(0);
  for (let y = b.y0; y < b.y1; y++)
    for (let x = b.x0; x < b.x1; x++) {
      const i = (y * png.width + x) << 2;
      const v = png.data[i] * 0.299 + png.data[i + 1] * 0.587 + png.data[i + 2] * 0.114;
      out[along === 'y' ? y - b.y0 : x - b.x0] += v;
    }
  const mean = out.reduce((s, v) => s + v, 0) / n;
  const c = out.map((v) => v - mean);
  const norm = Math.hypot(...c) || 1;
  return c.map((v) => v / norm);
}

/** Sub-pixel shift of `p` relative to `ref` (parabolic peak of the cross-correlation). */
function shift(p: number[], ref: number[]): number {
  const n = ref.length;
  let best = -Infinity;
  let bi = 0;
  const corr = (lag: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const j = i - lag;
      if (j >= 0 && j < n) s += p[i] * ref[j];
    }
    return s;
  };
  for (let lag = -120; lag <= 120; lag++) {
    const c = corr(lag);
    if (c > best) {
      best = c;
      bi = lag;
    }
  }
  const [a, b, c] = [corr(bi - 1), best, corr(bi + 1)];
  const den = a - 2 * b + c;
  return bi + (den ? (0.5 * (a - c)) / den : 0);
}

describe('rendered motion (fixtures/motion)', () => {
  it('moves by smooth sub-pixel steps that shrink steadily (no pixel-snapping stutter)', async () => {
    const tl = timelineOf('fixtures/motion');
    const rp = await openRuntime(browser, tl);
    const cap = await createCapturer(rp.page, { format: 'png', quality: 100 });
    const fps = 30;
    const frames: PNG[] = [];
    // from 40% of the rise (fully opaque by then) to past the end
    for (let i = 14; i <= 42; i++) frames.push(PNG.sync.read(await cap.frame(1 + i / fps)));
    await rp.page.close();

    const riseBox: Box = { x0: 0, y0: 290, x1: 1080, y1: 640 };
    const ref = profile(frames[frames.length - 1], riseBox, 'y');
    const ys = frames.map((f) => shift(profile(f, riseBox, 'y'), ref));
    const steps = ys.slice(1).map((v, i) => v - ys[i]);
    // rise moves up monotonically and decelerates; no frame stalls and then jumps
    for (const s of steps) expect(s).toBeLessThanOrEqual(0.15);
    const jerk = steps.slice(1).map((v, i) => Math.abs(v - steps[i]));
    expect(Math.max(...jerk), `steps: ${steps.map((s) => s.toFixed(2)).join(' ')}`).toBeLessThan(0.75);
    expect(Math.abs(ys[ys.length - 1])).toBeLessThan(0.05);
  });

  it('reveal keeps the text inside its final box while it rises', async () => {
    const tl = timelineOf('fixtures/motion');
    const rp = await openRuntime(browser, tl);
    const cap = await createCapturer(rp.page, { format: 'png', quality: 100 });
    const el = tl.scenes[0].elements.find((e) => e.id === 'reveal')!;
    const bottom = tl.scenes[0].origin.y + el.box.y + el.box.h;
    for (const t of [1.1, 1.3, 1.6]) {
      const png = PNG.sync.read(await cap.frame(t));
      let bright = 0;
      for (let y = bottom + 4; y < bottom + 120; y++)
        for (let x = 60; x < 900; x++) if (png.data[((y * png.width + x) << 2) + 1] > 180) bright++;
      expect(bright, `t=${t}`).toBeLessThan(40);
    }
    await rp.page.close();
  });
});
