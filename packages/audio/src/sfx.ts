import { hashString } from './prng.js';
import { SFX_RATE, synthesize, type SoundName } from './synth.js';

export interface SfxEvent {
  t: number;
  sound: SoundName;
  gain_db?: number;
}

/** −0.9 dBFS as a linear peak target (SRS §7.3). */
export const SFX_PEAK = 10 ** (-0.9 / 20);

/**
 * Renders the SFX track: every event is synthesized with a seed derived from
 * (episode seed, index, sound), placed at its time, then the track is peak-normalized
 * to −0.9 dBFS. The mix gain (`sfx_gain_db`) is applied later by ffmpeg.
 */
export function renderSfxTrack(events: SfxEvent[], duration: number, seed: string): Float32Array {
  const n = Math.max(1, Math.ceil(duration * SFX_RATE));
  const out = new Float32Array(n);
  const base = hashString(seed);
  events.forEach((ev, i) => {
    const buf = synthesize(ev.sound, (base ^ Math.imul(i + 1, 0x9e3779b1) ^ hashString(ev.sound)) >>> 0);
    const gain = 10 ** ((ev.gain_db ?? 0) / 20);
    const at = Math.round(ev.t * SFX_RATE);
    for (let k = 0; k < buf.length; k++) {
      const p = at + k;
      if (p >= 0 && p < n) out[p] += buf[k] * gain;
    }
  });
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const g = SFX_PEAK / peak;
    for (let i = 0; i < n; i++) out[i] *= g;
  }
  return out;
}
