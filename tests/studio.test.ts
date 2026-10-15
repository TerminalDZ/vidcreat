/** Studio: localhost-only server, single write endpoint, cue marking end-to-end (SRS §4.2, §8, NFR-9). */
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { episodePaths } from '@reelforge/core';
import { launchBrowser } from '@reelforge/renderer';
import { startStudio, type Studio } from '@reelforge/studio';
import type { Browser } from 'playwright';
import { ROOT } from './helpers.js';

let dir: string;
let studio: Studio;
let browser: Browser;

beforeAll(async () => {
  dir = path.join(mkdtempSync(path.join(os.tmpdir(), 'rf-studio-')), 'mini');
  cpSync(path.join(ROOT, 'fixtures/mini'), dir, {
    recursive: true,
    filter: (s) => !s.includes(`${path.sep}out`),
  });
  studio = await startStudio({ paths: episodePaths(dir, ROOT), mode: 'cue', port: 0 });
  browser = await launchBrowser();
});
afterAll(async () => {
  await browser?.close();
  await studio?.close();
});

function raw(
  method: string,
  p: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: studio.port, path: p, method, headers }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

describe('studio server', () => {
  it('binds to 127.0.0.1 and serves state, runtime and voice (with ranges)', async () => {
    expect(studio.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/#cue$/);
    const s = JSON.parse((await raw('GET', '/api/state')).body);
    expect(s.script).toHaveLength(3);
    expect(s.timeline.duration).toBe(6);
    expect((await raw('GET', '/runtime/runtime.html')).status).toBe(200);
    const part = await raw('GET', '/episode/voice.wav', { range: 'bytes=0-11' });
    expect(part.status).toBe(206);
    expect(part.body.startsWith('RIFF')).toBe(true);
  });

  it('blocks path traversal, foreign hosts and cross-origin writes', async () => {
    expect((await raw('GET', '/runtime/..%2F..%2F..%2Fpackage.json')).status).toBe(404);
    expect((await raw('GET', '/api/state', { host: 'evil.example' })).status).toBe(403);
    expect(
      (await raw('PUT', '/cues', { origin: 'http://evil.example', 'content-type': 'application/json' }, '{}'))
        .status,
    ).toBe(403);
    expect((await raw('POST', '/api/state')).status).toBe(405);
    expect((await raw('PUT', '/cues', {}, '{"version":1}')).status).toBe(422);
    expect((await raw('PUT', '/cues', {}, 'nope')).status).toBe(400);
  });

  it('accepts PUT /cues, writes atomically with the voice hash, and recompiles', async () => {
    const body = JSON.stringify({
      version: 1,
      audio: { file: 'voice.wav', duration: 6 },
      cues: { l1: 0.25, l2: 2.1, l3: 4.2 },
      words: {},
    });
    const res = await raw('PUT', '/cues', { 'content-type': 'application/json' }, body);
    expect(res.status).toBe(200);
    const saved = JSON.parse(readFileSync(path.join(dir, 'cues.json'), 'utf8'));
    expect(saved.cues.l1).toBe(0.25);
    expect(saved.audio.sha1).toMatch(/^[0-9a-f]{40}$/);
    expect(studio.state().timeline!.scenes[0].start).toBe(0.25);
  });
});

describe('studio UI', () => {
  it('previews the episode and marks cues with the keyboard', async () => {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(studio.url);
    await page.waitForFunction(() => document.querySelectorAll('#lines li').length === 3);
    const frame = page.frameLocator('#runtime');
    await frame.locator('.rf-scene').first().waitFor({ state: 'attached' });
    // re-mark l2 at 3.0 s: select the line, seek, press Space
    await page.locator('#lines li[data-id="l2"]').click();
    await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('#overview')!;
      const r = c.getBoundingClientRect();
      c.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: r.left + r.width * 0.5,
          clientY: r.top + 5,
          pointerId: 1,
          bubbles: true,
        }),
      );
      c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
    });
    await page.keyboard.press('Space');
    await page.waitForFunction(
      () => /saved/.test(document.querySelector('#status')!.textContent ?? ''),
      null,
      { timeout: 5000 },
    );
    const saved = JSON.parse(readFileSync(path.join(dir, 'cues.json'), 'utf8'));
    expect(saved.cues.l2).toBeCloseTo(3, 1);
    // nudge + undo
    await page.locator('#lines li[data-id="l2"]').click();
    const l2 = () => JSON.parse(readFileSync(path.join(dir, 'cues.json'), 'utf8')).cues.l2 as number;
    const until = async (want: number) => {
      for (let i = 0; i < 60 && Math.abs(l2() - want) > 0.0005; i++) await page.waitForTimeout(50);
      expect(l2()).toBeCloseTo(want, 3);
    };
    await page.keyboard.press('ArrowRight');
    await until(saved.cues.l2 + 0.05);
    await page.keyboard.press('Backspace');
    await until(saved.cues.l2);
    // preview mode + lint panel
    await page.keyboard.press('v');
    await page.waitForFunction(() => document.body.dataset.mode === 'dev');
    expect(await page.locator('#issues li').count()).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('hot-reloads on episode.yaml changes and keeps the last good timeline on errors (FR-DEV-3, FR-DEV-6)', async () => {
    const yamlFile = path.join(dir, 'episode.yaml');
    const original = readFileSync(yamlFile, 'utf8');
    const waitFor = async (pred: () => boolean) => {
      for (let i = 0; i < 100 && !pred(); i++) await new Promise((r) => setTimeout(r, 50));
      expect(pred()).toBe(true);
    };
    writeFileSync(yamlFile, original.replace(/^ {2}title: .*$/m, '  title: Hot'));
    await waitFor(() => studio.state().title === 'Hot');
    writeFileSync(yamlFile, original.replace('scenes:', 'scenes:\n  - bogus: [\n'));
    await waitFor(() => studio.state().error);
    expect(studio.state().timeline).not.toBeNull();
    expect(studio.state().title).toBe('Hot'); // last good values are kept while the YAML is broken
    expect(studio.state().voice?.url).toMatch(/voice\.wav$/);
    writeFileSync(yamlFile, original);
    await waitFor(() => !studio.state().error);
  });
});
