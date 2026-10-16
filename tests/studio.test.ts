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
    expect((await raw('POST', '/api/state')).status).toBe(415); // writes are JSON-only
    expect((await raw('DELETE', '/api/state')).status).toBe(405);
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
    // re-mark l2 at 3.0 s: select the line, seek on the timeline ruler, press Space
    await page.locator('#lines li[data-id="l2"]').click();
    await page.waitForSelector('.tl-lane.ruler');
    await page.evaluate(() => {
      const lane = document.querySelector<HTMLElement>('.tl-lane.ruler')!;
      const r = lane.getBoundingClientRect();
      const pps = (r.width - 40) / 6;
      lane.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: r.left + 3 * pps,
          clientY: r.top + 5,
          pointerId: 1,
          bubbles: true,
        }),
      );
      lane.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
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
    // review mode + lint panel
    await page.keyboard.press('Alt+3');
    await page.waitForFunction(() => document.body.dataset.mode === 'dev');
    expect(await page.locator('#issues li').count()).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('edits episode.yaml from the editor: inspector, canvas drag, undo (structured edits)', async () => {
    const yamlFile = path.join(dir, 'episode.yaml');
    const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(studio.url.replace('#cue', '#edit'));
    await page.waitForSelector('.trow.el');
    await page.waitForFunction(() => document.querySelector('#dur')?.textContent !== '0:00.00');
    // select t1 in the layers panel and change its text in the inspector
    await page.locator('.trow.el', { hasText: 't1' }).click();
    await page.waitForSelector('#inspector .ihead');
    const text = page.locator('#inspector textarea').first();
    await text.fill('**Double** Charge');
    await text.press('Enter');
    const until = async (re: RegExp) => {
      for (let i = 0; i < 80 && !re.test(readFileSync(yamlFile, 'utf8')); i++) await page.waitForTimeout(50);
      expect(readFileSync(yamlFile, 'utf8')).toMatch(re);
    };
    await until(/\*\*Double\*\* Charge/);
    expect(readFileSync(yamlFile, 'utf8')).toContain('# fixtures/mini'); // comments survive
    // drag t1 on the canvas (it is on screen at 1.5 s)
    await page.evaluate(() => document.querySelector<HTMLElement>('.tl-lane.ruler')!.scrollIntoView());
    await page.keyboard.press('Escape');
    await page.locator('.trow.el', { hasText: 't1' }).click();
    const box = await page.evaluate(() => {
      const r = document.querySelector('#overlay rect[stroke="#55dcff"]')!.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, box.y + 40, { steps: 6 });
    await page.mouse.up();
    await until(/id: t1[\s\S]*?place: \{ ?x: (?!60\b)\d+, y: (?!120\b)\d+/);
    // undo restores the original position, redo re-applies it
    await page.keyboard.press('Control+z');
    await until(/id: t1[\s\S]*?place: \{ ?x: 60, y: 120/);
    await page.keyboard.press('Control+Shift+z');
    await until(/id: t1[\s\S]*?place: \{ ?x: (?!60\b)\d+/);
    // insert a component from the command palette
    await page.keyboard.press('Control+k');
    await page.keyboard.type('Insert chip');
    await page.keyboard.press('Enter');
    await until(/use: chip\n\s+id: chip/);
    await page.waitForFunction(
      () => document.querySelector('.trow.el.sel .nm')?.textContent === 'chip',
      null,
      {
        polling: 100,
      },
    );
    await page.keyboard.press('Delete');
    for (let i = 0; i < 80 && /id: chip\b/.test(readFileSync(yamlFile, 'utf8')); i++)
      await page.waitForTimeout(50);
    expect(readFileSync(yamlFile, 'utf8')).not.toMatch(/id: chip\b/);
    expect(studio.state().error).toBe(false);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('guards the edit API (same origin, JSON only, valid operations)', async () => {
    const ops = JSON.stringify({ ops: [{ op: 'set', path: ['meta', 'title'], value: 'X' }] });
    expect(
      (
        await raw(
          'POST',
          '/api/edit',
          { origin: 'http://evil.example', 'content-type': 'application/json' },
          ops,
        )
      ).status,
    ).toBe(403);
    expect((await raw('POST', '/api/edit', { 'content-type': 'text/plain' }, ops)).status).toBe(415);
    expect(
      (
        await raw(
          'POST',
          '/api/edit',
          { 'content-type': 'application/json' },
          '{"ops":[{"op":"set","path":["../x"],"value":1}]}',
        )
      ).status,
    ).toBe(422);
    const meta = JSON.parse((await raw('GET', '/api/meta')).body);
    expect(meta.components.length).toBeGreaterThanOrEqual(21);
    expect(meta.schemas.title.properties.text).toBeDefined();
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
