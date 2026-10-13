import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decodeWav,
  encodeWav,
  frameEnvelope,
  hashString,
  mulberry32,
  peaks,
  renderSfxTrack,
  rnd,
  SFX_PEAK,
  SFX_RATE,
  snapToOnset,
  SOUNDS,
  synthesize,
  toMono,
  wavInfo,
  WavError,
} from '@reelforge/audio';

const sha = (a: Float32Array) =>
  createHash('sha1')
    .update(Buffer.from(a.buffer, a.byteOffset, a.byteLength))
    .digest('hex');

describe('WAV io', () => {
  it('round-trips 16-bit PCM and 32-bit float', () => {
    const x = Float32Array.from({ length: 480 }, (_, i) => Math.sin(i / 10) * 0.5);
    for (const float of [false, true]) {
      const back = decodeWav(encodeWav({ sampleRate: 48000, channels: [x, x] }, { float }));
      expect(back.sampleRate).toBe(48000);
      expect(back.channels).toHaveLength(2);
      for (let i = 0; i < x.length; i += 37) expect(back.channels[1][i]).toBeCloseTo(x[i], float ? 6 : 3);
    }
    const info = wavInfo(encodeWav({ sampleRate: 16000, channels: [x] }));
    expect(info.duration).toBeCloseTo(0.03, 5);
  });
  it('decodes 24-bit and 8-bit PCM', () => {
    const mk = (bits: number, write: (dv: DataView, o: number) => void) => {
      const buf = new Uint8Array(44 + bits / 8);
      const dv = new DataView(buf.buffer);
      const w = (o: number, s: string) => [...s].forEach((ch, i) => (buf[o + i] = ch.charCodeAt(0)));
      w(0, 'RIFF');
      dv.setUint32(4, 36 + bits / 8, true);
      w(8, 'WAVE');
      w(12, 'fmt ');
      dv.setUint32(16, 16, true);
      dv.setUint16(20, 1, true);
      dv.setUint16(22, 1, true);
      dv.setUint32(24, 8000, true);
      dv.setUint16(34, bits, true);
      w(36, 'data');
      dv.setUint32(40, bits / 8, true);
      write(dv, 44);
      return buf;
    };
    expect(
      decodeWav(
        mk(24, (dv, o) => {
          dv.setUint8(o, 0);
          dv.setUint8(o + 1, 0);
          dv.setUint8(o + 2, 0xc0);
        }),
      ).channels[0][0],
    ).toBeCloseTo(-0.5, 5);
    expect(decodeWav(mk(8, (dv, o) => dv.setUint8(o, 192))).channels[0][0]).toBeCloseTo(0.5, 5);
  });
  it('rejects non-WAV input', () => {
    expect(() => decodeWav(new Uint8Array(20))).toThrow(WavError);
  });
  it('mixes channels to mono', () => {
    expect(
      Array.from(toMono({ sampleRate: 1, channels: [Float32Array.of(1, 0), Float32Array.of(0, 0)] })),
    ).toEqual([0.5, 0]);
  });
});

describe('deterministic randomness', () => {
  it('is stable for a seed', () => {
    expect(rnd(42)).toBe(rnd(42));
    expect(rnd(42)).not.toBe(rnd(43));
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(hashString('ep01')).toBe(hashString('ep01'));
  });
});

describe('procedural SFX (SRS §7.3)', () => {
  it('synthesizes every sound deterministically and non-silently', () => {
    for (const s of SOUNDS) {
      const a = synthesize(s, 1);
      expect(a.length, s).toBeGreaterThan(SFX_RATE * 0.01);
      expect(sha(a)).toBe(sha(synthesize(s, 1)));
      expect(Math.max(...a.map(Math.abs)), s).toBeGreaterThan(0.05);
    }
  });
  it('renders a peak-normalized track (−0.9 dBFS) with stable hash', () => {
    const ev = [
      { t: 0.1, sound: 'hit' as const },
      { t: 0.5, sound: 'whoosh' as const, gain_db: -6 },
      { t: 0.9, sound: 'ding' as const },
    ];
    const a = renderSfxTrack(ev, 2, 'ep01');
    const b = renderSfxTrack(ev, 2, 'ep01');
    expect(sha(a)).toBe(sha(b));
    expect(a.length).toBe(2 * SFX_RATE);
    expect(Math.max(...a.map(Math.abs))).toBeCloseTo(SFX_PEAK, 5);
    expect(sha(renderSfxTrack(ev, 2, 'ep02'))).not.toBe(sha(a));
    expect(Math.max(...renderSfxTrack([], 1, 'x'))).toBe(0);
  });
});

describe('envelopes and onsets', () => {
  const rate = 8000;
  const sig = new Float32Array(rate * 2);
  for (let i = rate; i < rate * 2; i++) sig[i] = Math.sin(i / 3) * 0.5; // silence, then a tone at 1.0 s
  it('computes a per-frame envelope in [0,1]', () => {
    const env = frameEnvelope(sig, rate, 30);
    expect(env).toHaveLength(60);
    expect(env[5]).toBe(0);
    expect(env[45]).toBeGreaterThan(0.7);
  });
  it('snaps a cue to the nearest energy rise within ±120 ms', () => {
    const t = snapToOnset(sig, rate, 1.08);
    expect(Math.abs(t - 1.0)).toBeLessThan(0.02);
    expect(snapToOnset(sig, rate, 0.4)).toBe(0.4); // no onset nearby
  });
  it('computes peaks', () => {
    const p = peaks(sig, 4);
    expect(p[0]).toBe(0);
    expect(p[3]).toBeGreaterThan(0.4);
  });
});
