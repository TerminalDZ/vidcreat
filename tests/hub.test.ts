/** Project dashboard (reelforge studio): API, security and a full create → voice → render flow. */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ffmpegBin, launchBrowser } from '@reelforge/renderer';
import { startHub, type Hub } from '@reelforge/studio';
import WebSocket from 'ws';
import { ROOT } from './helpers.js';

let root: string;
let hub: Hub;

beforeAll(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'rf-hub-'));
  cpSync(path.join(ROOT, 'fixtures/mini'), path.join(root, 'episodes/mini'), {
    recursive: true,
    filter: (s) => !s.includes(`${path.sep}out`),
  });
  hub = await startHub({ root, port: 0 });
});
afterAll(async () => {
  await hub?.close();
});

function call(
  method: string,
  p: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: any; raw: Buffer }> {
  return new Promise((resolve, reject) => {
    const data =
      body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    const req = request(
      {
        host: '127.0.0.1',
        port: hub.port,
        path: p,
        method,
        headers: {
          ...(data && !Buffer.isBuffer(body) ? { 'content-type': 'application/json' } : {}),
          ...(data ? { 'content-length': data.length } : {}),
          ...headers,
        },
      },
      (res) => {
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
          resolve({ status: res.statusCode ?? 0, json, raw });
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

describe('dashboard API', () => {
  it('lists episodes with status', async () => {
    const r = await call('GET', '/api/project');
    expect(r.status).toBe(200);
    const mini = r.json.episodes.find((e: { key: string }) => e.key === 'episodes/mini');
    expect(mini).toMatchObject({
      id: 'mini',
      lines: 3,
      cues: { marked: 3, draft: false },
      issues: { errors: 0 },
    });
    expect(mini.voice.duration).toBeCloseTo(6, 1);
  });

  it('creates an episode and drafts cues', async () => {
    expect((await call('POST', '/api/episodes', { id: 'bad id!' })).status).toBe(422);
    const r = await call('POST', '/api/episodes', {
      id: 'ep10',
      title: 'Hello',
      series: 'TEST',
      episode: 10,
    });
    expect(r.status).toBe(201);
    expect(readFileSync(path.join(root, 'episodes/ep10/episode.yaml'), 'utf8')).toMatch(/title: "Hello"/);
    expect((await call('POST', '/api/episodes', { id: 'ep10' })).status).toBe(409);
    expect((await call('POST', '/api/cues/draft', { ep: 'episodes/ep10' })).status).toBe(200);
    expect(existsSync(path.join(root, 'episodes/ep10/cues.json'))).toBe(true);
    const v = await call('POST', '/api/validate', { ep: 'episodes/ep10' });
    expect(v.json.issues.filter((i: { level: string }) => i.level === 'error')).toEqual([]);
  });

  it('accepts a compressed recording and converts it to the voice WAV', async () => {
    const mp3 = path.join(root, 'take.mp3');
    spawnSync(ffmpegBin(), [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=220:duration=3',
      '-c:a',
      'libmp3lame',
      mp3,
    ]);
    if (!existsSync(mp3)) return; // ffmpeg build without mp3 encoder
    const r = await call('PUT', '/api/voice?ep=episodes%2Fep10&name=take.mp3', readFileSync(mp3), {
      'content-type': 'audio/mpeg',
    });
    expect(r.status).toBe(200);
    expect(r.json.duration).toBeCloseTo(3, 0);
    expect(readFileSync(path.join(root, 'episodes/ep10/voice.wav')).subarray(0, 4).toString()).toBe('RIFF');
    expect((await call('PUT', '/api/voice?ep=episodes%2Fep10&name=x.exe', Buffer.from('x'))).status).toBe(
      415,
    );
  });

  it('serves thumbnails and opens the per-episode studio', async () => {
    const t = await call('GET', '/api/thumb?ep=episodes%2Fmini');
    expect(t.status).toBe(200);
    expect(t.raw.subarray(0, 2).toString('hex')).toBe('ffd8');
    const s = await call('POST', '/api/studio', { ep: 'episodes/mini', mode: 'dev' });
    expect(s.json.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/#dev$/);
  });

  it('rejects foreign hosts, cross-origin writes, non-JSON bodies and path escapes', async () => {
    expect((await call('GET', '/api/project', undefined, { host: 'evil.example' })).status).toBe(403);
    expect((await call('POST', '/api/episodes', { id: 'x' }, { origin: 'http://evil.example' })).status).toBe(
      403,
    );
    expect(
      (await call('POST', '/api/episodes', Buffer.from('{"id":"x"}'), { 'content-type': 'text/plain' }))
        .status,
    ).toBe(415);
    expect((await call('POST', '/api/validate', { ep: '../../etc' })).status).toBe(404);
    expect((await call('GET', '/files?ep=episodes%2Fmini&f=episode.yaml')).status).toBe(403);
    expect((await call('GET', '/files?ep=episodes%2Fmini&f=out%2F..%2F..%2F..%2Fsecret')).status).toBe(404);
    expect((await call('DELETE', '/api/project')).status).toBe(405);
  });

  it('renders with live progress over the WebSocket and serves the outputs', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${hub.port}/ws`);
    const phases = new Set<string>();
    const finished = new Promise<{ status: string; message?: string }>((resolve) => {
      ws.on('message', (d) => {
        const m = JSON.parse(String(d));
        if (m.type !== 'job') return;
        phases.add(m.job.phase);
        if (m.job.status !== 'running') resolve(m.job);
      });
    });
    await new Promise((r) => ws.once('open', r));
    const r = await call('POST', '/api/render', {
      ep: 'episodes/mini',
      options: { fast: true, shareMb: 10 },
    });
    expect(r.status).toBe(202);
    expect((await call('POST', '/api/render', { ep: 'episodes/mini' })).status).toBe(409);
    const job = await finished;
    ws.close();
    expect(job.status, job.message).toBe('done');
    expect([...phases]).toEqual(expect.arrayContaining(['frames', 'master', 'share']));
    const p = await call('GET', '/api/project');
    const mini = p.json.episodes.find((e: { key: string }) => e.key === 'episodes/mini');
    expect(mini.outputs.map((o: { kind: string }) => o.kind)).toEqual(
      expect.arrayContaining(['master', 'share', 'sheet', 'srt', 'publish']),
    );
    const v = await call(
      'GET',
      `/files?ep=episodes%2Fmini&f=${encodeURIComponent('out/mini.share.mp4')}`,
      undefined,
      { range: 'bytes=0-15' },
    );
    expect(v.status).toBe(206);
  });
});

describe('dashboard render cancel', () => {
  it('cancels mid-render cleanly and keeps serving (no EPIPE crash)', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${hub.port}/ws`);
    await new Promise((r) => ws.once('open', r));
    let cancelled = false;
    const end = new Promise<{ status: string }>((resolve) => {
      ws.on('message', async (d) => {
        const m = JSON.parse(String(d));
        if (m.type !== 'job') return;
        if (!cancelled && m.job.phase === 'frames' && m.job.done > 3) {
          cancelled = true;
          await call('POST', '/api/render/cancel', {});
        }
        if (m.job.status !== 'running') resolve(m.job);
      });
    });
    expect((await call('POST', '/api/render', { ep: 'episodes/mini', options: { fast: true } })).status).toBe(
      202,
    );
    const job = await end;
    ws.close();
    expect(job.status).toBe('cancelled');
    await new Promise((r) => setTimeout(r, 1500)); // late pipe errors would crash the process here
    expect((await call('GET', '/api/project')).status).toBe(200);
  });
});

describe('dashboard UI', () => {
  it('loads, lists episodes and creates one through the dialog', async () => {
    const browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(hub.url);
    await page.waitForSelector('.card[data-key="episodes/mini"]');
    await page.click('#newBtn');
    await page.fill('#newForm input[name="id"]', 'ep11');
    await page.fill('#newForm input[name="title"]', 'From the UI');
    await page.click('#newForm button[value="ok"]');
    await page.waitForSelector('.card[data-key="episodes/ep11"]');
    expect(await page.locator('#docsLink').isVisible()).toBe(
      existsSync(path.join(ROOT, 'documentation/index.html')),
    );
    expect(errors).toEqual([]);
    await browser.close();
  });

  it('creates an episode from an industry template', async () => {
    const packs = await call('GET', '/api/packs');
    expect(packs.status).toBe(200);
    const health = packs.json.packs.find((p: { id: string }) => p.id === 'healthcare');
    expect(health.name).toEqual({ en: 'Healthcare', ar: expect.any(String) });
    expect(health.templates[0].slots.some((s: { name: string }) => s.name === 'org')).toBe(true);
    const bad = await call('POST', '/api/episodes', {
      id: 'tpl0',
      pack: 'healthcare',
      template: 'patient-journey',
      slots: { org: 'x'.repeat(200) },
    });
    expect(bad.status).toBe(422);
    expect(bad.json.error).toMatch(/org/);

    const browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(hub.url);
    await page.waitForSelector('.card[data-key="episodes/mini"]');
    await page.click('#newBtn');
    await page.check('#newForm input[name="mode"][value="template"]');
    await page.waitForSelector('#packSel option[value="healthcare"]', { state: 'attached' });
    await page.selectOption('#packSel', 'healthcare');
    await page.selectOption('#tplSel', 'patient-journey');
    await page.selectOption('#newForm select[name="lang"]', 'ar');
    await page.waitForSelector('#slotFields input[name="slot:org"]');
    expect(await page.inputValue('#slotFields input[name="slot:wait"]')).toBe('10');
    await page.fill('#newForm input[name="id"]', 'tpl1');
    await page.fill('#slotFields input[name="slot:org"]', 'مستشفى السلام');
    await page.fill('#slotFields input[name="slot:wait"]', '15');
    if (process.env.REELFORGE_SCREENSHOTS)
      await page.screenshot({
        path: path.join(process.env.REELFORGE_SCREENSHOTS, 'new-from-template-1366.png'),
      });
    await page.click('#newForm button[value="ok"]');
    await page.waitForSelector('.card[data-key="episodes/tpl1"]');
    const yaml = readFileSync(path.join(root, 'episodes/tpl1/episode.yaml'), 'utf8');
    expect(yaml).toMatch(/lang: ar-EG/);
    expect(yaml).toContain('مستشفى السلام');
    expect(existsSync(path.join(root, 'episodes/tpl1/cues.json'))).toBe(true);
    const v = await call('POST', '/api/validate', { ep: 'episodes/tpl1' });
    expect(v.json.issues.filter((i: { level: string }) => i.level === 'error')).toEqual([]);
    expect(errors).toEqual([]);
    await browser.close();
  });
});
