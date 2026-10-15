/** `reelforge doctor` (FR-CLI-7): environment checks with per-OS install hints. */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RUNTIME_DIR } from '@reelforge/runtime';
import { chromium } from 'playwright';
import { probeFfmpeg } from './ffmpeg.js';
import { launchBrowser } from './host.js';

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

const FFMPEG_HINT: Record<string, string> = {
  linux: 'sudo apt install ffmpeg   (Debian/Ubuntu)   ·   sudo dnf install ffmpeg   (Fedora, RPM Fusion)',
  darwin: 'brew install ffmpeg',
  win32: 'winget install Gyan.FFmpeg   (or choco install ffmpeg), then reopen the terminal',
};

export async function runDoctor(): Promise<Check[]> {
  const checks: Check[] = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({
    name: 'Node.js ≥ 22',
    ok: nodeMajor >= 22,
    detail: `v${process.versions.node}`,
    fix: 'Install Node.js 22 LTS from https://nodejs.org',
  });

  const ff = probeFfmpeg();
  const hint = FFMPEG_HINT[process.platform] ?? FFMPEG_HINT.linux;
  checks.push({
    name: 'ffmpeg ≥ 6.0',
    ok: ff.ok && (ff.major ?? 0) >= 6,
    detail: ff.ok ? `version ${ff.version}` : `not found (${ff.error ?? ''})`.trim(),
    fix: hint,
  });
  if (ff.ok) {
    checks.push({
      name: 'ffmpeg encoders: libx264, aac, mjpeg',
      ok: ff.encoders.libx264 && ff.encoders.aac && ff.encoders.mjpeg,
      detail: JSON.stringify(ff.encoders),
      fix: `Use a full ffmpeg build: ${hint}`,
    });
    checks.push({
      name: 'ffmpeg filters: loudnorm, sidechaincompress, alimiter',
      ok: Object.values(ff.filters).every(Boolean),
      detail: JSON.stringify(ff.filters),
      fix: `Use a full ffmpeg build: ${hint}`,
    });
  }

  let chromeDetail = '';
  let chromeOk = false;
  try {
    const b = await launchBrowser();
    chromeDetail = `Chromium ${b.version()} (${process.env.REELFORGE_CHROMIUM ?? chromium.executablePath()})`;
    await b.close();
    chromeOk = true;
  } catch (e) {
    chromeDetail = (e as Error).message.split('\n')[0];
  }
  checks.push({
    name: 'Playwright Chromium (pinned)',
    ok: chromeOk,
    detail: chromeDetail,
    fix: 'reelforge doctor --fix   (runs: npx playwright install chromium)',
  });

  const fontsCss = path.join(RUNTIME_DIR, 'fonts', 'fonts.css');
  let fontsOk = existsSync(fontsCss);
  let fontDetail = fontsOk ? 'Cairo, JetBrains Mono, Space Grotesk' : 'runtime not built';
  if (fontsOk) {
    const missing = [...readFileSync(fontsCss, 'utf8').matchAll(/url\(\.\/([^)]+)\)/g)]
      .map((m) => m[1])
      .filter((f) => !existsSync(path.join(RUNTIME_DIR, 'fonts', f)));
    if (missing.length) {
      fontsOk = false;
      fontDetail = `missing ${missing.join(', ')}`;
    }
  }
  checks.push({ name: 'Bundled fonts', ok: fontsOk, detail: fontDetail, fix: 'pnpm install && pnpm build' });
  return checks;
}
