/** `reelforge snap`: PNG frames at given times plus a contact-sheet JPEG (FR-CLI-6). */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Timeline } from '@reelforge/core';
import { createCapturer } from './capture.js';
import { run } from './ffmpeg.js';
import { launchBrowser, openRuntime } from './host.js';

export interface SnapResult {
  frames: string[];
  sheet?: string;
}

export async function snapFrames(
  tl: Timeline,
  times: number[],
  outDir: string,
  opts: { assetsDir?: string; sheet?: boolean } = {},
): Promise<SnapResult> {
  mkdirSync(outDir, { recursive: true });
  const browser = await launchBrowser();
  const frames: string[] = [];
  try {
    const rp = await openRuntime(browser, tl, opts.assetsDir);
    const cap = await createCapturer(rp.page, { format: 'png', quality: 100 });
    for (const t of times) {
      const tt = Math.max(0, Math.min(tl.duration, t));
      const file = path.join(outDir, `${tl.meta.id}_${tt.toFixed(2).replace('.', '_')}s.png`);
      writeFileSync(file, await cap.frame(tt));
      frames.push(file);
    }
    await rp.close();
  } finally {
    await browser.close();
  }
  let sheet: string | undefined;
  if (opts.sheet !== false && frames.length > 1) {
    sheet = path.join(outDir, `${tl.meta.id}.snap-sheet.jpg`);
    const cols = Math.min(4, frames.length);
    const rows = Math.ceil(frames.length / cols);
    const inputs = frames.flatMap((f) => ['-i', f]);
    const pads = Array.from({ length: cols * rows - frames.length }, () => 'color=c=0x07080c:s=360x640:d=1');
    const padInputs = pads.flatMap((p) => ['-f', 'lavfi', '-i', p]);
    const n = frames.length + pads.length;
    const scaled = Array.from(
      { length: n },
      (_, i) => `[${i}:v]scale=360:640:flags=lanczos,setsar=1[s${i}]`,
    ).join(';');
    const graph = `${scaled};${Array.from({ length: n }, (_, i) => `[s${i}]`).join('')}xstack=inputs=${n}:layout=${layout(cols, rows)}:fill=0x07080c[o]`;
    await run([
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      ...inputs,
      ...padInputs,
      '-filter_complex',
      graph,
      '-map',
      '[o]',
      '-frames:v',
      '1',
      '-q:v',
      '3',
      sheet,
    ]);
  }
  return { frames, sheet };
}

function layout(cols: number, rows: number): string {
  const cells: string[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push(`${c * 368}_${r * 648}`);
  return cells.join('|');
}

/** `--every N`: times every N seconds through the episode. */
export function everyTimes(duration: number, every: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < duration; t += every) out.push(Math.round(t * 1000) / 1000);
  return out;
}
