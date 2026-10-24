/**
 * Mono resampling for speech models (usually 48/44.1 kHz → 16 kHz). Windowed-sinc low-pass with a
 * precomputed table of 256 fractional phases, so the inner loop is multiply-add only.
 */

const ZEROS = 10; // sinc zero crossings per side (at the lower rate): ample for speech models
const PHASES = 256;

export function resample(x: Float32Array, from: number, to = 16000): Float32Array {
  if (from === to) return x;
  const ratio = from / to;
  const n = Math.floor(x.length / ratio);
  const out = new Float32Array(n);
  const scale = Math.max(1, ratio); // widen the kernel when downsampling
  const fc = 0.45 / scale; // cutoff, cycles per source sample
  const half = Math.ceil(ZEROS * scale);
  const width = 2 * half;
  const table = new Float32Array(PHASES * width);
  for (let p = 0; p < PHASES; p++) {
    const frac = p / PHASES;
    let sum = 0;
    for (let k = 0; k < width; k++) {
      const d = k - half + 1 - frac; // tap position relative to the output instant
      const s = Math.abs(d) < 1e-9 ? 2 * fc : Math.sin(2 * Math.PI * fc * d) / (Math.PI * d);
      const u = d / half;
      const w = Math.abs(u) >= 1 ? 0 : 0.42 + 0.5 * Math.cos(Math.PI * u) + 0.08 * Math.cos(2 * Math.PI * u);
      table[p * width + k] = s * w;
      sum += s * w;
    }
    for (let k = 0; k < width; k++) table[p * width + k] /= sum;
  }
  const last = x.length - 1;
  for (let j = 0; j < n; j++) {
    const t = j * ratio;
    const c = Math.floor(t);
    const p = Math.min(PHASES - 1, Math.round((t - c) * PHASES));
    const base = c - half + 1;
    const off = p * width;
    let acc = 0;
    if (base >= 0 && base + width <= x.length) {
      for (let k = 0; k < width; k++) acc += x[base + k] * table[off + k];
    } else {
      for (let k = 0; k < width; k++) acc += x[Math.min(last, Math.max(0, base + k))] * table[off + k];
    }
    out[j] = acc;
  }
  return out;
}
