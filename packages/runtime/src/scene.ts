/** Scenes and element wrappers: transitions (FR-RT-4), enter/exit animations and fx (§6.2). */
import type { TElement, Theme, Timeline, TScene } from '@reelforge/core';
import {
  clamp,
  easeInCubic,
  easeOutBack,
  easeOutCubic,
  identity,
  jitter,
  progress,
  transformCss,
  type Transform,
} from './anim.js';
import { COMPONENT_REGISTRY } from './components/index.js';
import { css, h } from './dom.js';
import type { Instance, LocalTime, ResolvedState, RuntimeComponent } from './types.js';

const SLIDE_DIST = 140;

/** Merge of every states[].set with at ≤ t (+ $since per key). Pure. */
export function resolveState(el: TElement, t: number): ResolvedState {
  const out: ResolvedState = { $since: {} };
  for (const s of el.states) {
    if (s.t > t) break;
    for (const [k, v] of Object.entries(s.set)) {
      out[k] = v;
      out.$since[k] = s.t;
    }
  }
  return out;
}

export class ElementView {
  readonly el: HTMLElement;
  private inst: Instance;
  private comp: RuntimeComponent;
  private seed: number;

  constructor(
    readonly spec: TElement,
    private tl: Timeline,
    private theme: Theme,
    parent: HTMLElement,
  ) {
    const comp = COMPONENT_REGISTRY[spec.component];
    if (!comp) throw new Error(`Runtime has no component "${spec.component}"`);
    this.comp = comp;
    const b = spec.box;
    this.el = h('div', {
      class: `rf-el rf-el-${spec.component}`,
      'data-id': spec.id,
      style: `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;z-index:${spec.layer === 'overlay' ? 1000 + spec.z : spec.z}`,
    });
    const root = h('div', { class: `rf-c c-${spec.component}` });
    this.el.append(root);
    // Mount while attached and laid out, so components can measure text (auto-fit).
    parent.append(this.el);
    this.seed = hashId(spec.id) ^ tl.seed;
    this.inst = comp.mount(root, spec.props, theme, {
      tl,
      el: spec,
      box: b,
      seed: this.seed,
      asset: (p) => (/^(https?:|data:)/.test(p) ? p : tl.assetBase + p.replace(/^assets\//, '')),
    });
  }

  /** Whether the element is on screen at t (inside its scene's visible window). */
  visibleAt(t: number): boolean {
    const { enter, exit } = this.spec;
    if (t < enter.t) return false;
    if (exit && t >= exit.t + exit.dur) return false;
    return true;
  }

  update(t: number, frame: number): void {
    const { enter, exit } = this.spec;
    if (!this.visibleAt(t)) {
      css(this.el, 'display', 'none');
      return;
    }
    css(this.el, 'display', 'block');
    const enterRaw = progress(t, enter.t, enter.dur);
    const exitP = exit ? progress(t, exit.t, exit.dur) : 0;
    const tr = identity();
    const handled = this.comp.handles?.includes(enter.anim) ?? false;
    applyEnter(tr, enter.anim, enterRaw, enter.params, handled, this.theme, t, this.seed);
    if (exit && t >= exit.t) applyExit(tr, exit.anim, exitP);
    for (const f of this.spec.fx) applyFx(tr, f, t, this.seed);

    css(this.el, 'transform', transformCss(tr));
    css(this.el, 'opacity', tr.opacity >= 0.999 ? '1' : tr.opacity.toFixed(3));
    const filters: string[] = [];
    if (tr.blur > 0.05) filters.push(`blur(${tr.blur.toFixed(2)}px)`);
    if (tr.glitch > 0.5) {
      const a = tr.glitch;
      const j = jitter(this.seed + 3, t, 24);
      filters.push(`drop-shadow(${(a * 0.35 * (1 + j)).toFixed(1)}px 0 0 rgba(255,74,92,.85))`);
      filters.push(`drop-shadow(${(-a * 0.35 * (1 - j)).toFixed(1)}px 0 0 rgba(85,220,255,.85))`);
    }
    css(this.el, 'filter', filters.length ? filters.join(' ') : 'none');
    css(
      this.el,
      'clip-path',
      tr.clip < 0.999 ? `inset(-20px ${((1 - tr.clip) * 100).toFixed(2)}% -20px -20px)` : 'none',
    );

    const ease = enter.anim === 'pop' ? easeOutBack(this.theme.motion.pop_overshoot) : easeOutCubic;
    const local: LocalTime = {
      since: t - enter.t,
      enterRaw,
      enterP: ease(enterRaw),
      exitP,
      enterEnd: enter.t + enter.dur,
      frame,
    };
    this.inst.update(t, local, resolveState(this.spec, t));
  }

  /** V-9: does the rendered content overflow the element box? */
  overflows(): boolean {
    const root = this.el.firstElementChild as HTMLElement;
    const tol = 2;
    return this.overflowsNow(root, tol);
  }

  private overflowsNow(root: HTMLElement, tol: number): boolean {
    if (root.scrollWidth > this.spec.box.w + tol || root.scrollHeight > this.spec.box.h + tol) return true;
    // Text containers marked data-fit must not overflow horizontally (vertical ink overflow of
    // tight line-heights is expected and is covered by the element-box check above).
    for (const n of root.querySelectorAll<HTMLElement>('[data-fit]')) {
      if (n.clientWidth > 0 && n.scrollWidth > n.clientWidth + tol) return true;
    }
    return false;
  }
}

export function applyEnter(
  tr: Transform,
  anim: TElement['enter']['anim'],
  p: number,
  params: Record<string, number | boolean>,
  handled: boolean,
  theme: Theme,
  t: number,
  seed: number,
): void {
  if (p >= 1 || anim === 'none') return;
  const e = easeOutCubic(p);
  const num = (k: string, d: number) => (typeof params[k] === 'number' ? (params[k] as number) : d);
  if (handled) {
    tr.opacity *= clamp(p / 0.25);
    return;
  }
  switch (anim) {
    case 'pop': {
      const s0 = num('s0', 0.8);
      tr.opacity *= easeOutCubic(clamp(p * 1.8));
      tr.scale *= s0 + (1 - s0) * easeOutBack(theme.motion.pop_overshoot)(p);
      tr.ty += num('dy', 40) * (1 - e);
      break;
    }
    case 'rise':
      tr.opacity *= e;
      tr.ty += num('dist', 40) * (1 - e);
      break;
    case 'slide-l':
      tr.opacity *= e;
      tr.tx -= num('dist', SLIDE_DIST) * (1 - e);
      break;
    case 'slide-r':
      tr.opacity *= e;
      tr.tx += num('dist', SLIDE_DIST) * (1 - e);
      break;
    case 'fade':
    case 'type':
    case 'count':
      tr.opacity *= e;
      break;
    case 'draw':
      tr.clip = e;
      tr.opacity *= clamp(p / 0.15);
      break;
    case 'flip':
      tr.opacity *= clamp(p * 2);
      tr.rotX += 90 * (1 - e);
      break;
    case 'zoom':
      tr.opacity *= e;
      tr.scale *= 1.35 - 0.35 * e;
      tr.blur += 10 * (1 - e);
      break;
    case 'stamp': {
      const slam = clamp(p / 0.6);
      const k = easeInCubic(slam);
      tr.opacity *= clamp(slam * 3);
      const settle = p > 0.6 ? 1 + 0.06 * Math.sin(((p - 0.6) / 0.4) * Math.PI) : 1;
      tr.scale *= (2.2 - 1.2 * k) * settle;
      tr.rot += num('rot', 0) * (1 - k);
      break;
    }
    case 'glitch': {
      const steps = jitter(seed, t, 20);
      tr.opacity *= p < 0.7 ? (steps > -0.3 ? 1 : 0.25) : 1;
      tr.tx += jitter(seed + 1, t, 30) * 26 * (1 - p);
      tr.glitch = Math.max(tr.glitch, num('amp', 30) * (1 - p));
      break;
    }
  }
}

export function applyExit(tr: Transform, anim: string, q: number): void {
  if (anim === 'none') {
    tr.opacity = 0;
    return;
  }
  const e = easeOutCubic(q);
  tr.opacity *= 1 - e;
  switch (anim) {
    case 'pop':
      tr.scale *= 1 - 0.2 * e;
      break;
    case 'rise':
      tr.ty -= 50 * e;
      break;
    case 'sink':
      tr.ty += 50 * e;
      break;
    case 'slide-l':
      tr.tx -= SLIDE_DIST * e;
      break;
    case 'slide-r':
      tr.tx += SLIDE_DIST * e;
      break;
    case 'zoom':
      tr.scale *= 1 + 0.25 * e;
      break;
  }
}

export function applyFx(tr: Transform, f: TElement['fx'][number], t: number, seed: number): void {
  if (t < f.t) return;
  const k = (t - f.t) / f.dur;
  if (k > 1) return;
  const decay = (1 - k) ** 2;
  switch (f.do) {
    case 'shake':
      tr.tx += jitter(seed + 11, t, 40) * f.amp * decay;
      tr.ty += jitter(seed + 12, t, 40) * f.amp * 0.6 * decay;
      tr.rot += jitter(seed + 13, t, 40) * 1.2 * decay;
      break;
    case 'glitch':
      tr.glitch = Math.max(tr.glitch, f.amp * decay);
      tr.tx += jitter(seed + 14, t, 24) * f.amp * 0.4 * decay;
      break;
    case 'pulse': {
      const env = Math.sin(Math.PI * k);
      tr.scale *= 1 + f.amp * env * (0.5 + 0.5 * Math.sin(2 * Math.PI * f.rate * (t - f.t)));
      break;
    }
    case 'bump':
      tr.scale *= 1 + f.amp * Math.sin(Math.PI * k);
      break;
  }
}

export class SceneView {
  readonly el: HTMLElement;
  readonly elements: ElementView[];
  private outDur = 0;
  private outKind: TScene['transition'] = 'cut';

  constructor(
    readonly spec: TScene,
    next: TScene | undefined,
    tl: Timeline,
    private theme: Theme,
    parent: HTMLElement,
  ) {
    const o = spec.origin;
    this.el = h('div', {
      class: 'rf-scene',
      'data-scene': spec.id,
      style: `left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${o.h}px;visibility:hidden`,
    });
    parent.append(this.el);
    this.elements = spec.elements.map((e) => new ElementView(e, tl, theme, this.el));
    this.el.style.visibility = '';
    css(this.el, 'display', 'none');
    if (next && Math.abs(next.start - spec.end) < 0.05) {
      this.outKind = next.transition;
      this.outDur = next.transition === 'cut' ? 0 : theme.motion.crossfade;
    } else {
      this.outKind = 'crossfade';
      this.outDur = theme.motion.crossfade;
    }
  }

  get inDur(): number {
    return this.spec.transition === 'cut' ? 0 : this.theme.motion.crossfade;
  }

  visibleAt(t: number): boolean {
    return t >= this.spec.start && t < this.spec.end + this.outDur;
  }

  update(t: number, frame: number): void {
    if (!this.visibleAt(t)) {
      css(this.el, 'display', 'none');
      return;
    }
    css(this.el, 'display', 'block');
    let opacity = 1;
    let scale = 1;
    let blur = 0;
    let ty = 0;
    const inD = this.inDur;
    if (inD > 0 && t < this.spec.start + inD) {
      const e = easeOutCubic(progress(t, this.spec.start, inD));
      opacity *= e;
      if (this.spec.transition === 'slide-up') ty += 140 * (1 - e);
      else {
        scale *= 0.97 + 0.03 * e;
        blur += 8 * (1 - e);
      }
    }
    if (t >= this.spec.end) {
      const q = easeOutCubic(progress(t, this.spec.end, this.outDur));
      opacity *= 1 - q;
      if (this.outKind === 'slide-up') ty -= 140 * q;
      else {
        scale *= 1 + 0.02 * q;
        blur += 8 * q;
      }
    }
    css(this.el, 'opacity', opacity >= 0.999 ? '1' : opacity.toFixed(3));
    css(
      this.el,
      'transform',
      scale === 1 && ty === 0 ? 'none' : `translateY(${ty.toFixed(2)}px) scale(${scale.toFixed(4)})`,
    );
    css(this.el, 'filter', blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none');
    // Elements freeze at the scene end while the scene fades out.
    const et = Math.min(t, this.spec.end - 0.0005);
    for (const e of this.elements) e.update(et, frame);
  }
}

function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
