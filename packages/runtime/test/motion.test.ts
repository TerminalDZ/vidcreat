/**
 * Motion quality: every enter/exit animation is continuous frame to frame (no pops or jumps),
 * starts and ends exactly at rest (no visible snap when the animation hands over), and the easing
 * curves behave. Sampled at 60 fps, twice the render rate.
 */
import { describe, expect, it } from 'vitest';
import { ENTER_ANIMS, EXIT_ANIMS, type Theme } from '@reelforge/core';
import { easeFor, easeOutBounce, identity, spring, type Transform } from '../src/anim.js';
import { applyEnter, applyExit, textIsRtl } from '../src/scene.js';

const theme = { motion: { pop_overshoot: 1.9, default_dur: 0.5, crossfade: 0.35 } } as unknown as Theme;
const STEPS = 60;
/** Intentionally discontinuous: glitch flickers by design; `none` is a cut. */
const JUMPY = new Set(['glitch', 'none']);

function sample(fn: (tr: Transform, p: number) => void): Transform[] {
  return Array.from({ length: STEPS + 1 }, (_, i) => {
    const tr = identity();
    fn(tr, i / STEPS);
    return tr;
  });
}

/** Largest single-step change of each channel, in px / scale units / opacity. */
function maxStep(frames: Transform[]) {
  const m = { pos: 0, scale: 0, opacity: 0, blur: 0, clip: 0 };
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    m.pos = Math.max(m.pos, Math.hypot(b.tx - a.tx, b.ty - a.ty));
    m.scale = Math.max(m.scale, Math.abs(b.scale - a.scale));
    m.opacity = Math.max(m.opacity, Math.abs(b.opacity - a.opacity));
    m.blur = Math.max(m.blur, Math.abs(b.blur - a.blur));
    m.clip = Math.max(m.clip, Math.abs(b.clip - a.clip), Math.abs(b.clipEnd - a.clipEnd));
  }
  return m;
}

function nearRest(tr: Transform) {
  expect(Math.abs(tr.tx)).toBeLessThan(1);
  expect(Math.abs(tr.ty)).toBeLessThan(1);
  expect(Math.abs(tr.scale - 1)).toBeLessThan(0.01);
  expect(tr.opacity).toBeGreaterThan(0.97);
  expect(tr.blur).toBeLessThan(0.3);
  expect(tr.clip).toBeGreaterThan(0.99);
  expect(tr.clipEnd).toBeLessThan(0.01);
  expect(tr.clipBottom).toBeLessThan(1);
  expect(Math.abs(tr.rotX)).toBeLessThan(1);
}

describe('enter animations', () => {
  it.each(ENTER_ANIMS.filter((a) => !JUMPY.has(a)))('%s is continuous and lands exactly at rest', (anim) => {
    for (const ease of [undefined, 'snappy', 'gentle', 'linear']) {
      const frames = sample((tr, p) => applyEnter(tr, anim, p, {}, false, theme, p, 7, 200, ease));
      const m = maxStep(frames);
      // A 1/60 s step never moves more than 60 px, scales more than 0.12 or jumps in opacity.
      expect(m.pos, `${anim}/${ease} position`).toBeLessThan(60);
      expect(m.scale, `${anim}/${ease} scale`).toBeLessThan(0.12);
      expect(m.opacity, `${anim}/${ease} opacity`).toBeLessThan(0.35);
      expect(m.blur, `${anim}/${ease} blur`).toBeLessThan(3);
      // The frame just before the end is already at rest: no snap when the animation finishes.
      const last = identity();
      applyEnter(last, anim, 1 - 1 / 240, {}, false, theme, 1, 7, 200, ease);
      nearRest(last);
    }
  });

  it('starts from the stated pose (nothing visible pops in before the animation)', () => {
    for (const anim of ['rise', 'fade', 'blur', 'zoom', 'spring', 'drop', 'reveal', 'wipe']) {
      const tr = identity();
      applyEnter(tr, anim as never, 0, {}, false, theme, 0, 7, 200);
      const hidden = tr.opacity < 0.05 || tr.clip < 0.05 || tr.clipBottom >= 199;
      expect(hidden, anim).toBe(true);
    }
  });
});

describe('exit animations', () => {
  it.each(EXIT_ANIMS.filter((a) => !JUMPY.has(a)))('%s leaves smoothly from rest', (anim) => {
    const frames = sample((tr, q) => applyExit(tr, anim, q));
    nearRest(frames[0]);
    const m = maxStep(frames);
    expect(m.pos).toBeLessThan(30);
    expect(m.opacity).toBeLessThan(0.1);
    expect(m.clip).toBeLessThan(0.1);
    const end = frames[STEPS];
    expect(end.opacity < 0.02 || end.clipEnd > 0.99).toBe(true);
  });
});

describe('easing curves', () => {
  it('start at 0, end at 1 and never jump', () => {
    for (const f of [
      easeFor(undefined),
      easeFor('snappy'),
      easeFor('gentle'),
      easeFor('linear'),
      easeOutBounce,
      spring,
    ]) {
      expect(f(0)).toBeCloseTo(0, 6);
      expect(f(1)).toBeCloseTo(1, 6);
      let prev = f(0);
      for (let i = 1; i <= 240; i++) {
        const v = f(i / 240);
        expect(Math.abs(v - prev)).toBeLessThan(0.08);
        prev = v;
      }
    }
  });

  it('spring overshoots a little and settles; bounce never exceeds the floor', () => {
    const peak = Math.max(...Array.from({ length: 200 }, (_, i) => spring(i / 200)));
    expect(peak).toBeGreaterThan(1.01);
    expect(peak).toBeLessThan(1.12);
    expect(Math.abs(spring(0.95) - 1)).toBeLessThan(0.01);
    expect(Math.max(...Array.from({ length: 200 }, (_, i) => easeOutBounce(i / 200)))).toBeLessThanOrEqual(
      1.0001,
    );
  });
});

describe('wipe direction', () => {
  it('follows the first strong character of the text, like dir="auto"', () => {
    expect(textIsRtl('كلمة بكلمة')).toBe(true);
    expect(textIsRtl('الـ client')).toBe(true);
    expect(textIsRtl('42 · word by word')).toBe(false);
    expect(textIsRtl('API الـ')).toBe(false);
    expect(textIsRtl('1080 × 1920')).toBeUndefined();
  });
});
