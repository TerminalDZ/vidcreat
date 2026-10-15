/** Series chrome (FR-RT-5): background glow + grid, header, progress, waveform, grain, vignette and flashes. */
import { mulberry32, rnd } from '@reelforge/audio';
import type { Timeline } from '@reelforge/core';
import { clamp, easeInOutCubic, easeOutCubic, progress } from './anim.js';
import { css, h, text } from './dom.js';
import { mix, rgba } from './color.js';

const GLOW_FADE = 0.8;
const CHAPTER_ANIM = 0.4;
const WAVE_BARS = 41;
const GRAIN_PAD = 240;
const GRID = 60;

/** Background glow color at time t: interpolates scene glows over 0.8 s. */
export function glowAt(tl: Timeline, t: number): string {
  const g = tl.glow;
  let i = 0;
  while (i + 1 < g.length && g[i + 1].t <= t) i++;
  const cur = g[i];
  const prev = g[i - 1];
  if (!prev) return cur.color;
  return mix(prev.color, cur.color, easeInOutCubic(progress(t, cur.t, GLOW_FADE)));
}

const ctx2d = (c: HTMLCanvasElement): CanvasRenderingContext2D | null => {
  const ctx = c.getContext?.('2d') ?? null;
  return ctx && typeof ctx.createRadialGradient === 'function' ? ctx : null;
};

/**
 * A static noise texture larger than the canvas. Each frame shows it at a seeded offset, so grain
 * changes every frame while the layer is only composited (never re-rasterized).
 */
function grainCanvas(seed: number, w: number, hgt: number): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = w + GRAIN_PAD;
  c.height = hgt + GRAIN_PAD;
  const ctx = ctx2d(c);
  if (!ctx || typeof ctx.createImageData !== 'function') return null;
  const rand = mulberry32(seed);
  const img = ctx.createImageData(c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // Signed luminance noise baked as white/black with alpha (normal blending is cheap to composite).
    const v = (rand() + rand() - 1) * 2.4;
    d[i] = d[i + 1] = d[i + 2] = v >= 0 ? 255 : 0;
    d[i + 3] = Math.min(255, Math.round(Math.abs(v) * 120));
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Grid lines with the radial fade baked in (drawn once). */
function gridCanvas(w: number, hgt: number, color: string): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hgt + GRID * 2;
  const ctx = ctx2d(c);
  if (!ctx) return null;
  ctx.fillStyle = color;
  for (let x = 0; x <= w; x += GRID) ctx.fillRect(x, 0, 1.5, c.height);
  for (let y = 0; y <= c.height; y += GRID) ctx.fillRect(0, y, w, 1.5);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.save();
  const cx = w / 2;
  const cy = GRID + hgt * 0.4;
  ctx.translate(cx, cy);
  ctx.scale(w * 0.7, hgt * 0.52);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0.3, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-2, -2, 4, 4);
  ctx.restore();
  return c;
}

export class Background {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private grid?: HTMLElement;
  private lastGlow = '';

  constructor(private tl: Timeline) {
    this.canvas = h('canvas', { width: tl.width, height: tl.height, class: 'rf-bgc' });
    this.ctx = ctx2d(this.canvas);
    this.el = h('div', { class: 'rf-layer rf-bg' }, this.canvas);
    if (tl.theme.chrome.grid) {
      const g = gridCanvas(tl.width, tl.height, 'rgba(255,255,255,0.05)');
      if (g) {
        g.className = 'rf-gridc';
        this.grid = g;
        this.el.append(g);
      }
    }
  }

  private paint(c: string): void {
    const ctx = this.ctx;
    const { width: w, height: hh } = this.tl;
    if (!ctx) {
      css(this.el, 'background', `radial-gradient(ellipse 60% 36% at 50% 28%, ${rgba(c, 0.34)}, transparent 75%)`);
      return;
    }
    ctx.clearRect(0, 0, w, hh);
    const ellipse = (cx: number, cy: number, rx: number, ry: number, stops: [number, number][]) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(rx, ry);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      for (const [o, a] of stops) g.addColorStop(o, rgba(c, a));
      ctx.fillStyle = g;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    };
    ellipse(w / 2, hh * 0.28, w * 0.66, hh * 0.38, [
      [0, 0.34],
      [0.45, 0.12],
      [1, 0],
    ]);
    ellipse(w / 2, hh * 0.98, w * 0.6, hh * 0.24, [
      [0, 0.13],
      [1, 0],
    ]);
  }

  update(t: number): void {
    const c = glowAt(this.tl, t);
    if (c !== this.lastGlow) {
      this.lastGlow = c;
      this.paint(c);
    }
    // Slow, seamless float of the grid (no wrap-around jump).
    if (this.grid) css(this.grid, 'transform', `translateY(${(-GRID + 30 * Math.sin((t * 2 * Math.PI) / 9)).toFixed(2)}px)`);
  }
}

export class Header {
  readonly el: HTMLElement;
  private fill?: HTMLElement;
  private chA: HTMLElement;
  private chB: HTMLElement;

