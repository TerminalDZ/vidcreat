/** SFX track + voice mastering and mix (SRS §7.3, §7.4, FR-REN-4). */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeWav, renderSfxTrack, SFX_RATE } from '@reelforge/audio';
import type { Timeline } from '@reelforge/core';
import { run } from './ffmpeg.js';

export const LOUDNESS = { I: -14, TP: -1.5, LRA: 9 };

/**
 * RNNoise model for speech in noisy recordings ("somnolent-hogwash", rnnoise-nu, Gregor Richards;
 * not subject to copyright). ffmpeg runs with this folder as its working directory so the filter
 * can name the model without escaping Windows paths.
 */
export const DENOISE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/rnnoise');
export const DENOISE_FILTER = 'arnndn=m=sh.rnnn';

export function writeSfx(tl: Timeline, file: string): void {
  const track = renderSfxTrack(tl.sfx, tl.duration, `${tl.meta.id}:${tl.seed}`);
  writeFileSync(file, encodeWav({ sampleRate: SFX_RATE, channels: [track] }, { float: true }));
}

interface LoudnormStats {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/** First loudnorm pass: measure the voice. */
export async function measureLoudness(
  voice: string,
  signal?: AbortSignal,
  denoise = false,
): Promise<LoudnormStats | undefined> {
  const pre = denoise ? `aresample=48000,${DENOISE_FILTER},` : '';
  const { stderr } = await run(
    [
      '-hide_banner',
      '-nostats',
      '-i',
      path.resolve(voice),
      '-af',
      `${pre}loudnorm=I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}:print_format=json`,
      '-f',
      'null',
      '-',
    ],
    { signal, cwd: denoise ? DENOISE_DIR : undefined },
  );
  const m = stderr.match(/\{[\s\S]*?"target_offset"[\s\S]*?\}/);
  if (!m) return undefined;
  const j = JSON.parse(m[0]) as LoudnormStats;
  return Number.isFinite(Number(j.input_i)) ? j : undefined;
}

export interface MixOptions {
  voice?: string;
  sfx: string;
  out: string;
  duration: number;
  sfxGainDb: number;
  duck: boolean;
  withSfx: boolean;
  /** Remove background noise from the voice before mastering (needs ffmpeg's arnndn filter). */
  denoise?: boolean;
  signal?: AbortSignal;
}

/**
 * Masters the voice to −14 LUFS (two-pass loudnorm), ducks SFX under the voice, mixes and limits.
 * Output: 48 kHz stereo PCM WAV with exactly the voice duration.
 */
export async function mixAudio(o: MixOptions): Promise<void> {
  const args = ['-hide_banner', '-nostats', '-y'];
  let voiceChain: string;
  const denoise = Boolean(o.denoise && o.voice);
  if (o.voice) {
    args.push('-i', path.resolve(o.voice));
    const st = await measureLoudness(o.voice, o.signal, denoise);
    const ln = st
      ? `loudnorm=I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}:measured_I=${st.input_i}:measured_TP=${st.input_tp}:measured_LRA=${st.input_lra}:measured_thresh=${st.input_thresh}:offset=${st.target_offset}:linear=true`
      : `loudnorm=I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}`;
    const clean = denoise ? `${DENOISE_FILTER},` : '';
    voiceChain = `[0:a]aresample=48000,${clean}${ln},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[v]`;
  } else {
    args.push('-f', 'lavfi', '-t', String(o.duration), '-i', 'anullsrc=r=48000:cl=stereo');
    voiceChain = '[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo[v]';
  }
  args.push('-i', path.resolve(o.sfx));
  const parts = [voiceChain];
  if (o.withSfx) {
    parts.push(
      `[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${o.sfxGainDb}dB[s0]`,
    );
    if (o.duck && o.voice) {
      parts.push('[v]asplit=2[v1][vk]');
      parts.push('[s0][vk]sidechaincompress=threshold=0.05:ratio=3:attack=8:release=220[s]');
      parts.push('[v1][s]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95:level=false[a]');
    } else {
      parts.push('[v][s0]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95:level=false[a]');
    }
  } else {
    parts.push('[v]alimiter=limit=0.95:level=false[a]');
  }
  args.push(
    '-filter_complex',
    parts.join(';'),
    '-map',
    '[a]',
    '-t',
    o.duration.toFixed(3),
    '-ar',
    '48000',
    '-ac',
    '2',
    '-c:a',
    'pcm_s16le',
    path.resolve(o.out),
  );
  await run(args, { signal: o.signal, cwd: denoise ? DENOISE_DIR : undefined });
}
