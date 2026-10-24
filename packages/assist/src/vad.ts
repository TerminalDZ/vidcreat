/**
 * Silero VAD v5 (2 MB ONNX) on onnxruntime-node: speech probability every 32 ms, turned into the
 * 10 ms speech mask that @reelforge/audio's aligner accepts. More robust than an energy threshold
 * for breaths, room noise and music beds.
 */
import { existsSync } from 'node:fs';
import { AssistError, loadOrt, vadFile } from './setup.js';

const SR = 16000;
const CHUNK = 512; // 32 ms
const CONTEXT = 64; // v5 expects the last 64 samples of the previous chunk in front

let session: Promise<any> | undefined;

/** Speech probability per 32 ms chunk of 16 kHz mono audio. */
export async function vadProbabilities(mono16k: Float32Array): Promise<Float32Array> {
  if (!existsSync(vadFile()))
    throw new AssistError('Silero VAD is not downloaded. Run `reelforge align --setup`.');
  const ort = loadOrt();
  session ??= ort.InferenceSession.create(vadFile(), {
    intraOpNumThreads: 1,
    interOpNumThreads: 1,
    graphOptimizationLevel: 'all',
  });
  const s = await session;
  const chunks = Math.ceil(mono16k.length / CHUNK);
  const probs = new Float32Array(chunks);
  let state = new ort.Tensor('float32', new Float32Array(2 * 128), [2, 1, 128]);
  const sr = new ort.Tensor('int64', BigInt64Array.from([BigInt(SR)]), []);
  const buf = new Float32Array(CONTEXT + CHUNK);
  for (let c = 0; c < chunks; c++) {
    buf.copyWithin(0, CHUNK, CHUNK + CONTEXT); // previous chunk's tail becomes the context
    const a = c * CHUNK;
    buf.fill(0, CONTEXT);
    buf.set(mono16k.subarray(a, Math.min(mono16k.length, a + CHUNK)), CONTEXT);
    const out = await s.run({
      input: new ort.Tensor('float32', buf.slice(), [1, CONTEXT + CHUNK]),
      state,
      sr,
    });
    probs[c] = (out.output.data as Float32Array)[0];
    state = out.stateN;
  }
  return probs;
}

/**
 * 10 ms speech mask with `frames` frames from per-chunk probabilities: hysteresis (on 0.5, off 0.35),
 * then speech shorter than 60 ms dropped and gaps shorter than 50 ms filled.
 */
export function vadMask(probs: Float32Array, frames: number): Uint8Array {
  const mask = new Uint8Array(frames);
  let on = false;
  for (let f = 0; f < frames; f++) {
    const p = probs[Math.min(probs.length - 1, Math.floor((f * 0.01 * SR) / CHUNK))] ?? 0;
    on = on ? p > 0.35 : p > 0.5;
    mask[f] = on ? 1 : 0;
  }
  const runs = (value: 0 | 1, min: number) => {
    let i = 0;
    while (i < frames) {
      if (mask[i] !== value) {
        i++;
        continue;
      }
      let j = i;
      while (j < frames && mask[j] === value) j++;
      if (j - i < min && i > 0 && j < frames) mask.fill(value ? 0 : 1, i, j);
      i = j;
    }
  };
  runs(1, 6);
  runs(0, 5);
  return mask;
}

export async function disposeVad(): Promise<void> {
  const s = await session;
  session = undefined;
  await s?.release?.();
}
