/** Data components: table, lanes, checklist, meter, timeline, grid, bucket. */
import { clamp, easeOutBack, easeOutCubic, formatNumber, progress } from '../anim.js';
import { attr, css, h, s, text } from '../dom.js';
import { icon } from '../icons.js';
import { mix, rgba, resolve } from '../color.js';
import type { RuntimeComponent } from '../types.js';
import { fontFor, keyframeValue, statusColor } from './util.js';

type Cell = string | number | { text: string | number; color: string };

export const table: RuntimeComponent = {
  name: 'table',
  mount(root, p, theme, ctx) {
    root.classList.add('rf-card');
    const cols: string[] = p.columns;
    const weights: number[] = p.widths ?? cols.map(() => 1);
    const sum = weights.reduce((a, b) => a + b, 0);
    const headH = Math.round(p.fontSize * 2.5);
    const n = Math.max(1, p.rows.length);
    const rowH = Math.min(Math.round(p.fontSize * 3), Math.floor((ctx.box.h - headH - 4) / n));
    const cellEl = (c: Cell, i: number, cls: string) => {
      const txt = typeof c === 'object' ? String(c.text) : String(c);
      const el = h('div', { class: `td ${cls}`, dir: 'auto', 'data-fit': true, style: `width:${((weights[i] ?? 1) / sum) * 100}%;font-family:${fontFor(theme, txt, 'mono')}` }, txt);
      if (typeof c === 'object') el.style.color = resolve(c.color);
      return el;
    };
    const head = h('div', { class: 'tr th', style: `height:${headH}px;font-size:${Math.round(p.fontSize * 0.8)}px` });
    cols.forEach((c, i) => head.append(cellEl(c, i, '')));
    root.append(head);
    const rows = (p.rows as { cells: Cell[]; at?: number; highlight?: boolean | number; color?: string; strike?: boolean | number }[]).map((r) => {
      const bg = h('i', { class: 'rowbg' });
      const tr = h('div', { class: 'tr', style: `height:${rowH}px;font-size:${p.fontSize}px` }, bg);
      if (r.color) tr.style.color = resolve(r.color);
      r.cells.forEach((c, i) => tr.append(cellEl(c, i, '')));
      const st = h('i', { class: 'rstrike', style: `display:none;background:${theme.colors.red}` });
      tr.append(st);
      root.append(tr);
      return { r, tr, bg, st };
    });
    const accent = resolve(p.accent);
    return {
      update(t) {
        for (const { r, tr, bg, st } of rows) {
          const at = r.at ?? ctx.el.enter.t;
          const visible = t >= at;
          css(tr, 'visibility', visible ? 'visible' : 'hidden');
          if (!visible) continue;
          const k = r.at !== undefined ? easeOutCubic(progress(t, at, 0.4)) : 1;
          css(tr, 'opacity', k.toFixed(3));
          css(tr, 'transform', k < 1 ? `translateX(${((1 - k) * -40).toFixed(2)}px)` : 'none');
          const flash = r.at !== undefined ? 1 - clamp((t - at) / 0.8) : 0;
          const hlAt = r.highlight === true ? at : typeof r.highlight === 'number' ? r.highlight : undefined;
          const hl = hlAt !== undefined && t >= hlAt ? easeOutCubic(progress(t, hlAt, 0.3)) : 0;
          const alpha = Math.max(0.2 * flash, 0.14 * hl);
          css(bg, 'background', alpha > 0 ? rgba(accent, alpha) : 'transparent');
          css(bg, 'box-shadow', hl > 0 ? `inset 6px 0 0 ${accent}` : 'none');
          const sAt = r.strike === true ? at : typeof r.strike === 'number' ? r.strike : undefined;
          const sk = sAt !== undefined && t >= sAt ? easeOutCubic(progress(t, sAt, 0.3)) : 0;
          css(st, 'display', sk > 0 ? 'block' : 'none');
          css(st, 'transform', `scaleX(${sk.toFixed(4)})`);
        }
      },
    };
  },
};

const MARK_ICON: Record<string, [string, string]> = { ok: ['check', 'lime'], err: ['x', 'red'], warn: ['warn', 'amber'] };

