/**
 * Studio server (SRS §8): 127.0.0.1 only, serves the project folder read-only, a WebSocket for
 * change events and a single write endpoint `PUT /cues` (IR-1, IR-2, NFR-9).
 */
import { existsSync, readFileSync, watch, type FSWatcher } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileEpisode,
  cuesSchema,
  readCues,
  sha1,
  writeCues,
  type CompileResult,
  type EpisodePaths,
  type Issue,
  type Timeline,
} from '@reelforge/core';
import type { PcmAudio } from '@reelforge/audio';
import { RUNTIME_DIR } from '@reelforge/runtime';
import { WebSocketServer, type WebSocket } from 'ws';
import { listen, readBody, safeJoin, sendFile } from './http.js';
export { startHub, type Hub, type HubOptions, type EpisodeSummary, type Job } from './hub.js';

const CLIENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'client');

export interface StudioOptions {
  paths: EpisodePaths;
  mode: 'cue' | 'dev';
  port?: number;
  preset?: string;
  decode?: (file: string) => PcmAudio;
  /** Headless V-9/V-10 measuring (runs in the background after each compile). */
  measure?: (tl: Timeline) => Promise<Issue[]>;
  log?: (msg: string) => void;
}

export interface StudioState {
  mode: 'cue' | 'dev';
  id: string;
  title: string;
  script: { id: string; text: string }[];
  cues: { cues: Record<string, number>; words: Record<string, number[]> } | null;
  timeline: Timeline | null;
  issues: Issue[];
  error: boolean;
  voice: { url: string; duration: number } | null;
  compiledAt: number;
  compileMs: number;
}

export interface Studio {
  url: string;
  port: number;
  state(): StudioState;
  close(): Promise<void>;
}

