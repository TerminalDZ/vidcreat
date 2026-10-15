import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeWav, mulberry32, toMono } from '@reelforge/audio';
import { autoCues, cuesSchema, INSTALL_ROOT, lineWeight, parseYaml, syllableCount } from '@reelforge/core';

const ALIGN = path.join(INSTALL_ROOT, 'fixtures/align');

function load(name: string) {
  const dir = path.join(ALIGN, name);
  const truth = JSON.parse(readFileSync(path.join(dir, 'truth.json'), 'utf8')) as {
    lines: Record<string, number>;
    words: Record<string, number[]>;
  };
  const spec = parseYaml(readFileSync(path.join(dir, 'episode.yaml'), 'utf8'), 'episode.yaml').data as {
    script: { text: string }[];
  };
  const script = spec.script.map((l, i) => ({ id: `l${i + 1}`, text: l.text }));
  const pcm = decodeWav(readFileSync(path.join(dir, 'voice.wav')));
  return { truth, script, mono: toMono(pcm), sampleRate: pcm.sampleRate };
}

function withNoise(x: Float32Array, snrDb: number): Float32Array {
  const rnd = mulberry32(11);
  let p = 0;
  for (const v of x) p += v * v;
  const amp = Math.sqrt((p / x.length / Math.pow(10, snrDb / 10)) * 3);
  return x.map((v) => v + (rnd() * 2 - 1) * amp);
}

describe('syllableCount / lineWeight', () => {
  it('counts English and Arabic syllables roughly', () => {
    expect(syllableCount('cat')).toBe(1);
    expect(syllableCount('rate')).toBe(1);
    expect(syllableCount('limiter,')).toBe(3);
    expect(syllableCount('ReelForge.')).toBe(2);
    expect(syllableCount('الـ')).toBeGreaterThanOrEqual(1);
    expect(syllableCount('المشكلة')).toBeGreaterThanOrEqual(3);
    expect(syllableCount('2026')).toBe(4);
    expect(lineWeight('Meet ReelForge.')).toBe(3);
  });
});

/** Fixtures with a recording and its true timings (ar-real waits for a person to record it). */
const READY = readdirSync(ALIGN).filter(
  (n) => existsSync(path.join(ALIGN, n, 'voice.wav')) && existsSync(path.join(ALIGN, n, 'truth.json')),
);

describe('autoCues on recorded speech (ground truth from the synthesizer)', () => {
  for (const name of READY) {
    for (const [variant, snr] of [
      ['clean', null],
      ['noisy (15 dB SNR)', 15],
    ] as const) {
      it(`${name}, ${variant}: every line within 100 ms, words mostly within 100 ms`, () => {
        const f = load(name);
        const mono = snr === null ? f.mono : withNoise(f.mono, snr);
        const r = autoCues(f.script, {
          mono,
          sampleRate: f.sampleRate,
          duration: mono.length / f.sampleRate,
          file: 'voice.wav',
          sha1: 'abc',
        });
        expect(cuesSchema.parse(r.cues)).toBeTruthy();
        expect(r.cues.auto).toBe(true);
        expect(r.cues.audio.sha1).toBe('abc');
        for (const l of f.script) expect(Math.abs(r.cues.cues[l.id] - f.truth.lines[l.id])).toBeLessThan(0.1);
        const errs: number[] = [];
        for (const l of f.script) {
          const got = r.cues.words[l.id];
          expect(got).toHaveLength(f.truth.words[l.id].length);
          for (let k = 1; k < got.length; k++) expect(got[k]).toBeGreaterThan(got[k - 1]);
          f.truth.words[l.id].forEach((t, k) => errs.push(Math.abs(got[k] - t)));
        }
        errs.sort((a, b) => a - b);
        expect(errs[Math.floor(errs.length / 2)]).toBeLessThan(0.06);
        expect(errs.filter((e) => e < 0.1).length / errs.length).toBeGreaterThan(0.6);
        // 10–30 ms for ~40 s of speech in plain Node (scripts/eval-assist.mjs); the parallel test
        // runner can be far slower, so this only guards against a pathological slowdown.
        expect(r.ms).toBeLessThan(3000);
      });
    }
  }

  it('can skip words', () => {
    const f = load('en-zira');
    const r = autoCues(
      f.script,
      { ...f, duration: f.mono.length / f.sampleRate, file: 'v.wav' },
      { words: false },
    );
    expect(r.cues.words).toEqual({});
  });
});
