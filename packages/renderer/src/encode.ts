/** Master/share encoding (FR-REN-5/6), bitrate formula and output compliance checks (NFR-13). */
import { openSync, readSync, closeSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ffprobeJson, run } from './ffmpeg.js';

export const AUDIO_KBPS_MASTER = 192;
export const AUDIO_KBPS_SHARE = 128;
/** Above this, extra bitrate buys nothing visible at 1080×1920@30 and only bloats uploads. */
export const MAX_SHARE_VIDEO_KBPS = 8000;
export const MIN_SHARE_VIDEO_KBPS = 250;

/** FR-REN-6: video_kbps = floor((share_MB × 8192 × 0.97) / duration) − audio_kbps. */
export function shareVideoKbps(shareMb: number, duration: number, audioKbps = AUDIO_KBPS_SHARE): number {
  return Math.floor((shareMb * 8192 * 0.97) / duration) - audioKbps;
}

const H264 = [
  '-c:v',
  'libx264',
  '-profile:v',
  'high',
  '-pix_fmt',
  'yuv420p',
  '-fps_mode',
  'cfr',
  '-g',
  '60',
  '-bf',
  '2',
  '-tag:v',
  'avc1',
];

export interface EncodeInput {
  video: string;
  audio: string;
  out: string;
  fps: number;
  duration: number;
  /** Seek into the audio (partial renders). */
  audioOffset?: number;
  signal?: AbortSignal;
  onTime?: (sec: number) => void;
}

const common = (o: EncodeInput) => [
  '-hide_banner',
  '-nostats',
  '-y',
  '-progress',
  'pipe:1',
  '-i',
  o.video,
  ...(o.audioOffset ? ['-ss', o.audioOffset.toFixed(3)] : []),
  '-i',
  o.audio,
  '-map',
  '0:v:0',
  '-map',
  '1:a:0',
  '-r',
  String(o.fps),
];

export async function encodeMaster(o: EncodeInput & { fast?: boolean }): Promise<void> {
  await run(
    [
      ...common(o),
      ...H264,
      '-preset',
      o.fast ? 'medium' : 'slow',
      '-crf',
      '18',
      '-c:a',
      'aac',
      '-b:a',
      `${AUDIO_KBPS_MASTER}k`,
      '-ar',
      '48000',
      '-ac',
      '2',
      '-t',
      o.duration.toFixed(3),
      '-movflags',
      '+faststart',
      o.out,
    ],
    { signal: o.signal, onTime: o.onTime },
  );
}

