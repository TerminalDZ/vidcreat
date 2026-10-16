/**
 * Shared helpers for chart and diagram components: number labels, "nice" scales, palettes, text
 * direction, legends, staggered reveals and SVG geometry. Every helper is a pure function of its
 * inputs (or writes styles through the cached `css`/`attr` setters), so components built on them
 * stay deterministic in render(t).
 */
import type { Theme } from '@reelforge/core';
import { clamp, easeOutBack, easeOutCubic, formatNumber, progress } from '../anim.js';
import { attr, css, h, s } from '../dom.js';
import { parse, resolve, rgba } from '../color.js';
import type { MountCtx } from '../types.js';
import { fitText, fontFor, isArabic } from './util.js';

// ------------------------------------------------------------------ numbers & scales

export interface NumFmt {
  prefix?: string;
  suffix?: string;
  decimals?: number;
  separator?: boolean;
}

export const fmtNum = (v: number, f: NumFmt = {}): string =>
  `${f.prefix ?? ''}${formatNumber(v, f.decimals ?? 0, f.separator ?? true)}${f.suffix ?? ''}`;

const tidy = (v: number) => Number.parseFloat(v.toPrecision(12));

/** Axis bounds rounded outwards to a 1-2-2.5-5×10ⁿ step, with the ticks in between. */
export function niceScale(
  lo: number,
  hi: number,
  count = 4,
): { min: number; max: number; step: number; ticks: number[] } {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) [lo, hi] = [0, 1];
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi === lo) hi = lo === 0 ? 1 : lo + Math.abs(lo);
  const raw = (hi - lo) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = tidy((n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag);
  const min = tidy(Math.floor(lo / step + 1e-9) * step);
  const max = tidy(Math.ceil(hi / step - 1e-9) * step);
  const ticks: number[] = [];
  for (let i = 0; min + i * step <= max + step * 1e-6; i++) ticks.push(tidy(min + i * step));
  return { min, max, step, ticks };
}

/** Domain bounds for value charts: includes 0 unless the caller fixes min/max. */
export function valueDomain(values: number[], min?: number, max?: number, count = 4) {
  const lo = min ?? Math.min(0, ...values);
  const hi = max ?? Math.max(0, ...values);
  const nice = niceScale(lo, hi, count);
  return {
    ...nice,
    min: min ?? nice.min,
    max: max ?? nice.max,
    ticks: nice.ticks.filter((v) => v >= (min ?? nice.min) - 1e-9 && v <= (max ?? nice.max) + 1e-9),
  };
}

/** Linear map from [d0, d1] to [r0, r1]. */
export const linearScale =
  (d0: number, d1: number, r0: number, r1: number) =>
  (v: number): number =>
    d1 === d0 ? r0 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

// ------------------------------------------------------------------ colors & direction

const SERIES = ['cyan', 'lime', 'violet', 'amber', 'red', 'ink'];

/**
 * `n` distinct colors: explicit per-item colors win, the first item defaults to `base`, the rest
 * walk the theme's series palette (skipping `base`).
 */
export function palette(
  theme: Theme,
  base: string,
  n: number,
  explicit: (string | undefined)[] = [],
): string[] {
  const b = resolve(base);
  const rest = SERIES.map((k) => theme.colors[k]).filter((c) => c && c.toLowerCase() !== b.toLowerCase());
  const out: string[] = [];
  for (let i = 0; i < n; i++)
    out.push(explicit[i] ? resolve(explicit[i]) : i === 0 ? b : rest[(i - 1) % rest.length]);
  return out;
}

/** Reading direction of a component from its texts: right-to-left as soon as one is Arabic. */
export const textDir = (...texts: (string | undefined)[]): 'rtl' | 'ltr' =>
  texts.some((t) => t !== undefined && isArabic(t)) ? 'rtl' : 'ltr';

/** Mirrors an x position (of an item `w` wide) inside a `W`-wide box for right-to-left layouts. */
export const mirrorX = (x: number, w: number, W: number, rtl: boolean): number => (rtl ? W - x - w : x);

// ------------------------------------------------------------------ text

export interface TextOpts {
  cls?: string;
  size?: number;
  kind?: 'auto' | 'display' | 'arabic' | 'mono';
  color?: string;
  weight?: number;
  align?: 'start' | 'center' | 'end';
  style?: string;
  /** Mark as a V-9 overflow target (default true). */
  fit?: boolean;
}

