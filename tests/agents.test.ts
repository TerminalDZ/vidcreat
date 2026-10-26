/** AI endpoints of the dashboard: MCP over HTTP, the REST tool API, discovery and their security. */
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchBrowser } from '@reelforge/renderer';
import { startHub, type Hub } from '@reelforge/studio';
import { ROOT } from './helpers.js';

let root: string;
let cfg: string;
let hub: Hub;

beforeAll(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'rf-agents-'));
  cfg = mkdtempSync(path.join(os.tmpdir(), 'rf-agents-cfg-'));
  cpSync(path.join(ROOT, 'fixtures/mini'), path.join(root, 'episodes/mini'), {
    recursive: true,
    filter: (s) => !s.includes(`${path.sep}out`),
  });
  const skill = path.join(root, 'skills', 'make-video');
  mkdirSync(skill, { recursive: true });
  writeFileSync(
    path.join(skill, 'SKILL.md'),
    '---\nname: make-video\ndescription: Make a ReelForge episode.\n---\n\n# Make a video\n\n## Steps\n\n1. Script first.\n\n## More\n\nLong part.\n',
  );
  hub = await startHub({ root, port: 0, configDir: cfg });
});
afterAll(async () => {
  await hub?.close();
});

type Res = { status: number; json: any; headers: Record<string, string | string[] | undefined>; raw: string };

function call(
  method: string,
  p: string,
  body?: unknown,
  headers: Record<string, string> = {},
  port = hub.port,
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path: p,
        method,
        headers: {
          ...(data ? { 'content-type': 'application/json', 'content-length': data.length } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json: unknown;
          try {
            json = JSON.parse(raw);
          } catch {
            json = undefined;
          }
          resolve({ status: res.statusCode ?? 0, json, headers: res.headers, raw });
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const rpc = (method: string, params: unknown = {}, id: number | undefined = 1) =>
  id === undefined ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id, method, params };

describe('MCP over HTTP', () => {
  it('initializes a session, lists tools by toolset and calls a tool', async () => {
    const init = await call(
      'POST',
      '/mcp',
      rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {} }),
      {
        accept: 'application/json, text/event-stream',
      },
    );
    expect(init.status).toBe(200);
    expect(init.json.result.protocolVersion).toBe('2025-03-26');
    expect(init.json.result.serverInfo.name).toBe('reelforge');
    const sid = init.headers['mcp-session-id'] as string;
    expect(sid).toMatch(/^[0-9a-f-]{36}$/);
    const h = { 'mcp-session-id': sid, 'mcp-protocol-version': '2025-03-26' };

    expect((await call('POST', '/mcp', rpc('notifications/initialized', {}, undefined), h)).status).toBe(202);
    const all = await call('POST', '/mcp', rpc('tools/list'), h);
    expect(all.json.result.tools.length).toBeGreaterThanOrEqual(19);
    const basic = await call('POST', '/mcp?toolsets=basic', rpc('tools/list'), h);
    const names = basic.json.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('validate_episode');
    expect(names).not.toContain('render_episode');
    expect(
      basic.json.result.tools.every(
        (t: { inputSchema: { type: string } }) => t.inputSchema.type === 'object',
      ),
    ).toBe(true);

    const v = await call(
      'POST',
      '/mcp',
      rpc('tools/call', { name: 'validate_episode', arguments: { episode: 'mini', measure: false } }),
      h,
    );
    expect(v.json.result.isError).toBeFalsy();
    expect(v.json.result.structuredContent.issues.errors).toBe(0);
    expect(v.json.result.structuredContent.next).toEqual(expect.any(String));

    // Batches answer with an array; render tools are hidden from the basic toolset.
    const batch = await call(
      'POST',
      '/mcp?toolsets=basic',
      [rpc('ping', {}, 7), rpc('tools/call', { name: 'doctor', arguments: {} }, 8)],
      h,
    );
    expect(batch.json.map((m: { id: number }) => m.id).sort()).toEqual([7, 8]);
    expect(batch.json.find((m: { id: number }) => m.id === 8).error.code).toBe(-32602);

    expect((await call('POST', '/mcp', rpc('ping'), { 'mcp-session-id': 'nope' })).status).toBe(404);
    expect((await call('POST', '/mcp', rpc('ping'), { 'mcp-protocol-version': '1999-01-01' })).status).toBe(
      400,
    );
    expect((await call('GET', '/mcp')).status).toBe(405);
    expect((await call('POST', '/mcp?toolsets=bogus', rpc('ping'))).status).toBe(400);
    expect((await call('DELETE', '/mcp', undefined, { 'mcp-session-id': sid })).status).toBe(204);
    expect((await call('POST', '/mcp', rpc('ping'), h)).status).toBe(404);
  });
});

