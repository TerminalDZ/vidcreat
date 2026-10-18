/**
 * Loads the runtime page in Chromium with every request served from local files through
 * request interception: no HTTP server, no network (NFR-8). Any other request is blocked and recorded.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Timeline } from '@reelforge/core';
import { RUNTIME_DIR } from '@reelforge/runtime';
import { chromium, type Browser, type Page } from 'playwright';

export const HOST = 'http://reelforge.local';

export const CHROMIUM_ARGS = [
  '--disable-gpu',
  '--disable-lcd-text',
  '--font-render-hinting=none',
  '--force-color-profile=srgb',
  '--force-device-scale-factor=1',
  '--hide-scrollbars',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--mute-audio',
  '--no-first-run',
  '--disable-extensions',
  '--disable-features=TranslateUI,MediaRouter,OptimizationHints,PaintHolding',
];

export async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({
      headless: true,
      executablePath: process.env.REELFORGE_CHROMIUM || undefined,
      args: CHROMIUM_ARGS,
    });
  } catch (e) {
    throw new Error(
      `Cannot launch Chromium: ${(e as Error).message.split('\n')[0]}\nRun \`reelforge doctor --fix\` to install the pinned Chromium, or set REELFORGE_CHROMIUM.`,
    );
  }
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.map': 'application/json',
};

/** Resolves a URL path inside `base`; undefined for traversal attempts or malformed %-escapes. */
export function safeJoin(base: string, rel: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return undefined;
  }
  const root = path.resolve(base);
  const p = path.resolve(root, `.${path.posix.normalize(`/${decoded}`)}`);
  return p === root || p.startsWith(root + path.sep) ? p : undefined;
}

export interface RuntimePage {
  page: Page;
  blocked: string[];
  close(): Promise<void>;
}

export async function openRuntime(browser: Browser, tl: Timeline, assetsDir?: string): Promise<RuntimePage> {
  const context = await browser.newContext({
    viewport: { width: tl.width, height: tl.height },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
    serviceWorkers: 'block',
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  const page = await context.newPage();
  const blocked: string[] = [];
  const json = JSON.stringify(tl);
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    const u = new URL(url);
    if (u.origin !== HOST) {
      blocked.push(url);
      return route.abort('blockedbyclient');
    }
    if (u.pathname === '/timeline.json')
      return route.fulfill({ status: 200, body: json, contentType: 'application/json' });
    let file: string | undefined;
    if (u.pathname.startsWith('/runtime/'))
      file = safeJoin(RUNTIME_DIR, u.pathname.slice('/runtime/'.length));
    else if (u.pathname.startsWith('/episode/assets/') && assetsDir)
      file = safeJoin(assetsDir, u.pathname.slice('/episode/assets/'.length));
    if (!file || !existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({
      status: 200,
      path: file,
      contentType: TYPES[path.extname(file)] ?? 'application/octet-stream',
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${HOST}/runtime/runtime.html?timeline=/timeline.json`, { waitUntil: 'load' });
  await page
    .evaluate(() => window.reelforge.ready)
    .catch((e) => {
      throw new Error(
        `Runtime failed to start: ${(e as Error).message}${errors.length ? `\n${errors.join('\n')}` : ''}`,
      );
    });
  const fonts = await page.evaluate(() => window.reelforge.fonts);
  if (!fonts.ok)
    throw new Error(`Fonts failed to load: ${fonts.missing.join(', ')} (V-13). Rebuild the runtime package.`);
  return {
    page,
    blocked,
    close: () => context.close(),
  };
}

declare global {
  interface Window {
    reelforge: {
      ready: Promise<void>;
      fonts: { ok: boolean; missing: string[] };
      render(t: number): void;
      measure(): {
        overflow: { id: string; scene: string; t: number }[];
        captions: { lineId: string; start: number; lines: number; text: string }[];
      };
    };
  }
}
