/**
 * The dashboard's /docs/ route: the bilingual documentation site (documentation/site, `pnpm docs:local`)
 * served offline, and the single-file guide (documentation/index.html) opened from disk.
 * REELFORGE_SCREENSHOTS=<dir> also writes screenshots at 1366×768 and 390×844.
 */
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchBrowser } from '@reelforge/renderer';
import { startHub, type Hub } from '@reelforge/studio';
import { ROOT } from './helpers.js';

const SITE = path.join(ROOT, 'documentation/site');
const SHOTS = process.env.REELFORGE_SCREENSHOTS;
const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
] as const;

let hub: Hub;
let browser: Browser;

beforeAll(async () => {
  hub = await startHub({ root: mkdtempSync(path.join(os.tmpdir(), 'rf-docs-')), port: 0 });
  browser = await launchBrowser();
});
afterAll(async () => {
  await browser?.close();
  await hub?.close();
});

/** A raw request: Node sends the path as written, so `..` segments reach the server. */
function get(p: string): Promise<{ status: number; type: string; location?: string; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: hub.port, path: p }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          type: String(res.headers['content-type'] ?? ''),
          location: res.headers.location,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      );
    });
    req.on('error', reject);
    req.end();
  });
}

const shot = async (page: Page, name: string, vp: { width: number }) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}-${vp.width}.png`) });
};

describe('documentation site at /docs/', () => {
  it('is built (pnpm docs:local)', () => {
    expect(existsSync(path.join(SITE, 'index.html'))).toBe(true);
    expect(existsSync(path.join(SITE, 'ar/index.html'))).toBe(true);
  });

  it('serves pages, clean URLs, assets and both search indexes with the right types', async () => {
    const dir = await get('/docs');
    expect(dir.status).toBe(301);
    expect(dir.location).toBe('/docs/');
    for (const p of [
      '/docs/',
      '/docs/ar/',
      '/docs/guide/quick-start.html',
      '/docs/guide/quick-start',
      '/docs/ar/guide/timing.html',
    ]) {
      const r = await get(p);
      expect(r.status, p).toBe(200);
      expect(r.type, p).toMatch(/^text\/html/);
    }
    const chunks = readdirSync(path.join(SITE, 'assets/chunks'));
    for (const lang of ['root', 'ar']) {
      const index = chunks.find((f) => f.startsWith(`@localSearchIndex${lang}.`));
      expect(index, lang).toBeTruthy();
      const r = await get(`/docs/assets/chunks/${encodeURIComponent(index!)}`);
      expect(r.status).toBe(200);
      expect(r.type).toMatch(/^text\/javascript/);
    }
    const css = readdirSync(path.join(SITE, 'assets')).find((f) => f.endsWith('.css'));
    expect((await get(`/docs/assets/${css}`)).type).toMatch(/^text\/css/);
    const font = readdirSync(path.join(SITE, 'assets')).find((f) => f.endsWith('.woff2'));
    if (font) expect((await get(`/docs/assets/${font}`)).type).toBe('font/woff2');
    expect((await get('/docs/preview.gif')).type).toBe('image/gif');
  });

  it("answers unknown pages with the site's 404 page", async () => {
    const r = await get('/docs/guide/no-such-page.html');
    expect(r.status).toBe(404);
    expect(r.type).toMatch(/^text\/html/);
    expect(r.body).toContain('/docs/assets/');
  });

  it('never serves files outside the documentation', async () => {
    for (const p of [
      '/docs/../package.json',
      '/docs/..%2f..%2fpackage.json',
      '/docs/%2e%2e/%2e%2e/package.json',
      '/docs/..\\..\\package.json',
    ]) {
      const r = await get(p);
      expect(r.status, p).not.toBe(200);
      expect(r.body, p).not.toContain('reelforge-monorepo');
    }
  });

  it('renders English, follows the sidebar, switches to Arabic and searches', async () => {
    const page = await browser.newPage({ viewport: VIEWPORTS[0] });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${hub.url}docs/`);
    await page.waitForSelector('.VPHero');
    expect(await page.getAttribute('html', 'lang')).toBe('en');
    expect(await page.textContent('.VPHero .name')).toContain('ReelForge');

    await page.click('.VPHero a:has-text("Quick start")');
    await page.waitForURL(/\/docs\/guide\/quick-start\.html$/);
    await page.click('.VPSidebar a:has-text("Installation")');
    await page.waitForURL(/\/docs\/guide\/installation\.html$/);
    await page.locator('.vp-doc h1', { hasText: 'Installation' }).waitFor();

    await page.hover('.VPNavBarTranslations .button');
    await page.click('.VPNavBarTranslations a:has-text("العربية")');
    await page.waitForURL(/\/docs\/ar\/guide\/installation\.html$/);
    await page.waitForFunction(() => document.documentElement.dir === 'rtl');
    expect(await page.getAttribute('html', 'lang')).toBe('ar');
    await page.locator('.vp-doc h1', { hasText: 'التثبيت' }).waitFor();

    await page.click('.VPSidebar a:has-text("لوحة التحكم")');
    await page.waitForURL(/\/docs\/ar\/guide\/dashboard\.html$/);
    await page.locator('.vp-doc h1', { hasText: 'لوحة التحكم' }).waitFor();

    await page.click('.VPNavBarSearch button');
    await page.fill('.VPLocalSearchBox input', 'cues');
    await page.waitForSelector('.VPLocalSearchBox .result');
    expect(await page.locator('.VPLocalSearchBox .result').count()).toBeGreaterThan(0);
    await page.keyboard.press('Escape');

    // A deep link opened directly (no client-side navigation) works too.
    await page.goto(`${hub.url}docs/ar/guide/timing.html#cues-mode`);
    await page.waitForSelector('.vp-doc h1');
    expect(await page.getAttribute('html', 'dir')).toBe('rtl');
    expect(errors).toEqual([]);
    await page.close();
  });

  it.runIf(Boolean(SHOTS))('screenshots', async () => {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: vp });
      const mobile = vp.width < 768;
      await page.goto(`${hub.url}docs/`);
      await page.waitForSelector('.VPHero');
      await shot(page, 'docs-home-en', vp);
      await page.goto(`${hub.url}docs/ar/`);
      await page.waitForSelector('.VPHero');
      await shot(page, 'docs-home-ar', vp);
      await page.goto(`${hub.url}docs/guide/quick-start.html`);
      await page.waitForSelector('.vp-doc h1');
      await shot(page, 'docs-guide-en', vp);
      await page.goto(`${hub.url}docs/ar/guide/command-line.html`);
      await page.waitForSelector('.vp-doc h1');
      await shot(page, 'docs-guide-ar', vp);
      if (mobile) {
        await page.click('.VPNavBarHamburger');
        await page.click('.VPNavScreenTranslations button');
      } else await page.hover('.VPNavBarTranslations .button');
      await page.waitForTimeout(400);
      await shot(page, 'docs-language-menu', vp);
      await page.close();
    }
  });
});

