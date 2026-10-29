// Generates a synthetic, speech-like test voice (buzz + formants, syllable envelopes) as PCM WAV.
// Used for fixtures and demos only; real episodes use a human recording.
// Usage: node scripts/make-test-voice.mjs <out.wav> <duration-seconds> [cue,cue,...]
import { writeFileSync } from 'node:fs';
import { encodeWav, mulberry32 } from '../packages/audio/dist/index.js';

const [out, durArg, cuesArg] = process.argv.slice(2);
if (!out || !durArg) {
  console.error('usage: node scripts/make-test-voice.mjs <out.wav> <duration> [cue,cue,...]');
  process.exit(2);
}
const rate = 16000;
const duration = Number(durArg);
const cues = (cuesArg ?? '0').split(',').map(Number);
const n = Math.round(duration * rate);
const x = new Float32Array(n);
const rand = mulberry32(7);
let phase = 0;
for (let li = 0; li < cues.length; li++) {
  const a = cues[li];
  const b = (cues[li + 1] ?? duration) - 0.25;
  let t = a;
  while (t < b) {
    const syl = 0.14 + rand() * 0.12;
    const f0 = 110 + rand() * 50;
    const i0 = Math.round(t * rate);
    const i1 = Math.min(n, Math.round(Math.min(b, t + syl) * rate));
    for (let i = i0; i < i1; i++) {
      const p = (i - i0) / Math.max(1, i1 - i0);
      phase += (2 * Math.PI * f0) / rate;
      const env = Math.sin(Math.PI * p) ** 0.6;
      const buzz = Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.3 * Math.sin(3 * phase) + 0.2 * Math.sin(5 * phase);
      x[i] = buzz * env * 0.22 + (rand() * 2 - 1) * 0.01;
    }
    t += syl + 0.03 + rand() * 0.05;
  }
}
writeFileSync(out, encodeWav({ sampleRate: rate, channels: [x] }));
console.log(`wrote ${out} (${duration}s)`);
