/**
 * `reelforge mcp`: the Model Context Protocol server over stdio, so AI clients (Claude Code, Claude
 * Desktop, Cursor, VS Code Copilot, Windsurf, Codex, Gemini CLI, …) can create, edit, preview,
 * validate and render episodes. A thin transport over the tool registry in @reelforge/studio
 * (ADR-014): JSON-RPC 2.0, one message per line; stdout carries protocol messages only (all logging
 * goes to stderr).
 */
import path from 'node:path';
import { createInterface } from 'node:readline';
import { createMcpDispatcher, createToolHost, type Toolset } from '@reelforge/studio';
import { ffmpegDecode } from './decode.js';

export async function startMcp(opts: {
  root: string;
  version: string;
  toolsets?: Toolset[] | 'all';
}): Promise<void> {
  const root = path.resolve(opts.root);
  const log = (m: string): void => {
    process.stderr.write(`[reelforge-mcp] ${m}\n`);
  };
  // Keep stdout clean for the protocol.
  console.log = (...a: unknown[]) => log(a.map(String).join(' '));
  console.info = console.log;
  console.warn = (...a: unknown[]) => log(a.map(String).join(' '));
  const host = createToolHost({ root, decode: ffmpegDecode, log });
  const mcp = createMcpDispatcher({ host, version: opts.version, toolsets: opts.toolsets });

  const send = (msg: unknown): void => {
    process.stdout.write(`${JSON.stringify(msg)}\n`);
  };

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const pending = new Set<Promise<void>>();
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    const batch = Array.isArray(msg) ? msg : [msg];
    for (const m of batch) {
      const p = mcp
        .handle(m, send)
        .then((r) => r && send(r))
        .catch((e) => log(String(e)));
      pending.add(p);
      void p.finally(() => pending.delete(p));
    }
  });
  log(
    `ready · project ${root}${opts.toolsets && opts.toolsets !== 'all' ? ` · toolsets ${opts.toolsets.join(',')}` : ''}`,
  );
  await new Promise<void>((resolve) => rl.on('close', resolve));
  await Promise.allSettled([...pending]);
  await host.close();
}
