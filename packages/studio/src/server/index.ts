/**
 * Studio server (SRS §8): the visual editor, cue marker and preview for one episode.
 * 127.0.0.1 only with same-origin checks; writes are limited to episode.yaml (structured edits),
 * cues.json and SVG assets of this episode, all JSON-only (IR-1, IR-2, NFR-9).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, type FSWatcher } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileEpisode,
  COMPONENTS,
  cuesSchema,
  ENTER_ANIMS,
  episodeJsonSchema,
  EXIT_ANIMS,
  FX_KINDS,
  ICONS_LIST,
  listResources,
  readCues,
  sha1,
  type CompileResult,
  type EpisodePaths,
  type Issue,
  type Timeline,
} from '@reelforge/core';
import { SOUNDS, type PcmAudio } from '@reelforge/audio';
import { RUNTIME_DIR } from '@reelforge/runtime';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseDocument } from 'yaml';
import { applyOps, EditError, History, parseOps } from './edit.js';
import { listen, readBody, safeJoin, sendFile } from './http.js';
import { RenderBusyError, RenderRunner, type Job, type RenderOptions } from './jobs.js';
export { startHub, type Hub, type HubOptions, type EpisodeSummary } from './hub.js';
export { applyOps, History, parseOps, type EditOp } from './edit.js';
export { RenderRunner, type Job, type RenderOptions } from './jobs.js';

export type StudioMode = 'edit' | 'cue' | 'dev';

const CLIENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'client');

export interface StudioOptions {
  paths: EpisodePaths;
  mode: StudioMode;
  port?: number;
  preset?: string;
  decode?: (file: string) => PcmAudio;
  /** Headless V-9/V-10 measuring (runs in the background after each compile). */
  measure?: (tl: Timeline) => Promise<Issue[]>;
  log?: (msg: string) => void;
  /** Shared render queue (the dashboard passes its own so only one render runs at a time). */
  renderer?: RenderRunner;
  /** Key of this episode in the renderer's jobs (defaults to the episode id). */
  renderKey?: string;
}

export interface StudioState {
  mode: StudioMode;
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
  /** episode.yaml as data (last version that parsed), for the editor's layers and inspector. */
  spec: Record<string, unknown> | null;
  history: { undo: number; redo: number; undoLabel?: string; redoLabel?: string };
  job: Job | null;
  outputs: { file: string; size: number; mtime: number }[];
  file: string;
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

  const history = new History();
  const renderer = opts.renderer ?? new RenderRunner({ decode: opts.decode, log });
  const renderKey = opts.renderKey ?? paths.id;
  let lastSpec: Record<string, unknown> | null = null;
  const readSpec = () => {
    try {
      const doc = parseDocument(readFileSync(paths.yaml, 'utf8'));
      if (!doc.errors.length) lastSpec = (doc.toJS() as Record<string, unknown>) ?? null;
    } catch {
      /* keep the last good spec */
    }
    return lastSpec;
  };
  const outputs = () =>
    existsSync(paths.out)
      ? readdirSync(paths.out)
          .filter((f) => /\.(mp4|srt|jpg|png|md)$/.test(f) && !f.startsWith('.'))
          .map((f) => {
            const st = statSync(path.join(paths.out, f));
            return { file: f, size: st.size, mtime: st.mtimeMs };
          })
          .sort((a, b) => b.mtime - a.mtime)
      : [];