export async function startStudio(opts: StudioOptions): Promise<Studio> {
  const { paths } = opts;
  const log = opts.log ?? (() => undefined);
  let result: CompileResult;
  let lastGood: Timeline | null = null;
  let measured: Issue[] = [];
  let state!: StudioState;
  let watchers: FSWatcher[] = [];
  let measureTimer: NodeJS.Timeout | undefined;
  let measureSeq = 0;

  const voiceInfo = () => {
    const v = result?.voice;
    return v ? { url: `/episode/voice${path.extname(v.file)}`, duration: v.duration } : null;
  };

  const compile = () => {
    const t0 = performance.now();
    result = compileEpisode(paths, { draftCues: true, preset: opts.preset, decode: opts.decode });
    if (result.timeline && !result.issues.some((i) => i.rule === 'V-1' && i.level === 'error'))
      lastGood = result.timeline;
    const cuesFile = readCues(paths.cues).cues;
    state = {
      mode: opts.mode,
      id: paths.id,
      title: result.spec?.meta.title ?? state?.title ?? paths.id,
      script: result.script,
      cues: cuesFile ? { cues: cuesFile.cues, words: cuesFile.words ?? {} } : null,
      timeline: result.ok || !lastGood ? (result.timeline ?? lastGood) : (result.timeline ?? lastGood),
      issues: result.issues,
      error: result.issues.some((i) => i.level === 'error' && (i.rule === 'V-1' || i.rule === 'V-13')),
      // A broken YAML stops compilation before the voice is loaded: keep the last one so the
      // studio does not reload the audio and lose the playhead (FR-DEV-3).
      voice: voiceInfo() ?? state?.voice ?? null,
      compiledAt: Date.now(),
      compileMs: Math.round(performance.now() - t0),
    };
    if (state.error) state.timeline = lastGood;
    scheduleMeasure();
    rewatch();
  };

  const scheduleMeasure = () => {
    if (!opts.measure || !result.timeline || state.error) return;
    clearTimeout(measureTimer);
    const seq = ++measureSeq;
    const tl = result.timeline;
    measureTimer = setTimeout(() => {
      opts.measure!(tl)
        .then((issues) => {
          if (seq !== measureSeq) return;
          measured = issues;
          state = {
            ...state,
            issues: [...state.issues.filter((i) => i.rule !== 'V-9' && i.rule !== 'V-10'), ...measured],
          };
          broadcast();
        })
        .catch((e) => log(`measure skipped: ${(e as Error).message.split('\n')[0]}`));
    }, 900);
  };

  // ---- file watching (FR-DEV-3)
  let debounce: NodeJS.Timeout | undefined;
  const onChange = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      compile();
      broadcast();
    }, 40);
  };
  const rewatch = () => {
    const files = new Set(result.files.filter((f) => f));
    const dirs = new Set([...files].map((f) => path.dirname(f)));
    const key = [...dirs].sort().join('|');
    if ((rewatch as { key?: string }).key === key) return;
    (rewatch as { key?: string }).key = key;
    for (const w of watchers) w.close();
    watchers = [];
    for (const d of dirs) {
      if (!existsSync(d)) continue;
      try {
        const w = watch(d, (_ev, name) => {
          if (!name) return onChange();
          const full = path.join(d, name.toString());
          if ([...(result?.files ?? [])].includes(full)) onChange();
        });
        watchers.push(w);
      } catch (e) {
        log(`cannot watch ${d}: ${(e as Error).message}`);
      }
    }
  };

  compile();

  // ---- HTTP
  let port = 0;
  const allowedHosts = () => new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const sameOrigin = (req: IncomingMessage) => {
    if (!allowedHosts().has(req.headers.host ?? '')) return false;
    const origin = req.headers.origin;
    return !origin || origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
  };

  const server = createServer(async (req, res) => {
    try {
      if (!sameOrigin(req)) {
        res
          .writeHead(403, { 'content-type': 'text/plain' })
          .end('Forbidden: studio accepts local same-origin requests only');
        return;
      }
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const p = url.pathname;
      res.setHeader('x-content-type-options', 'nosniff');
      if (req.method === 'PUT' && p === '/cues') return await putCues(req, res);
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { allow: 'GET, HEAD' }).end();
        return;
      }
      if (p === '/api/state') {
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        });
        res.end(JSON.stringify(state));
        return;
      }
      if (p.startsWith('/episode/voice')) return sendFile(req, res, result.voice?.file);
      if (p.startsWith('/episode/assets/'))
        return sendFile(req, res, safeJoin(paths.assets, p.slice('/episode/assets/'.length)));
      if (p.startsWith('/runtime/'))
        return sendFile(req, res, safeJoin(RUNTIME_DIR, p.slice('/runtime/'.length)));
      const rel = p === '/' ? 'index.html' : p.slice(1);
      return sendFile(req, res, safeJoin(CLIENT_DIR, rel));
    } catch (e) {
      log(`request error: ${(e as Error).message}`);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Internal error');
    }
  });

  async function putCues(req: IncomingMessage, res: ServerResponse) {
    let body: unknown;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      res
        .writeHead(400, { 'content-type': 'application/json' })
        .end(JSON.stringify({ error: `Invalid JSON: ${(e as Error).message}` }));
      return;
    }
    const parsed = cuesSchema.safeParse(body);
    if (!parsed.success) {
      res.writeHead(422, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        }),
      );
      return;
    }
    const known = new Set(state.script.map((l) => l.id));
    const unknown = Object.keys(parsed.data.cues).filter((k) => !known.has(k));
    if (unknown.length) {
      res
        .writeHead(422, { 'content-type': 'application/json' })
        .end(JSON.stringify({ error: `Unknown script ids: ${unknown.join(', ')}` }));
      return;
    }
    const v = result.voice;
    const data = {
      ...parsed.data,
      audio: v
        ? {
            file: path.basename(v.file),
            duration: Math.round(v.duration * 1000) / 1000,
            sha1: sha1(readFileSync(v.file)),
          }
        : parsed.data.audio,
      updated: new Date().toISOString(),
      draft: undefined,
    };
    writeCues(paths.cues, data);
    compile();
    broadcast();
    res
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ ok: true, updated: data.updated }));
  }

  // ---- WebSocket (change events)
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const clients = new Set<WebSocket>();
  server.on('upgrade', (req, socket, head) => {
    if (!sameOrigin(req) || new URL(req.url ?? '/', 'http://x').pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws);
      ws.on('close', () => clients.delete(ws));
      ws.send(JSON.stringify({ type: 'state', state }));
    });
  });
  const broadcast = () => {
    const msg = JSON.stringify({ type: 'state', state });
    for (const c of clients) if (c.readyState === c.OPEN) c.send(msg);
  };

  const wanted = opts.port ?? Number(process.env.REELFORGE_PORT ?? 4317);
  port = await listen(server, wanted);
  const url = `http://127.0.0.1:${port}/#${opts.mode}`;
  return {
    url,
    port,
    state: () => state,
    close: async () => {
      clearTimeout(debounce);
      clearTimeout(measureTimer);
      for (const w of watchers) w.close();
      for (const c of clients) c.terminate();
      wss.close();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
