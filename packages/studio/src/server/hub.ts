/**
 * Project dashboard ("hub"): one localhost page to manage every episode of a project —
 * create, upload voice, mark cues, preview, validate, render with live progress, open outputs.
 *
 * Security model (NFR-9, ADR-015): bound to 127.0.0.1 by default, Host/Origin checks on every request
 * and WebSocket, JSON-only writes, and every file path is resolved inside the project root. AI
 * clients use /mcp and /api/v1 (see agents.ts); a bearer token guards them when the dashboard is
 * bound to another address or REELFORGE_REQUIRE_TOKEN=1.
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
  fillTemplate,
  findTemplate,
  listPacks,
  pick,
  slotsSchema,
  type Lang,
  listResources,
  readCues,
  writeCues,
  type EpisodePaths,
} from '@reelforge/core';
import { alignEpisode, AssistError, assistStatus, providerStatus, type AlignEngine } from '@reelforge/assist';
import { ffmpegBin, measureTimeline, runDoctor, snapFrames } from '@reelforge/renderer';
import { RUNTIME_DIR } from '@reelforge/runtime';
import { WebSocketServer, type WebSocket } from 'ws';
import { listSkills, skillsDir } from '../tools/guide.js';
import { docFile } from '../tools/resources.js';
import type { ToolHost } from '../tools/types.js';
import { createAgentApi, stdioCommand } from './agents.js';
import { docsKind, serveDocs } from './docs.js';
import { galleryComponent, galleryComponents, galleryFrame, galleryThemes } from './gallery.js';
import { listen, readBody, safeJoin, sendFile } from './http.js';
import { startStudio, type Studio, type StudioMode } from './index.js';
import { RenderBusyError, RenderRunner, type RenderOptions } from './jobs.js';
import {
  configDir,
  hostAllowed,
  isLoopback,
  isWildcard,
  loadOrCreateToken,
  originAllowed,
  parseAllowedHosts,
  peerIsLoopback,
  type HostPolicy,
} from './security.js';

const CLIENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'client');
const VERSION = '1.0.0';
const MAX_UPLOAD = 1024 * 1024 * 1024; // 1 GiB

export interface HubOptions {
  root: string;
  port?: number;
  /** Bind address (default 127.0.0.1 or $REELFORGE_HOST). */
  host?: string;
  /** Extra Host names to accept (default $REELFORGE_ALLOWED_HOSTS, comma separated). */
  allowedHosts?: string[];
  /** Require the bearer token on /mcp and /api/v1 (default: non-loopback bind or REELFORGE_REQUIRE_TOKEN=1). */
  requireToken?: boolean;
  /** Where the token file lives (default: the user config folder, $REELFORGE_CONFIG_DIR). */
  configDir?: string;
  decode?: (file: string) => PcmAudio;
  log?: (msg: string) => void;
}

export interface Hub {
  url: string;
  port: number;
  host: string;
  /** Whether /mcp and /api/v1 require `Authorization: Bearer <token>`. */
  tokenRequired: boolean;
  /** Path of the token file when a token is required. */
  tokenFile?: string;
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
  cues: { marked: number; draft: boolean; auto: boolean } | null;
  voice: { file: string; duration: number } | null;
  issues: { errors: number; warnings: number; first?: string };
  outputs: OutputFile[];
  updated: number;
}

