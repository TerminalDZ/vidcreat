/** Process & structure components: steps, flow, org-chart, tree, cycle, funnel, pyramid, matrix-2x2. */
import type { Theme } from '@reelforge/core';
import { clamp, easeInOutCubic, easeOutCubic, progress } from '../anim.js';
import { attr, css, h, s } from '../dom.js';
import { icon } from '../icons.js';
import { mix, resolve, rgba } from '../color.js';
import type { MountCtx, RuntimeComponent } from '../types.js';
import {
  arrowHead,
  colorOr,
  drawStroke,
  fitTo,
  flash,
  fmtNum,
  itemAt,
  mirrorX,
  numEl,
  palette,
  polar,
  reveal,
  svgBox,
  textDir,
  textEl,
  type NumFmt,
  type Pt,
} from './chart.js';
import { buildTree, connector, layoutTree, type TreeIn, type TreeNode } from './hierarchy.js';

/** Colors from `from` (first item) to `to` (last item), unless an item sets its own. */
const ramp = (from: string, to: string, n: number, explicit: (string | undefined)[]) =>
  Array.from({ length: n }, (_, i) => colorOr(explicit[i], mix(from, to, n > 1 ? i / (n - 1) : 0)));

// ------------------------------------------------------------------ steps

export const steps: RuntimeComponent = {
  name: 'steps',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const items = p.items as { title: string; text?: string; icon?: string; at?: number }[];
    const n = items.length;
    const rtl = textDir(...items.flatMap((x) => [x.title, x.text])) === 'rtl';
    const c = resolve(p.color);
    const vert = p.orient === 'vertical';
    const slot = vert ? H / n : W / n;
    const d = Math.round(Math.min(vert ? slot * 0.66 : H * 0.3, fs * 1.9));
    const subFs = Math.round(fs * 0.62);
    const centers: Pt[] = items.map((_, i) => {
      const j = !vert && rtl ? n - 1 - i : i;
      return vert
        ? { x: mirrorX(d / 2, 0, W, rtl), y: slot * (j + 0.5) }
        : { x: slot * (j + 0.5), y: d / 2 + 4 };
    });
    const svg = svgBox(W, H);
    root.append(svg);
    const links = centers.slice(1).map((b, i) => {
      const a = centers[i];
      const off = d / 2 + 8;
      const pa = vert ? { x: a.x, y: a.y + off } : { x: a.x + (rtl ? -off : off), y: a.y };
      const pb = vert ? { x: b.x, y: b.y - off } : { x: b.x + (rtl ? off : -off), y: b.y };
      const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      const track = s('line', {
        x1: pa.x,
        y1: pa.y,
        x2: pb.x,
        y2: pb.y,
        stroke: rgba(theme.colors.ink, 0.1),
        'stroke-width': 4,
        'stroke-linecap': 'round',
      });
      const line = s('line', {
        x1: pa.x,
        y1: pa.y,
        x2: pb.x,
        y2: pb.y,
        stroke: c,
        'stroke-width': 4,
        'stroke-linecap': 'round',
      });
      svg.append(track, line);
      return { line, len: Math.max(1, len) };
    });
    const views = items.map((it, i) => {
      const at = itemAt(ctx, i, p.stagger, it.at);
      const ctr = centers[i];
      const dot = h('div', {
        class: 'st-dot',
        style: `left:${ctr.x - d / 2}px;top:${ctr.y - d / 2}px;width:${d}px;height:${d}px;font-size:${Math.round(d * 0.46)}px`,
      });
      if (it.icon) dot.append(icon(it.icon, Math.round(d * 0.5), theme.colors.bg, 2.2));
      else dot.append(String(i + 1));
      const body = h('div', { class: `st-body ${vert ? 'v' : 'h'}`, dir: rtl ? 'rtl' : 'ltr' });
      const bw = vert ? W - d - fs * 0.7 : slot - 16;
      const tt = textEl(theme, it.title, { cls: 'st-title', size: fs, weight: 700 });
      body.append(tt);
      let sub: HTMLElement | undefined;
      if (it.text) {
        sub = textEl(theme, it.text, { cls: 'st-text', size: subFs });
        body.append(sub);
      }
      if (vert) {
        body.style.cssText += `;top:${slot * i}px;height:${slot}px;width:${bw}px;${rtl ? 'right' : 'left'}:${d + fs * 0.7}px`;
      } else {
        body.style.cssText += `;top:${d + 24}px;left:${ctr.x - bw / 2}px;width:${bw}px;height:${H - d - 24}px;text-align:center`;
      }
      root.append(body, dot);
      fitTo(tt, bw, fs * 1.4, fs, 16);
      if (sub) fitTo(sub, bw, subFs * 1.5, subFs, 14);
      return { dot, body, at };
    });
    return {
      update(t) {
        let current = -1;
        views.forEach((v, i) => {
          if (t >= v.at) current = i;
          reveal(v.dot, t, v.at, { s0: 0.4, dur: 0.4 });
          reveal(v.body, t, v.at + 0.08, vert ? { dx: rtl ? 26 : -26, dur: 0.4 } : { dy: 18, dur: 0.4 });
        });
        views.forEach((v, i) => {
          const done = i < current;
          const glow = flash(t, v.at, 0.9);
          css(v.dot, 'background', i === current ? c : done ? rgba(c, 0.85) : 'transparent');
          css(v.dot, 'color', theme.colors.bg);
          css(v.dot, 'border-color', c);
          css(
            v.dot,
            'box-shadow',
            i === current ? `0 0 ${(26 + 30 * glow).toFixed(0)}px ${rgba(c, 0.45 + 0.3 * glow)}` : 'none',
          );
          css(v.body, 'filter', i === current || current < 0 ? 'none' : 'brightness(0.72)');
        });
        links.forEach((l, i) => {
          const a = views[i].at;
          const b = views[i + 1].at;
          drawStroke(
            l.line,
            l.len,
            t < a ? 0 : easeInOutCubic(progress(t, a + 0.1, Math.max(0.15, b - a - 0.05))),
          );
        });
      },
    };
  },
};

