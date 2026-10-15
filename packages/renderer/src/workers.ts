/** Parallel frame-range workers (FR-REN-1…3, NFR-5): Chromium → JPEG → ffmpeg segment per worker. */
import { rmSync } from 'node:fs';
import type { Timeline } from '@reelforge/core';
import type { Browser } from 'playwright';
import { createCapturer } from './capture.js';
import { spawnPipe } from './ffmpeg.js';
import { launchBrowser, openRuntime } from './host.js';

export interface FrameRange {
  index: number;
  from: number; // inclusive frame
  to: number; // exclusive frame
  file: string;
}

export function splitRanges(from: number, to: number, workers: number, file: (i: number) => string): FrameRange[] {
  const n = Math.max(1, Math.min(workers, to - from));
  const size = Math.ceil((to - from) / n);
  const out: FrameRange[] = [];
  for (let i = 0; i < n; i++) {
    const a = from + i * size;
    const b = Math.min(to, a + size);
    if (b > a) out.push({ index: i, from: a, to: b, file: file(i) });
  }
  return out;
}

export interface WorkerOptions {
  tl: Timeline;
  assetsDir?: string;
  format: 'jpeg' | 'png';
  quality: number;
  signal?: AbortSignal;
  onFrame: () => void;
}

/** Renders one range into an intermediate x264 segment (CRF 14, veryfast). */
export async function renderRange(range: FrameRange, o: WorkerOptions): Promise<void> {
  let browser: Browser | undefined;
  const ff = spawnPipe([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'image2pipe',
    '-framerate',
    String(o.tl.fps),
    '-c:v',
    o.format === 'png' ? 'png' : 'mjpeg',
    '-i',
    '-',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '14',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(o.tl.fps),
    range.file,
  ]);
  let stderr = '';
  ff.stderr?.setEncoding('utf8').on('data', (d: string) => (stderr += d));
  const done = new Promise<void>((resolve, reject) => {
    ff.on('error', (e) => reject(new Error(`Cannot start ffmpeg: ${e.message}`)));
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg (segment ${range.index}) exited with ${code}: ${stderr.trim().slice(-400)}`))));
  });
  done.catch(() => undefined);
  const write = (buf: Buffer) =>
    new Promise<void>((resolve, reject) => {
      if (!ff.stdin || ff.stdin.destroyed) return reject(new Error('ffmpeg input closed'));
      ff.stdin.write(buf, (err) => (err ? reject(err) : resolve()));
    });
  try {
    browser = await launchBrowser();
    const rp = await openRuntime(browser, o.tl, o.assetsDir);
    const cap = await createCapturer(rp.page, { format: o.format, quality: o.quality });
    for (let f = range.from; f < range.to; f++) {
      if (o.signal?.aborted) throw new Error('Aborted');
      const buf = await cap.frame(f / o.tl.fps);
      await write(buf);
      o.onFrame();
    }
    if (rp.blocked.length) throw new Error(`Network access attempted (NFR-8): ${rp.blocked.slice(0, 3).join(', ')}`);
    ff.stdin?.end();
    await done;
  } catch (e) {
    ff.stdin?.destroy();
    ff.kill('SIGKILL');
    rmSync(range.file, { force: true });
    throw e;
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

/** Runs all ranges in parallel; a crashed range is retried once (NFR-5). */
export async function renderAll(ranges: FrameRange[], o: WorkerOptions & { onRetry?: (r: FrameRange, e: Error) => void }): Promise<void> {
  await Promise.all(
    ranges.map(async (r) => {
      let counted = 0;
      const opts = { ...o, onFrame: () => (counted++, o.onFrame()) };
      try {
        await renderRange(r, opts);
      } catch (e) {
        if (o.signal?.aborted) throw e;
        o.onRetry?.(r, e as Error);
        // Roll the progress back for the frames of the failed attempt.
        const retryOpts = { ...o, onFrame: () => (counted > 0 ? counted-- : o.onFrame()) };
        try {
          await renderRange(r, retryOpts);
        } catch (e2) {
          throw new Error(`Worker for frames ${r.from}–${r.to - 1} failed twice: ${(e2 as Error).message}`);
        }
      }
    }),
  );
}
