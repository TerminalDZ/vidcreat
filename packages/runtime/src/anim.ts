/** Animation primitives (SRS §6.2): pure functions of time. */
import { rnd } from '@reelforge/audio';

export const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const linear = (x: number): number => clamp(x);
export const easeOutCubic = (x: number): number => 1 - (1 - clamp(x)) ** 3;
export const easeInCubic = (x: number): number => clamp(x) ** 3;
export const easeInOutCubic = (x: number): number => {
  const k = clamp(x);
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
};
export const easeOutBack =
  (c1 = 1.9) =>
  (x: number): number => {
    const k = clamp(x);
    const c3 = c1 + 1;
    return 1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2;
  };
export const easeOutExpo = (x: number): number => (x >= 1 ? 1 : 1 - 2 ** (-10 * clamp(x)));
export const easeOutQuart = (x: number): number => 1 - (1 - clamp(x)) ** 4;
export const easeOutQuint = (x: number): number => 1 - (1 - clamp(x)) ** 5;
export const easeInOutSine = (x: number): number => -(Math.cos(Math.PI * clamp(x)) - 1) / 2;
export const easeOutSine = (x: number): number => Math.sin((clamp(x) * Math.PI) / 2);

/** Ball-drop bounce that settles at 1. */
export function easeOutBounce(x: number): number {
  const k = clamp(x);
  const n = 7.5625;
  const d = 2.75;
  if (k < 1 / d) return n * k * k;
  if (k < 2 / d) return n * (k - 1.5 / d) ** 2 + 0.75;
  if (k < 2.5 / d) return n * (k - 2.25 / d) ** 2 + 0.9375;
  return n * (k - 2.625 / d) ** 2 + 0.984375;
}

/**
 * Damped spring from 0 to 1 (overshoots, then settles exactly at 1 when x = 1).
 * The envelope is windowed so the last frames land precisely without a visible snap.
 */
export function spring(x: number, bounces = 2.2, damping = 6): number {
  const k = clamp(x);
  if (k >= 1) return 1;
  const osc = Math.exp(-damping * k) * Math.cos(Math.PI * 2 * bounces * k * 0.5);
  return 1 - osc * (1 - k * k);
}

/** Easing for `enter.ease` (default: smooth). */
export function easeFor(name: string | undefined): (x: number) => number {
  switch (name) {
    case 'snappy':
      return easeOutQuint;
    case 'gentle':
      return easeInOutSine;
    case 'linear':
      return linear;
    default:
      return easeOutCubic;
  }
}

export const EASINGS = { linear, easeOutCubic, easeInOutCubic, easeInCubic, easeOutExpo } as const;

/** Linear progress of `t` through [t0, t0 + dur]. */
export const progress = (t: number, t0: number, dur: number): number =>
  dur <= 0 ? (t >= t0 ? 1 : 0) : clamp((t - t0) / dur);

/** Seeded jitter in [-1, 1] that changes `rate` times per second (deterministic). */
export function jitter(seed: number, t: number, rate = 30): number {
  return rnd(seed * 7919 + Math.floor(t * rate)) * 2 - 1;
}

export interface Transform {
  tx: number;
  ty: number;
  scale: number;
  rot: number;
  rotX: number;
  opacity: number;
  blur: number;
  glitch: number;
  clip: number; // 0..1 reveal from the inline-start side (1 = fully visible)
  clipEnd: number; // 0..1 hidden from the inline-start side (wipe out; 0 = nothing hidden)
  clipBottom: number; // px hidden at the bottom of the element (mask for `reveal`)
}

export const identity = (): Transform => ({
  tx: 0,
  ty: 0,
  scale: 1,
  rot: 0,
  rotX: 0,
  opacity: 1,
  blur: 0,
  glitch: 0,
  clip: 1,
  clipEnd: 0,
  clipBottom: 0,
});

export function transformCss(tr: Transform): string {
  const parts: string[] = [];
  if (tr.tx || tr.ty) parts.push(`translate(${tr.tx.toFixed(2)}px, ${tr.ty.toFixed(2)}px)`);
  if (tr.rotX) parts.push(`perspective(1200px) rotateX(${tr.rotX.toFixed(2)}deg)`);
  if (tr.rot) parts.push(`rotate(${tr.rot.toFixed(3)}deg)`);
  if (tr.scale !== 1) parts.push(`scale(${tr.scale.toFixed(4)})`);
  return parts.length ? parts.join(' ') : 'none';
}

/** Number formatting for counters (deterministic: no locale dependency). */
export function formatNumber(v: number, decimals: number, separator: boolean): string {
  const neg = v < 0;
  const fixed = Math.abs(v).toFixed(decimals);
  const [intPart, frac] = fixed.split('.');
  let int = intPart;
  if (separator) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${int}${frac ? `.${frac}` : ''}`;
}

/** Typed reveal: number of characters visible at `cps` since `t0`. */
export const typedCount = (t: number, t0: number, cps: number, total: number): number =>
  t < t0 ? 0 : Math.min(total, Math.floor((t - t0) * cps + 1e-6));

/** Caret blink (on for 0.5 s, off for 0.5 s), pure in t. */
export const caretOn = (t: number): boolean => Math.floor(t * 2) % 2 === 0;