export const lanes: RuntimeComponent = {
  name: 'lanes',
  mount(root, p, theme, ctx) {
    const lanes = p.lanes as { title: string; color: string; steps: { text: string; at: number; color?: string; mark?: string }[] }[];
    const all = lanes.flatMap((l, li) => l.steps.map((st, si) => ({ li, si, at: st.at }))).sort((a, b) => a.at - b.at || a.li - b.li);
    const rank = new Map(all.map((x, i) => [`${x.li}:${x.si}`, i]));
    const rowsN = p.interleave ? Math.max(1, all.length) : Math.max(1, ...lanes.map((l) => l.steps.length));
    const bodyH = ctx.box.h - 74;
    const rowH = Math.min(96, Math.floor((bodyH - 24) / rowsN));
    const stepH = Math.max(40, rowH - 14);
    const views = lanes.map((l, li) => {
      const c = resolve(l.color);
      const lh = h('div', { class: 'lh', dir: 'auto', style: `border-color:${rgba(c, 0.7)};color:${c};background:${rgba(c, 0.12)};font-family:${fontFor(theme, l.title, 'mono')}` }, l.title);
      const lb = h('div', { class: 'lb', style: `border-color:${rgba(c, 0.35)};background:${rgba(c, 0.03)}` });
      const lane = h('div', { class: 'lane' }, lh, lb);
      root.append(lane);
      const steps = l.steps.map((st, si) => {
        const row = p.interleave ? rank.get(`${li}:${si}`)! : si;
        const el = h('div', {
          class: 'step',
          dir: 'auto',
          style: `top:${12 + row * rowH}px;height:${stepH}px;font-size:${p.fontSize}px;font-family:${fontFor(theme, st.text, 'mono')}${st.color ? `;color:${resolve(st.color)}` : ''}`,
        });
        el.append(h('span', { 'data-fit': true, style: 'overflow:hidden' }, st.text));
        if (st.mark) {
          const [name, col] = MARK_ICON[st.mark];
          const mk = h('span', { class: 'mk', style: 'display:flex' });
          mk.append(icon(name, p.fontSize * 1.2, theme.colors[col], 3));
          el.append(mk);
        }
        lb.append(el);
        return { st, el, c };
      });
      return { steps };
    });
    return {
      update(t) {
        for (const v of views) {
          for (const { st, el, c } of v.steps) {
            const vis = t >= st.at;
            css(el, 'visibility', vis ? 'visible' : 'hidden');
            if (!vis) continue;
            const k = easeOutCubic(progress(t, st.at, 0.32));
            const flash = 1 - clamp((t - st.at) / 0.7);
            css(el, 'opacity', k.toFixed(3));
            css(el, 'transform', k < 1 ? `translateY(${((1 - k) * -22).toFixed(2)}px)` : 'none');
            const mc = st.mark ? theme.colors[MARK_ICON[st.mark][1]] : c;
            css(el, 'border-color', mix(theme.colors.line, mc, 0.35 + 0.65 * flash));
            css(el, 'box-shadow', flash > 0 ? `0 0 ${(30 * flash).toFixed(0)}px ${rgba(mc, 0.5 * flash)}` : 'none');
          }
        }
      },
    };
  },
};

