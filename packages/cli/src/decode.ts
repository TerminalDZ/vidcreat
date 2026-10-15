/** ffmpeg-based decoder for voice files that are not plain PCM WAV (mp3, m4a, 24-bit packed, …). */
import { spawnSync } from 'node:child_process';
import type { PcmAudio } from '@reelforge/audio';
import { ffmpegBin } from '@reelforge/renderer';

export function ffmpegDecode(file: string): PcmAudio {
  const rate = 48000;
  const r = spawnSync(
    ffmpegBin(),
    ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(rate), '-'],
    { maxBuffer: 1 << 30 },
  );
  if (r.error || r.status !== 0)
    throw new Error(`ffmpeg cannot decode ${file}: ${r.error?.message ?? r.stderr?.toString().trim()}`);
  const buf = r.stdout as Buffer;
  const samples = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  return { sampleRate: rate, channels: [Float32Array.from(samples)] };
}