// ------------------------------------------------------------------ flow

export const flow: RuntimeComponent = {
  name: 'flow',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const stages = p.stages as { label: string; sub?: string; icon?: string; color?: string; at?: number }[];
    const n = stages.length;
    const rtl = textDir(...stages.flatMap((x) => [x.label, x.sub])) === 'rtl';
    const base = resolve(p.color);
    const accent = resolve(p.accent);
    const gapW = Math.max(44, Math.min(fs * 2.4, W * 0.08));
    const bw = (W - gapW * (n - 1)) / n;
    const hasSub = stages.some((x) => x.sub);
    const hasIcon = stages.some((x) => x.icon);
    const bh = Math.min(H - 8, fs * (2.4 + (hasSub ? 1.1 : 0) + (hasIcon ? 1.7 : 0)));
    const top = (H - bh) / 2;
    const cy = H / 2;
    const xs = stages.map((_, i) => mirrorX(i * (bw + gapW), bw, W, rtl));
    const centers = xs.map((x) => x + bw / 2);
    const svg = svgBox(W, H);
    root.append(svg);
    const conns = stages.slice(1).map((_, i) => {
      const dir = rtl ? -1 : 1;
      const a = { x: centers[i] + (dir * bw) / 2 + dir * 8, y: cy };
      const b = { x: centers[i + 1] - (dir * bw) / 2 - dir * 10, y: cy };
      const len = Math.abs(b.x - a.x);
      const line = s('line', {
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        stroke: rgba(theme.colors.ink, 0.35),
        'stroke-width': 4,
        'stroke-linecap': 'round',
      });
      const head = s('polygon', {
        points: arrowHead(b, rtl ? Math.PI : 0, 16),
        fill: rgba(theme.colors.ink, 0.5),
      });
      svg.append(line, head);
      return { line, head, len };
    });
    const tok = p.token === false ? undefined : p.token === true ? { dur: 0.5, loop: false } : p.token;
    const token = s('circle', { r: 13, fill: tok?.color ? resolve(tok.color) : accent });
    if (tok) svg.append(token);
    const views = stages.map((st, i) => {
      const c = colorOr(st.color, base);
      const box = h('div', {
        class: 'fl-stage',
        dir: 'auto',
        style: `left:${xs[i]}px;top:${top}px;width:${bw}px;height:${bh}px`,
      });
      if (st.icon) box.append(h('span', { class: 'fl-ic' }, icon(st.icon, Math.round(fs * 1.5), c, 2)));
      const lab = textEl(theme, st.label, { cls: 'fl-label', size: fs, weight: 700 });
      box.append(lab);
      let sub: HTMLElement | undefined;
      if (st.sub) {
        sub = textEl(theme, st.sub, { cls: 'fl-sub', size: Math.round(fs * 0.7) });
        box.append(sub);
      }
      root.append(box);
      fitTo(lab, bw - 24, fs * 1.4, fs, 14);
      if (sub) fitTo(sub, bw - 24, fs * 1.1, Math.round(fs * 0.7), 12);
      return { box, c, at: itemAt(ctx, i, p.stagger, st.at) };
    });
    const hop = tok?.dur ?? 0.5;
    const tStart = typeof tok?.at === 'number' ? tok.at : views[n - 1].at + 0.5;
    const travel = hop * (n - 1);
    return {
      update(t) {
        // Token position in hops (0 = first stage); pure in t, looping if asked.
        let pos = -1;
        let arrived = -1e9;
        if (tok && t >= tStart) {
          let e = t - tStart;
          const cycle = travel + hop;
          if (tok.loop) e %= cycle;
          pos = Math.min(n - 1, e / hop);
          arrived = t - (e - Math.floor(pos) * hop);
        }
        const reached = pos < 0 ? -1 : Math.floor(pos + 1e-9);
        views.forEach((v, i) => {
          reveal(v.box, t, v.at, { s0: 0.8, dur: 0.4 });
          const on = i === reached;
          const fl = on ? flash(t, arrived, 0.6) : 0;
          const c = on ? mix(v.c, accent, 0.85) : v.c;
          css(v.box, 'border-color', on ? c : rgba(c, 0.55));
          css(
            v.box,
            'background',
            `linear-gradient(160deg, ${rgba(c, on ? 0.24 + 0.2 * fl : 0.12)}, ${rgba(theme.colors.card, 0.96)} 75%)`,
          );
          css(
            v.box,
            'box-shadow',
            on ? `0 0 ${(30 + 40 * fl).toFixed(0)}px ${rgba(c, 0.4 + 0.3 * fl)}` : 'none',
          );
          css(v.box, 'color', on ? c : theme.colors.ink);
        });
        conns.forEach((cn, i) => {
          const a = views[i + 1].at - 0.05;
          const k = t < a ? 0 : easeOutCubic(progress(t, a, 0.3));
          drawStroke(cn.line, cn.len, k);
          attr(cn.head, 'opacity', clamp((k - 0.8) / 0.2).toFixed(3));
          const lit = reached > i;
          attr(cn.line, 'stroke', lit ? rgba(accent, 0.8) : rgba(theme.colors.ink, 0.35));
          attr(cn.head, 'fill', lit ? accent : rgba(theme.colors.ink, 0.5));
        });
        if (tok) {
          const moving = pos >= 0 && pos < n - 1;
          const h0 = Math.min(n - 2, Math.floor(pos));
          const fr = easeInOutCubic(pos - h0);
          const x = moving ? centers[h0] + (centers[h0 + 1] - centers[h0]) * fr : 0;
          attr(token, 'cx', x.toFixed(2));
          attr(token, 'cy', cy);
          attr(token, 'opacity', moving ? '1' : '0');
          css(token, 'filter', `drop-shadow(0 0 12px ${rgba(accent, 0.9)})`);
        }
      },
    };
  },
};

