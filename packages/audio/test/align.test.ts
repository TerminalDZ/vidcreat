import { describe, expect, it } from 'vitest';
import { alignLines, alignWords, analyzeSpeech, mulberry32, pausesIn, refineOnset } from '@reelforge/audio';

const SR = 16000;

/** Speech-like bursts (seeded noise under a syllable-rate envelope) at known [start, end) spans. */
function speech(spans: [number, number][], total: number, noiseDb = -70, seed = 1): Float32Array {
  const rnd = mulberry32(seed);
  const x = new Float32Array(Math.round(total * SR));
  const floor = Math.pow(10, noiseDb / 20);
  for (let i = 0; i < x.length; i++) x[i] = (rnd() * 2 - 1) * floor;
  for (const [a, b] of spans) {
    for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) {
      const t = i / SR - a;
      const syll = 0.55 + 0.45 * Math.abs(Math.sin(Math.PI * 4.5 * t)); // ~4.5 syllables/s
      x[i] += (rnd() * 2 - 1) * 0.3 * syll;
    }
  }
  return x;
}

describe('analyzeSpeech', () => {
  it('finds speech and pauses with a 10 ms grid', () => {
    const x = speech(
      [
        [0.5, 2],
        [2.4, 3.1],
        [3.15, 4],
      ],
      5,
    );
    const map = analyzeSpeech(x, SR);
    expect(map.hop).toBe(0.01);
    expect(map.first * map.hop).toBeCloseTo(0.5, 1);
    expect(map.last * map.hop).toBeCloseTo(4, 1);
    // The 50 ms gap is a stop consonant, not a pause; the 400 ms one is a pause.
    const p = pausesIn(map, map.first, map.last, 2);
    expect(p).toHaveLength(1);
    expect(p[0].to * map.hop).toBeCloseTo(2.4, 1);
  });

  it('treats a recording without silence as all speech and survives digital silence', () => {
    const loud = speech([[0, 3]], 3);
    expect(analyzeSpeech(loud, SR).voiced.every((v) => v === 1)).toBe(true);
    const silent = new Float32Array(SR * 2);
    const m = analyzeSpeech(silent, SR);
    expect(m.frames).toBe(200);
    expect(alignLines(silent, m, [3, 4]).starts).toHaveLength(2);
    expect(analyzeSpeech(new Float32Array(0), SR).frames).toBe(1);
  });

  it('accepts an external voiced mask (VAD)', () => {
    const x = speech([[0.5, 1.5]], 2);
    const mask = new Uint8Array(200);
    mask.fill(1, 100, 180);
    const map = analyzeSpeech(x, SR, { voiced: mask });
    expect(map.first).toBe(100);
    expect(map.last).toBe(180);
  });
});

describe('refineOnset', () => {
  it('locates a burst onset to the millisecond', () => {
    const x = speech([[1.2345, 2]], 3, -80);
    const map = analyzeSpeech(x, SR);
    expect(Math.abs(refineOnset(x, map, 1.23) - 1.2345)).toBeLessThan(0.004);
  });
});

describe('alignLines', () => {
  it('puts boundaries in the right pauses, guided by line lengths', () => {
    // Line lengths 2.0, 0.6, 1.5 s; an extra short pause inside the first line is a decoy.
    const spans: [number, number][] = [
      [0.3, 1.2],
      [1.45, 2.3], // decoy pause 1.2–1.45 inside line 1
      [2.9, 3.5],
      [4.1, 5.6],
    ];
    const x = speech(spans, 6.5);
    const map = analyzeSpeech(x, SR);
    const r = alignLines(x, map, [20, 6, 15]);
    expect(r.starts.map((t) => Math.round(t * 10) / 10)).toEqual([0.3, 2.9, 4.1]);
    expect(r.confidence.every((c) => c > 0 && c <= 1)).toBe(true);
  });

  it('stays monotonic with more lines than pauses', () => {
    const x = speech([[0.2, 4]], 4.5);
    const map = analyzeSpeech(x, SR);
    const r = alignLines(x, map, [1, 1, 1, 1]);
    for (let i = 1; i < 4; i++) expect(r.starts[i]).toBeGreaterThan(r.starts[i - 1]);
    expect(r.confidence[1]).toBeLessThan(0.5);
  });

  it('is deterministic and fast (10 minutes, ~120 lines)', () => {
    const spans: [number, number][] = [];
    const w: number[] = [];
    let t = 0.4;
    const rnd = mulberry32(3);
    while (t < 595) {
      const len = 1.5 + rnd() * 4;
      spans.push([t, t + len]);
      w.push(len * 10);
      t += len + 0.25 + rnd() * 0.6;
    }
    const x = speech(spans, 600, -60, 5);
    const t0 = performance.now();
    const map = analyzeSpeech(x, SR);
    const r = alignLines(x, map, w);
    const ms = performance.now() - t0;
    // ~0.2 s in plain Node (well over 1000× real time); allow for a loaded parallel test runner.
    expect(ms).toBeLessThan(4000);
    const err = r.starts.map((s, i) => Math.abs(s - spans[i][0]));
    expect(Math.max(...err)).toBeLessThan(0.05);
    expect(alignLines(x, map, w)).toEqual(r);
  });
});

describe('alignWords', () => {
  it('anchors words to pauses after punctuation and keeps order', () => {
    // "one, two three" with a pause after "one,".
    const x = speech(
      [
        [0.2, 0.6],
        [0.95, 1.9],
      ],
      2.3,
    );
    const map = analyzeSpeech(x, SR);
    const w = alignWords(x, map, 0.2, 2.3, [1, 1, 1], [1, 0]);
    expect(w[0]).toBe(0.2);
    expect(Math.abs(w[1] - 0.95)).toBeLessThan(0.02);
    expect(w[2]).toBeGreaterThan(w[1]);
    expect(w[2]).toBeLessThan(1.9);
  });

  it('handles one word and empty lines', () => {
    const x = speech([[0.2, 0.6]], 1);
    const map = analyzeSpeech(x, SR);
    expect(alignWords(x, map, 0.2, 1, [2])).toEqual([0.2]);
    expect(alignWords(x, map, 0.2, 1, [])).toEqual([]);
  });
});
