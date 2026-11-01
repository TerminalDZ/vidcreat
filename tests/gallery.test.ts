/** Dashboard gallery (/gallery): API, security and the three tabs in a browser. */
import { mkdtempSync } from 'node:fs';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchBrowser } from '@reelforge/renderer';
import { startHub, type Hub } from '@reelforge/studio';

let hub: Hub;

beforeAll(async () => {
  hub = await startHub({ root: mkdtempSync(path.join(os.tmpdir(), 'rf-gallery-')), port: 0 });
});
afterAll(async () => {
  await hub?.close();
});

function call(
  method: string,
  p: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; type: string; raw: Buffer; json: any }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: hub.port, path: p, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        let json: unknown;
        try {
          json = JSON.parse(raw.toString('utf8'));
        } catch {
          json = undefined;
        }
        resolve({ status: res.statusCode ?? 0, type: String(res.headers['content-type'] ?? ''), raw, json });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('gallery API', () => {
  it('lists components with their gallery scene and serves the frames', async () => {
    const r = await call('GET', '/api/gallery/components');
    expect(r.status).toBe(200);
    expect(r.json).toHaveLength(62);
    expect(r.json.find((c: { name: string }) => c.name === 'title')).toMatchObject({
      scene: 'text',
      size: { w: 960, h: 240 },
      layer: 'base',
    });
    const one = await call('GET', '/api/gallery/components/counter');
    expect(one.json.schema.properties.keyframes).toBeTruthy();
    expect((await call('GET', '/api/gallery/components/nope')).status).toBe(404);
    const png = await call('GET', '/gallery/frames/text.png');
    expect(png.status).toBe(200);
    expect(png.type).toBe('image/png');
    expect(png.raw.subarray(1, 4).toString()).toBe('PNG');
  });

  it('lists themes with a contrast summary and serves the bundled fonts', async () => {
    const r = await call('GET', '/api/gallery/themes');
    expect(r.status).toBe(200);
    expect(r.json.length).toBeGreaterThanOrEqual(16);
    expect(r.json.find((t: { name: string }) => t.name === 'clinical')).toMatchObject({
      mode: 'light',
      source: 'builtin',
      contrast: { pass: expect.any(Boolean), min: expect.any(Number) },
    });
    const css = await call('GET', '/gallery/fonts/fonts.css');
    expect(css.status).toBe(200);
    expect(css.raw.toString()).toMatch(/@font-face/);
  });

  it('is GET-only, local-only and confined to the frames and fonts folders', async () => {
    expect((await call('GET', '/api/gallery/components', { host: 'evil.example' })).status).toBe(403);
    expect((await call('GET', '/gallery/frames/text.png', { host: 'evil.example' })).status).toBe(403);
    expect((await call('POST', '/api/gallery/themes', { 'content-type': 'application/json' })).status).toBe(
      404,
    );
    expect((await call('DELETE', '/api/gallery/components')).status).toBe(405);
    for (const p of [
      '/gallery/frames/..%2Fepisode.yaml',
      '/gallery/frames/../episode.yaml',
      '/gallery/frames/text.jpg',
      '/gallery/frames/nothing.png',
      '/gallery/fonts/..%2Fruntime.html',
      '/gallery/fonts/runtime.js',
    ])
      expect((await call('GET', p)).status, p).toBe(404);
  });
});

describe('gallery UI', () => {
  it('browses components, themes and packs and starts from a template', async () => {
    const browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(hub.url);
    await page.click('#galleryLink');
    // The page is usable once its DOM is ready; component frames load lazily afterwards.
    await page.waitForURL(/\/gallery$/, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ccard');
    expect(await page.locator('.ccard').count()).toBeGreaterThanOrEqual(60);
    expect(await page.locator('.ccard[data-comp="title"] .shot img').count()).toBe(1);

    await page.fill('#search', 'chart');
    const filtered = await page.locator('.ccard').count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(20);
    expect(await page.locator('.ccard[data-comp="bar-chart"]').count()).toBe(1);
    expect(await page.locator('.ccard[data-comp="title"]').count()).toBe(0);
    await page.fill('#search', '');

    await page.click('.ccard[data-comp="counter"]');
    await page.waitForSelector('#compDlg[open] #propsTable table');
    expect(await page.textContent('#compDlg pre')).toMatch(/use: counter/);
    await page.keyboard.press('Escape');

    await page.focus('#tab-components');
    await page.keyboard.press('ArrowRight');
    expect(await page.getAttribute('#tab-themes', 'aria-selected')).toBe('true');
    await page.waitForSelector('.tcard');
    expect(await page.locator('.tcard').count()).toBeGreaterThanOrEqual(16);
    expect(await page.locator('#panel-components').isHidden()).toBe(true);

    await page.click('#tab-packs');
    expect(await page.getAttribute('#tab-packs', 'aria-selected')).toBe('true');
    await page.waitForSelector('.pack');
    expect(await page.locator('.pack').count()).toBe(12);
    await page.click('[data-lang="ar"]');
    expect(await page.getAttribute('#packs', 'dir')).toBe('rtl');
    expect(await page.textContent('.pack[data-pack="healthcare"] h2')).toMatch(/[\u0600-\u06ff]/);

    await page.click('.pack[data-pack="healthcare"] .tpl[data-template="patient-journey"] [data-use]');
    await page.waitForSelector('#newDlg[open]');
    await page.waitForFunction(() => (document.querySelector('#tplSel') as HTMLSelectElement).value !== '');
    expect(await page.isChecked('#newForm input[name="mode"][value="template"]')).toBe(true);
    expect(await page.inputValue('#packSel')).toBe('healthcare');
    expect(await page.inputValue('#tplSel')).toBe('patient-journey');
    expect(await page.inputValue('#newForm select[name="lang"]')).toBe('ar');
    expect(new URL(page.url()).search).toBe('');
    expect(errors).toEqual([]);
    await browser.close();
  });
});
