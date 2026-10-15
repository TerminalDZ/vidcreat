/**
 * Loudness envelopes. Pure functions over mono sample buffers (browser and Node safe).
 */

/** RMS of `x` in [from, to). */
function rms(x: Float32Array, from: number, to: number): number {
  const a = Math.max(0, from);
  const b = Math.min(x.length, to);
  if (b <= a) return 0;
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / (b - a));
}

const DB_FLOOR = -54;
const DB_CEIL = -8;

/**
 * Per-video-frame RMS envelope mapped to [0, 1] on a dB scale, rounded to 3 decimals.
 * Feeds the audio-reactive waveform (FR-RT-5).
 */
export function frameEnvelope(
  mono: Float32Array,
  sampleRate: number,
  fps: number,
  frames?: number,
): number[] {
  const n = frames ?? Math.ceil((mono.length / sampleRate) * fps);
  const hop = sampleRate / fps;
  const out = new Array<number>(n);
  for (let f = 0; f < n; f++) {
    const center = Math.round(f * hop + hop / 2);
    const v = rms(mono, center - Math.round(hop), center + Math.round(hop));
    const db = v > 0 ? 20 * Math.log10(v) : DB_FLOOR;
    const norm = Math.min(1, Math.max(0, (db - DB_FLOOR) / (DB_CEIL - DB_FLOOR)));
    out[f] = Math.round(norm * 1000) / 1000;
  }
  return out;
}

/** Peak-per-bucket overview for drawing waveforms (studio). */
export function peaks(mono: Float32Array, buckets: number): Float32Array {
  const out = new Float32Array(buckets);
  const step = mono.length / buckets;
  for (let b = 0; b < buckets; b++) {
    const a = Math.floor(b * step);
    const e = Math.min(mono.length, Math.floor((b + 1) * step));
    let m = 0;
    for (let i = a; i < e; i++) {
      const v = Math.abs(mono[i]);
      if (v > m) m = v;
    }
    out[b] = m;
  }
  return out;
}

/**
 * "Snap to onset" (FR-CUE-6): finds the strongest energy rise within ±windowSec of `t`.
 * Deterministic RMS-envelope method, no ML. Returns `t` unchanged when no clear onset exists.
 */
export function snapToOnset(mono: Float32Array, sampleRate: number, t: number, windowSec = 0.12): number {
  const hop = Math.max(1, Math.round(sampleRate * 0.0025)); // 2.5 ms
  const win = Math.round(sampleRate * 0.01); // 10 ms
  const start = Math.max(0, Math.round((t - windowSec) * sampleRate));
  const end = Math.min(mono.length, Math.round((t + windowSec) * sampleRate));
  if (end - start < win * 4) return t;
  const lag = 4; // 10 ms
  const db: number[] = [];
  const pos: number[] = [];
  for (let s = start - lag * hop; s <= end; s += hop) {
    const v = rms(mono, s, s + win);
    db.push(v > 1e-6 ? 20 * Math.log10(v) : -120);
    pos.push(s);
  }
  const sorted = [...db].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)] ?? -120;
  let best = -1;
  let bestRise = 6; // need at least a 6 dB rise
  for (let k = lag; k < db.length; k++) {
    if (pos[k] < start) continue;
    const rise = db[k] - db[k - lag];
    if (rise > bestRise && db[k] > floor + 6) {
      bestRise = rise;
      best = k;
    }
  }
  if (best < 0) return t;
  return Math.round((pos[best] / sampleRate) * 1000) / 1000;
}
