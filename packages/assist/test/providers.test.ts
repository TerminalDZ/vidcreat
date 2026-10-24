import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  chatJson,
  extractJson,
  guessProvider,
  llmConfig,
  providerStatus,
  type LlmConfig,
} from '@reelforge/assist';

const KEYS = [
  'REELFORGE_OLLAMA',
  'REELFORGE_LLM_PROVIDER',
  'REELFORGE_LLM_BASE_URL',
  'REELFORGE_LLM_MODEL',
  'REELFORGE_LLM_API_KEY',
  'REELFORGE_CONFIG_DIR',
] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS)
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
});
function freshEnv(): string {
  for (const k of KEYS) delete process.env[k];
  const dir = mkdtempSync(path.join(os.tmpdir(), 'rf-cfg-'));
  process.env.REELFORGE_CONFIG_DIR = dir;
  return dir;
}

type Handler = (req: IncomingMessage, body: any, res: ServerResponse) => void;
async function mock(handler: Handler): Promise<{ url: string; close: () => void; bodies: any[] }> {
  const bodies: any[] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : undefined;
      if (body) bodies.push(body);
      handler(req, body, res);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => server.close(),
    bodies,
  };
}
const SCHEMA = { type: 'object', properties: { n: { type: 'number' } }, required: ['n'] };
const isN = (v: unknown) => (typeof (v as { n?: unknown })?.n === 'number' ? [] : ['n must be a number']);

describe('llm configuration', () => {
  it('defaults to local Ollama, reads llm.json, and lets env win', () => {
    const dir = freshEnv();
    expect(llmConfig()).toMatchObject({ provider: 'ollama', source: 'default' });
    writeFileSync(
      path.join(dir, 'llm.json'),
      JSON.stringify({ baseUrl: 'https://api.example.test/v1', model: 'm1', apiKey: 'k' }),
    );
    expect(llmConfig()).toMatchObject({ provider: 'openai', model: 'm1', apiKey: 'k', source: 'file' });
    process.env.REELFORGE_LLM_MODEL = 'm2';
    expect(llmConfig()).toMatchObject({ model: 'm2', source: 'env' });
  });

  it('guesses the provider from the URL', () => {
    expect(guessProvider('https://api.anthropic.com')).toBe('anthropic');
    expect(guessProvider('http://127.0.0.1:11434')).toBe('ollama');
    expect(guessProvider('http://127.0.0.1:11434/v1')).toBe('openai');
    expect(guessProvider('http://localhost:1234/v1')).toBe('openai');
  });

  it('extracts JSON from fenced or chatty replies', () => {
    expect(extractJson('```json\n{"n":1}\n```')).toEqual({ n: 1 });
    expect(extractJson('Sure! {"n":2} hope it helps')).toEqual({ n: 2 });
    expect(() => extractJson('no json here')).toThrow(/JSON/);
  });
});

describe('chatJson strategies', () => {
  it('OpenAI-compatible: uses response_format json_schema', async () => {
    freshEnv();
    const m = await mock((_req, _b, res) =>
      res.end(JSON.stringify({ choices: [{ message: { content: '{"n":3}' } }] })),
    );
    try {
      const c: LlmConfig = { provider: 'openai', baseUrl: m.url, model: 'x', apiKey: 'k', source: 'env' };
      const r = await chatJson({ system: 's', user: 'u', schema: SCHEMA, validate: isN }, c);
      expect(r).toMatchObject({ value: { n: 3 }, strategy: 'json-schema', attempts: 1 });
      expect(m.bodies[0].response_format.type).toBe('json_schema');
    } finally {
      m.close();
    }
  });

  it('OpenAI-compatible: falls back to plain JSON when response_format is rejected, then repairs', async () => {
    let calls = 0;
    const m = await mock((_req, body, res) => {
      calls++;
      if (body.response_format) return res.writeHead(400).end('response_format not supported');
      const content = calls === 2 ? 'here: {"n":"three"}' : '{"n":3}';
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
    try {
      const c: LlmConfig = { provider: 'openai', baseUrl: m.url, model: 'x', source: 'env' };
      const r = await chatJson({ system: 's', user: 'u', schema: SCHEMA, validate: isN }, c);
      expect(r).toMatchObject({ value: { n: 3 }, strategy: 'repair', attempts: 2 });
      expect(m.bodies[1].messages.at(-1).content).toContain('JSON Schema');
      expect(m.bodies[2].messages.at(-1).content).toContain('n must be a number');
    } finally {
      m.close();
    }
  });

  it('gives up after two repairs', async () => {
    const m = await mock((_req, _b, res) =>
      res.end(JSON.stringify({ choices: [{ message: { content: '{"n":"no"}' } }] })),
    );
    try {
      const c: LlmConfig = { provider: 'openai', baseUrl: m.url, model: 'x', source: 'env' };
      await expect(chatJson({ system: 's', user: 'u', schema: SCHEMA, validate: isN }, c)).rejects.toThrow(
        /after 2 retries/,
      );
      expect(m.bodies).toHaveLength(3);
    } finally {
      m.close();
    }
  });

  it('Anthropic: forces a tool call carrying the schema', async () => {
    const m = await mock((req, _b, res) => {
      expect(req.url).toBe('/v1/messages');
      expect(req.headers['x-api-key']).toBe('secret');
      res.end(JSON.stringify({ content: [{ type: 'tool_use', name: 'answer', input: { n: 7 } }] }));
    });
    try {
      const c: LlmConfig = {
        provider: 'anthropic',
        baseUrl: m.url,
        model: 'x',
        apiKey: 'secret',
        source: 'env',
      };
      const r = await chatJson({ system: 's', user: 'u', schema: SCHEMA, validate: isN }, c);
      expect(r).toMatchObject({ value: { n: 7 }, strategy: 'tool' });
      expect(m.bodies[0].tool_choice).toEqual({ type: 'tool', name: 'answer' });
      expect(m.bodies[0].tools[0].input_schema).toEqual(SCHEMA);
    } finally {
      m.close();
    }
  });

  it('Ollama native: sends the schema as a decoding grammar', async () => {
    const m = await mock((req, _b, res) => {
      if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'q:latest' }] }));
      res.end(JSON.stringify({ message: { content: '{"n":1}' } }));
    });
    try {
      const c: LlmConfig = { provider: 'ollama', baseUrl: m.url, model: 'q', source: 'env' };
      const r = await chatJson({ system: 's', user: 'u', schema: SCHEMA }, c);
      expect(r.strategy).toBe('grammar');
      expect(m.bodies[0].format).toEqual(SCHEMA);
      expect(await providerStatus(c)).toMatchObject({ running: true, available: true, hasKey: false });
    } finally {
      m.close();
    }
  });

  it('never exposes the API key in the status', async () => {
    freshEnv();
    process.env.REELFORGE_LLM_PROVIDER = 'anthropic';
    process.env.REELFORGE_LLM_API_KEY = 'secret';
    const s = await providerStatus();
    expect(JSON.stringify(s)).not.toContain('secret');
    expect(s).toMatchObject({ provider: 'anthropic', hasKey: true, available: true });
  });
});