export type { Job } from './jobs.js';

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
  let aligning = false;
  const runner = new RenderRunner({ decode: opts.decode, log });
  runner.subscribe((j) => {
    if (j.status !== 'running') summaryCache.delete(j.key);
    broadcast({ type: 'job', job: j });
    if (j.status !== 'running') broadcast({ type: 'project' });
  });
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
      cues: cuesFile
        ? {
            marked: Object.keys(cuesFile.cues).length,
            draft: Boolean(cuesFile.draft),
            auto: Boolean(cuesFile.auto),
          }
        : null,
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
    docs: docsKind() !== null,
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
    job: runner.job,
  });

  // ------------------------------------------------------------------ actions
  /** Packs with their templates and slots, names localized for the dialog (both languages kept). */
  const packsInfo = () => {
    const { packs, errors } = listPacks(root);
    const both = (v: string | { en: string; ar: string }) => ({ en: pick(v, 'en'), ar: pick(v, 'ar') });
    return {
      errors,
      packs: packs.map((p) => ({
        id: p.id,
        name: both(p.name),
        description: both(p.description),
        theme: p.theme,
        templates: p.templates.map((t) => ({
          id: t.id,
          title: both(t.title),
          description: both(t.description),
          languages: Object.keys(t.files),
          slots: Object.entries(t.slots).map(([name, s]) => ({
            name,
            label: s.label,
            type: s.type,
            ...(s.min !== undefined ? { min: s.min } : {}),
            ...(s.max !== undefined ? { max: s.max } : {}),
            ...(s.help ? { help: s.help } : {}),
            default: typeof s.default === 'number' ? { en: s.default, ar: s.default } : both(s.default),
          })),
        })),
      })),
    };
  };

  /** A new episode from an industry template: validated slot values, filled YAML and draft cues. */
  const createFromTemplate = (id: string, dir: string, body: Record<string, unknown>) => {
    const lang: Lang = body.lang === 'ar' ? 'ar' : 'en';
    let found: ReturnType<typeof findTemplate>;
    try {
      found = findTemplate(listPacks(root).packs, String(body.pack), String(body.template ?? ''));
    } catch (e) {
      throw new HttpError(422, (e as Error).message);
    }
    const slots = body.slots && typeof body.slots === 'object' ? body.slots : {};
    const parsed = slotsSchema(found.template, lang).safeParse(slots);
    if (!parsed.success)
      throw new HttpError(
        422,
        `Check the fields: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'slots'}: ${i.message}`).join('; ')}`,
      );
    const { yaml } = fillTemplate(found.pack, found.template, { lang, id, slots: parsed.data });
    mkdirSync(path.join(dir, 'assets'), { recursive: true });
    writeFileSync(path.join(dir, 'episode.yaml'), yaml);
    const p = episodePaths(dir, root);
    const r = compileEpisode(p, { draftCues: true, voice: null, decode: opts.decode });
    writeCues(p.cues, draftCues(r.script, r.spec?.audio.voice));
  };

  const createEpisode = (body: {
    id?: string;
    series?: string;
    title?: string;
    episode?: number;
    lang?: string;
    pack?: string;
    template?: string;
    slots?: Record<string, unknown>;
  }) => {
    const id = String(body.id ?? '').trim();
    if (!SLUG.test(id))
      throw new HttpError(422, 'The id must be a slug: letters, digits, "-" and "_" (e.g. ep10)');
    const dir = path.join(root, 'episodes', id);
    if (existsSync(path.join(dir, 'episode.yaml')))
      throw new HttpError(409, `Episode "${id}" already exists`);
    if (body.pack) {
      createFromTemplate(id, dir, body as Record<string, unknown>);
      writeSchema();
      return { key: `episodes/${id}` };
    }
    mkdirSync(path.join(dir, 'assets'), { recursive: true });
    let yaml = episodeTemplate(id, {
      series: body.series?.trim() || undefined,
      episode: Number(body.episode) || 1,
      lang: body.lang === 'ar' ? 'ar' : 'en',
    });
    if (body.title?.trim())
      yaml = yaml.replace('title: "My topic"', `title: ${JSON.stringify(body.title.trim())}`);
    writeFileSync(path.join(dir, 'episode.yaml'), yaml);
    writeSchema();
    return { key: `episodes/${id}` };
  };

  function writeSchema() {
    const schemaFile = path.join(root, 'schema', 'episode.schema.json');
    if (existsSync(schemaFile)) return;
    mkdirSync(path.dirname(schemaFile), { recursive: true });
    writeFileSync(schemaFile, `${JSON.stringify(episodeJsonSchema(), null, 2)}\n`);
  }

  const openStudio = async (key: string, mode: StudioMode) => {
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
        renderer: runner,
        renderKey: key,
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

  const startRender = (key: string, o: RenderOptions) => {
    try {
      return { job: runner.start(key, resolveKey(key), o) };
    } catch (e) {
      if (e instanceof RenderBusyError) throw new HttpError(409, e.message);
      throw e;
    }
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
          rmSync(tmp, { force: true });
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
      const targetExt = path.extname(target).toLowerCase();
      if (isPcm && targetExt === '.wav') renameSync(tmp, target);
      else {
        // Convert next to the target and swap it in only when ffmpeg succeeded (keeps the old take otherwise).
        const converted = path.join(p.dir, `.voice-${Date.now()}${targetExt || '.wav'}`);
        const codec = targetExt === '.wav' || !targetExt ? ['-c:a', 'pcm_s16le'] : [];
        const r = spawnSync(
          ffmpegBin(),
          ['-v', 'error', '-y', '-i', tmp, '-ac', '1', '-ar', '48000', ...codec, converted],
          { encoding: 'utf8' },
        );
        if (r.error || r.status !== 0) {
          rmSync(converted, { force: true });
          throw new HttpError(
            422,
            `Cannot convert the recording with ffmpeg: ${(r.error?.message ?? r.stderr).trim().split('\n').pop()}`,
          );
        }
        renameSync(converted, target);
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
  const bindHost = (opts.host ?? process.env.REELFORGE_HOST ?? '127.0.0.1').trim() || '127.0.0.1';
  const policy: HostPolicy = {
    port: () => port,
    allowed: [
      ...(opts.allowedHosts ?? parseAllowedHosts(process.env.REELFORGE_ALLOWED_HOSTS)),
      // A specific address the person asked for is a name clients will use.
      ...(!isLoopback(bindHost) && !isWildcard(bindHost) ? [bindHost.toLowerCase()] : []),
    ],
  };
  const sameOrigin = (req: IncomingMessage) =>
    hostAllowed(req.headers.host, policy) && originAllowed(req.headers.origin, policy);
  const tokenRequired =
    opts.requireToken ?? (process.env.REELFORGE_REQUIRE_TOKEN === '1' || !isLoopback(bindHost));
  const tokenDir = opts.configDir ?? configDir();
  const token = tokenRequired ? loadOrCreateToken(tokenDir) : undefined;

  const toolHost: ToolHost = {
    root,
    decode: opts.decode,
    runner,
    log,
    openStudio: async (p) => openStudio(path.relative(root, p.dir).split(path.sep).join('/'), 'edit'),
  };
  const agents = createAgentApi({ host: toolHost, version: VERSION, token });

  /** Details for the Connect AI page; the token only goes to this computer's own dashboard page. */
  const connectInfo = (req: IncomingMessage) => {
    const fetchSite = String(req.headers['sec-fetch-site'] ?? 'same-origin');
    const local = peerIsLoopback(req) && (fetchSite === 'same-origin' || fetchSite === 'none');
    const origin = `http://${req.headers.host}`;
    return {
      version: VERSION,
      root,
      bind: bindHost,
      mcpUrl: `${origin}/mcp`,
      apiUrl: `${origin}/api/v1`,
      openapiUrl: `${origin}/api/v1/openapi.json`,
      cardUrl: `${origin}/.well-known/mcp.json`,
      stdio: stdioCommand(root),
      tokenRequired,
      token: tokenRequired && local ? token : undefined,
      tokenFile: tokenRequired ? path.join(tokenDir, 'token') : undefined,
      skills: listSkills(skillsDir(root)).map((s) => ({ name: s.name, description: s.description })),
      skillsDir: skillsDir(root) ?? null,
      llms: Boolean(docFile(root, 'llms.txt')),
      llmsFull: Boolean(docFile(root, 'llms-full.txt')),
    };
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
      if (await agents.handle(req, res, url)) return;
      if (!peerIsLoopback(req))
        throw new HttpError(
          403,
          'Forbidden: the dashboard answers on this computer only; AI clients use /mcp and /api/v1',
        );
      const q = (k: string) => url.searchParams.get(k) ?? '';
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (p === '/api/project') return json(res, 200, project());
        if (p === '/api/packs') return json(res, 200, packsInfo());
        if (p === '/api/connect') return json(res, 200, connectInfo(req));
        if (p === '/connect') return sendFile(req, res, path.join(CLIENT_DIR, 'connect.html'));
        if (p === '/gallery') return sendFile(req, res, path.join(CLIENT_DIR, 'gallery.html'));
        if (p === '/api/gallery/components') return json(res, 200, galleryComponents());
        if (p.startsWith('/api/gallery/components/')) {
          const c = galleryComponent(p.slice('/api/gallery/components/'.length));
          if (!c) throw new HttpError(404, 'Unknown component');
          return json(res, 200, c);
        }
        if (p === '/api/gallery/themes') return json(res, 200, galleryThemes(root));
        if (p.startsWith('/gallery/frames/')) {
          const m = p.slice('/gallery/frames/'.length).match(/^([a-z0-9_-]+)\.png$/i);
          const f = m ? galleryFrame(m[1]) : undefined;
          if (!f) throw new HttpError(404, 'No preview frame');
          return sendFile(req, res, f);
        }
        if (p.startsWith('/gallery/fonts/')) {
          // The fonts vendored into the runtime page, for the theme previews.
          const name = p.slice('/gallery/fonts/'.length);
          if (!/^[a-z0-9-]+\.(woff2|css)$/.test(name)) throw new HttpError(404, 'Not found');
          return sendFile(req, res, safeJoin(path.join(RUNTIME_DIR, 'fonts'), name));
        }
        if (p === '/api/doctor')
          return json(res, 200, {
            checks: await runDoctor(),
            assist: assistStatus(),
            llm: await providerStatus(),
          });
        if (p === '/api/thumb') {
          const f = await thumbnail(q('ep'));
          if (!f) throw new HttpError(404, 'No thumbnail');
          return sendFile(req, res, f);
        }
        if (p === '/files') {
          const ep = resolveKey(q('ep'));
          const rel = q('f');
          if (!rel.startsWith('out/')) throw new HttpError(403, 'Only output files can be served');
          res.setHeader(
            'content-security-policy',
            "sandbox; default-src 'none'; img-src data:; media-src 'self'",
          );
          return sendFile(req, res, safeJoin(ep.out, rel.slice(4)));
        }
        if (serveDocs(req, res, p)) return;
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
          return json(
            res,
            200,
            await openStudio(
              String(body.ep),
              body.mode === 'cue' || body.mode === 'dev' ? body.mode : 'edit',
            ),
          );
        case '/api/validate':
          return json(res, 200, await validate(String(body.ep)));
        case '/api/render':
          return json(res, 202, startRender(String(body.ep), (body.options ?? {}) as Record<string, never>));
        case '/api/render/cancel':
          runner.cancel();
          return json(res, 200, { ok: true });
        case '/api/cues/draft': {
          const ep = resolveKey(body.ep);
          if (existsSync(ep.cues))
            throw new HttpError(409, 'cues.json already exists; mark cues in the editor’s Cues mode instead');
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
        case '/api/cues/auto': {
          const ep = resolveKey(body.ep);
          if (aligning) throw new HttpError(409, 'Already aligning another episode; wait for it to finish');
          aligning = true;
          try {
            const engine = ['auto', 'dsp', 'whisper'].includes(String(body.engine))
              ? (body.engine as AlignEngine)
              : 'auto';
            const r = await alignEpisode(ep, { engine, force: body.force === true, decode: opts.decode });
            summaryCache.delete(String(body.ep));
            broadcast({ type: 'project' });
            return json(res, 200, {
              ok: true,
              engine: r.engine,
              vad: r.vad,
              matched: r.matched,
              confidence: r.confidence,
              ms: r.ms,
              note: r.note,
            });
          } catch (e) {
            if (e instanceof AssistError)
              throw new HttpError(/by hand/.test(e.message) ? 409 : 422, e.message);
            throw e;
          } finally {
            aligning = false;
          }
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
    if (!sameOrigin(req) || !peerIsLoopback(req) || new URL(req.url ?? '/', 'http://x').pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws);
      ws.on('close', () => clients.delete(ws));
      ws.on('error', () => clients.delete(ws));
      if (runner.job) ws.send(JSON.stringify({ type: 'job', job: runner.job }));
    });
  });
  function broadcast(msg: unknown) {
    const s = JSON.stringify(msg);
    for (const c of clients) if (c.readyState === c.OPEN) c.send(s);
  }

  port = await listen(server, opts.port ?? Number(process.env.REELFORGE_PORT ?? 4310), bindHost);
  const shown = isWildcard(bindHost) ? '127.0.0.1' : bindHost;
  return {
    url: `http://${shown.includes(':') && !shown.startsWith('[') ? `[${shown}]` : shown}:${port}/`,
    port,
    host: bindHost,
    tokenRequired,
    tokenFile: tokenRequired ? path.join(tokenDir, 'token') : undefined,
    close: async () => {
      runner.cancel();
      for (const s of studios.values()) await s.close().catch(() => undefined);
      for (const c of clients) c.terminate();
      wss.close();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
