/**
 * Project dashboard ("hub"): one localhost page to manage every episode of a project —
 * create, upload voice, mark cues, preview, validate, render with live progress, open outputs.
 *
 * Security model (NFR-9): bound to 127.0.0.1, same-origin checks on every request and WebSocket,
 * JSON-only writes, and every file path is resolved inside the project root.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeWav, wavInfo, type PcmAudio } from '@reelforge/audio';
import {
  compileEpisode,
  draftCues,
  episodeJsonSchema,
  episodePaths,
  episodeTemplate,
  INSTALL_ROOT,
  listResources,
  readCues,
  writeCues,
  type EpisodePaths,
  type Issue,
} from '@reelforge/core';
import {
  ffmpegBin,
  measureTimeline,
  renderEpisode,
  runDoctor,
  snapFrames,
  type Progress,
} from '@reelforge/renderer';
import { WebSocketServer, type WebSocket } from 'ws';
import { listen, readBody, safeJoin, sendFile } from './http.js';
import { startStudio, type Studio } from './index.js';

const CLIENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'client');
const VERSION = '1.0.0';
const MAX_UPLOAD = 1024 * 1024 * 1024; // 1 GiB

export interface HubOptions {
  root: string;
  port?: number;
  decode?: (file: string) => PcmAudio;
  log?: (msg: string) => void;
}

export interface Hub {
  url: string;
  port: number;
  close(): Promise<void>;
}

export interface OutputFile {
  kind: 'master' | 'share' | 'part' | 'sheet' | 'srt' | 'publish' | 'cover';
  file: string;
  size: number;
  mtime: number;
}

export interface EpisodeSummary {
  key: string;
  group: 'episodes' | 'examples';
  id: string;
  title: string;
  series: string;
  episode: number;
  preset: string;
  theme: string;
  lines: number;
  scenes: number;
  duration: number;
  cues: { marked: number; draft: boolean } | null;
  voice: { file: string; duration: number } | null;
  issues: { errors: number; warnings: number; first?: string };
  outputs: OutputFile[];
  updated: number;
}

export interface Job {
  id: number;
  key: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  phase: string;
  done: number;
  total: number;
  fps?: number;
  eta?: number;
  started: number;
  finished?: number;
  message?: string;
  issues?: Issue[];
}

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Approximate WAV duration from the header only (no full decode). */
function voiceDuration(file: string): number | undefined {
  try {
    const fd = openSync(file, 'r');
    const buf = Buffer.alloc(65536);
    const n = readSync(fd, buf, 0, buf.length, 0);
    closeSync(fd);
    const info = wavInfo(buf.subarray(0, n));
    const bytesPerFrame = (info.bitsPerSample / 8) * info.channels;
    return (statSync(file).size - info.dataOffset) / bytesPerFrame / info.sampleRate;
  } catch {
    return undefined;
  }
}

const OUT_KINDS: [RegExp, OutputFile['kind']][] = [
  [/\.master\.mp4$/, 'master'],
  [/\.share\.mp4$/, 'share'],
  [/\.part\.mp4$/, 'part'],
  [/\.sheet\.jpg$/, 'sheet'],
  [/\.srt$/, 'srt'],
  [/^publish\.md$/, 'publish'],
  [/\.cover\.png$/, 'cover'],
];

