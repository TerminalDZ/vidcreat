/** Caption renderer (SRS §9.2): karaoke highlight, RTL/LTR mixing via <bdi> isolation. */
import type { CaptionChunk, Timeline } from '@reelforge/core';
import { clamp, easeOutCubic, progress } from './anim.js';
import { cls, css, h } from './dom.js';
import { rgba } from './color.js';

const CHUNK_IN = 0.16;
const ACTIVE_PULSE = 0.25;

interface ChunkView {
  chunk: CaptionChunk;
  el: HTMLElement;
  toks: HTMLElement[];
}

/** Builds the DOM of a chunk: one inline-block token per unit; Latin parts isolated in <bdi>. */
export function chunkDom(chunk: CaptionChunk): { el: HTMLElement; toks: HTMLElement[] } {
  const line = h('span', { class: 'rf-cline' });
  const toks: HTMLElement[] = [];
  chunk.tokens.forEach((tok, i) => {
    const span = h('span', { class: 'rf-tok' });
    for (const p of tok.parts) span.append(p.latin ? h('bdi', {}, p.text) : document.createTextNode(p.text));
    if (i) line.append(document.createTextNode(' '));
    line.append(span);
    toks.push(span);
  });
  const el = h(
    'div',
    {
      class: 'rf-chunk',
      dir: chunk.dir,
      lang: chunk.dir === 'rtl' ? 'ar' : 'en',
      style: `direction:${chunk.dir}`,
    },
    line,
  );
  return { el, toks };
}

export class Captions {
  readonly el: HTMLElement;
  private views: ChunkView[] = [];
  private active: string;
  private english: string;
  private ink: string;
  private future: number;

  constructor(private tl: Timeline) {
    const p = tl.preset;
    const rightRail = p.safe.find((z) => z.x > 0 && z.y < p.captionsY + 300 && z.x + z.w >= tl.width);
    const left = 70;
    const right = rightRail ? tl.width - rightRail.x + 16 : 70;
    const th = tl.theme;
    this.active = th.captions.active;
    this.english = th.captions.english;
    this.ink = th.colors.ink ?? '#eef1f7';
    this.future = th.captions.future_opacity;
    this.el = h('div', {
      class: 'rf-captions',
      style: `left:${left}px;width:${tl.width - left - right}px;top:${p.captionsY}px;font-size:${th.type.caption}px;--scrim:${rgba(th.colors.bg ?? '#07080c', th.captions.scrim)}`,
    });
    for (const chunk of tl.captions) {
      const { el, toks } = chunkDom(chunk);
      css(el, 'display', 'none');
      this.el.append(el);
      this.views.push({ chunk, el, toks });
    }
  }

  /** Index of the chunk visible at t (or -1). */
  indexAt(t: number): number {
    let lo = 0;
    let hi = this.views.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.views[mid].chunk.start <= t) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found >= 0 && t < this.views[found].chunk.end) return found;
    return -1;
  }

  update(t: number): void {
    const idx = this.indexAt(t);
    this.views.forEach((v, i) => {
      if (i !== idx) {
        css(v.el, 'display', 'none');
        return;
      }
      css(v.el, 'display', 'block');
      const k = easeOutCubic(progress(t, v.chunk.start, CHUNK_IN));
      css(v.el, 'opacity', k.toFixed(3));
      css(v.el, 'transform', `translateY(${((1 - k) * 16).toFixed(2)}px)`);
      let activeTok = -1;
      v.chunk.tokens.forEach((tok, j) => {
        if (tok.start <= t) activeTok = j;
      });
      v.chunk.tokens.forEach((tok, j) => {
        const el = v.toks[j];
        const isActive = j === activeTok;
        const past = j < activeTok;
        css(el, 'color', isActive ? this.active : tok.english ? this.english : this.ink);
        css(el, 'opacity', isActive || past ? '1' : String(this.future));
        const pulse = isActive
          ? 1 + 0.08 * (1 - clamp(easeOutCubic(progress(t, tok.start, ACTIVE_PULSE))))
          : 1;
        css(el, 'transform', pulse === 1 ? 'none' : `scale(${pulse.toFixed(4)})`);
        cls(el, 'is-active', isActive);
      });
    });
  }

  /** Number of rendered lines per chunk (V-10 measuring pass). */
  measureLines(): { lineId: string; start: number; lines: number; text: string }[] {
    return this.views.map((v) => {
      const prev = v.el.style.display;
      v.el.style.display = 'block';
      // Layout positions (offsetTop ignores transforms); a new line starts when a token sits
      // more than half a font size below the previous line.
      const size = parseFloat(getComputedStyle(this.el).fontSize) || 66;
      const tops = v.toks.map((tk) => tk.offsetTop).sort((a, b) => a - b);
      let lines = tops.length ? 1 : 0;
      for (let i = 1; i < tops.length; i++) if (tops[i] - tops[i - 1] > size * 0.5) lines++;
      v.el.style.display = prev;
      return { lineId: v.chunk.lineId, start: v.chunk.start, lines, text: v.chunk.text };
    });
  }
}
