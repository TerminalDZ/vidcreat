/**
 * Procedural sound effects (PRD F9, SRS §7.3). No samples: every sound is synthesized
 * from oscillators and seeded noise at 48 kHz, so output is deterministic and license-free.
 */
import { mulberry32 } from './prng.js';

export const SFX_RATE = 48000;
export const SOUNDS = ['whoosh', 'hit', 'ding', 'err', 'glitch', 'tick', 'tap', 'typing'] as const;
export type SoundName = (typeof SOUNDS)[number];

type Synth = (rand: () => number) => Float32Array;

const len = (sec: number) => Math.round(sec * SFX_RATE);
const TAU = Math.PI * 2;

/** Filtered noise with a sine² envelope and a rising band-pass sweep. */
const whoosh: Synth = (rand) => {
  const n = len(0.42);
  const out = new Float32Array(n);
  let lp = 0;
  let lp2 = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const env = Math.sin(Math.PI * p) ** 2;
    const cutoff = 0.02 + 0.22 * Math.sin(Math.PI * p);
    const w = rand() * 2 - 1;
    lp += cutoff * (w - lp);
    lp2 += cutoff * (lp - lp2);
    out[i] = (lp - lp2 * 0.6) * env * 2.4;
  }
  return out;
};

/** Pitched-down sine 55→38 Hz body plus a short noise transient. */
const hit: Synth = (rand) => {
  const n = len(0.7);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SFX_RATE;
    const f = 38 + 17 * Math.exp(-t * 9);
    phase += (TAU * f) / SFX_RATE;
    const body = Math.sin(phase) * Math.exp(-t * 5.5);
    const click = t < 0.03 ? (rand() * 2 - 1) * (1 - t / 0.03) ** 2 * 0.8 : 0;
    const sub = Math.sin(phase * 2) * 0.25 * Math.exp(-t * 14);
    out[i] = Math.tanh((body + sub) * 1.6) + click;
  }
  return out;
};

/** Two partials (1320 + 1980 Hz) with exponential decay. */
const ding: Synth = () => {
  const n = len(0.9);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SFX_RATE;
    const attack = Math.min(1, t / 0.004);
    out[i] =
      attack * (Math.sin(TAU * 1320 * t) * Math.exp(-t * 6) * 0.6 + Math.sin(TAU * 1980 * t) * Math.exp(-t * 9) * 0.35);
  }
  return out;
};

/** Gated 190 Hz square, two pulses. */
const err: Synth = () => {
  const n = len(0.42);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SFX_RATE;
    const gate = (t < 0.14 || (t > 0.2 && t < 0.34) ? 1 : 0) * Math.min(1, (t % 0.2) / 0.005);
    const sq = Math.sin(TAU * 190 * t) >= 0 ? 1 : -1;
    out[i] = sq * gate * 0.42;
  }
  // gentle one-pole low-pass to tame the square edges
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += 0.25 * (out[i] - lp);
    out[i] = lp;
  }
  return out;
};

/** Sample-and-hold noise, chopped into bursts. */
const glitch: Synth = (rand) => {
  const n = len(0.38);
  const out = new Float32Array(n);
  let held = 0;
  let hold = 0;
  for (let i = 0; i < n; i++) {
    if (hold <= 0) {
      held = rand() * 2 - 1;
      hold = 20 + Math.floor(rand() * 260);
    }
    hold--;
    const t = i / SFX_RATE;
    const chop = Math.floor(t / 0.03) % 3 === 1 ? 0 : 1;
    out[i] = held * chop * 0.55 * (1 - t / 0.38);
  }
  return out;
};

/** 15 ms noise click. */
const tick: Synth = (rand) => {
  const n = len(0.015);
  const out = new Float32Array(n);
  let hp = 0;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1;
    hp = 0.7 * (hp + w - prev);
    prev = w;
    out[i] = hp * (1 - i / n) ** 3 * 0.9;
  }
  return out;
};

/** Soft tap: short low thump with a click. */
const tap: Synth = (rand) => {
  const n = len(0.09);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SFX_RATE;
    out[i] = Math.sin(TAU * 220 * t * (1 - t * 3)) * Math.exp(-t * 55) * 0.8 + (t < 0.004 ? (rand() * 2 - 1) * 0.5 : 0);
  }
  return out;
};

/** A short burst of keyboard ticks (used for "typing" events). */
const typing: Synth = (rand) => {
  const n = len(0.36);
  const out = new Float32Array(n);
  const keys = 5;
  for (let k = 0; k < keys; k++) {
    const at = Math.floor(((k + rand() * 0.4) / keys) * (n - len(0.02)));
    const click = tick(rand);
    const g = 0.5 + rand() * 0.5;
    for (let i = 0; i < click.length && at + i < n; i++) out[at + i] += click[i] * g;
  }
  return out;
};

const SYNTHS: Record<SoundName, Synth> = { whoosh, hit, ding, err, glitch, tick, tap, typing };

export function synthesize(sound: SoundName, seed: number): Float32Array {
  return SYNTHS[sound](mulberry32(seed));
}