// ------------------------------------------------------------------ hierarchy (org-chart, tree)

interface HierOpts<T> {
  vertical: boolean;
  style: 'elbow' | 'curve';
  maxW: number;
  maxH: number;
  stagger: number;
  line: string;
  make: (n: TreeNode<T>, w: number, h: number) => { el: HTMLElement; fit?: () => void };
  rtl: boolean;
}

/** Lays out a forest in the element box and reveals it level by level with drawn connectors. */
function mountHierarchy<T extends TreeIn>(
  root: HTMLElement,
  ctx: MountCtx,
  roots: TreeNode<T>[],
  o: HierOpts<T>,
) {
  const W = ctx.box.w;
  const H = ctx.box.h;
  const { nodes, slots, levels } = layoutTree(roots);
  const along = o.vertical ? H : W;
  const across = o.vertical ? W : H;
  const level = along / levels;
  const slot = across / slots;
  const bw = o.vertical ? Math.min(slot - 14, o.maxW) : Math.min(level - 56, o.maxW);
  const bh = o.vertical ? Math.min(level - 44, o.maxH) : Math.min(slot - 12, o.maxH);
  const rect = (n: TreeNode<T>) => {
    const ca = n.x * slot;
    const cl = n.depth * level + level / 2;
    let cx = o.vertical ? ca : cl;
    const cy = o.vertical ? cl : ca;
    if (o.rtl) cx = W - cx;
    return { x: cx - bw / 2, y: cy - bh / 2, cx, cy };
  };
  const svg = svgBox(W, H);
  root.append(svg);
  const at = (n: TreeNode<T>) => ctx.el.enter.t + n.depth * o.stagger;
  const edges = nodes
    .filter((n) => n.parent)
    .map((n) => {
      const a = rect(n.parent!);
      const b = rect(n);
      const dir = o.rtl ? -1 : 1;
      const from = o.vertical ? { x: a.cx, y: a.y + bh } : { x: a.cx + (dir * bw) / 2, y: a.cy };
      const to = o.vertical ? { x: b.cx, y: b.y } : { x: b.cx - (dir * bw) / 2, y: b.cy };
      const c = connector(from, to, o.vertical, o.style);
      const path = s('path', {
        d: c.d,
        fill: 'none',
        stroke: o.line,
        'stroke-width': 3.5,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
      svg.append(path);
      return { path, len: Math.max(1, c.len), t0: at(n.parent!) + 0.15, t1: at(n) + 0.05 };
    });
  const views = nodes.map((n) => {
    const r = rect(n);
    const { el, fit } = o.make(n, bw, bh);
    el.style.cssText += `;left:${r.x.toFixed(1)}px;top:${r.y.toFixed(1)}px;width:${bw.toFixed(1)}px;height:${bh.toFixed(1)}px`;
    root.append(el);
    fit?.();
    return { n, el, at: at(n) };
  });
  return {
    views,
    bw,
    bh,
    update(t: number) {
      for (const e of edges)
        drawStroke(
          e.path,
          e.len,
          t < e.t0 ? 0 : easeInOutCubic(progress(t, e.t0, Math.max(0.2, e.t1 - e.t0))),
        );
      for (const v of views) reveal(v.el, t, v.at, { s0: 0.75, dur: 0.4 });
    },
  };
}

type OrgNode = TreeIn & { name: string; role?: string; color?: string; icon?: string };

export const orgChart: RuntimeComponent = {
  name: 'org-chart',
  mount(root, p, theme, ctx) {
    const fs: number = p.fontSize;
    const people = p.people as OrgNode[];
    const roots = buildTree(people);
    const all: OrgNode[] = [];
    const walk = (x: OrgNode) => {
      all.push(x);
      (x.children as OrgNode[] | undefined)?.forEach(walk);
    };
    people.forEach(walk);
    const rtl = textDir(...all.flatMap((x) => [x.name, x.role])) === 'rtl';
    const base = resolve(p.color);
    const accent = resolve(p.accent);
    const hv = mountHierarchy<OrgNode>(root, ctx, roots, {
      vertical: true,
      style: 'elbow',
      maxW: 300,
      maxH: fs * 3.6,
      stagger: p.stagger,
      line: rgba(theme.colors.ink, 0.3),
      rtl,
      make: (n, w, bh) => {
        const c = colorOr(n.data.color, n.depth === 0 ? accent : base);
        const box = h('div', {
          class: 'oc-box',
          dir: rtl ? 'rtl' : 'ltr',
          style: `border-color:${rgba(c, 0.7)};background:linear-gradient(160deg, ${rgba(c, 0.16)}, ${rgba(theme.colors.card, 0.97)} 70%);box-shadow:0 0 30px ${rgba(c, 0.18)}`,
        });
        const iconSize = Math.round(Math.min(bh * 0.5, fs * 1.5));
        const showIcon = w > iconSize * 3.2;
        if (showIcon)
          box.append(
            h(
              'span',
              {
                class: 'oc-av',
                style: `width:${iconSize}px;height:${iconSize}px;background:${rgba(c, 0.18)}`,
              },
              icon(n.data.icon ?? 'user', Math.round(iconSize * 0.6), c, 2),
            ),
          );
        const txt = h('div', { class: 'oc-txt' });
        const sizeName = Math.round(Math.min(fs, bh * 0.36));
        const name = textEl(theme, n.data.name, { cls: 'oc-name', size: sizeName, weight: 700 });
        txt.append(name);
        let role: HTMLElement | undefined;
        if (n.data.role) {
          role = textEl(theme, n.data.role, { cls: 'oc-role', size: Math.round(sizeName * 0.68), color: c });
          txt.append(role);
        }
        box.append(txt);
        const fit = () => {
          const tw = w - 28 - (showIcon ? iconSize + 12 : 0);
          fitTo(name, tw, sizeName * 1.4, sizeName, 12);
          if (role) fitTo(role, tw, sizeName, Math.round(sizeName * 0.68), 11);
        };
        return { el: box, fit };
      },
    });
    return { update: (t) => hv.update(t) };
  },
};

type TreeData = TreeIn & { label: string; color?: string };

export const tree: RuntimeComponent = {
  name: 'tree',
  mount(root, p, theme, ctx) {
    const fs: number = p.fontSize;
    const data = p.nodes as TreeData[];
    const roots = buildTree(data);
    const labels: string[] = [];
    const walk = (x: TreeData) => {
      labels.push(x.label);
      (x.children as TreeData[] | undefined)?.forEach(walk);
    };
    data.forEach(walk);
    const rtl = textDir(...labels) === 'rtl';
    const base = resolve(p.color);
    const vertical = p.orient === 'down';
    const hv = mountHierarchy<TreeData>(root, ctx, roots, {
      vertical,
      style: 'curve',
      maxW: vertical ? 260 : 300,
      maxH: fs * 2.2,
      stagger: p.stagger,
      line: rgba(base, 0.55),
      rtl: rtl && !vertical ? true : rtl,
      make: (n, w, bh) => {
        const c = colorOr(n.data.color, n.children.length ? base : mix(base, theme.colors.ink, 0.35));
        const size = Math.round(Math.min(fs, bh * 0.5));
        const box = h('div', {
          class: `tr-node${n.depth === 0 ? ' root' : ''}`,
          style: `border-color:${c};background:${n.depth === 0 ? c : rgba(c, 0.14)};color:${n.depth === 0 ? theme.colors.bg : theme.colors.ink};box-shadow:0 0 24px ${rgba(c, 0.25)}`,
        });
        const lab = textEl(theme, n.data.label, { cls: 'tr-label', size, weight: 700 });
        box.append(lab);
        return { el: box, fit: () => fitTo(lab, w - 24, bh - 6, size, 12) };
      },
    });
    return { update: (t) => hv.update(t) };
  },
};

// ------------------------------------------------------------------ cycle

export const cycle: RuntimeComponent = {
  name: 'cycle',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const stages = p.stages as { label: string; sub?: string; icon?: string; color?: string }[];
    const n = stages.length;
    const base = resolve(p.color);
    const accent = resolve(p.accent);
    const hasSub = stages.some((x) => x.sub);
    const hasIcon = stages.some((x) => x.icon);
    const bh = fs * (2.2 + (hasSub ? 1 : 0) + (hasIcon ? 1.5 : 0));
    const cx = W / 2;
    const cy = H / 2;
    // Boxes must not touch their neighbours: shrink them to the chord between adjacent stages.
    const ringR = (w: number) => Math.max(40, Math.min(W - w, H - bh) / 2 - 6);
    let bw = Math.min(W * 0.36, 280);
    for (let k = 0; k < 3; k++) bw = Math.min(W * 0.36, 280, 2 * ringR(bw) * Math.sin(Math.PI / n) - 28);
    bw = Math.max(90, bw);
    const R = ringR(bw);
    const angles = stages.map((_, i) => (2 * Math.PI * i) / n);
    const ctr = angles.map((a) => polar(cx, cy, R, a));
    // Angle at which the ring leaves box i (search outward from its centre; boxes are padded by 14px).
    const exitAngle = (i: number, dir: 1 | -1) => {
      for (let d = 0; d < Math.PI / n; d += 0.005) {
        const q = polar(cx, cy, R, angles[i] + dir * d);
        if (Math.abs(q.x - ctr[i].x) > bw / 2 + 14 || Math.abs(q.y - ctr[i].y) > bh / 2 + 14) return d;
      }
      return Math.PI / n;
    };
    const svg = svgBox(W, H);
    root.append(svg);
    svg.append(
      s('circle', {
        cx,
        cy,
        r: R,
        fill: 'none',
        stroke: rgba(theme.colors.ink, 0.06),
        'stroke-width': 3,
        'stroke-dasharray': '4 10',
      }),
    );
    const arcs = stages.map((_, i) => {
      const a0 = angles[i] + exitAngle(i, 1);
      const a1 = angles[i] + (2 * Math.PI) / n - exitAngle((i + 1) % n, -1) - 0.06;
      const p0 = polar(cx, cy, R, a0);
      const p1 = polar(cx, cy, R, a1);
      const span = Math.max(0.01, a1 - a0);
      const path = s('path', {
        d: `M${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A${R} ${R} 0 ${span > Math.PI ? 1 : 0} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
        fill: 'none',
        'stroke-width': 5,
        'stroke-linecap': 'round',
      });
      const tip = polar(cx, cy, R, a1 + 0.05);
      const head = s('polygon', { points: arrowHead(tip, a1 + 0.05, 18) });
      svg.append(path, head);
      return { path, head, len: R * span };
    });
    let center: HTMLElement | undefined;
    if (p.center) {
      const cw = Math.max(80, (R - bh / 2) * 1.4);
      center = textEl(theme, p.center, {
        cls: 'cy-center',
        size: Math.round(fs * 1.3),
        weight: 800,
        style: `left:${cx - cw / 2}px;top:${cy - fs}px;width:${cw}px`,
      });
      root.append(center);
      fitTo(center, cw, fs * 2, Math.round(fs * 1.3), 14);
    }
    const views = stages.map((st, i) => {
      const c = colorOr(st.color, base);
      const box = h('div', {
        class: 'cy-stage',
        dir: 'auto',
        style: `left:${ctr[i].x - bw / 2}px;top:${ctr[i].y - bh / 2}px;width:${bw}px;height:${bh}px`,
      });
      if (st.icon) box.append(h('span', { class: 'cy-ic' }, icon(st.icon, Math.round(fs * 1.3), c, 2)));
      const lab = textEl(theme, st.label, { cls: 'cy-label', size: fs, weight: 700 });
      box.append(lab);
      let sub: HTMLElement | undefined;
      if (st.sub) {
        sub = textEl(theme, st.sub, { cls: 'cy-sub', size: Math.round(fs * 0.68) });
        box.append(sub);
      }
      root.append(box);
      fitTo(lab, bw - 24, fs * 1.4, fs, 12);
      if (sub) fitTo(sub, bw - 24, fs, Math.round(fs * 0.68), 11);
      return { box, c, at: itemAt(ctx, i, p.stagger) };
    });
    const active = (p.active as { at: number; index: number }[]).slice().sort((a, b) => a.at - b.at);
    const autoStart = views[n - 1].at + 0.5;
    const activeAt = (t: number): { i: number; since: number } => {
      if (active.length) {
        let cur = { i: -1, since: -1e9 };
        for (const a of active) if (a.at <= t) cur = { i: a.index % n, since: a.at };
        return cur;
      }
      if (p.step <= 0 || t < autoStart) return { i: -1, since: -1e9 };
      const k = Math.floor((t - autoStart) / p.step);
      return { i: k % n, since: autoStart + k * p.step };
    };
    return {
      update(t) {
        const act = activeAt(t);
        views.forEach((v, i) => {
          reveal(v.box, t, v.at, { s0: 0.6, dur: 0.4 });
          const on = i === act.i;
          const fl = on ? flash(t, act.since, 0.6) : 0;
          const c = on ? accent : v.c;
          css(v.box, 'border-color', on ? c : rgba(c, 0.55));
          css(
            v.box,
            'background',
            `linear-gradient(160deg, ${rgba(c, on ? 0.26 : 0.12)}, ${rgba(theme.colors.card, 0.97)} 75%)`,
          );
          css(
            v.box,
            'box-shadow',
            on ? `0 0 ${(34 + 40 * fl).toFixed(0)}px ${rgba(c, 0.45 + 0.3 * fl)}` : 'none',
          );
          css(v.box, 'color', on ? c : theme.colors.ink);
          css(v.box, 'scale', on ? (1.06 + 0.04 * fl).toFixed(4) : '1');
        });
        arcs.forEach((a, i) => {
          const t0 = views[i].at + 0.15;
          const k = t < t0 ? 0 : easeOutCubic(progress(t, t0, 0.45));
          drawStroke(a.path, a.len, k);
          const lit = (act.i - 1 + n) % n === i && act.i >= 0;
          const c = lit ? accent : rgba(theme.colors.ink, 0.4);
          attr(a.path, 'stroke', c);
          attr(a.head, 'fill', c);
          attr(a.head, 'opacity', clamp((k - 0.85) / 0.15).toFixed(3));
        });
        if (center) css(center, 'opacity', clamp((t - ctx.el.enter.t) / 0.5).toFixed(3));
      },
    };
  },
};

// ------------------------------------------------------------------ funnel

export const funnel: RuntimeComponent = {
  name: 'funnel',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const f: NumFmt = p;
    const stages = p.stages as { label: string; value?: number; color?: string; at?: number }[];
    const n = stages.length;
    const rtl = textDir(...stages.map((x) => x.label)) === 'rtl';
    const colors = ramp(
      resolve(p.color),
      resolve(p.accent),
      n,
      stages.map((x) => x.color),
    );
    const side = stages.some((x) => x.value !== undefined);
    const colW = side ? Math.min(W * 0.3, fs * 6) : 0;
    const FW = W - colW;
    const gap = 8;
    const sh = (H - gap * (n - 1)) / n;
    const widthAt = (y: number) => FW * (1 - (1 - p.neck) * (y / H));
    const first = stages[0].value;
    const views = stages.map((st, i) => {
      const y0 = i * (sh + gap);
      const y1 = y0 + sh;
      const w0 = widthAt(y0);
      const w1 = widthAt(y1);
      const c = colors[i];
      const x0 = mirrorX(0, FW, W, rtl);
      const inset0 = ((FW - w0) / 2 / FW) * 100;
      const inset1 = ((FW - w1) / 2 / FW) * 100;
      const shape = h('div', {
        class: 'fn-stage',
        style: `left:${x0}px;top:${y0}px;width:${FW}px;height:${sh}px;background:linear-gradient(90deg, ${rgba(c, 0.55)}, ${c}, ${rgba(c, 0.55)});clip-path:polygon(${inset0}% 0, ${100 - inset0}% 0, ${100 - inset1}% 100%, ${inset1}% 100%)`,
      });
      const lab = textEl(theme, st.label, { cls: 'fn-label', size: fs, weight: 800, color: theme.colors.bg });
      shape.append(lab);
      root.append(shape);
      fitTo(lab, w1 - 32, sh - 8, fs, 14);
      let side: HTMLElement | undefined;
      if (st.value !== undefined) {
        side = h('div', {
          class: 'fn-side',
          style: `${rtl ? 'left' : 'right'}:0;width:${colW - 12}px;top:${y0}px;height:${sh}px;text-align:${rtl ? 'left' : 'right'}`,
        });
        const v = numEl('fn-val', `color:${c};font-size:${fs}px`);
        v.textContent = fmtNum(st.value, f);
        side.append(v);
        if (p.rate && first && i > 0) {
          const r = numEl('fn-rate', `font-size:${Math.round(fs * 0.62)}px`);
          r.textContent = `${fmtNum((st.value / first) * 100, { decimals: 0, separator: false })}%`;
          side.append(r);
        }
        root.append(side);
      }
      return { shape, side, at: itemAt(ctx, i, p.stagger, st.at) };
    });
    return {
      update(t) {
        for (const v of views) {
          reveal(v.shape, t, v.at, { dy: -24, dur: 0.4 });
          if (v.side) reveal(v.side, t, v.at + 0.15, { dx: rtl ? -20 : 20, dur: 0.35 });
        }
      },
    };
  },
};

// ------------------------------------------------------------------ pyramid

export const pyramid: RuntimeComponent = {
  name: 'pyramid',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const levels = p.levels as { label: string; sub?: string; color?: string; at?: number }[];
    const n = levels.length;
    const rtl = textDir(...levels.flatMap((x) => [x.label, x.sub])) === 'rtl';
    const colors = ramp(
      resolve(p.accent),
      resolve(p.color),
      n,
      levels.map((x) => x.color),
    );
    const PW = Math.min(W * 0.5, H * 1.15);
    const gap = 8;
    const lh = (H - gap * (n - 1)) / n;
    const px = mirrorX(0, PW, W, rtl);
    const labX = PW + 40;
    const labW = W - labX;
    const svg = svgBox(W, H);
    root.append(svg);
    const subFs = Math.round(fs * 0.62);
    const views = levels.map((lv, i) => {
      const y0 = i * (lh + gap);
      const y1 = y0 + lh;
      const w0 = (PW * y0) / H;
      const w1 = (PW * y1) / H;
      const c = colors[i];
      const i0 = ((PW - w0) / 2 / PW) * 100;
      const i1 = ((PW - w1) / 2 / PW) * 100;
      const shape = h('div', {
        class: 'py-level',
        style: `left:${px}px;top:${y0}px;width:${PW}px;height:${lh}px;background:linear-gradient(180deg, ${c}, ${rgba(c, 0.6)});clip-path:polygon(${i0}% 0, ${100 - i0}% 0, ${100 - i1}% 100%, ${i1}% 100%)`,
      });
      const num = h(
        'span',
        {
          class: 'py-num rf-num',
          style: `font-size:${Math.round(Math.min(fs, lh * 0.45))}px;color:${theme.colors.bg};padding-top:${i === 0 ? lh * 0.3 : 0}px`,
        },
        String(i + 1),
      );
      shape.append(num);
      const ym = (y0 + y1) / 2 + (i === 0 ? lh * 0.15 : 0);
      const edge = PW / 2 + (PW * ym) / H / 2 + 10;
      const a = { x: mirrorX(edge, 0, W, rtl), y: ym };
      const b = { x: mirrorX(labX - 12, 0, W, rtl), y: ym };
      const lead = s('line', {
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        stroke: rgba(c, 0.7),
        'stroke-width': 2.5,
        'stroke-dasharray': '3 6',
      });
      const dot = s('circle', { cx: b.x, cy: b.y, r: 5, fill: c });
      svg.append(lead, dot);
      const box = h('div', {
        class: 'py-label',
        dir: rtl ? 'rtl' : 'ltr',
        style: `${rtl ? 'right' : 'left'}:${labX}px;width:${labW}px;top:${y0}px;height:${lh}px`,
      });
      const tt = textEl(theme, lv.label, { size: fs, weight: 700, color: c });
      box.append(tt);
      let sub: HTMLElement | undefined;
      if (lv.sub) {
        sub = textEl(theme, lv.sub, { cls: 'py-sub', size: subFs });
        box.append(sub);
      }
      root.append(shape, box);
      fitTo(tt, labW, Math.min(lh, fs * 1.4), fs, 14);
      if (sub) fitTo(sub, labW, subFs * 1.5, subFs, 12);
      const seq = p.order === 'bottom-up' ? n - 1 - i : i;
      return { shape, box, lead, dot, len: Math.abs(b.x - a.x), at: itemAt(ctx, seq, p.stagger, lv.at) };
    });
    return {
      update(t) {
        for (const v of views) {
          reveal(v.shape, t, v.at, { dy: p.order === 'bottom-up' ? -30 : 30, dur: 0.4 });
          const k = t < v.at + 0.15 ? 0 : easeOutCubic(progress(t, v.at + 0.15, 0.3));
          drawStroke(v.lead, v.len, k);
          attr(v.dot, 'opacity', k >= 1 ? '1' : '0');
          reveal(v.box, t, v.at + 0.3, { dx: rtl ? 20 : -20, dur: 0.35 });
        }
      },
    };
  },
};

// ------------------------------------------------------------------ matrix-2x2

function axisText(theme: Theme, text: string, size: number, style: string, cls = 'mx-axis'): HTMLElement {
  return textEl(theme, text, { cls, size, style });
}

export const matrix2x2: RuntimeComponent = {
  name: 'matrix-2x2',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const quads = p.quadrants as { title: string; color?: string }[];
    const items = p.items as { label: string; x: number; y: number; color?: string; at?: number }[];
    const rtl =
      textDir(p.x.label, p.y.label, ...quads.map((q) => q.title), ...items.map((x) => x.label)) === 'rtl';
    const axFs = Math.round(fs * 0.8);
    const yAxisW = axFs * 2.2;
    const xAxisH = axFs * 2.4;
    const x0 = rtl ? 0 : yAxisW;
    const pw = W - yAxisW;
    const ph = H - xAxisH;
    const gap = 8;
    const qw = (pw - gap) / 2;
    const qh = (ph - gap) / 2;
    const qColors = palette(
      theme,
      p.color,
      4,
      quads.map((q) => q.color),
    );
    // Quadrant i: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right (mirrored for Arabic).
    const qViews = [0, 1, 2, 3].map((i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = x0 + mirrorX(col * (qw + gap), qw, pw, rtl);
      const y = row * (qh + gap);
      const q = quads[i];
      const c = qColors[i];
      const el = h('div', {
        class: 'mx-quad',
        style: `left:${x}px;top:${y}px;width:${qw}px;height:${qh}px;border-color:${rgba(c, q ? 0.45 : 0.18)};background:${rgba(c, q ? 0.08 : 0.03)}`,
      });
      if (q) {
        const outerStart = (col === 0) !== rtl;
        const tt = textEl(theme, q.title, {
          cls: 'mx-qt',
          size: fs,
          color: c,
          style: `${outerStart ? 'left' : 'right'}:18px;${row === 0 ? 'top' : 'bottom'}:14px;max-width:${qw - 36}px;text-align:${outerStart ? 'left' : 'right'}`,
        });
        el.append(tt);
        root.append(el);
        fitTo(tt, qw - 36, fs * 1.5, fs, 12);
      } else root.append(el);
      return { el, at: ctx.el.enter.t + i * 0.08 };
    });
    // axes: [low · label · high] rows; the y row is rotated to read bottom → top
    const axis = (ax: { label?: string; low: string; high: string }, style: string, reverse: boolean) => {
      const row = h('div', {
        class: 'mx-axrow',
        style: `${style};flex-direction:${reverse ? 'row-reverse' : 'row'};font-size:${axFs}px`,
      });
      const parts = [ax.low, ax.label ?? '', ax.high].map((t) => axisText(theme, t, axFs, ''));
      row.append(...parts);
      root.append(row);
      return parts;
    };
    const yl = rtl ? W - yAxisW : 0;
    axis(
      p.y,
      `left:${yl + yAxisW / 2 - ph / 2}px;top:${ph / 2 - yAxisW / 2}px;width:${ph}px;height:${yAxisW}px;transform:rotate(-90deg)`,
      false,
    );
    axis(p.x, `left:${x0}px;top:${ph}px;width:${pw}px;height:${xAxisH}px`, rtl);
    const iViews = items.map((it, i) => {
      const c = colorOr(it.color, theme.colors.ink);
      const px = x0 + mirrorX(it.x * pw, 0, pw, rtl);
      const py = (1 - it.y) * ph;
      // Label on the side with more room inside the item's quadrant.
      const qStart = px >= x0 + pw / 2 ? x0 + pw / 2 : x0;
      const onRight = qStart + pw / 2 - px >= px - qStart;
      const el = h('div', { class: 'mx-item', style: `left:${px}px;top:${py}px` });
      const dot = h('i', { class: 'mx-dot', style: `background:${c};box-shadow:0 0 18px ${rgba(c, 0.8)}` });
      const lab = textEl(theme, it.label, {
        cls: 'mx-lab',
        size: Math.round(fs * 0.9),
        style: `${onRight ? 'left' : 'right'}:18px;border-color:${rgba(c, 0.5)}`,
      });
      el.append(dot, lab);
      root.append(el);
      fitTo(lab, qw * 0.9, fs * 1.6, Math.round(fs * 0.9), 12);
      return { el, at: itemAt(ctx, i, p.stagger, it.at) };
    });
    return {
      update(t) {
        for (const q of qViews) reveal(q.el, t, q.at, { s0: 0.92, dur: 0.4 });
        for (const v of iViews) reveal(v.el, t, v.at, { s0: 0.3, dur: 0.4 });
      },
    };
  },
};