/** A single-line text box with the right font for its script and `dir="auto"`. */
export function textEl(theme: Theme, text: string, o: TextOpts = {}): HTMLElement {
  const st = [
    `font-family:${fontFor(theme, text, o.kind ?? 'auto')}`,
    o.size ? `font-size:${o.size}px` : '',
    o.color ? `color:${o.color}` : '',
    o.weight ? `font-weight:${o.weight}` : '',
    o.align ? `text-align:${o.align}` : '',
    o.style ?? '',
  ].filter(Boolean);
  return h(
    'div',
    { class: `rf-tx ${o.cls ?? ''}`.trim(), dir: 'auto', 'data-fit': o.fit ?? true, style: st.join(';') },
    text,
  );
}

/** A number label: always left-to-right and isolated, so it reads correctly inside Arabic text. */
export const numEl = (cls = '', style = ''): HTMLElement =>
  h('span', { class: `rf-num ${cls}`.trim(), dir: 'ltr', style });

/** Shrinks text to fit a w×h slot (min 16 px). */
export const fitTo = (el: HTMLElement, w: number, h: number, size: number, min = 16): number =>
  fitText(el, Math.max(1, w), Math.max(1, h), size, min);

/**
 * Like fitTo, but first caps the element at `w` (max-width): a block that stretches wider than its
 * slot would otherwise never measure as fitting.
 */
export function fitWithin(el: HTMLElement, w: number, h: number, size: number, min = 16): number {
  el.style.maxWidth = `${Math.max(1, w)}px`;
  return fitTo(el, w, h, size, min);
}

// ------------------------------------------------------------------ legend

/** Legend rows (swatch + label). Rows with Arabic labels put the swatch on the right. */
export function legend(
  theme: Theme,
  items: { label: string; color: string; value?: HTMLElement }[],
  o: { size?: number; column?: boolean; style?: string } = {},
): { el: HTMLElement; rows: HTMLElement[] } {
  const size = o.size ?? 24;
  const el = h('div', {
    class: `rf-legend${o.column ? ' col' : ''}`,
    style: `font-size:${size}px;${o.style ?? ''}`,
  });
  const rows = items.map((it) => {
    const row = h(
      'div',
      { class: 'rf-lg', dir: isArabic(it.label) ? 'rtl' : 'ltr' },
      h('i', {
        class: 'rf-sw',
        style: `width:${Math.round(size * 0.62)}px;height:${Math.round(size * 0.62)}px;background:${it.color};box-shadow:0 0 14px ${rgba(it.color, 0.5)}`,
      }),
      textEl(theme, it.label, { cls: 'rf-lg-t' }),
    );
    if (it.value) row.append(h('i', { class: 'rf-sp' }), it.value);
    el.append(row);
    return row;
  });
  return { el, rows };
}

// ------------------------------------------------------------------ timing

/** When the i-th sequenced item appears: its own `at`, else staggered from the element's enter (same rule as core). */
export const itemAt = (ctx: MountCtx, i: number, stagger: number, at?: number): number =>
  typeof at === 'number' ? at : ctx.el.enter.t + i * stagger;

export interface RevealOpts {
  dur?: number;
  dx?: number;
  dy?: number;
  /** Start scale (springs to 1). */
  s0?: number;
  /** Extra transform appended after the animated part (e.g. a centering translate). */
  base?: string;
}

/**
 * Staggered entrance of a sub-element. Writes visibility, opacity and transform on every call
 * (whatever the branch) so the result only depends on `t`. Returns the eased progress (0 hidden).
 */
export function reveal(el: HTMLElement | SVGElement, t: number, at: number, o: RevealOpts = {}): number {
  const vis = t >= at;
  const raw = vis ? progress(t, at, o.dur ?? 0.4) : 0;
  const k = easeOutCubic(raw);
  const parts: string[] = [];
  if (o.base) parts.push(o.base);
  if (vis && k < 1 && (o.dx || o.dy))
    parts.push(`translate(${((1 - k) * (o.dx ?? 0)).toFixed(2)}px, ${((1 - k) * (o.dy ?? 0)).toFixed(2)}px)`);
  if (vis && raw < 1 && o.s0 !== undefined)
    parts.push(`scale(${(o.s0 + (1 - o.s0) * easeOutBack(2)(raw)).toFixed(4)})`);
  css(el, 'visibility', vis ? 'visible' : 'hidden');
  css(el, 'opacity', !vis ? '0' : k >= 1 ? '1' : k.toFixed(3));
  css(el, 'transform', parts.length ? parts.join(' ') : 'none');
  return k;
}

/** Glow/flash envelope that decays from 1 to 0 over `dur` after `at` (0 before). */
export const flash = (t: number, at: number, dur = 0.7): number => (t < at ? 0 : 1 - clamp((t - at) / dur));

// ------------------------------------------------------------------ SVG geometry

export interface Pt {
  x: number;
  y: number;
}

export const svgBox = (w: number, hh: number, cls = ''): SVGSVGElement =>
  s('svg', {
    class: cls || undefined,
    width: w,
    height: hh,
    viewBox: `0 0 ${w} ${hh}`,
    style: 'position:absolute;left:0;top:0;overflow:visible',
  });