  const voiceInfo = () => {
    const v = result?.voice;
    // The version query makes the editor reload the audio when a new recording is uploaded.
    const version = existsSync(v?.file ?? '') ? Math.round(statSync(v!.file).mtimeMs) : 0;
    return v ? { url: `/episode/voice${path.extname(v.file)}?v=${version}`, duration: v.duration } : null;
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
      spec: readSpec(),
      history: history.counts,
      job: renderer.job?.key === renderKey ? renderer.job : null,
      outputs: outputs(),
      file: paths.yaml,
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
      if (req.method === 'PUT' && p === '/api/asset') return await putAsset(req, res, url);
      if (req.method === 'POST' && p.startsWith('/api/')) return await post(req, res, p);
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { allow: 'GET, HEAD' }).end();
        return;
      }
      if (p === '/api/meta') return json(res, 200, meta());
      if (p.startsWith('/episode/out/'))
        return sendFile(req, res, safeJoin(paths.out, p.slice('/episode/out/'.length)));
      if (p === '/api/state') {
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        });
        res.end(JSON.stringify(state));
        return;
      }
      if (p.startsWith('/episode/voice')) return sendFile(req, res, result.voice?.file);
      if (p.startsWith('/episode/assets/')) {
        // Assets are shown as images; never let an uploaded SVG run script on this origin.
        res.setHeader(
          'content-security-policy',
          "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        );
        return sendFile(req, res, safeJoin(paths.assets, p.slice('/episode/assets/'.length)));
      }
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

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res
      .writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      .end(JSON.stringify(body));
  };

  let metaCache: object | null = null;
  const meta = () =>
    (metaCache ??= {
      components: Object.values(COMPONENTS).map((c) => ({
        name: c.name,
        description: c.description,
        size: c.size,
        layer: c.layer ?? 'base',
        fill: Boolean(c.fill),
        endpoints: c.endpoints ?? [],
        enter: c.enter ?? 'pop',
      })),
      schemas: (episodeJsonSchema() as { 'x-components': Record<string, unknown> })['x-components'],
      enterAnims: ENTER_ANIMS,
      exitAnims: EXIT_ANIMS,
      fxKinds: FX_KINDS,
      icons: ICONS_LIST,
      sounds: SOUNDS,
      themes: listResources('theme', paths.root),
      presets: listResources('preset', paths.root),
    });

  const listAssets = () =>
    existsSync(paths.assets) ? readdirSync(paths.assets).filter((f) => /\.svg$/i.test(f)) : [];

  const refresh = () => {
    compile();
    broadcast();
  };

  async function post(req: IncomingMessage, res: ServerResponse, p: string) {
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json'))
      return json(res, 415, { error: 'Expected application/json' });
    let body: Record<string, unknown>;
    try {
      body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>;
    } catch {
      return json(res, 400, { error: 'Invalid JSON body' });
    }
    try {
      switch (p) {
        case '/api/edit': {
          const ops = parseOps(body);
          const label = typeof body.label === 'string' ? body.label.slice(0, 80) : 'Edit';
          const text = applyOps(readFileSync(paths.yaml, 'utf8'), ops);
          history.write(paths.yaml, text, label);
          refresh();
          return json(res, 200, { ok: true, history: history.counts });
        }
        case '/api/undo':
        case '/api/redo': {
          const label = p === '/api/undo' ? history.undo() : history.redo();
          refresh();
          return json(res, 200, { ok: true, label, history: history.counts });
        }
        case '/api/assets':
          return json(res, 200, { assets: listAssets() });
        case '/api/render': {
          const job = renderer.start(renderKey, paths, (body.options ?? {}) as RenderOptions);
          return json(res, 202, { job });
        }
        case '/api/render/cancel':
          if (renderer.job?.key === renderKey) renderer.cancel();
          return json(res, 200, { ok: true });
        default:
          return json(res, 404, { error: 'Unknown endpoint' });
      }
    } catch (e) {
      if (e instanceof EditError) return json(res, e.status, { error: e.message });
      if (e instanceof RenderBusyError) return json(res, 409, { error: e.message });
      throw e;
    }
  }

  /** Stores an SVG in the episode's assets/ folder (for icon src). */
  async function putAsset(req: IncomingMessage, res: ServerResponse, url: URL) {
    const name = path.basename(url.searchParams.get('name') ?? '').replace(/[^\w.-]/g, '_');
    if (!/^[\w-][\w.-]{0,80}\.svg$/i.test(name))
      return json(res, 415, { error: 'Only .svg files can be added' });
    const text = await readBody(req, 2 << 20);
    if (!/<svg[\s>]/i.test(text) || /<script|\son\w+\s*=|javascript:/i.test(text))
      return json(res, 422, { error: 'Not a plain SVG file (scripts are not allowed)' });
    mkdirSync(paths.assets, { recursive: true });
    history.write(path.join(paths.assets, name), text, `Add ${name}`);
    refresh();
    return json(res, 200, { ok: true, file: `assets/${name}`, assets: listAssets() });
  }

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
    history.write(paths.cues, `${JSON.stringify(data, null, 2)}\n`, 'Edit cues');
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
      ws.on('error', () => clients.delete(ws));
      ws.send(JSON.stringify({ type: 'state', state }));
    });
  });
  const unsubscribe = renderer.subscribe((j) => {
    if (j.key !== renderKey) return;
    state = { ...state, job: j, outputs: j.status === 'running' ? state.outputs : outputs() };
    const msg = JSON.stringify({ type: 'job', job: j, outputs: state.outputs });
    for (const c of clients) if (c.readyState === c.OPEN) c.send(msg);
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
      unsubscribe();
      for (const w of watchers) w.close();
      for (const c of clients) c.terminate();
      wss.close();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
