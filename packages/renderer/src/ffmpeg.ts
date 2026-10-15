/** ffmpeg/ffprobe discovery and process helpers (system binaries, ADR-009). */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

export const ffmpegBin = (): string => process.env.REELFORGE_FFMPEG ?? 'ffmpeg';
export const ffprobeBin = (): string => process.env.REELFORGE_FFPROBE ?? 'ffprobe';

export interface FfmpegInfo {
  ok: boolean;
  version?: string;
  major?: number;
  encoders: { libx264: boolean; aac: boolean; mjpeg: boolean };
  filters: { loudnorm: boolean; sidechaincompress: boolean; alimiter: boolean };
  error?: string;
}

export function probeFfmpeg(): FfmpegInfo {
  const empty = { encoders: { libx264: false, aac: false, mjpeg: false }, filters: { loudnorm: false, sidechaincompress: false, alimiter: false } };
  const v = spawnSync(ffmpegBin(), ['-hide_banner', '-version'], { encoding: 'utf8' });
  if (v.error || v.status !== 0) return { ok: false, ...empty, error: v.error?.message ?? v.stderr };
  const m = v.stdout.match(/ffmpeg version (?:n)?(\d+)(?:\.(\d+))?[^\s]*/);
  const version = m?.[0].replace('ffmpeg version ', '');
  const major = m ? Number(m[1]) : undefined;
  const enc = spawnSync(ffmpegBin(), ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout ?? '';
  const fil = spawnSync(ffmpegBin(), ['-hide_banner', '-filters'], { encoding: 'utf8' }).stdout ?? '';
  const has = (txt: string, name: string) => new RegExp(`\\s${name}\\s`).test(txt);
  return {
    ok: true,
    version,
    major,
    encoders: { libx264: has(enc, 'libx264'), aac: has(enc, 'aac'), mjpeg: has(enc, 'mjpeg') },
    filters: { loudnorm: has(fil, 'loudnorm'), sidechaincompress: has(fil, 'sidechaincompress'), alimiter: has(fil, 'alimiter') },
  };
}

export class FfmpegError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
  }
}

const running = new Set<ChildProcess>();

/** Kills every ffmpeg process started by this module (SIGINT handling). */
export function killAll(): void {
  for (const p of running) p.kill('SIGKILL');
  running.clear();
}

export interface RunOptions {
  signal?: AbortSignal;
  /** Called with ffmpeg's `out_time` in seconds when `-progress pipe:1` is used. */
  onTime?: (sec: number) => void;
  bin?: string;
}

/** Runs ffmpeg (or ffprobe with opts.bin) and resolves with stdout/stderr. */
export function run(args: string[], opts: RunOptions = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const bin = opts.bin ?? ffmpegBin();
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    running.add(p);
    let stdout = '';
    let stderr = '';
    p.stdout.setEncoding('utf8').on('data', (d: string) => {
      stdout += d;
      if (opts.onTime) {
        const m = d.match(/out_time_us=(\d+)/g);
        if (m) opts.onTime(Number(m[m.length - 1].split('=')[1]) / 1e6);
        if (stdout.length > 1e6) stdout = stdout.slice(-1e5);
      }
    });
    p.stderr.setEncoding('utf8').on('data', (d: string) => {
      stderr += d;
      if (stderr.length > 2e6) stderr = stderr.slice(-2e5);
    });
    const onAbort = () => p.kill('SIGKILL');
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    p.on('error', (e) => {
      running.delete(p);
      reject(new FfmpegError(`Cannot start ${bin}: ${e.message}. Run \`reelforge doctor\`.`, ''));
    });
    p.on('close', (code) => {
      running.delete(p);
      opts.signal?.removeEventListener('abort', onAbort);
      if (opts.signal?.aborted) return reject(new FfmpegError('Aborted', stderr));
      if (code === 0) resolve({ stdout, stderr });
      else {
        const tail = stderr.trim().split('\n').slice(-6).join('\n');
        reject(new FfmpegError(`${bin} exited with code ${code}:\n${tail}`, stderr));
      }
    });
  });
}

/** Spawns an ffmpeg process that reads a stream on stdin (image2pipe). */
export function spawnPipe(args: string[]): ChildProcess {
  const p = spawn(ffmpegBin(), args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  running.add(p);
  p.on('close', () => running.delete(p));
  return p;
}

export async function ffprobeJson(file: string): Promise<any> {
  const { stdout } = await run(['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { bin: ffprobeBin() });
  return JSON.parse(stdout);
}

export async function countFrames(file: string): Promise<number> {
  const { stdout } = await run(
    ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', file],
    { bin: ffprobeBin() },
  );
  return Number(stdout.trim().split(/[\s,]+/)[0]);
}
