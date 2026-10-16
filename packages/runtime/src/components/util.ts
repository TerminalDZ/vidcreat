/** Shared helpers for components. */
import type { Theme } from '@reelforge/core';
import { css } from '../dom.js';

export const ARABIC = /[؀-ۿ]/;
export const isArabic = (s: string): boolean => ARABIC.test(s);

export function fontFor(
  theme: Theme,
  text: string,
  kind: 'auto' | 'display' | 'arabic' | 'mono' = 'auto',
): string {
  const f = theme.fonts;
  const q = (n: string) => `'${n}'`;
  if (kind === 'mono') return `${q(f.mono)}, ${q(f.arabic)}`;
  if (kind === 'arabic' || (kind === 'auto' && isArabic(text))) return `${q(f.arabic)}, ${q(f.display)}`;
  return `${q(f.display)}, ${q(f.arabic)}`;
}

/** Shrinks `el`'s font size (binary search, at mount) until it fits in w×h. Deterministic layout reads. */
export function fitText(el: HTMLElement, w: number, h: number, size: number, min = 18): number {
  el.style.fontSize = `${size}px`;
  if (!el.isConnected || (el.scrollWidth <= w + 1 && el.scrollHeight <= h + 1)) return size;
  let lo = min;
  let hi = size;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    el.style.fontSize = `${mid}px`;
    if (el.scrollWidth <= w + 1 && el.scrollHeight <= h + 1) lo = mid;
    else hi = mid;
  }
  el.style.fontSize = `${lo}px`;
  return lo;
}

export interface Segment {
  text: string;
  accent: boolean;
}

/** `**accent**` markup → segments. */
export function parseAccent(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), accent: false });
    out.push({ text: m[1], accent: true });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), accent: false });
  return out.length ? out : [{ text: '', accent: false }];
}

/**
 * Typing units: Latin text is revealed per character; Arabic text per word (so letters are never
 * split from their joining neighbours across elements).
 */
export function typingUnits(text: string): string[] {
  if (!isArabic(text)) return [...text];
  return text.match(/\S+\s*|\s+/g) ?? [text];
}

/** Two-span reveal used by typed text: [shown][hidden]. Keeps layout stable while typing. */
export class Reveal {
  readonly el: HTMLElement;
  private parts: { shown: HTMLElement; hidden: HTMLElement; units: string[] }[] = [];
  readonly total: number;
  private last = -1;

  constructor(segments: { text: string; className?: string; color?: string }[]) {
    this.el = document.createElement('span');
    let total = 0;
    for (const seg of segments) {
      const wrap = document.createElement('span');
      if (seg.className) wrap.className = seg.className;
      if (seg.color) wrap.style.color = seg.color;
      const shown = document.createElement('span');
      const hidden = document.createElement('span');
      hidden.className = 'rf-hidden';
      hidden.style.opacity = '0';
      wrap.append(shown, hidden);
      this.el.append(wrap);
      const units = typingUnits(seg.text);
      total += units.length;
      this.parts.push({ shown, hidden, units });
    }
    this.total = total;
    this.set(total);
  }

  set(n: number): void {
    n = Math.max(0, Math.min(this.total, n));
    if (n === this.last) return;
    this.last = n;
    let left = n;
    for (const p of this.parts) {
      const k = Math.min(left, p.units.length);
      p.shown.textContent = p.units.slice(0, k).join('');
      p.hidden.textContent = p.units.slice(k).join('');
      left -= k;
    }
  }
}

export const STATUS_COLORS: Record<string, string> = {
  idle: '',
  ok: 'lime',
  err: 'red',
  warn: 'amber',
  busy: 'cyan',
  off: 'dim',
};

export function statusColor(theme: Theme, status: string, fallback: string): string {
  const name = STATUS_COLORS[status];
  return name ? (theme.colors[name] ?? fallback) : fallback;
}

/** Keyframed value: counts from the previous value to each keyframe's value over its `dur`. */
export function keyframeValue(
  keyframes: { at: number; value: number; dur?: number }[],
  t: number,
  from: number,
  ease: (x: number) => number,
  defaultDur = 0.8,
): number {
  let v = from;
  let prev = from;
  for (const kf of keyframes) {
    if (t < kf.at) break;
    const dur = kf.dur ?? defaultDur;
    const k = dur <= 0 ? 1 : ease(Math.min(1, (t - kf.at) / dur));
    v = prev + (kf.value - prev) * k;
    prev = kf.value;
  }
  return v;
}

export function setVars(el: HTMLElement, vars: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(vars)) css(el, k, v);
}