describe('single-file guide (documentation/index.html)', () => {
  const file = pathToFileURL(path.join(ROOT, 'documentation/index.html')).href;

  it('opens from disk in English and switches to the same chapter in Arabic', async () => {
    const page = await browser.newPage({ viewport: VIEWPORTS[0] });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(file);
    expect(await page.getAttribute('html', 'dir')).toBe('ltr');
    await page.click('#doc-en aside nav a:has-text("Timing, cues and auto alignment")');
    await page.waitForFunction(() => {
      const r = document.getElementById('timing-cues-and-auto-alignment')!.getBoundingClientRect();
      return Math.abs(r.top - 20) < 30;
    });
    await page.click('#doc-en .switch button[data-lang="ar"]');
    expect(await page.getAttribute('html', 'dir')).toBe('rtl');
    expect(await page.getAttribute('html', 'lang')).toBe('ar');
    expect(await page.isVisible('#doc-en')).toBe(false);
    const h1 = page.locator('#doc-ar .chapter h1').filter({ hasText: 'التوقيت' });
    const box = await h1.boundingBox();
    expect(box && box.y).toBeGreaterThanOrEqual(-5);
    expect(box && box.y).toBeLessThan(200);
    const font = await page.evaluate(() => document.fonts.check('16px "Readex Pro"', 'مرحبا'));
    expect(font).toBe(true);
    await page.click('#doc-ar .switch button[data-lang="en"]');
    expect(await page.getAttribute('html', 'lang')).toBe('en');
    expect(errors).toEqual([]);
    await page.close();
  });

  it.runIf(Boolean(SHOTS))('screenshots', async () => {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: vp });
      await page.goto(file);
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${file}#quick-start-your-first-video-in-10-minutes`);
      await page.waitForTimeout(300);
      await shot(page, 'offline-en', vp);
      // A tap does not scroll; Playwright's click may scroll the page to the sticky header first.
      await page.locator('#doc-en .switch button[data-lang="ar"]').dispatchEvent('click');
      await page.waitForTimeout(300);
      await shot(page, 'offline-ar', vp);
      await page.click('#doc-ar .switch button[data-lang="en"]');
      await page.close();
    }
  });
});