export async function encodeShare(
  o: EncodeInput & { shareMb: number; tmpDir: string; fast?: boolean },
): Promise<{ kbps: number }> {
  let kbps = shareVideoKbps(o.shareMb, o.duration);
  if (kbps < MIN_SHARE_VIDEO_KBPS) {
    throw new Error(
      `Share size ${o.shareMb} MB is too small for ${o.duration.toFixed(1)} s (needs ≥ ${MIN_SHARE_VIDEO_KBPS} kb/s video). Raise --share-size.`,
    );
  }
  kbps = Math.min(kbps, MAX_SHARE_VIDEO_KBPS);
  const passlog = path.join(o.tmpDir, 'x264pass');
  const rate = ['-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.5)}k`, '-bufsize', `${kbps * 3}k`];
  const preset = ['-preset', o.fast ? 'medium' : 'slow'];
  await run(
    [
      '-hide_banner',
      '-nostats',
      '-y',
      '-i',
      o.video,
      '-map',
      '0:v:0',
      '-r',
      String(o.fps),
      ...H264,
      ...preset,
      ...rate,
      '-pass',
      '1',
      '-passlogfile',
      passlog,
      '-an',
      '-t',
      o.duration.toFixed(3),
      '-f',
      'mp4',
      os.devNull,
    ],
    { signal: o.signal },
  );
  await run(
    [
      ...common(o),
      ...H264,
      ...preset,
      ...rate,
      '-pass',
      '2',
      '-passlogfile',
      passlog,
      '-c:a',
      'aac',
      '-b:a',
      `${AUDIO_KBPS_SHARE}k`,
      '-ar',
      '48000',
      '-ac',
      '2',
      '-t',
      o.duration.toFixed(3),
      '-movflags',
      '+faststart',
      o.out,
    ],
    { signal: o.signal, onTime: o.onTime },
  );
  return { kbps };
}

/** Top-level MP4 atoms in file order. */
export function mp4Atoms(file: string): string[] {
  const fd = openSync(file, 'r');
  const size = statSync(file).size;
  const out: string[] = [];
  const head = Buffer.alloc(16);
  let pos = 0;
  try {
    while (pos + 8 <= size && out.length < 64) {
      readSync(fd, head, 0, 16, pos);
      let len = head.readUInt32BE(0);
      const type = head.toString('latin1', 4, 8);
      if (len === 1) len = Number(head.readBigUInt64BE(8));
      else if (len === 0) len = size - pos;
      out.push(type);
      if (len < 8) break;
      pos += len;
    }
  } finally {
    closeSync(fd);
  }
  return out;
}

export interface Compliance {
  ok: boolean;
  problems: string[];
  info: {
    codec?: string;
    profile?: string;
    pixFmt?: string;
    fps?: string;
    audio?: string;
    sampleRate?: number;
    size: number;
    duration: number;
  };
}

/** NFR-13: h264 High, yuv420p, 30/1, AAC 48 kHz, moov before mdat, size ≤ target. */
export async function checkCompliance(
  file: string,
  opts: { fps: number; maxBytes?: number },
): Promise<Compliance> {
  const j = await ffprobeJson(file);
  const v = j.streams.find((s: any) => s.codec_type === 'video');
  const a = j.streams.find((s: any) => s.codec_type === 'audio');
  const size = statSync(file).size;
  const problems: string[] = [];
  if (v?.codec_name !== 'h264') problems.push(`video codec ${v?.codec_name} (expected h264)`);
  if (v?.profile !== 'High') problems.push(`H.264 profile ${v?.profile} (expected High)`);
  if (v?.pix_fmt !== 'yuv420p') problems.push(`pixel format ${v?.pix_fmt} (expected yuv420p)`);
  if (v?.r_frame_rate !== `${opts.fps}/1`)
    problems.push(`frame rate ${v?.r_frame_rate} (expected ${opts.fps}/1)`);
  if (a?.codec_name !== 'aac') problems.push(`audio codec ${a?.codec_name} (expected aac)`);
  if (Number(a?.sample_rate) !== 48000) problems.push(`audio sample rate ${a?.sample_rate} (expected 48000)`);
  const atoms = mp4Atoms(file);
  if (atoms.indexOf('moov') < 0 || atoms.indexOf('moov') > atoms.indexOf('mdat'))
    problems.push('moov atom is not before mdat (no faststart)');
  if (opts.maxBytes && size > opts.maxBytes)
    problems.push(
      `size ${(size / 1048576).toFixed(2)} MB exceeds ${(opts.maxBytes / 1048576).toFixed(2)} MB`,
    );
  return {
    ok: problems.length === 0,
    problems,
    info: {
      codec: v?.codec_name,
      profile: v?.profile,
      pixFmt: v?.pix_fmt,
      fps: v?.r_frame_rate,
      audio: a?.codec_name,
      sampleRate: Number(a?.sample_rate),
      size,
      duration: Number(j.format?.duration ?? 0),
    },
  };
}

/** 12 evenly spaced frames tiled 4×3 into a JPEG contact sheet (FR-REN-7). */
export async function contactSheet(
  video: string,
  out: string,
  frames: number,
  signal?: AbortSignal,
): Promise<void> {
  const picks = Array.from({ length: 12 }, (_, i) =>
    Math.min(frames - 1, Math.floor(((i + 0.5) * frames) / 12)),
  );
  const select = picks.map((n) => `eq(n\\,${n})`).join('+');
  await run(
    [
      '-hide_banner',
      '-nostats',
      '-y',
      '-i',
      video,
      '-vf',
      `select='${select}',scale=360:640:flags=lanczos,tile=4x3:padding=8:margin=8:color=0x07080c`,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      out,
    ],
    { signal },
  );
}
