import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installModel, modelsDir, pinnedModels, type PinnedModel } from '@reelforge/assist';

const BODY = Buffer.from('pretend onnx bytes');
const SHA = createHash('sha256').update(BODY).digest('hex');
let server: ReturnType<typeof createServer>;
const env = { cache: process.env.REELFORGE_CACHE, hf: process.env.HF_ENDPOINT };

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url?.endsWith('/resolve/abc123/onnx/model.onnx')) res.end(BODY);
    else res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  process.env.HF_ENDPOINT = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.REELFORGE_CACHE = mkdtempSync(path.join(os.tmpdir(), 'rf-cache-'));
});
afterAll(() => {
  server.close();
  for (const [k, v] of [
    ['REELFORGE_CACHE', env.cache],
    ['HF_ENDPOINT', env.hf],
  ] as const)
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
});

const pin = (sha256: string, repo = 'test/model'): PinnedModel => ({
  repo,
  revision: 'abc123',
  files: { 'onnx/model.onnx': { sha256, size: BODY.length } },
});

describe('align --setup supply chain', () => {
  it('pins every model to a commit and every file to a SHA-256', () => {
    const p = pinnedModels();
    expect(Object.keys(p).sort()).toEqual(['silero-vad', 'whisper-base', 'whisper-small', 'whisper-tiny']);
    for (const m of Object.values(p)) {
      expect(m.revision).toMatch(/^[0-9a-f]{40}$/);
      for (const f of Object.values(m.files)) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('installs a file whose hash matches and marks the model verified', async () => {
    await installModel(pin(SHA));
    const file = path.join(modelsDir(), 'test', 'model', 'onnx', 'model.onnx');
    expect(readFileSync(file)).toEqual(BODY);
    expect(readFileSync(path.join(modelsDir(), 'test', 'model', '.reelforge-verified'), 'utf8').trim()).toBe(
      'abc123',
    );
  });

  it('refuses a file whose hash does not match and leaves nothing behind', async () => {
    await expect(installModel(pin('0'.repeat(64), 'test/other'))).rejects.toThrow(/Checksum mismatch/);
    const dir = path.join(modelsDir(), 'test', 'other');
    expect(existsSync(path.join(dir, 'onnx', 'model.onnx'))).toBe(false);
    expect(existsSync(path.join(dir, 'onnx', 'model.onnx.part'))).toBe(false);
    expect(existsSync(path.join(dir, '.reelforge-verified'))).toBe(false);
  });
});