describe('REST API', () => {
  it('lists tools, calls them and describes them in OpenAPI', async () => {
    const health = await call('GET', '/api/v1/health');
    expect(health.json).toMatchObject({ ok: true, name: 'reelforge', auth: { required: false } });

    const list = await call('GET', '/api/v1/tools?toolsets=render');
    expect(list.json.tools.map((t: { name: string }) => t.name)).toContain('render_episode');
    expect(list.json.tools.map((t: { name: string }) => t.name)).not.toContain('create_episode');
    const fns = await call('GET', '/api/v1/tools?format=openai');
    expect(fns.json[0]).toMatchObject({ type: 'function', function: { name: expect.any(String) } });

    const ok = await call('POST', '/api/v1/tools/validate_episode', { episode: 'mini', measure: false });
    expect(ok.status).toBe(200);
    expect(ok.json.ok).toBe(true);
    expect(ok.json.result.issues.errors).toBe(0);
    const bad = await call('POST', '/api/v1/tools/validate_episode', { episode: 'nope' });
    expect(bad.json).toMatchObject({ ok: false, error: expect.stringMatching(/not found/) });
    const invalid = await call('POST', '/api/v1/tools/create_episode', { id: 'bad id!' });
    expect(invalid.json.ok).toBe(false);
    expect((await call('POST', '/api/v1/tools/no_such_tool', {})).status).toBe(404);
    expect((await call('GET', '/api/v1/tools/validate_episode')).status).toBe(405);

    const created = await call('POST', '/api/v1/tools/create_episode', {
      id: 'ep5',
      title: 'Caching',
      script: ['Your database is melting.', 'A cache keeps hot data close.'],
    });
    expect(created.json.ok).toBe(true);
    expect(created.json.result).toMatchObject({
      episode: 'episodes/ep5',
      issues: { errors: 0 },
      fixes: expect.any(Array),
      next: expect.stringMatching(/edit_episode/),
    });

    const doc = (await call('GET', '/api/v1/openapi.json')).json;
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.servers[0].url).toBe(`http://127.0.0.1:${hub.port}`);
    const op = doc.paths['/api/v1/tools/validate_episode'].post;
    expect(op.operationId).toBe('validate_episode');
    expect(op.requestBody.content['application/json'].schema.properties.episode.type).toBe('string');
    const ids = Object.values(doc.paths).map((p: any) => p.post.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('serves guides, layout text and discovery files', async () => {
    const g = await call('POST', '/api/v1/tools/get_guide', { topic: 'make-video' });
    expect(g.json.text).toMatch(/^Make a ReelForge episode\./);
    expect(g.json.text).toContain('1. Script first.');
    expect(g.json.text).not.toContain('Long part');

    const f = await call('POST', '/api/v1/tools/preview_frames', {
      episode: 'mini',
      times: ["l2:'request'+0.6"],
      width: 180,
    });
    expect(f.json.ok).toBe(true);
    expect(f.json.images[0].mimeType).toBe('image/jpeg');
    expect(f.json.text).toMatch(
      /Visible elements \(canvas coordinates\):\n- t1 \(title, base\) box x 60 y \d+/,
    );
    expect(f.json.text).toMatch(/- api \(node, base\)/);
    const frame = f.json.result.frames[0];
    expect(frame.scene.id).toBe('hook');
    expect(frame.elements.map((e: { id: string }) => e.id)).toEqual(
      expect.arrayContaining(['t1', 'client', 'api']),
    );

    const card = (await call('GET', '/.well-known/mcp.json')).json;
    expect(card.name).toBe('reelforge');
    expect(card.transports.map((t: { type: string }) => t.type)).toEqual(['stdio', 'streamable-http']);
    expect(card.transports[1].url).toBe(`http://127.0.0.1:${hub.port}/mcp`);
    expect(card.toolsets.basic).toContain('validate_episode');
    expect(card.auth.required).toBe(false);
    const llms = await call('GET', '/llms.txt');
    expect(llms.status).toBe(200);
    expect(llms.raw).toContain('# ReelForge');
  });
});

describe('security', () => {
  it('rejects foreign hosts and origins and never sends permissive CORS', async () => {
    expect((await call('POST', '/mcp', rpc('ping'), { host: 'evil.example' })).status).toBe(403);
    expect(
      (await call('GET', '/api/v1/health', undefined, { host: `evil.example:${hub.port}` })).status,
    ).toBe(403);
    expect((await call('POST', '/mcp', rpc('ping'), { origin: 'http://evil.example' })).status).toBe(403);
    expect(
      (await call('POST', '/api/v1/tools/list_episodes', {}, { origin: 'http://evil.example' })).status,
    ).toBe(403);
    const ok = await call(
      'POST',
      '/api/v1/tools/list_episodes',
      {},
      { origin: `http://localhost:${hub.port}` },
    );
    expect(ok.status).toBe(200);
    expect(ok.headers['access-control-allow-origin']).toBeUndefined();
    expect((await call('OPTIONS', '/mcp', undefined, { origin: 'http://evil.example' })).status).toBe(403);
    const text = await call('POST', '/mcp', undefined, { 'content-type': 'text/plain' });
    expect(text.status).toBe(415);
    const conn = await call('GET', '/api/connect');
    expect(conn.json).toMatchObject({ tokenRequired: false, mcpUrl: `http://127.0.0.1:${hub.port}/mcp` });
    expect(conn.json.token).toBeUndefined();
    expect(conn.json.skills.map((s: { name: string }) => s.name)).toEqual(['make-video']);
  });

  it('requires the bearer token when REELFORGE_REQUIRE_TOKEN=1', async () => {
    const before = process.env.REELFORGE_REQUIRE_TOKEN;
    process.env.REELFORGE_REQUIRE_TOKEN = '1';
    const locked = await startHub({ root, port: 0, configDir: cfg });
    try {
      expect(locked.tokenRequired).toBe(true);
      const port = locked.port;
      expect((await call('GET', '/api/v1/health', undefined, {}, port)).status).toBe(401);
      expect((await call('POST', '/mcp', rpc('ping'), {}, port)).status).toBe(401);
      const wrong = await call('GET', '/api/v1/health', undefined, { authorization: 'Bearer nope' }, port);
      expect(wrong.status).toBe(401);
      expect(wrong.headers['www-authenticate']).toMatch(/^Bearer/);
      const conn = await call('GET', '/api/connect', undefined, {}, port);
      const token = conn.json.token as string;
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const auth = { authorization: `Bearer ${token}` };
      expect((await call('GET', '/api/v1/health', undefined, auth, port)).status).toBe(200);
      const init = await call(
        'POST',
        '/mcp',
        rpc('initialize', { protocolVersion: '2025-06-18' }),
        auth,
        port,
      );
      expect(init.status).toBe(200);
      const cross = await call('GET', '/api/connect', undefined, { 'sec-fetch-site': 'cross-site' }, port);
      expect(cross.json.token).toBeUndefined();
      expect((await call('GET', '/api/project', undefined, {}, port)).status).toBe(200); // the local UI stays open
    } finally {
      await locked.close();
      if (before === undefined) delete process.env.REELFORGE_REQUIRE_TOKEN;
      else process.env.REELFORGE_REQUIRE_TOKEN = before;
    }
  });
});

describe('Connect AI page', () => {
  it('renders every client, switches variants and tests the connection', async () => {
    const browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(hub.url);
    await page.click('#connectLink');
    await page.waitForSelector('.client.on');
    expect(await page.locator('.client').count()).toBeGreaterThanOrEqual(11);
    expect(await page.locator('#recipe pre').innerText()).toContain('claude mcp add reelforge');
    await page.click('[data-client="cursor"]');
    await page.click('[data-variant="http"]');
    expect(await page.locator('#recipe pre').innerText()).toContain(`http://127.0.0.1:${hub.port}/mcp`);
    await page.selectOption('#toolsets', 'basic');
    expect(await page.locator('#recipe pre').innerText()).toContain('/mcp?toolsets=basic');
    await page.click('#testBtn');
    await page.waitForSelector('#testOut.ok');
    expect(await page.locator('#testOut').innerText()).toMatch(/Connected: ReelForge .*tools/);
    expect(errors).toEqual([]);
    await browser.close();
  });
});
