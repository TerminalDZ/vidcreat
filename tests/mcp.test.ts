/** MCP server: protocol handshake, tools, edits, validation and frame previews over stdio. */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROOT } from './helpers.js';

let proc: ChildProcessWithoutNullStreams;
let root: string;
let seq = 0;
const waiting = new Map<number, (m: Record<string, unknown>) => void>();
const notes: Record<string, unknown>[] = [];

function call(method: string, params: unknown = {}): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const id = ++seq;
    waiting.set(id, resolve);
    proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

async function tool(name: string, args: Record<string, unknown>) {
  const r = await call('tools/call', { name, arguments: args, _meta: { progressToken: `t${seq}` } });
  return r.result as {
    content: { type: string; text?: string; data?: string; mimeType?: string }[];
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  };
}

beforeAll(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'rf-mcp-'));
  mkdirSync(path.join(root, 'episodes'));
  proc = spawn(process.execPath, [path.join(ROOT, 'packages/cli/bin/reelforge.js'), 'mcp', '--root', root], {
    stdio: 'pipe',
  });
  let buf = '';
  proc.stdout.on('data', (d: Buffer) => {
    buf += d.toString();
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      const m = JSON.parse(line) as Record<string, unknown>; // every stdout line must be JSON-RPC
      if (typeof m.id === 'number' && waiting.has(m.id)) {
        waiting.get(m.id)!(m);
        waiting.delete(m.id);
      } else notes.push(m);
    }
  });
});

afterAll(() => {
  proc?.stdin.end();
  proc?.kill();
});

describe('reelforge mcp', () => {
  it('negotiates the protocol and lists tools, resources and prompts', async () => {
    const init = (
      await call('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      })
    ).result as Record<string, unknown>;
    expect(init.protocolVersion).toBe('2025-06-18');
    expect((init.serverInfo as { name: string }).name).toBe('reelforge');
    proc.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    const old = (await call('initialize', { protocolVersion: '1999-01-01' })).result as Record<
      string,
      unknown
    >;
    expect(old.protocolVersion).toBe('2025-06-18');
    const tools = (
      (await call('tools/list')).result as { tools: { name: string; inputSchema: { type: string } }[] }
    ).tools;
    const names = tools.map((t) => t.name);
    for (const n of [
      'create_episode',
      'get_episode',
      'edit_episode',
      'validate_episode',
      'preview_frames',
      'render_episode',
    ])
      expect(names).toContain(n);
    expect(tools.every((t) => t.inputSchema.type === 'object')).toBe(true);
    const res = ((await call('resources/list')).result as { resources: { uri: string }[] }).resources;
    expect(res.map((r) => r.uri)).toContain('reelforge://docs/authoring');
    const doc = (await call('resources/read', { uri: 'reelforge://docs/components' })).result as {
      contents: { text: string }[];
    };
    expect(doc.contents[0].text).toContain('Component reference');
    const prompt = (await call('prompts/get', { name: 'make_explainer', arguments: { topic: 'caching' } }))
      .result as { messages: { content: { text: string } }[] };
    expect(prompt.messages[0].content.text).toContain('caching');
    expect(((await call('no/such/method')).error as { code: number }).code).toBe(-32601);
  });

  it('creates, edits, validates and previews an episode', async () => {
    const created = await tool('create_episode', {
      id: 'ep1',
      title: 'Rate Limiting',
      script: [
        'Your API just got flooded with requests.',
        'A rate limiter decides who gets through.',
        'The token bucket is the classic way.',
      ],
    });
    expect(created.isError).toBeFalsy();
    const yamlFile = path.join(root, 'episodes/ep1/episode.yaml');
    expect(readFileSync(yamlFile, 'utf8')).toContain('lang: en-US');
    const got = await tool('get_episode', { episode: 'ep1' });
    const outline = got.structuredContent as {
      script: { id: string; words: string[] }[];
      scenes: { elements: { path: unknown[] }[] }[];
    };
    expect(outline.script.map((l) => l.id)).toEqual(['l1', 'l2', 'l3']);
    expect(outline.scenes[0].elements[0].path).toEqual(['scenes', 0, 'elements', 0]);

    const edit = await tool('edit_episode', {
      episode: 'ep1',
      ops: [
        { op: 'set', path: ['scenes', 0, 'elements', 0, 'place'], value: { x: 60, y: 160, w: 960, h: 240 } },
        {
          op: 'insert',
          path: ['scenes'],
          value: {
            id: 'bucket',
            at: 'l3',
            elements: [
              {
                use: 'bucket',
                id: 'tb',
                props: { capacity: 8 },
                place: { x: 320, y: 100, w: 440, h: 560 },
                enter: { at: "l3:'bucket'" },
              },
            ],
          },
        },
      ],
    });
    expect(edit.isError).toBeFalsy();
    expect(edit.content[0].text).toMatch(/0 error/);
    const bad = await tool('edit_episode', {
      episode: 'ep1',
      ops: [{ op: 'move', path: ['meta'], from: 0, to: 1 }],
    });
    expect(bad.isError).toBe(true);
    const refused = await tool('write_episode_yaml', {
      episode: 'ep1',
      yaml: 'meta: { id: ep1 }\nscript: []\n',
    });
    expect(refused.isError).toBe(true);
    expect(readFileSync(yamlFile, 'utf8')).toContain('use: bucket'); // unchanged

    const v = await tool('validate_episode', { episode: 'ep1', measure: false });
    expect((v.structuredContent as { issues: { errors: number } }).issues.errors).toBe(0);

    const frames = await tool('preview_frames', { episode: 'ep1', times: ["l3:'bucket'+0.8"], width: 270 });
    const img = frames.content.find((c) => c.type === 'image')!;
    expect(img.mimeType).toBe('image/jpeg');
    expect(Buffer.from(img.data!, 'base64').subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(notes.some((n) => n.method === 'notifications/progress')).toBe(true);

    const scene = await tool('preview_frames', { episode: 'ep1', times: ['@bucket+0.5'], width: 180 });
    expect(scene.isError).toBeFalsy();
    const emptyPath = await tool('edit_episode', {
      episode: 'ep1',
      ops: [{ op: 'set', path: [], value: { a: 1 } }],
    });
    expect(emptyPath.isError).toBe(true);
    expect(readFileSync(yamlFile, 'utf8')).not.toContain('? null');

    const missing = await tool('get_episode', { episode: '../../etc' });
    expect(missing.isError).toBe(true);
  });
});