/** Point on a circle; angle in radians, 0 = 12 o'clock, clockwise. */
export const polar = (cx: number, cy: number, r: number, a: number): Pt => ({
  x: cx + r * Math.sin(a),
  y: cy - r * Math.cos(a),
});

/**
 * Shows the clockwise arc [from, from + len] (fractions of a turn, 0 = 12 o'clock) of an SVG circle
 * by its dash pattern. The circle needs `transform="rotate(-90 cx cy)"`.
 */
export function ringArc(circle: SVGCircleElement, r: number, from: number, len: number): void {
  const c = 2 * Math.PI * r;
  const l = clamp(len) * c;
  attr(circle, 'stroke-dasharray', `${l.toFixed(2)} ${(c + 1).toFixed(2)}`);
  attr(circle, 'stroke-dashoffset', (-from * c).toFixed(2));
  attr(circle, 'opacity', l > 0.01 ? '1' : '0');
}

/** Cumulative lengths of a polyline. */
export function polyLengths(pts: Pt[]): number[] {
  const acc = [0];
  for (let i = 1; i < pts.length; i++)
    acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return acc;
}

/** The first `k` (0..1, by length) of a polyline, ending exactly at the drawn head. */
export function partialPolyline(pts: Pt[], acc: number[], k: number): Pt[] {
  const total = acc[acc.length - 1];
  if (k >= 1 || total === 0) return pts.slice();
  const L = clamp(k) * total;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (acc[i] <= L) {
      out.push(pts[i]);
      continue;
    }
    const f = (L - acc[i - 1]) / (acc[i] - acc[i - 1] || 1);
    out.push({
      x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f,
      y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f,
    });
    break;
  }
  return out;
}

export const pathD = (pts: Pt[]): string =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');

/** Reveals a stroked path from its start: k = 0 hidden, 1 complete (`len` = its length). */
export function drawStroke(el: SVGElement, len: number, k: number): void {
  attr(el, 'stroke-dasharray', `${len.toFixed(2)} ${(len + 1).toFixed(2)}`);
  attr(el, 'stroke-dashoffset', (len * (1 - clamp(k))).toFixed(2));
  attr(el, 'opacity', k > 0 ? '1' : '0');
}

/** Arrow-head triangle pointing along `angle` with its tip at `tip`. */
export function arrowHead(tip: Pt, angle: number, size: number): string {
  const back = { x: tip.x - Math.cos(angle) * size, y: tip.y - Math.sin(angle) * size };
  const nx = -Math.sin(angle) * size * 0.55;
  const ny = Math.cos(angle) * size * 0.55;
  return `${tip.x.toFixed(2)},${tip.y.toFixed(2)} ${(back.x + nx).toFixed(2)},${(back.y + ny).toFixed(2)} ${(back.x - nx).toFixed(2)},${(back.y - ny).toFixed(2)}`;
}

/** Resolved color with a fallback (props colors arrive resolved; optional ones may be missing). */
export const colorOr = (c: string | undefined, fallback: string): string => (c ? resolve(c) : fallback);

/** Readable text color on a solid background: near-black on bright colors, white on dark ones. */
export function contrastText(bg: string, dark = '#0b0d14', light = '#ffffff'): string {
  const { r, g, b } = parse(bg);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55 ? dark : light;
}

/** Element-unique id for SVG defs (gradients, masks, clip paths). */
export const defId = (ctx: MountCtx, suffix: string): string =>
  `rf-${ctx.el.id.replace(/[^\w-]/g, '')}-${ctx.seed % 100000}-${suffix}`;

/** When the element is on screen: from its enter to its exit (or the end of its scene). */
export function lifetime(ctx: MountCtx): { start: number; end: number } {
  const scene = ctx.tl.scenes.find((sc) => sc.elements.some((e) => e.id === ctx.el.id));
  const start = ctx.el.enter.t;
  const end = ctx.el.exit?.t ?? scene?.end ?? start + 5;
  return { start, end: Math.max(start + 0.5, end) };
}

/** Points sampled along a Catmull–Rom spline through `pts` (`per` samples per segment). */
export function smoothPath(pts: Pt[], per = 16): Pt[] {
  if (pts.length < 3) return pts.slice();
  const out: Pt[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 1; k <= per; k++) {
      const u = k / per;
      const u2 = u * u;
      const u3 = u2 * u;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return out;
}

/** Initials of a name (first letter of the first two words). */
export const initialsOf = (name: string): string =>
  isArabic(name)
    ? ([...name.trim()][0] ?? '')
    : name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => [...w][0] ?? '')
        .join('')
        .toUpperCase();