export const checklist: RuntimeComponent = {
  name: 'checklist',
  mount(root, p, theme, ctx) {
    if (p.title) root.append(h('div', { class: 'ct', dir: 'auto' }, p.title));
    const size = Math.round(p.fontSize * 1.25);
    const enterEnd = ctx.el.enter.t + ctx.el.enter.dur;
    const items = (p.items as { text: string; at?: number; ok: boolean }[]).map((it, i) => {
      const at = it.at ?? enterEnd + i * 0.5;
      const bx = h('div', { class: 'bx', style: `width:${size}px;height:${size}px` });
      const svg = s('svg', { viewBox: '0 0 24 24', width: size + 8, height: size + 8 });
      const d = it.ok ? 'M5 12.5 10 17.5 19.5 6.5' : 'M6.5 6.5l11 11M17.5 6.5l-11 11';
      const path = s('path', { d, fill: 'none', 'stroke-width': 3.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': '1 1' });
      svg.append(path);
      bx.append(svg);
      const tx = h('div', { class: 'tx', dir: 'auto', 'data-fit': true, style: `font-size:${p.fontSize}px;font-family:${fontFor(theme, it.text)}` }, it.text);
      const row = h('div', { class: 'it' }, bx, tx);
      root.append(row);
      return { it, at, row, bx, path, tx };
    });
    const okC = resolve(p.color);
    return {
      update(t) {
        for (const x of items) {
          const vis = t >= x.at;
          css(x.row, 'visibility', vis ? 'visible' : 'hidden');
          if (!vis) continue;
          const k = easeOutCubic(progress(t, x.at, 0.35));
          css(x.row, 'opacity', k.toFixed(3));
          css(x.row, 'transform', k < 1 ? `translateX(${((1 - k) * 30).toFixed(2)}px)` : 'none');
          const ck = easeOutCubic(progress(t, x.at + 0.2, 0.3));
          const c = x.it.ok ? okC : theme.colors.red;
          attr(x.path, 'stroke', c);
          attr(x.path, 'stroke-dashoffset', (1 - ck).toFixed(4));
          css(x.bx, 'border-color', ck > 0 ? c : theme.colors.line);
          css(x.bx, 'background', rgba(c, 0.14 * ck));
          const pop = easeOutBack(2.4)(progress(t, x.at + 0.2, 0.3));
          css(x.bx, 'transform', ck > 0 && ck < 1 ? `scale(${(0.85 + 0.15 * pop).toFixed(4)})` : 'none');
          css(x.tx, 'color', x.it.ok ? theme.colors.ink : mix(theme.colors.ink, theme.colors.red, 0.4 * ck));
        }
      },
    };
  },
};

export const meter: RuntimeComponent = {
  name: 'meter',
  mount(root, p, theme, ctx) {
    const ml = h('span', { class: 'ml', dir: 'auto' }, p.label ?? '');
    const mv = h('span', { class: 'mv' });
    const fill = h('i', { class: 'fill' });
    const track = h('div', { class: 'track' }, fill);
    root.append(h('div', { class: 'mh' }, ml, mv), track);
    const innerW = ctx.box.w - 8;
    fill.style.width = `${innerW}px`;
    if (p.threshold !== undefined) {
      const pos = clamp(p.threshold / p.max) * 100;
      track.append(h('i', { class: 'thr', style: `left:${pos}%;background:${resolve(p.danger)}` }));
      track.append(h('span', { class: 'thl', style: `left:${pos}%;color:${resolve(p.danger)}` }, `LIMIT ${formatNumber(p.threshold, 0, true)}${p.unit}`));
    }
    const base = resolve(p.color);
    const danger = resolve(p.danger);
    return {
      update(t) {
        const v = keyframeValue(p.keyframes, t, p.from ?? 0, easeOutCubic);
        const k = clamp(v / p.max);
        css(fill, 'transform', `scaleX(${k.toFixed(5)})`);
        const over = p.threshold !== undefined ? clamp((v - p.threshold) / (p.max * 0.03) + 0.5) : 0;
        const c = mix(base, danger, over);
        css(fill, 'background', `linear-gradient(90deg, ${rgba(c, 0.55)}, ${c})`);
        css(fill, 'box-shadow', `0 0 30px ${rgba(c, 0.5)}`);
        text(mv, `${formatNumber(v, Number.isInteger(p.max) && p.max >= 10 ? 0 : 1, true)}${p.unit}`);
        css(mv, 'color', c);
        void theme;
      },
    };
  },
};

export const timeline: RuntimeComponent = {
  name: 'timeline',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const axisY = Math.round(ctx.box.h * 0.32);
    const c = resolve(p.color);
    const axis = h('i', { class: 'axis', style: `top:${axisY}px;background:linear-gradient(90deg, ${rgba(c, 0.3)}, ${c})` });
    root.append(axis);
    if (p.start) root.append(h('span', { class: 'end', style: `left:0;top:${axisY - 44}px` }, p.start));
    if (p.end) root.append(h('span', { class: 'end', style: `right:0;top:${axisY - 44}px` }, p.end));
    const enterEnd = ctx.el.enter.t + ctx.el.enter.dur;
    const markers = (p.markers as { pos: number; label: string; sub?: string; at?: number; color?: string }[]).map((m, i) => {
      const mc = resolve(m.color ?? p.color);
      const pin = h('i', { class: 'pin', style: `border-color:${mc};box-shadow:0 0 22px ${rgba(mc, 0.6)}` });
      const el = h('div', { class: 'mk', style: `left:${m.pos * W}px;top:${axisY - 13}px` }, pin, h('span', { class: 'lab', dir: 'auto', style: `color:${mc};font-family:${fontFor(theme, m.label, 'mono')}` }, m.label));
      if (m.sub) el.append(h('span', { class: 'sub', dir: 'auto' }, m.sub));
      root.append(el);
      return { el, pin, at: m.at ?? enterEnd + i * 0.4 };
    });
    const cur = h('i', { class: 'cur', style: `top:${axisY - 40}px;height:80px;background:${theme.colors.ink};display:none` });
    root.append(cur);
    return {
      update(t, local) {
        css(axis, 'transform', `scaleX(${easeOutCubic(local.enterRaw).toFixed(4)})`);
        for (const m of markers) {
          const vis = t >= m.at;
          css(m.el, 'visibility', vis ? 'visible' : 'hidden');
          if (!vis) continue;
          const k = easeOutBack(2.2)(progress(t, m.at, 0.4));
          css(m.el, 'opacity', clamp(k * 2).toFixed(3));
          css(m.el, 'transform', `translateX(-50%) translateY(${((1 - clamp(k)) * -30).toFixed(2)}px)`);
          css(m.pin, 'transform', `scale(${(0.4 + 0.6 * k).toFixed(4)})`);
        }
        const kfs = (p.cursor as { at: number; pos: number; dur?: number }[]).map((x) => ({ at: x.at, value: x.pos, dur: x.dur }));
        if (kfs.length && t >= kfs[0].at) {
          const pos = keyframeValue(kfs, t, kfs[0].value, easeOutCubic, 0.6);
          css(cur, 'display', 'block');
          css(cur, 'left', `${(pos * W).toFixed(1)}px`);
        } else css(cur, 'display', 'none');
      },
    };
  },
};

/** Expands step keys: "3", "1-4", "*" (all). */
export function expandTiles(set: Record<string, string>, n: number): Map<number, string> {
  const out = new Map<number, string>();
  for (const [k, v] of Object.entries(set)) {
    if (k === '*') for (let i = 0; i < n; i++) out.set(i, v);
    else if (/^\d+-\d+$/.test(k)) {
      const [a, b] = k.split('-').map(Number);
      for (let i = Math.min(a, b); i <= Math.max(a, b) && i < n; i++) out.set(i, v);
    } else if (/^\d+$/.test(k) && Number(k) < n) out.set(Number(k), v);
  }
  return out;
}

export const grid: RuntimeComponent = {
  name: 'grid',
  mount(root, p, theme, ctx) {
    const n = p.cols * p.rows;
    if (p.label) root.append(h('div', { class: 'gl', dir: 'auto' }, p.label));
    const gg = h('div', { class: 'gg', style: `grid-template-columns:repeat(${p.cols},1fr);grid-template-rows:repeat(${p.rows},1fr);gap:${p.gap}px` });
    root.append(gg);
    const tiles = Array.from({ length: n }, (_, i) => {
      const spec = p.tiles[i];
      const lbl = typeof spec === 'string' ? spec : (spec?.label ?? '');
      const state = typeof spec === 'object' && spec?.state ? spec.state : 'idle';
      const el = h('div', { class: 'tile', dir: 'auto' }, lbl);
      gg.append(el);
      return { el, state };
    });
    const steps = (p.steps as { at: number; set: Record<string, string> }[]).map((st) => ({ at: st.at, map: expandTiles(st.set, n) }));
    const enterT = ctx.el.enter.t;
    return {
      update(t, _l, st) {
        const states = tiles.map((x) => x.state);
        const since = new Array<number>(n).fill(-1e9);
        for (const step of steps) {
          if (step.at > t) break;
          for (const [i, v] of step.map) {
            if (states[i] !== v) since[i] = step.at;
            states[i] = v;
          }
        }
        if (st.tiles && typeof st.tiles === 'object') {
          for (const [i, v] of expandTiles(st.tiles as Record<string, string>, n)) {
            if (states[i] !== v) since[i] = st.$since.tiles;
            states[i] = v;
          }
        }
        tiles.forEach((x, i) => {
          const s0 = states[i];
          const c = s0 === 'idle' ? theme.colors.line : statusColor(theme, s0, theme.colors.line);
          const bump = 1 - clamp((t - since[i]) / 0.5);
          const appear = easeOutBack(2)(progress(t, enterT + i * 0.025, 0.35));
          css(x.el, 'border-color', s0 === 'idle' ? theme.colors.line : c);
          css(x.el, 'background', s0 === 'idle' ? rgba(theme.colors.card, 0.9) : rgba(c, s0 === 'off' ? 0.05 : 0.18 + 0.25 * bump));
          css(x.el, 'color', s0 === 'idle' ? theme.colors.dim : c);
          css(x.el, 'opacity', s0 === 'off' ? '0.35' : clamp(appear * 1.5).toFixed(3));
          css(x.el, 'transform', `scale(${((0.6 + 0.4 * appear) * (1 + 0.08 * Math.sin(Math.PI * bump))).toFixed(4)})`);
          css(x.el, 'box-shadow', s0 !== 'idle' && s0 !== 'off' ? `0 0 ${(18 + 30 * bump).toFixed(0)}px ${rgba(c, 0.35)}` : 'none');
        });
      },
    };
  },
};

export const bucket: RuntimeComponent = {
  name: 'bucket',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const top = 90;
    const bottom = H - 70;
    const inset = W * 0.1;
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    const c = resolve(p.color);
    const body = s('path', {
      d: `M${inset * 0.4} ${top} L${inset} ${bottom} Q${inset} ${bottom + 18} ${inset + 18} ${bottom + 18} L${W - inset - 18} ${bottom + 18} Q${W - inset} ${bottom + 18} ${W - inset} ${bottom} L${W - inset * 0.4} ${top}`,
      fill: rgba(c, 0.05),
      stroke: rgba(c, 0.8),
      'stroke-width': 5,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    });
    svg.append(body);
    const cols = Math.max(2, Math.min(5, Math.ceil(Math.sqrt(p.capacity * 1.2))));
    const rowsN = Math.ceil(p.capacity / cols);
    const innerW = W - inset * 2 - 40;
    const r = Math.min(innerW / cols / 2 - 6, (bottom - top - 40) / rowsN / 2 - 6, 36);
    const slots: { x: number; y: number }[] = [];
    for (let i = 0; i < p.capacity; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      slots.push({ x: inset + 20 + innerW * ((col + 0.5) / cols), y: bottom - 14 - r - row * (r * 2 + 10) });
    }
    const tokens = slots.map((sl) => {
      const g = s('circle', { cx: sl.x, cy: sl.y, r, fill: c });
      svg.append(g);
      return g;
    });
    root.append(svg);
    const count = h('div', { class: 'bl', style: `top:${H - 50}px;font-size:34px;font-weight:700;color:${c}` });
    root.append(count);
    if (p.label) root.append(h('div', { class: 'bl', dir: 'auto', style: `top:0;font-size:28px;color:${theme.colors.ink};font-weight:700;letter-spacing:.1em;text-transform:uppercase` }, p.label));
    if (p.rate) root.append(h('div', { class: 'bl', dir: 'auto', style: `top:40px;font-size:22px;color:${theme.colors.dim}` }, p.rate));
    const kfs = p.keyframes as { at: number; tokens: number }[];
    return {
      update(t) {
        let cur = p.capacity;
        let prev = p.capacity;
        let changed = -1e9;
        for (const kf of kfs) {
          if (kf.at > t) break;
          prev = cur;
          cur = Math.min(p.capacity, kf.tokens);
          changed = kf.at;
        }
        const k = easeOutCubic(progress(t, changed, 0.4));
        tokens.forEach((g, i) => {
          const sl = slots[i];
          let op = i < cur ? 1 : 0;
          let dy = 0;
          let sc = 1;
          if (k < 1 && i >= cur && i < prev) {
            op = 1 - k; // consumed: fly up
            dy = -180 * k;
            sc = 1 - 0.4 * k;
          } else if (k < 1 && i < cur && i >= prev) {
            op = k; // refilled: drop in
            dy = -120 * (1 - k);
          }
          attr(g, 'opacity', op.toFixed(3));
          attr(g, 'transform', `translate(0 ${dy.toFixed(1)}) translate(${sl.x} ${sl.y}) scale(${sc.toFixed(3)}) translate(${-sl.x} ${-sl.y})`);
          attr(g, 'fill', cur === 0 ? theme.colors.red : c);
        });
        text(count, `${cur}/${p.capacity}`);
        css(count, 'color', cur === 0 ? theme.colors.red : c);
      },
    };
  },
};
