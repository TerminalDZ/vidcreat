/** Headless measuring pass for V-9 (text overflow) and V-10 (caption lines), cached by scene hash. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Issue, Timeline } from '@reelforge/core';
import { sha1 } from '@reelforge/core';
import { RUNTIME_DIR } from '@reelforge/runtime';
import { launchBrowser, openRuntime } from './host.js';

let runtimeHash: string | undefined;
/** The cache must be invalidated when the runtime itself changes. */
function runtimeVersion(): string {
  if (!runtimeHash) {
    const f = path.join(RUNTIME_DIR, 'runtime.js');
    runtimeHash = existsSync(f) ? sha1(readFileSync(f)).slice(0, 12) : 'none';
  }
  return runtimeHash;
}

interface MeasureCache {
  key: string;
  overflow: { id: string; scene: string; t: number }[];
  captions: { lineId: string; start: number; lines: number; text: string }[];
}

export interface MeasureOptions {
  cacheDir?: string;
  assetsDir?: string;
  file?: string;
}

export async function measureTimeline(tl: Timeline, opts: MeasureOptions = {}): Promise<Issue[]> {
  const key = sha1(JSON.stringify({ r: runtimeVersion(), s: tl.scenes.map((s) => s.hash), c: tl.captions, th: tl.theme, p: tl.preset })).slice(0, 20);
  const cacheFile = opts.cacheDir ? path.join(opts.cacheDir, 'measure.json') : undefined;
  let data: MeasureCache | undefined;
  if (cacheFile && existsSync(cacheFile)) {
    try {
      const c = JSON.parse(readFileSync(cacheFile, 'utf8')) as MeasureCache;
      if (c.key === key) data = c;
    } catch {
      /* stale cache */
    }
  }
  if (!data) {
    const browser = await launchBrowser();
    try {
      const rp = await openRuntime(browser, tl, opts.assetsDir);
      const m = await rp.page.evaluate(() => window.reelforge.measure());
      data = { key, ...m };
      await rp.close();
    } finally {
      await browser.close();
    }
    if (cacheFile) {
      mkdirSync(path.dirname(cacheFile), { recursive: true });
      writeFileSync(cacheFile, JSON.stringify(data));
    }
  }
  return measureIssues(tl, data, opts.file);
}

export function measureIssues(tl: Timeline, data: Omit<MeasureCache, 'key'>, file?: string): Issue[] {
  const issues: Issue[] = [];
  const els = new Map(tl.scenes.flatMap((s) => s.elements.map((e) => [e.id, e] as const)));
  for (const o of data.overflow) {
    const el = els.get(o.id);
    issues.push({
      rule: 'V-9',
      level: 'warn',
      message: `Text overflows element "${o.id}" (${el?.component}) at ${o.t}s`,
      hint: 'Shorten the text, lower the font size, or enlarge place.w/h',
      file,
      line: el?.source?.line,
      col: el?.source?.col,
      time: o.t,
      sceneId: o.scene,
      elementId: o.id,
    });
  }
  for (const c of data.captions) {
    if (c.lines > tl.theme.captions.max_lines) {
      issues.push({
        rule: 'V-10',
        level: 'warn',
        message: `Caption "${c.text}" (${c.lineId}) renders in ${c.lines} lines (max ${tl.theme.captions.max_lines})`,
        hint: `Add \`break: [word]\` to line ${c.lineId}, or lower theme captions.max_chars`,
        file,
        time: c.start,
      });
    }
  }
  return issues;
}
