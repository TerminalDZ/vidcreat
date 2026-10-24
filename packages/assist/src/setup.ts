/**
 * Optional model runtime (Level 1): transformers.js + onnxruntime are not part of the ReelForge
 * install. `setupAssist()` installs them once into the user cache from the committed lockfile
 * (`npm ci`), prunes what this machine cannot use, and downloads the models itself: every file comes
 * from a pinned Hugging Face commit and is checked against its SHA-256 before it is ever loaded.
 * transformers.js then runs with remote models disabled, so alignment is offline after setup.
 * The pins and hashes live in packages/assist/runtime/models.json (scripts/pin-assist-models.mjs).
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Shipped next to dist/: package.json + package-lock.json of the runtime, and models.json. */
export const RUNTIME_SPEC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../runtime');

export interface PinnedModel {
  repo: string;
  revision: string;
  files: Record<string, { sha256: string; size: number }>;
}
type ModelKey = 'whisper-tiny' | 'whisper-base' | 'whisper-small' | 'silero-vad';

let pins: Record<ModelKey, PinnedModel> | undefined;
export function pinnedModels(): Record<ModelKey, PinnedModel> {
  pins ??= JSON.parse(readFileSync(path.join(RUNTIME_SPEC_DIR, 'models.json'), 'utf8')) as Record<
    ModelKey,
    PinnedModel
  >;
  return pins;
}

export const TRANSFORMERS_VERSION = '4.3.2';

export const WHISPER_MODELS = {
  tiny: 'onnx-community/whisper-tiny_timestamped',
  base: 'onnx-community/whisper-base_timestamped',
  small: 'onnx-community/whisper-small_timestamped',
} as const;
export type WhisperSize = keyof typeof WHISPER_MODELS;

/** Per-user cache: $REELFORGE_CACHE, else the platform cache folder. */
export function cacheDir(): string {
  if (process.env.REELFORGE_CACHE) return path.resolve(process.env.REELFORGE_CACHE);
  if (process.platform === 'win32')
    return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'reelforge');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'reelforge');
  return path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'), 'reelforge');
}
export const assistDir = (): string => path.join(cacheDir(), 'assist');
export const modelsDir = (): string => path.join(assistDir(), 'models');
const modelDir = (m: PinnedModel): string => path.join(modelsDir(), ...m.repo.split('/'));
export const vadFile = (): string => path.join(modelDir(pinnedModels()['silero-vad']), 'onnx', 'model.onnx');

const req = () => createRequire(path.join(assistDir(), 'package.json'));

function resolves(name: string): boolean {
  try {
    req().resolve(name);
    return true;
  } catch {
    return false;
  }
}

const sha256File = (file: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')));
  });

const lockHash = (): string =>
  createHash('sha256')
    .update(readFileSync(path.join(RUNTIME_SPEC_DIR, 'package-lock.json')))
    .digest('hex');
const LOCK_MARKER = '.reelforge-lock';
const VERIFIED = '.reelforge-verified';

/** The runtime is installed from the current lockfile. */
export const runtimeInstalled = (): boolean => {
  if (!resolves('@huggingface/transformers') || !resolves('onnxruntime-node')) return false;
  try {
    return readFileSync(path.join(assistDir(), LOCK_MARKER), 'utf8').trim() === lockHash();
  } catch {
    return false;
  }
};

/** Every file of a pinned model is present and was verified for this revision. */
function modelReady(m: PinnedModel): boolean {
  const dir = modelDir(m);
  try {
    if (readFileSync(path.join(dir, VERIFIED), 'utf8').trim() !== m.revision) return false;
  } catch {
    return false;
  }
  return Object.entries(m.files).every(([f, meta]) => {
    const p = path.join(dir, ...f.split('/'));
    return existsSync(p) && statSync(p).size === meta.size;
  });
}

/** Whisper files present and verified for a model size. */
export const whisperCached = (size: WhisperSize): boolean => modelReady(pinnedModels()[`whisper-${size}`]);

function dirSize(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? dirSize(p) : statSync(p).size;
  }
  return n;
}

export interface AssistStatus {
  installed: boolean;
  version: string;
  dir: string;
  /** Disk used by the runtime and the models, in MB. */
  sizeMb: number;
  whisper: Record<WhisperSize, boolean>;
  vad: boolean;
}

export function assistStatus(): AssistStatus {
  return {
    installed: runtimeInstalled(),
    version: TRANSFORMERS_VERSION,
    dir: assistDir(),
    sizeMb: Math.round(dirSize(assistDir()) / 1048576),
    whisper: { tiny: whisperCached('tiny'), base: whisperCached('base'), small: whisperCached('small') },
    vad: modelReady(pinnedModels()['silero-vad']),
  };
}

let transformers: Promise<any> | undefined;

/** transformers.js from the cache (loaded once per process), restricted to the verified local models. */
export function loadTransformers(): Promise<any> {
  if (!runtimeInstalled())
    throw new AssistError('The speech model runtime is not installed. Run `reelforge align --setup` once.');
  transformers ??= import(pathToFileURL(req().resolve('@huggingface/transformers')).href).then((t) => {
    t.env.localModelPath = modelsDir();
    t.env.cacheDir = modelsDir();
    t.env.allowLocalModels = true;
    // Never fetch at run time: only files verified by setupAssist() are loaded.
    t.env.allowRemoteModels = false;
    return t;
  });
  return transformers;
}