  constructor(private tl: Timeline) {
    const p = tl.preset;
    this.el = h('div', { class: 'rf-header', style: `top:${p.headerTop - 30}px` });
    if (tl.theme.chrome.progress) {
      const bar = h('div', { class: 'rf-progress' });
      this.fill = h('div', { class: 'rf-progress-fill' });
      bar.append(this.fill);
      for (const ch of tl.chapters) {
        if (ch.t <= 0.05) continue;
        bar.append(h('i', { class: 'rf-progress-tick', style: `left:${((ch.t / tl.duration) * 100).toFixed(3)}%` }));
      }
      this.el.append(bar);
    }
    if (tl.theme.chrome.header) {
      const ep = `EP.${String(tl.meta.episode).padStart(2, '0')}`;
      this.el.append(
        h('div', { class: 'rf-hrow' }, h('span', { class: 'rf-series' }, tl.meta.series || tl.meta.title), h('span', { class: 'rf-ep' }, ep)),
      );
    }
    this.chA = h('span');
    this.chB = h('span');
    if (tl.theme.chrome.header) this.el.append(h('div', { class: 'rf-chapter' }, this.chA, this.chB));
  }

  update(t: number): void {
    if (this.fill) css(this.fill, 'transform', `scaleX(${clamp(t / this.tl.duration).toFixed(5)})`);
    const chs = this.tl.chapters;
    let i = -1;
    while (i + 1 < chs.length && chs[i + 1].t <= t) i++;
    const cur = chs[i];
    const prev = chs[i - 1];
    const k = cur ? easeOutCubic(progress(t, cur.t, CHAPTER_ANIM)) : 1;
    text(this.chA, cur?.label ?? '');
    css(this.chA, 'transform', `translateY(${((1 - k) * 34).toFixed(2)}px)`);
    css(this.chA, 'opacity', k.toFixed(3));
    text(this.chB, prev && k < 1 ? prev.label : '');
    css(this.chB, 'transform', `translateY(${(-k * 34).toFixed(2)}px)`);
    css(this.chB, 'opacity', (1 - k).toFixed(3));
  }
}

/** Bottom-most y not covered by a full-width safe-zone exclusion. */
export function safeBottom(tl: Timeline): number {
  const bottoms = tl.preset.safe.filter((z) => z.w >= tl.width * 0.8).map((z) => z.y);
  return bottoms.length ? Math.min(...bottoms) : tl.height;
}

export class Waveform {
  readonly el: HTMLElement;
  private bars: HTMLElement[] = [];
  private maxH = 44;

  constructor(private tl: Timeline) {
    const y = Math.min(tl.preset.captionsY + 205, safeBottom(tl) - this.maxH / 2 - 12);
    this.el = h('div', { class: 'rf-wave', style: `top:${y - this.maxH / 2}px;height:${this.maxH}px` });
    for (let i = 0; i < WAVE_BARS; i++) {
      const b = h('i');
      this.bars.push(b);
      this.el.append(b);
    }
  }

  update(t: number): void {
    const env = this.tl.audio.envelope;
    const fps = this.tl.fps;
    const mid = (WAVE_BARS - 1) / 2;
    for (let i = 0; i < WAVE_BARS; i++) {
      const d = Math.abs(i - mid);
      const f = Math.floor((t - d * 0.018) * fps);
      const v = env[Math.max(0, Math.min(env.length - 1, f))] ?? 0;
      const shape = 1 - (d / (mid + 1)) * 0.65;
      const hgt = 4 + v * shape * (this.maxH - 4);
      css(this.bars[i], 'height', `${hgt.toFixed(1)}px`);
      css(this.bars[i], 'opacity', (0.35 + 0.6 * shape * (0.4 + v * 0.6)).toFixed(3));
    }
  }
}

export class Overlays {
  readonly el: HTMLElement;
  private flash: HTMLElement;
  private grain?: HTMLCanvasElement;

  constructor(private tl: Timeline) {
    const { vignette, grain } = tl.theme.chrome;
    this.flash = h('div', { class: 'rf-flash', style: 'opacity:0' });
    this.el = h('div', { class: 'rf-layer' });
    if (vignette > 0) {
      this.el.append(
        h('div', { class: 'rf-vignette', style: `background: radial-gradient(ellipse 80% 70% at 50% 45%, transparent 52%, rgba(0,0,0,${vignette}) 100%)` }),
      );
    }
    if (grain > 0) {
      const g = grainCanvas(tl.seed, tl.width, tl.height);
      if (g) {
        g.className = 'rf-grain';
        g.style.opacity = String(grain);
        this.grain = g;
        this.el.append(g);
      }
    }
    this.el.append(this.flash);
  }

  update(t: number, frame: number): void {
    let best = 0;
    let color = '#ffffff';
    for (const f of this.tl.flashes) {
      if (t < f.t || t > f.t + f.dur) continue;
      const v = f.intensity * (1 - (t - f.t) / f.dur) ** 2;
      if (v > best) {
        best = v;
        color = f.color;
      }
    }
    css(this.flash, 'opacity', best.toFixed(3));
    if (best > 0) css(this.flash, 'background', color);
    if (this.grain) {
      // 8 seeded offsets cycled by frame index (FR-RT-5: "8 pre-generated tiles chosen by frame index").
      const k = frame % 8;
      const ox = Math.floor(rnd(this.tl.seed + k * 2) * GRAIN_PAD);
      const oy = Math.floor(rnd(this.tl.seed + k * 2 + 1) * GRAIN_PAD);
      css(this.grain, 'transform', `translate(${-ox}px, ${-oy}px)`);
    }
  }
}
