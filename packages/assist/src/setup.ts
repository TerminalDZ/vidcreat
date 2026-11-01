/**
 * Optional model runtime (Level 1): transformers.js + onnxruntime are not part of the ReelForge
 * install. `setupAssist()` installs them once into the user cache, prunes everything this machine
 * cannot use (other platforms' binaries, the browser runtime) and downloads the models.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const TRANSFORMERS_VERSION = '4.3.2';

export const WHISPER_MODELS = {
  tiny: 'onnx-community/whisper-tiny_timestamped',
  base: 'onnx-community/whisper-base_timestamped',
  small: 'onnx-community/whisper-small_timestamped',
} as const;
export type WhisperSize = keyof typeof WHISPER_MODELS;
export const VAD_URL = 'https://huggingface.co/onnx-community/silero-vad/resolve/main/onnx/model.onnx';

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
export const vadFile = (): string => path.join(modelsDir(), 'silero-vad', 'model.onnx');

const req = () => createRequire(path.join(assistDir(), 'package.json'));

function resolves(name: string): boolean {
  try {
    req().resolve(name);
    return true;
  } catch {
    return false;
  }
}

export const runtimeInstalled = (): boolean =>
  resolves('@huggingface/transformers') && resolves('onnxruntime-node');

/** Whisper files present in the cache for a model size (quantized encoder + merged decoder). */
export function whisperCached(size: WhisperSize): boolean {
  const dir = path.join(modelsDir(), ...WHISPER_MODELS[size].split('/'), 'onnx');
  return (
    existsSync(path.join(dir, 'encoder_model_quantized.onnx')) &&
    existsSync(path.join(dir, 'decoder_model_merged_quantized.onnx'))
  );
}

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
    vad: existsSync(vadFile()),
  };
}

let transformers: Promise<any> | undefined;

/** transformers.js from the cache (loaded once per process). */
export function loadTransformers(): Promise<any> {
  if (!runtimeInstalled())
    throw new AssistError('The speech model runtime is not installed. Run `reelforge align --setup` once.');
  transformers ??= import(pathToFileURL(req().resolve('@huggingface/transformers')).href).then((t) => {
    t.env.cacheDir = modelsDir();
    t.env.allowLocalModels = false;
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
    // Fixed arguments only: a shell is needed to run npm.cmd on Windows.
    const p = spawn('npm', args, { cwd, shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stdout.setEncoding('utf8').on('data', (d: string) => d.trim() && log(d.trim()));
    p.stderr.setEncoding('utf8').on('data', (d: string) => (err += d));
    p.on('error', (e) => reject(new AssistError(`Cannot run npm: ${e.message}`)));
    p.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new AssistError(`npm install failed (${code}): ${err.trim().slice(-400)}`)),
    );
  });
}

/** Removes files this machine never loads: ~460 MB installed â†’ ~100 MB. */
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

export interface SetupOptions {
  /** Whisper sizes to download (default ['base']). */
  models?: WhisperSize[];
  vad?: boolean;
  onLog?: (m: string) => void;
}

export async function setupAssist(o: SetupOptions = {}): Promise<AssistStatus> {
  const log = o.onLog ?? (() => undefined);
  const dir = assistDir();
  mkdirSync(dir, { recursive: true });
  if (!existsSync(path.join(dir, 'package.json')))
    writeFileSync(
      path.join(dir, 'package.json'),
      '{ "name": "reelforge-assist-runtime", "private": true }\n',
    );
  if (!runtimeInstalled()) {
    log(`Installing @huggingface/transformers ${TRANSFORMERS_VERSION} into ${dir} (one time)â€¦`);
    await npm(
      [
        'install',
        '--no-audit',
        '--no-fund',
        '--omit=dev',
        '--loglevel=error',
        `@huggingface/transformers@${TRANSFORMERS_VERSION}`,
      ],
      dir,
      log,
    );
    log(`Pruned ${pruneRuntime()} MB this machine does not need`);
  }
  if (o.vad !== false && !existsSync(vadFile())) {
    log('Downloading Silero VAD (2 MB)â€¦');
    const r = await fetch(VAD_URL);
    if (!r.ok) throw new AssistError(`VAD download failed: HTTP ${r.status}`);
    mkdirSync(path.dirname(vadFile()), { recursive: true });
    writeFileSync(vadFile(), Buffer.from(await r.arrayBuffer()));
  }
  const t = await loadTransformers();
  for (const size of o.models ?? ['base']) {
    if (whisperCached(size)) continue;
    log(`Downloading Whisper ${size} (quantized)â€¦`);
    const p = await t.pipeline('automatic-speech-recognition', WHISPER_MODELS[size], {
      dtype: 'q8',
      device: 'cpu',
    });
    await p.dispose?.();
  }
  return assistStatus();
}