export function loadOrt(): any {
  if (!resolves('onnxruntime-node'))
    throw new AssistError('The speech model runtime is not installed. Run `reelforge align --setup` once.');
  return req()('onnxruntime-node');
}

export class AssistError extends Error {}

function npm(args: string[], cwd: string, log: (m: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    // A shell is needed to run npm.cmd on Windows; the arguments are fixed constants, never user input.
    const p = spawn(['npm', ...args].join(' '), {
      cwd,
      shell: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    p.stdout.setEncoding('utf8').on('data', (d: string) => d.trim() && log(d.trim()));
    p.stderr.setEncoding('utf8').on('data', (d: string) => (err += d));
    p.on('error', (e) => reject(new AssistError(`Cannot run npm: ${e.message}`)));
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new AssistError(`npm ci failed (${code}): ${err.trim().slice(-400)}`)),
    );
  });
}

/** Removes files this machine never loads: ~460 MB installed → ~100 MB. */
export function pruneRuntime(): number {
  const nm = path.join(assistDir(), 'node_modules');
  const before = dirSize(nm);
  // transformers.js bundles the WebGPU/WASM runtime it needs into its own Node build.
  rmSync(path.join(nm, 'onnxruntime-web'), { recursive: true, force: true });
  const bin = path.join(nm, 'onnxruntime-node', 'bin', 'napi-v6');
  if (existsSync(bin)) {
    for (const plat of readdirSync(bin)) {
      if (plat !== process.platform) rmSync(path.join(bin, plat), { recursive: true, force: true });
      else
        for (const arch of readdirSync(path.join(bin, plat)))
          if (arch !== process.arch) rmSync(path.join(bin, plat, arch), { recursive: true, force: true });
    }
  }
  return Math.round((before - dirSize(nm)) / 1048576);
}

/** Installs the runtime with `npm ci` from the committed lockfile (reinstalls when it changed). */
async function installRuntime(log: (m: string) => void): Promise<void> {
  if (runtimeInstalled()) return;
  const dir = assistDir();
  mkdirSync(dir, { recursive: true });
  rmSync(path.join(dir, 'node_modules'), { recursive: true, force: true });
  for (const f of ['package.json', 'package-lock.json'])
    copyFileSync(path.join(RUNTIME_SPEC_DIR, f), path.join(dir, f));
  log(
    `Installing @huggingface/transformers ${TRANSFORMERS_VERSION} into ${dir} from the lockfile (one time)…`,
  );
  await npm(['ci', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], dir, log);
  log(`Pruned ${pruneRuntime()} MB this machine does not need`);
  writeFileSync(path.join(dir, LOCK_MARKER), `${lockHash()}\n`);
}

/** Downloads one pinned file to a temporary name, checks size and SHA-256, then moves it in place. */
async function fetchVerified(m: PinnedModel, file: string, log: (m: string) => void): Promise<void> {
  const meta = m.files[file];
  const dest = path.join(modelDir(m), ...file.split('/'));
  if (existsSync(dest) && statSync(dest).size === meta.size && (await sha256File(dest)) === meta.sha256)
    return;
  mkdirSync(path.dirname(dest), { recursive: true });
  const host = (process.env.HF_ENDPOINT ?? 'https://huggingface.co').replace(/\/$/, '');
  const url = `${host}/${m.repo}/resolve/${m.revision}/${file}`;
  log(`Downloading ${m.repo}/${file} (${(meta.size / 1048576).toFixed(1)} MB)…`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new AssistError(`Download failed (${res.status}): ${url}`);
  const part = `${dest}.part`;
  const hash = createHash('sha256');
  const body = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  body.on('data', (d: Buffer) => hash.update(d));
  await streamPipeline(body, createWriteStream(part));
  const got = hash.digest('hex');
  if (got !== meta.sha256) {
    rmSync(part, { force: true });
    throw new AssistError(
      `Checksum mismatch for ${m.repo}/${file} at ${m.revision.slice(0, 12)}: expected ${meta.sha256}, got ${got}. ` +
        'The download was corrupted or changed upstream; nothing was installed. Run `reelforge align --setup` again, and report it if it persists.',
    );
  }
  renameSync(part, dest);
}

/** Downloads and verifies every file of a pinned model (exported for tests; HF_ENDPOINT sets a mirror). */
export async function installModel(
  m: PinnedModel,
  log: (m: string) => void = () => undefined,
): Promise<void> {
  if (modelReady(m)) return;
  rmSync(path.join(modelDir(m), VERIFIED), { force: true });
  for (const file of Object.keys(m.files)) await fetchVerified(m, file, log);
  writeFileSync(path.join(modelDir(m), VERIFIED), `${m.revision}\n`);
}

export interface SetupOptions {
  /** Whisper sizes to download (default ['base']). */
  models?: WhisperSize[];
  vad?: boolean;
  onLog?: (m: string) => void;
}

export async function setupAssist(o: SetupOptions = {}): Promise<AssistStatus> {
  const log = o.onLog ?? (() => undefined);
  await installRuntime(log);
  const p = pinnedModels();
  if (o.vad !== false) await installModel(p['silero-vad'], log);
  for (const size of o.models ?? ['base']) await installModel(p[`whisper-${size}`], log);
  return assistStatus();
}
