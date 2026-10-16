/** The render engine: mounts a Timeline and exposes a pure render(t) (FR-RT-1…3). */
import type { Timeline } from '@reelforge/core';
import { jitter } from './anim.js';
import { Captions } from './captions.js';
import { Background, Header, Overlays, Waveform } from './chrome.js';
import { setPalette } from './color.js';
import { css, h } from './dom.js';
import { LIGHT_CSS } from './light.js';
import { SceneView } from './scene.js';
import { BASE_CSS } from './styles.js';
import { GENERAL_CSS } from './styles-general.js';

export interface MeasureResult {
  overflow: { id: string; scene: string; t: number }[];
  captions: { lineId: string; start: number; lines: number; text: string }[];
}

let styleInjected = false;
let lightInjected = false;

export class Engine {
  readonly root: HTMLElement;
  private world: HTMLElement;
  private bg: Background;
  private scenes: SceneView[];
  private header: Header;
  private captions: Captions;
  private wave?: Waveform;
  private overlays: Overlays;

  constructor(
    readonly tl: Timeline,
    host: HTMLElement,
  ) {
    if (!styleInjected) {
      const style = document.createElement('style');
      style.textContent = BASE_CSS + GENERAL_CSS;
      document.head.append(style);
      styleInjected = true;
    }
    const light = tl.theme.mode === 'light';
    if (light && !lightInjected) {
      const style = document.createElement('style');
      style.textContent = LIGHT_CSS;
      document.head.append(style);
      lightInjected = true;
    }
    setPalette(tl.theme.colors);
    const th = tl.theme;
    this.root = h('div', { id: 'rf-root', style: `width:${tl.width}px;height:${tl.height}px` });
    if (light) this.root.classList.add('rf-light');
    // Playfair Display defaults to old-style figures; counters and stats need lining ones.
    if (Object.values(th.fonts).includes('Playfair Display'))
      this.root.style.setProperty('font-feature-settings', "'lnum'");
    const vars: Record<string, string> = {
      '--f-display': `'${th.fonts.display}', '${th.fonts.arabic}'`,
      '--f-mono': `'${th.fonts.mono}', '${th.fonts.arabic}'`,
      '--f-arabic': `'${th.fonts.arabic}', '${th.fonts.display}'`,
      '--grid-line': light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.045)',
    };
    for (const [k, v] of Object.entries(th.colors)) vars[`--${k}`] = v;
    for (const [k, v] of Object.entries(vars)) this.root.style.setProperty(k, v);
    document.documentElement.style.setProperty('--bg', th.colors.bg);

    this.bg = new Background(tl);
    this.world = h('div', { class: 'rf-world' });
    this.root.append(this.bg.el, this.world);
    host.replaceChildren(this.root);
    this.scenes = tl.scenes.map((s, i) => new SceneView(s, tl.scenes[i + 1], tl, th, this.world));
    this.header = new Header(tl);
    this.captions = new Captions(tl);
    this.overlays = new Overlays(tl);
    this.root.append(this.header.el, this.captions.el);
    if (th.chrome.waveform) {
      this.wave = new Waveform(tl);
      this.root.append(this.wave.el);
    }
    this.root.append(this.overlays.el);
  }

  /** Renders the frame at time t. Pure: the result depends only on (timeline, t). */
  render(t: number): void {
    const tl = this.tl;
    t = Math.max(0, Math.min(tl.duration, Number.isFinite(t) ? t : 0));
    const frame = Math.round(t * tl.fps);
    this.bg.update(t);
    let sx = 0;
    let sy = 0;
    let rot = 0;
    for (const s of tl.shakes) {
      if (t < s.t || t > s.t + s.dur) continue;
      const d = (1 - (t - s.t) / s.dur) ** 2;
      sx += jitter(tl.seed + 101, t, 40) * s.amp * d;
      sy += jitter(tl.seed + 202, t, 40) * s.amp * 0.7 * d;
      rot += jitter(tl.seed + 303, t, 40) * 0.6 * d;
    }
    css(
      this.world,
      'transform',
      sx || sy ? `translate(${sx.toFixed(2)}px, ${sy.toFixed(2)}px) rotate(${rot.toFixed(3)}deg)` : 'none',
    );
    for (const s of this.scenes) s.update(t, frame);
    this.header.update(t);
    this.captions.update(t);
    this.wave?.update(t);
    this.overlays.update(t, frame);
  }

  /** Headless measuring pass for V-9 (text overflow) and V-10 (caption lines). */
  measure(): MeasureResult {
    const overflow: MeasureResult['overflow'] = [];
    for (const s of this.scenes) {
      for (const e of s.elements) {
        if (['arrow', 'particles', 'trap', 'icon'].includes(e.spec.component)) continue;
        // Measured at the settled state (all text typed, rows inserted, entry overshoots finished),
        // and only reported when it still overflows a moment earlier (ignores transient bumps).
        const end = Math.min(e.spec.exit?.t ?? s.spec.end, s.spec.end) - 0.02;
        const before = Math.max(e.spec.enter.t + e.spec.enter.dur, end - 0.6);
        let over = true;
        for (const t of [end, before]) {
          this.render(t);
          over &&= e.visibleAt(t) && e.overflows();
        }
        if (over) overflow.push({ id: e.spec.id, scene: s.spec.id, t: Math.round(end * 1000) / 1000 });
      }
    }
    return { overflow, captions: this.captions.measureLines() };
  }

  /** Element boxes (canvas coordinates) for the studio overlay. */
  boxes(
    t: number,
  ): { id: string; component: string; x: number; y: number; w: number; h: number; visible: boolean }[] {
    const out = [];
    for (const s of this.scenes) {
      const vis = s.visibleAt(t);
      for (const e of s.elements) {
        const b = e.spec.box;
        out.push({
          id: e.spec.id,
          component: e.spec.component,
          x: b.x + s.spec.origin.x,
          y: b.y + s.spec.origin.y,
          w: b.w,
          h: b.h,
          visible: vis && e.visibleAt(t),
        });
      }
    }
    return out;
  }
}