function listOutputs(p: EpisodePaths): OutputFile[] {
  if (!existsSync(p.out)) return [];
  const out: OutputFile[] = [];
  for (const f of readdirSync(p.out)) {
    const kind = OUT_KINDS.find(([re]) => re.test(f))?.[1];
    if (!kind) continue;
    const st = statSync(path.join(p.out, f));
    out.push({ kind, file: `out/${f}`, size: st.size, mtime: st.mtimeMs });
  }
  const order = OUT_KINDS.map(([, k]) => k);
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

function openInFileManager(dir: string): void {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [dir]]
      : process.platform === 'win32'
        ? ['explorer', [dir]]
        : ['xdg-open', [dir]];
  try {
    const child = spawn(cmd, args as string[], { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    /* no file manager available */
  }
}

export async function startHub(opts: HubOptions): Promise<Hub> {
  const root = path.resolve(opts.root);
  const log = opts.log ?? (() => undefined);
  const studios = new Map<string, Studio>();
  const summaryCache = new Map<string, { stamp: string; summary: EpisodeSummary }>();
  let job: Job | null = null;
  let jobAbort: AbortController | null = null;
  let jobSeq = 0;
  let thumbQueue: Promise<unknown> = Promise.resolve();

  // ------------------------------------------------------------------ episodes
  const findEpisodeDirs = (): { key: string; group: EpisodeSummary['group']; dir: string }[] => {
    const out: { key: string; group: EpisodeSummary['group']; dir: string }[] = [];
    const scan = (dir: string, group: EpisodeSummary['group'], depth: number) => {
      if (!existsSync(dir) || depth > 2) return;
      for (const name of readdirSync(dir).sort()) {
        if (name.startsWith('.') || name === 'out' || name === 'node_modules') continue;
        const full = path.join(dir, name);
        if (!statSync(full).isDirectory()) continue;
        if (existsSync(path.join(full, 'episode.yaml'))) {
          out.push({ key: path.relative(root, full).split(path.sep).join('/'), group, dir: full });
        } else scan(full, group, depth + 1);
      }
    };
    scan(path.join(root, 'episodes'), 'episodes', 0);
    scan(path.join(root, 'examples'), 'examples', 0);
    return out;
  };

  const resolveKey = (key: unknown): EpisodePaths => {
    if (typeof key !== 'string' || !key) throw new HttpError(400, 'Missing episode key');
    const dir = safeJoin(root, key);
    if (!dir || !existsSync(path.join(dir, 'episode.yaml')))
      throw new HttpError(404, `Episode "${key}" not found`);
    return episodePaths(dir, root);
  };

  const mtime = (f: string) => (existsSync(f) ? statSync(f).mtimeMs : 0);

  const summarize = (key: string, group: EpisodeSummary['group'], dir: string): EpisodeSummary => {
    const p = episodePaths(dir, root);
    const outs = listOutputs(p);
    const voiceGuess = path.join(dir, 'voice.wav');
    const stamp = [
      mtime(p.yaml),
      mtime(p.cues),
      mtime(voiceGuess),
      outs.map((o) => `${o.file}:${o.mtime}`).join(','),
    ].join('|');
    const hit = summaryCache.get(key);
    if (hit && hit.stamp === stamp) return hit.summary;
    // Voice is summarized from its header; the full decode is not needed for the dashboard.
    const r = compileEpisode(p, { draftCues: true, voice: null, decode: opts.decode });
    const spec = r.spec;
    const voiceFile = spec ? path.resolve(dir, spec.audio.voice) : voiceGuess;
    const vd = existsSync(voiceFile) ? (voiceDuration(voiceFile) ?? 0) : undefined;
    const cuesFile = readCues(p.cues).cues;
    const issues = r.issues.filter((i) => !(i.rule === 'V-4' && /not found/.test(i.message)));
    const errors = issues.filter((i) => i.level === 'error');
    const summary: EpisodeSummary = {
      key,
      group,
      id: spec?.meta.id ?? path.basename(dir),
      title: spec?.meta.title || path.basename(dir),
      series: spec?.meta.series ?? '',
      episode: spec?.meta.episode ?? 1,
      preset: spec?.meta.preset ?? 'tiktok',
      theme: spec?.meta.theme ?? 'default',
      lines: r.script.length,
      scenes: spec?.scenes.length ?? 0,
      duration: vd ?? r.timeline?.duration ?? 0,
      cues: cuesFile ? { marked: Object.keys(cuesFile.cues).length, draft: Boolean(cuesFile.draft) } : null,
      voice: vd !== undefined ? { file: path.basename(voiceFile), duration: vd } : null,
      issues: {
        errors: errors.length,
        warnings: issues.filter((i) => i.level === 'warn').length,
        first: errors[0]?.message,
      },
      outputs: outs,
      updated: Math.max(mtime(p.yaml), mtime(p.cues)),
    };
    summaryCache.set(key, { stamp, summary });
    return summary;
  };

  const project = () => ({
    root,
    name: path.basename(root),
    version: VERSION,
    presets: listResources('preset', root),
    themes: listResources('theme', root),
    docs: existsSync(path.join(INSTALL_ROOT, 'documentation', 'index.html')),
    episodes: findEpisodeDirs()
      .map((e) => {
        try {
          return summarize(e.key, e.group, e.dir);
        } catch (err) {
          log(`summary failed for ${e.key}: ${(err as Error).message}`);
          return null;
        }
      })
      .filter(Boolean),
    job,
  });

  // ------------------------------------------------------------------ actions
  const createEpisode = (body: { id?: string; series?: string; title?: string; episode?: number }) => {
    const id = String(body.id ?? '').trim();
    if (!SLUG.test(id))
      throw new HttpError(422, 'The id must be a slug: letters, digits, "-" and "_" (e.g. ep10)');
    const dir = path.join(root, 'episodes', id);
    if (existsSync(path.join(dir, 'episode.yaml')))
      throw new HttpError(409, `Episode "${id}" already exists`);
    mkdirSync(path.join(dir, 'assets'), { recursive: true });
    let yaml = episodeTemplate(id, {
      series: body.series?.trim() || undefined,
      episode: Number(body.episode) || 1,
    });
    if (body.title?.trim())
      yaml = yaml.replace('title: "My topic"', `title: ${JSON.stringify(body.title.trim())}`);
    writeFileSync(path.join(dir, 'episode.yaml'), yaml);
    const schemaFile = path.join(root, 'schema', 'episode.schema.json');
    if (!existsSync(schemaFile)) {
      mkdirSync(path.dirname(schemaFile), { recursive: true });
      writeFileSync(schemaFile, `${JSON.stringify(episodeJsonSchema(), null, 2)}\n`);
    }
    return { key: `episodes/${id}` };
  };

  const openStudio = async (key: string, mode: 'cue' | 'dev') => {
    const p = resolveKey(key);
    let s = studios.get(p.dir);
    if (!s) {
      s = await startStudio({
        paths: p,
        mode,
        port: 0,
        decode: opts.decode,
        measure: (tl) =>
          measureTimeline(tl, { cacheDir: path.join(p.out, '.cache'), assetsDir: p.assets, file: p.yaml }),
        log,
      });
      studios.set(p.dir, s);
    }
    return { url: s.url.replace(/#.*$/, `#${mode}`) };
  };

  const validate = async (key: string) => {
    const p = resolveKey(key);
    const r = compileEpisode(p, { decode: opts.decode });
    const issues = [...r.issues];
    if (r.timeline && !issues.some((i) => i.level === 'error' && i.rule === 'V-1')) {
      try {
        issues.push(
          ...(await measureTimeline(r.timeline, {
            cacheDir: path.join(p.out, '.cache'),
            assetsDir: p.assets,
            file: p.yaml,
          })),
        );
      } catch (e) {
        issues.push({
          rule: 'V-9',
          level: 'info',
          message: `Headless checks skipped: ${(e as Error).message.split('\n')[0]}`,
        });
      }
    }
    return { issues };
  };

  const startRender = (
    key: string,
    o: { preset?: string; shareMb?: number; sfx?: boolean; silent?: boolean; fast?: boolean },
  ) => {
    if (job?.status === 'running') throw new HttpError(409, `A render is already running (${job.key})`);
    const p = resolveKey(key);
    jobAbort = new AbortController();
    const current: Job = {
      id: ++jobSeq,
      key,
      status: 'running',
      phase: 'validate',
      done: 0,
      total: 1,
      started: Date.now(),
    };
    job = current;
    broadcast({ type: 'job', job });
    let lastSent = 0;
    renderEpisode(p, {
      preset: typeof o.preset === 'string' && o.preset ? o.preset : undefined,
      shareMb: Number(o.shareMb) > 0 ? Number(o.shareMb) : undefined,
      sfx: o.sfx !== false,
      silent: Boolean(o.silent),
      fast: Boolean(o.fast),
      signal: jobAbort.signal,
      compile: { decode: opts.decode },
      onLog: log,
      onProgress: (pr: Progress) => {
        Object.assign(current, { phase: pr.phase, done: pr.done, total: pr.total, fps: pr.fps, eta: pr.eta });
        const now = Date.now();
        if (now - lastSent > 200 || pr.done === pr.total) {
          lastSent = now;
          broadcast({ type: 'job', job: current });
        }
      },
    })
      .then((r) => {
        current.status = r.ok ? 'done' : 'failed';
        current.message = r.ok
          ? `Rendered ${r.frames} frames in ${Math.round(r.seconds)} s`
          : `Output check failed: ${Object.values(r.compliance)
              .flatMap((c) => c?.problems ?? [])
              .join('; ')}`;
      })
      .catch((e: Error & { issues?: Issue[] }) => {
        current.status = jobAbort?.signal.aborted ? 'cancelled' : 'failed';
        current.message = e.message;
        current.issues = (e.issues ?? []).filter((i) => i.level === 'error').slice(0, 20);
      })
      .finally(() => {
        current.finished = Date.now();
        summaryCache.delete(key);
        broadcast({ type: 'job', job: current });
        broadcast({ type: 'project' });
      });
    return { job: current };
  };

  /** Stores an uploaded recording as the episode's voice file (converted to WAV when needed). */
  const uploadVoice = async (req: IncomingMessage, key: string, name: string) => {
    const p = resolveKey(key);
    const ext = (path.extname(name || '').toLowerCase() || '.wav').replace(/[^.a-z0-9]/g, '');
    if (!['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac', '.webm', '.opus'].includes(ext)) {
      throw new HttpError(415, `Unsupported audio type "${ext}". Use WAV, MP3, M4A, AAC, OGG, OPUS or FLAC.`);
    }
    const len = Number(req.headers['content-length'] ?? 0);
    if (len > MAX_UPLOAD) throw new HttpError(413, 'File too large (max 1 GB)');
    const tmp = path.join(p.dir, `.upload-${Date.now()}${ext}`);
    await new Promise<void>((resolve, reject) => {
      let size = 0;
      const ws = createWriteStream(tmp);
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_UPLOAD) {
          req.destroy();
          ws.destroy();
          reject(new HttpError(413, 'File too large (max 1 GB)'));
        }
      });
      req.pipe(ws);
      ws.on('finish', () => resolve());
      ws.on('error', reject);
      req.on('error', reject);
    });
    const spec = compileEpisode(p, { draftCues: true, voice: null }).spec;
    const target = path.resolve(p.dir, spec?.audio.voice ?? 'voice.wav');
    if (!target.startsWith(p.dir + path.sep)) {
      rmSync(tmp, { force: true });
      throw new HttpError(422, 'audio.voice must point inside the episode folder');
    }
    try {
      let isPcm = false;
      if (ext === '.wav') {
        try {
          decodeWav(readFileSync(tmp));
          isPcm = true;
        } catch {
          isPcm = false;
        }
      }
      if (isPcm && path.extname(target).toLowerCase() === '.wav') renameSync(tmp, target);
      else {
        const r = spawnSync(
          ffmpegBin(),
          ['-v', 'error', '-y', '-i', tmp, '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', target],
          { encoding: 'utf8' },
        );
        if (r.error || r.status !== 0)
          throw new HttpError(
            422,
            `Cannot convert the recording with ffmpeg: ${(r.error?.message ?? r.stderr).trim().split('\n').pop()}`,
          );
      }
    } finally {
      rmSync(tmp, { force: true });
    }
    summaryCache.delete(key);
    broadcast({ type: 'project' });
    return { voice: path.basename(target), duration: voiceDuration(target) };
  };

  const thumbnail = async (key: string): Promise<string | undefined> => {
    const p = resolveKey(key);
    const file = path.join(p.out, '.cache', 'thumb.jpg');
    const cover = path.join(p.out, `${path.basename(p.dir)}.cover.png`);
    if (existsSync(cover)) return cover;
    if (existsSync(file) && mtime(file) >= Math.max(mtime(p.yaml), mtime(p.cues))) return file;
    const work = thumbQueue.then(async () => {
      const r = compileEpisode(p, { draftCues: true, voice: null });
      if (!r.timeline || (!r.ok && r.issues.some((i) => i.rule === 'V-1' && i.level === 'error')))
        return undefined;
      const tl = r.timeline;
      // A representative frame: just before the end of the second scene (or 35 % in).
      const s = tl.scenes[1] ?? tl.scenes[0];
      const t = s ? Math.max(0, Math.min(tl.duration, s.end - 0.25)) : tl.duration * 0.35;
      const dir = path.join(p.out, '.cache');
      mkdirSync(dir, { recursive: true });
      const shot = await snapFrames(tl, [t], dir, { assetsDir: p.assets, sheet: false });
      const r2 = spawnSync(ffmpegBin(), [
        '-v',
        'error',
        '-y',
        '-i',
        shot.frames[0],
        '-vf',
        'scale=360:640',
        '-q:v',
        '4',
        file,
      ]);
      rmSync(shot.frames[0], { force: true });
      return r2.status === 0 ? file : undefined;
    });
    thumbQueue = work.catch(() => undefined);
    return work;
  };

  // ------------------------------------------------------------------ http
  let port = 0;
  const allowed = () => new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const sameOrigin = (req: IncomingMessage) => {
    if (!allowed().has(req.headers.host ?? '')) return false;
    const origin = req.headers.origin;
    return !origin || origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
  };
  const json = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  const jsonBody = async (req: IncomingMessage) => {
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json'))
      throw new HttpError(415, 'Expected application/json');
    try {
      return JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>;
    } catch {
      throw new HttpError(400, 'Invalid JSON body');
    }
  };

  const server = createServer(async (req, res) => {
    try {
      if (!sameOrigin(req))
        throw new HttpError(403, 'Forbidden: the dashboard accepts local same-origin requests only');
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const p = url.pathname;
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('referrer-policy', 'no-referrer');
      const q = (k: string) => url.searchParams.get(k) ?? '';
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (p === '/api/project') return json(res, 200, project());
        if (p === '/api/doctor') return json(res, 200, { checks: await runDoctor() });
        if (p === '/api/thumb') {
          const f = await thumbnail(q('ep'));
          if (!f) throw new HttpError(404, 'No thumbnail');
          return sendFile(req, res, f);
        }
        if (p === '/files') {
          const ep = resolveKey(q('ep'));
          const rel = q('f');
          if (!rel.startsWith('out/')) throw new HttpError(403, 'Only output files can be served');
          return sendFile(req, res, safeJoin(ep.out, rel.slice(4)));
        }
        if (p === '/docs' || p.startsWith('/docs/')) {
          const base = path.join(INSTALL_ROOT, 'documentation');
          return sendFile(
            req,
            res,
            safeJoin(base, p === '/docs' || p === '/docs/' ? 'index.html' : p.slice(6)),
          );
        }
        if (p.startsWith('/api/')) throw new HttpError(404, 'Unknown endpoint');
        return sendFile(req, res, safeJoin(CLIENT_DIR, p === '/' ? 'hub.html' : p.slice(1)));
      }
      if (req.method === 'PUT' && p === '/api/voice')
        return json(res, 200, await uploadVoice(req, q('ep'), q('name')));
      if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
      const body = await jsonBody(req);
      switch (p) {
        case '/api/episodes':
          return json(res, 201, createEpisode(body));
        case '/api/studio':
          return json(res, 200, await openStudio(String(body.ep), body.mode === 'cue' ? 'cue' : 'dev'));
        case '/api/validate':
          return json(res, 200, await validate(String(body.ep)));
        case '/api/render':
          return json(res, 202, startRender(String(body.ep), (body.options ?? {}) as Record<string, never>));
        case '/api/render/cancel':
          if (job?.status === 'running') jobAbort?.abort();
          return json(res, 200, { ok: true });
        case '/api/cues/draft': {
          const ep = resolveKey(body.ep);
          if (existsSync(ep.cues))
            throw new HttpError(409, 'cues.json already exists; mark cues in the cue marker instead');
          const r = compileEpisode(ep, { draftCues: true, decode: opts.decode });
          const d = draftCues(r.script, r.spec?.audio.voice);
          if (r.voice) {
            const k = r.voice.duration / d.audio.duration;
            for (const id of Object.keys(d.cues)) d.cues[id] = Math.round(d.cues[id] * k * 1000) / 1000;
            d.audio.duration = Math.round(r.voice.duration * 1000) / 1000;
          }
          writeCues(ep.cues, d);
          summaryCache.delete(String(body.ep));
          return json(res, 200, { ok: true });
        }
        case '/api/reveal': {
          const ep = resolveKey(body.ep);
          openInFileManager(body.out ? ep.out : ep.dir);
          return json(res, 200, { ok: true, dir: ep.dir });
        }
        default:
          throw new HttpError(404, 'Unknown endpoint');
      }
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) log(`dashboard error: ${(e as Error).stack ?? e}`);
      if (!res.headersSent)
        json(res, status, {
          error: status === 500 ? `Internal error: ${(e as Error).message}` : (e as Error).message,
        });
      else res.end();
    }
  });

  // ------------------------------------------------------------------ websocket (job progress)
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
      if (job) ws.send(JSON.stringify({ type: 'job', job }));
    });
  });
  function broadcast(msg: unknown) {
    const s = JSON.stringify(msg);
    for (const c of clients) if (c.readyState === c.OPEN) c.send(s);
  }

  port = await listen(server, opts.port ?? Number(process.env.REELFORGE_PORT ?? 4310));
  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    close: async () => {
      jobAbort?.abort();
      for (const s of studios.values()) await s.close().catch(() => undefined);
      for (const c of clients) c.terminate();
      wss.close();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
