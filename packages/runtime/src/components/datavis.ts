/** Data components: bar-chart, line-chart, donut-chart, stat-card, progress-ring, comparison, before-after, ranking. */
import { clamp, easeInOutCubic, easeOutBack, easeOutCubic, formatNumber, progress } from '../anim.js';
import { attr, css, h, s, text } from '../dom.js';
import { icon } from '../icons.js';
import { mix, resolve, rgba } from '../color.js';
import type { RuntimeComponent } from '../types.js';
import {
  colorOr,
  fitTo,
  fmtNum,
  itemAt,
  legend,
  linearScale,
  mirrorX,
  numEl,
  palette,
  partialPolyline,
  pathD,
  polyLengths,
  reveal,
  ringArc,
  svgBox,
  textDir,
  textEl,
  valueDomain,
  type NumFmt,
  type Pt,
} from './chart.js';
import { keyframeValue } from './util.js';

type Kf = { at: number; value: number; dur?: number };

/** Value of a keyframable number: counts from `from` to `value` over `dur` after `start`, then follows keyframes. */
function countValue(t: number, start: number, dur: number, from: number, value: number, kfs?: Kf[]): number {
  if (kfs?.length) return keyframeValue(kfs, t, from, easeOutCubic);
  return from + (value - from) * easeOutCubic(progress(t, start, dur));
}

/** Width estimate of a short monospace number label (layout only; real text is fitted). */
const monoW = (s: string, size: number) => s.length * size * 0.62 + 12;

const uid = (id: string, seed: number, suffix: string) =>
  `rf-${id.replace(/[^\w-]/g, '')}-${seed % 100000}-${suffix}`;

// ------------------------------------------------------------------ bar-chart

export const barChart: RuntimeComponent = {
  name: 'bar-chart',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const bars = p.bars as { label: string; value: number; color?: string; keyframes?: Kf[] }[];
    const n = bars.length;
    const rtl = textDir(p.title, ...bars.map((b) => b.label)) === 'rtl';
    const f: NumFmt = p;
    const base = resolve(p.color);
    const accent = resolve(p.accent);
    const colors = bars.map((b) => colorOr(b.color, base));
    const dom = valueDomain(
      bars.flatMap((b) => [b.value, ...(b.keyframes ?? []).map((k) => k.value)]),
      p.min,
      p.max,
    );
    let top = 0;
    if (p.title) {
      const tt = textEl(theme, p.title, { cls: 'bc-title', size: fs * 0.95 });
      tt.style.height = `${fs * 1.5}px`;
      root.append(tt);
      fitTo(tt, W, fs * 1.5, fs * 0.95);
      top = fs * 1.9;
    }
    const vert = p.orient === 'vertical';
    const tickFs = Math.round(fs * 0.78);
    const tickW = p.grid && vert ? Math.max(...dom.ticks.map((v) => monoW(fmtNum(v, f), tickFs))) + 8 : 0;
    const valFs = Math.round(fs * 1.05);
    const valueW =
      p.values && !vert
        ? Math.max(
            ...bars
              .flatMap((b) => [b.value, ...(b.keyframes ?? []).map((k) => k.value)])
              .map((v) => monoW(fmtNum(v, f), valFs)),
          ) + 8
        : 0;

    // Plot rectangle (value axis runs bottom→top for vertical, start→end for horizontal).
    const catH = vert ? Math.round(fs * 2) : 0;
    const labelW = vert
      ? 0
      : Math.min(W * 0.34, Math.max(...bars.map((b) => b.label.length)) * fs * 0.6 + 24);
    const px0 = vert ? (rtl ? 0 : tickW) : labelW + 12;
    const px1 = vert ? (rtl ? W - tickW : W) : W - valueW;
    const py0 = top + (vert && p.values ? valFs * 1.6 : 6);
    const py1 = H - catH;
    const vs = vert ? linearScale(dom.min, dom.max, py1, py0) : linearScale(dom.min, dom.max, px0, px1);
    const zero = vs(clamp(0, dom.min, dom.max));

    const plot = h('div', { class: 'bc-plot' });
    root.append(plot);
    if (p.grid) {
      for (const v of dom.ticks) {
        const at = vs(v);
        const strong = v === 0;
        const line = h('i', {
          class: `bc-grid${vert ? '' : ' v'}${strong ? ' zero' : ''}`,
          style: vert
            ? `left:${px0}px;width:${px1 - px0}px;top:${at.toFixed(1)}px`
            : `top:${py0}px;height:${py1 - py0}px;left:${mirrorX(at, 0, W, rtl).toFixed(1)}px`,
        });
        plot.append(line);
        if (vert) {
          const lab = h(
            'span',
            {
              class: 'bc-tick rf-num',
              dir: 'ltr',
              style: `top:${at.toFixed(1)}px;font-size:${tickFs}px;${rtl ? `left:${W - tickW + 8}px;text-align:left` : `right:${W - tickW + 10}px;text-align:right`}`,
            },
            fmtNum(v, f),
          );
          plot.append(lab);
        }
      }
    }

    const slot = vert ? (px1 - px0) / n : (py1 - py0) / n;
    const thick = vert ? Math.min(slot * 0.62, 150) : Math.min(slot * 0.6, 70);
    const items = bars.map((b, i) => {
      const j = vert && rtl ? n - 1 - i : i;
      const c = (vert ? px0 : py0) + slot * (j + 0.5);
      const bar = h('div', { class: 'bc-bar' });
      const val = numEl('bc-val', `font-size:${valFs}px`);
      const lab = textEl(theme, b.label, { cls: 'bc-cat', size: fs });
      if (vert) {
        css(bar, 'left', `${(c - thick / 2).toFixed(1)}px`);
        css(bar, 'width', `${thick.toFixed(1)}px`);
        lab.style.cssText += `;left:${(c - slot / 2 + 4).toFixed(1)}px;width:${(slot - 8).toFixed(1)}px;top:${py1 + 10}px;text-align:center`;
      } else {
        css(bar, 'top', `${(c - thick / 2).toFixed(1)}px`);
        css(bar, 'height', `${thick.toFixed(1)}px`);
        lab.style.cssText += `;${rtl ? 'right' : 'left'}:0;width:${labelW}px;top:${(c - fs * 0.7).toFixed(1)}px;text-align:${rtl ? 'right' : 'left'}`;
      }
      plot.append(bar, val, lab);
      if (vert) fitTo(lab, slot - 8, catH - 8, fs);
      else fitTo(lab, labelW, fs * 1.4, fs);
      return { b, bar, val, lab, c, at: itemAt(ctx, i, p.stagger), color: colors[i] };
    });

    const fIndex = typeof p.focus === 'number' ? p.focus : p.focus?.index;
    const fAt =
      typeof p.focus === 'object' && typeof p.focus.at === 'number'
        ? p.focus.at
        : itemAt(ctx, n - 1, p.stagger) + p.dur;
    return {
      update(t) {
        const fk =
          fIndex !== undefined && fIndex < n ? easeOutCubic(progress(t, fAt, 0.4)) * (t >= fAt ? 1 : 0) : 0;
        items.forEach((it, i) => {
          const grow = easeOutCubic(progress(t, it.at, p.dur));
          const v = countValue(t, it.at, 0, it.b.value, it.b.value, it.b.keyframes) * grow;
          const pos = vs(clamp(v, dom.min, dom.max));
          const lo = Math.min(pos, zero);
          const len = Math.abs(pos - zero);
          const focused = i === fIndex;
          const c = focused ? mix(it.color, accent, fk) : it.color;
          const neg = v < 0;
          if (vert) {
            css(it.bar, 'top', `${lo.toFixed(2)}px`);
            css(it.bar, 'height', `${len.toFixed(2)}px`);
            css(it.bar, 'border-radius', neg ? '4px 4px 12px 12px' : '12px 12px 4px 4px');
            css(it.bar, 'background', `linear-gradient(${neg ? 0 : 180}deg, ${c}, ${rgba(c, 0.55)})`);
            css(it.val, 'left', `${it.c.toFixed(1)}px`);
            css(it.val, 'top', `${(neg ? lo + len + 6 : lo - valFs * 1.35).toFixed(1)}px`);
            css(it.val, 'transform', 'translateX(-50%)');
          } else {
            const x = mirrorX(lo, len, W, rtl);
            css(it.bar, 'left', `${x.toFixed(2)}px`);
            css(it.bar, 'width', `${len.toFixed(2)}px`);
            css(it.bar, 'border-radius', neg !== rtl ? '12px 4px 4px 12px' : '4px 12px 12px 4px');
            css(
              it.bar,
              'background',
              `linear-gradient(${neg !== rtl ? 270 : 90}deg, ${rgba(c, 0.55)}, ${c})`,
            );
            const end = mirrorX(neg ? lo : lo + len, 0, W, rtl);
            const after = neg !== rtl;
            css(it.val, 'left', `${(after ? end - 12 : end + 12).toFixed(1)}px`);
            css(it.val, 'top', `${it.c.toFixed(1)}px`);
            css(it.val, 'transform', `translate(${after ? '-100%' : '0'}, -50%)`);
          }
          css(
            it.bar,
            'box-shadow',
            `0 0 ${(24 + 26 * (focused ? fk : 0)).toFixed(0)}px ${rgba(c, 0.3 + (focused ? 0.35 * fk : 0))}`,
          );
          css(it.bar, 'visibility', t >= it.at ? 'visible' : 'hidden');
          const dim = fIndex !== undefined && !focused ? 1 - 0.5 * fk : 1;
          css(it.bar, 'opacity', dim.toFixed(3));
          css(it.lab, 'opacity', (clamp(grow * 2) * dim).toFixed(3));
          css(it.lab, 'color', focused && fk > 0 ? mix(theme.colors.ink, accent, fk) : theme.colors.ink);
          text(it.val, fmtNum(v, f));
          css(it.val, 'display', p.values ? 'block' : 'none');
          css(it.val, 'opacity', (clamp((grow - 0.3) / 0.5) * dim).toFixed(3));
          css(it.val, 'color', focused && fk > 0 ? accent : theme.colors.ink);
        });
      },
    };
  },
};

// ------------------------------------------------------------------ line-chart

export const lineChart: RuntimeComponent = {
  name: 'line-chart',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const f: NumFmt = p;
    const series = p.series as { label?: string; values: number[]; color?: string; at?: number }[];
    const labels: string[] = p.labels;
    const colors = palette(
      theme,
      p.color,
      series.length,
      series.map((x) => x.color),
    );
    const dom = valueDomain(
      series.flatMap((x) => x.values),
      p.min,
      p.max,
    );
    let top = 0;
    if (p.title) {
      const tt = textEl(theme, p.title, { cls: 'lc-title', size: fs * 1.05 });
      root.append(tt);
      fitTo(tt, W, fs * 1.6, fs * 1.05);
      top += fs * 1.9;
    }
    const named = series.filter((x) => x.label);
    if (p.legend && named.length) {
      const lg = legend(
        theme,
        series.flatMap((x, i) => (x.label ? [{ label: x.label, color: colors[i] }] : [])),
        { size: fs, style: `position:absolute;left:0;right:0;top:${top}px` },
      );
      lg.el.dir = textDir(...named.map((x) => x.label));
      root.append(lg.el);
      top += fs * 2;
    }
    const tickFs = Math.round(fs * 0.85);
    const tickW = Math.max(...dom.ticks.map((v) => monoW(fmtNum(v, f), tickFs))) + 6;
    const n = Math.max(...series.map((x) => x.values.length));
    const xLabH = labels.length ? fs * 1.9 : fs * 0.6;
    const x0 = tickW + 10;
    const x1 = W - fs * 1.2;
    const y0 = top + fs * 1.6;
    const y1 = H - xLabH;
    const xs = linearScale(0, Math.max(1, n - 1), x0, x1);
    const ys = linearScale(dom.min, dom.max, y1, y0);
    const svg = svgBox(W, H);
    root.append(svg);
    if (p.grid) {
      for (const v of dom.ticks) {
        svg.append(
          s('line', {
            x1: x0,
            x2: x1,
            y1: ys(v).toFixed(1),
            y2: ys(v).toFixed(1),
            stroke: v === 0 ? rgba(theme.colors.ink, 0.35) : rgba(theme.colors.ink, 0.1),
            'stroke-width': v === 0 ? 2 : 1.5,
            'stroke-dasharray': v === 0 ? undefined : '6 8',
          }),
        );
      }
    }
    for (const v of dom.ticks)
      root.append(
        h(
          'span',
          {
            class: 'lc-tick rf-num',
            dir: 'ltr',
            style: `right:${W - tickW}px;top:${ys(v).toFixed(1)}px;font-size:${tickFs}px`,
          },
          fmtNum(v, f),
        ),
      );
    // x labels: thin out so neighbours never collide
    const every = Math.max(1, Math.ceil((labels.length * fs * 3.2) / Math.max(1, x1 - x0)));
    labels.slice(0, n).forEach((l, i) => {
      if (i % every !== 0 && i !== n - 1) return;
      const slotW = Math.min(W, ((x1 - x0) / Math.max(1, n - 1)) * every);
      const left = clamp(xs(i) - slotW / 2, 0, W - slotW);
      const el = textEl(theme, l, {
        cls: 'lc-x',
        size: Math.round(fs * 0.9),
        style: `left:${left.toFixed(1)}px;width:${slotW.toFixed(1)}px;top:${(y1 + fs * 0.6).toFixed(1)}px`,
      });
      root.append(el);
      fitTo(el, slotW, fs * 1.3, Math.round(fs * 0.9), 14);
    });
    const views = series.map((sr, si) => {
      const c = colors[si];
      const pts: Pt[] = sr.values.map((v, i) => ({ x: xs(i), y: ys(clamp(v, dom.min, dom.max)) }));
      const acc = polyLengths(pts);
      const gid = uid(ctx.el.id, ctx.seed, `g${si}`);
      const grad = s('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
      grad.append(
        s('stop', { offset: 0, 'stop-color': c, 'stop-opacity': 0.28 }),
        s('stop', { offset: 1, 'stop-color': c, 'stop-opacity': 0 }),
      );
      const defs = s('defs');
      defs.append(grad);
      const area = s('path', { fill: `url(#${gid})`, stroke: 'none' });
      const glow = s('path', {
        fill: 'none',
        stroke: c,
        'stroke-width': 14,
        opacity: 0.14,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
      const line = s('path', {
        fill: 'none',
        stroke: c,
        'stroke-width': 5,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
      svg.append(defs);
      if (p.area && si === 0) svg.append(area);
      svg.append(glow, line);
      const dots = p.points
        ? pts.map((q) => {
            const d = s('circle', {
              cx: q.x.toFixed(1),
              cy: q.y.toFixed(1),
              r: 0,
              fill: theme.colors.bg,
              stroke: c,
              'stroke-width': 4,
            });
            svg.append(d);
            return d;
          })
        : [];
      const head = s('circle', { r: 9, fill: c });
      svg.append(head);
      const endLab = numEl(
        'lc-end',
        `color:${c};font-size:${Math.round(fs * 1.1)}px;left:${pts[pts.length - 1].x}px;top:${pts[pts.length - 1].y}px`,
      );
      endLab.textContent = fmtNum(sr.values[sr.values.length - 1], f);
      root.append(endLab);
      return { pts, acc, area, glow, line, dots, head, endLab, at: itemAt(ctx, si, p.stagger, sr.at) };
    });
    return {
      update(t) {
        for (const v of views) {
          const k = progress(t, v.at, p.dur);
          const part = t >= v.at ? partialPolyline(v.pts, v.acc, k) : [v.pts[0]];
          const d = part.length > 1 ? pathD(part) : '';
          attr(v.line, 'd', d);
          attr(v.glow, 'd', d);
          attr(
            v.area,
            'd',
            part.length > 1
              ? `${d} L${part[part.length - 1].x.toFixed(2)} ${y1} L${part[0].x.toFixed(2)} ${y1} Z`
              : '',
          );
          const total = v.acc[v.acc.length - 1] || 1;
          v.dots.forEach((dot, i) => {
            const ti = v.at + (p.dur * v.acc[i]) / total;
            const r = t >= ti ? 7 * easeOutBack(2.4)(progress(t, ti, 0.25)) : 0;
            attr(dot, 'r', r.toFixed(2));
          });
          const tip = part[part.length - 1];
          const drawing = t >= v.at && k < 1;
          attr(v.head, 'cx', tip.x.toFixed(2));
          attr(v.head, 'cy', tip.y.toFixed(2));
          attr(v.head, 'opacity', drawing ? '1' : '0');
          const ek = t >= v.at + p.dur ? easeOutCubic(progress(t, v.at + p.dur, 0.35)) : 0;
          css(v.endLab, 'opacity', ek.toFixed(3));
          css(v.endLab, 'transform', `translate(-100%, ${(-150 + 20 * (1 - ek)).toFixed(1)}%)`);
        }
      },
    };
  },
};

// ------------------------------------------------------------------ donut-chart

export const donutChart: RuntimeComponent = {
  name: 'donut-chart',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const f: NumFmt = p;
    const segs = p.segments as { label: string; value: number; color?: string }[];
    const n = segs.length;
    const colors = palette(
      theme,
      p.color,
      n,
      segs.map((x) => x.color),
    );
    const sum = segs.reduce((a, b) => a + Math.max(0, b.value), 0) || 1;
    const total = Math.max(p.total ?? sum, sum);
    const rtl = textDir(p.label, ...segs.map((x) => x.label)) === 'rtl';
    const side = p.legend && W >= H * 1.45;
    const rowsBelow = p.legend && !side ? Math.ceil(n / 2) : 0;
    const legendH = rowsBelow * fs * 1.7;
    const D = Math.max(80, side ? Math.min(H, W * 0.5) - 12 : Math.min(W, H - legendH - 16) - 8);
    const cx = side ? mirrorX(D / 2 + 6, 0, W, rtl) : W / 2;
    const cy = side ? H / 2 : D / 2 + 4;
    const R = D / 2;
    const thick = R * p.thickness;
    const r = R - thick / 2;
    const svg = svgBox(W, H);
    root.append(svg);
    svg.append(
      s('circle', { cx, cy, r, fill: 'none', stroke: rgba(theme.colors.ink, 0.07), 'stroke-width': thick }),
    );
    const gap = n > 1 ? Math.min(0.006, 2 / (2 * Math.PI * r)) : 0;
    let cum = 0;
    const arcs = segs.map((sg, i) => {
      const frac = Math.max(0, sg.value) / total;
      const c = colors[i];
      const el = s('circle', {
        cx,
        cy,
        r,
        fill: 'none',
        stroke: c,
        'stroke-width': thick,
        transform: `rotate(-90 ${cx} ${cy})`,
        style: `filter:drop-shadow(0 0 10px ${rgba(c, 0.45)})`,
      });
      svg.append(el);
      const a = { el, from: cum, frac };
      cum += frac;
      return a;
    });
    const filled = cum;
    // center
    const inner = 2 * (R - thick) * 0.82;
    const center = h('div', {
      class: 'dc-center',
      style: `left:${cx - inner / 2}px;top:${cy - inner / 2}px;width:${inner}px;height:${inner}px`,
    });
    const big = h('div', { class: 'dc-val', 'data-fit': true, dir: 'ltr' });
    center.append(big);
    let cap: HTMLElement | undefined;
    if (p.label) {
      cap = textEl(theme, p.label, { cls: 'dc-cap', size: Math.round(fs * 0.85) });
      center.append(cap);
    }
    root.append(center);
    const bigSize = Math.min(inner * 0.36, fs * 2.6);
    big.textContent = p.value ?? fmtNum(sum, f);
    fitTo(big, inner, inner * 0.5, bigSize, 20);
    if (cap) fitTo(cap, inner * 0.92, fs * 1.4, Math.round(fs * 0.85), 14);
    // legend
    const pct = (x: number) => `${formatNumber((x / total) * 100, 0, false)}%`;
    const rowsData = segs.map((sg, i) => {
      const val = p.show === 'none' ? undefined : numEl('dc-lv', `color:${colors[i]}`);
      if (val) val.textContent = p.show === 'percent' ? pct(Math.max(0, sg.value)) : fmtNum(sg.value, f);
      return { label: sg.label, color: colors[i], value: val };
    });
    const rows: HTMLElement[] = [];
    if (p.legend) {
      const lw = side ? W - D - 60 : W;
      const lg = legend(theme, rowsData, {
        size: fs,
        column: side,
        style: side
          ? `position:absolute;top:50%;${rtl ? 'left' : 'right'}:0;width:${lw}px;transform:translateY(-50%)`
          : `position:absolute;left:0;right:0;top:${D + 24}px;display:grid;grid-template-columns:1fr 1fr;gap:${fs * 0.5}px ${fs}px`,
      });
      lg.el.dir = rtl ? 'rtl' : 'ltr';
      root.append(lg.el);
      rows.push(...lg.rows);
      for (const row of lg.rows) {
        const tx = row.querySelector<HTMLElement>('.rf-lg-t')!;
        fitTo(tx, (side ? lw : W / 2) - fs * 4.6, fs * 1.5, fs, 14);
      }
    }
    const start = ctx.el.enter.t + 0.1;
    return {
      update(t) {
        const k = easeInOutCubic(progress(t, start, p.dur));
        const head = k * filled;
        for (const a of arcs) ringArc(a.el, r, a.from, clamp(head - a.from, 0, Math.max(0, a.frac - gap)));
        if (p.value === undefined) text(big, fmtNum(sum * k, f));
        css(big, 'opacity', clamp(k * 3).toFixed(3));
        if (cap) css(cap, 'opacity', clamp(k * 2).toFixed(3));
        rows.forEach((row, i) =>
          reveal(row, t, start + p.dur * (arcs[i].from / (filled || 1)) * 0.85, { dy: 12, dur: 0.35 }),
        );
      },
    };
  },
};

// ------------------------------------------------------------------ stat-card

function trendIcon(up: boolean, size: number, color: string): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 12 12', width: size, height: size });
  svg.append(s('path', { d: up ? 'M6 2 11 10H1z' : 'M6 10 11 2H1z', fill: color }));
  return svg;
}

export const statCard: RuntimeComponent = {
  name: 'stat-card',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const rtl = textDir(p.label, p.sub) === 'rtl';
    const accent = resolve(p.accent);
    root.classList.add('rf-card');
    root.dir = rtl ? 'rtl' : 'ltr';
    root.style.boxShadow = `inset ${rtl ? -6 : 6}px 0 0 ${accent}, 0 24px 60px rgba(0,0,0,.35)`;
    const pad = Math.round(Math.min(W, H) * 0.12);
    root.style.padding = `${Math.round(pad * 0.8)}px ${pad}px`;
    const head = h('div', { class: 'sc-head' });
    if (p.icon)
      head.append(
        h('span', { class: 'sc-ic', style: `background:${rgba(accent, 0.14)}` }, icon(p.icon, 30, accent, 2)),
      );
    const lab = textEl(theme, p.label, { cls: 'sc-label' });
    head.append(lab);
    const f: NumFmt = p;
    const valWrap = h('div', { class: 'sc-val', 'data-fit': true, style: `color:${p.color}` });
    const val = numEl();
    valWrap.append(val);
    root.append(head, valWrap);
    let foot: HTMLElement | undefined;
    if (p.delta !== undefined || p.sub) {
      foot = h('div', { class: 'sc-foot' });
      if (p.delta !== undefined) {
        const d = p.delta;
        const up = typeof d === 'number' ? d >= 0 : !/^\s*[-−▼↓]/.test(d);
        const good = up === (p.good === 'up');
        const c = good ? theme.colors.lime : theme.colors.red;
        const txt =
          typeof d === 'number' ? `${d > 0 ? '+' : ''}${String(d).replace('-', '−')}${p.deltaSuffix}` : d;
        const pill = h(
          'span',
          { class: 'sc-delta', dir: 'ltr', style: `color:${c};background:${rgba(c, 0.14)}` },
          trendIcon(up, 18, c),
          txt,
        );
        foot.append(pill);
      }
      if (p.sub) foot.append(textEl(theme, p.sub, { cls: 'sc-sub' }));
      root.append(foot);
    }
    const innerW = W - 2 * pad;
    const kfs = p.keyframes as Kf[] | undefined;
    const widest = [p.value, p.from, ...(kfs ?? []).map((k) => k.value)]
      .map((v: number) => fmtNum(v, f))
      .sort((a, b) => b.length - a.length)[0];
    val.textContent = widest;
    const valH = H - pad * 1.6 - 50 - (foot ? 52 : 0);
    fitTo(valWrap, innerW, Math.max(40, valH), p.size, 28);
    fitTo(lab, innerW - (p.icon ? 60 : 0), 40, 26, 14);
    return {
      update(t) {
        const v = countValue(t, ctx.el.enter.t, p.dur, p.from, p.value, kfs);
        text(val, fmtNum(v, f));
        if (foot) reveal(foot, t, ctx.el.enter.t + p.dur * 0.7, { dy: 10, dur: 0.35 });
      },
    };
  },
};

// ------------------------------------------------------------------ progress-ring

export const progressRing: RuntimeComponent = {
  name: 'progress-ring',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const S = Math.min(W, H);
    const th = Math.min(p.thickness, S * 0.14);
    const R = S / 2 - th / 2 - 6;
    const cx = W / 2;
    const cy = H / 2;
    const c = resolve(p.color);
    const svg = svgBox(W, H);
    svg.append(
      s('circle', { cx, cy, r: R, fill: 'none', stroke: rgba(theme.colors.ink, 0.08), 'stroke-width': th }),
    );
    const arc = s('circle', {
      cx,
      cy,
      r: R,
      fill: 'none',
      stroke: c,
      'stroke-width': th,
      'stroke-linecap': 'round',
      transform: `rotate(-90 ${cx} ${cy})`,
      style: `filter:drop-shadow(0 0 14px ${rgba(c, 0.55)})`,
    });
    svg.append(arc);
    root.append(svg);
    const inner = (R - th / 2) * 2 * 0.8;
    const center = h('div', {
      class: 'pr-center',
      style: `left:${cx - inner / 2}px;top:${cy - inner / 2}px;width:${inner}px;height:${inner}px`,
    });
    const valWrap = h('div', { class: 'pr-val', 'data-fit': true });
    const val = numEl();
    valWrap.append(val);
    center.append(valWrap);
    let lab: HTMLElement | undefined;
    if (p.label) {
      lab = textEl(theme, p.label, { cls: 'pr-label' });
      center.append(lab);
    }
    root.append(center);
    const f: NumFmt = p;
    const kfs = p.keyframes as Kf[] | undefined;
    val.textContent = fmtNum(Math.max(p.max, p.value), f);
    fitTo(valWrap, inner, inner * 0.45, Math.round(S * 0.22), 20);
    if (lab) fitTo(lab, inner, S * 0.12, Math.round(S * 0.075), 14);
    return {
      update(t) {
        const v = countValue(t, ctx.el.enter.t, p.dur, p.from, p.value, kfs);
        ringArc(arc, R, 0, clamp(v / p.max));
        text(val, fmtNum(v, f));
      },
    };
  },
};

// ------------------------------------------------------------------ comparison

type Verdict = boolean | string | number;

export const comparison: RuntimeComponent = {
  name: 'comparison',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const rows = p.rows as { label: string; a: Verdict; b: Verdict; at?: number }[];
    const n = rows.length;
    const rtl = textDir(p.a.title, p.b.title, ...rows.map((r) => r.label)) === 'rtl';
    const accent = resolve(p.accent);
    const sides = { a: { ...p.a, c: resolve(p.a.color) }, b: { ...p.b, c: resolve(p.b.color) } } as Record<
      'a' | 'b',
      { title: string; icon?: string; c: string }
    >;
    const winner: 'a' | 'b' | undefined = typeof p.winner === 'string' ? p.winner : p.winner?.side;
    const labelW = W * 0.38;
    const colW = (W - labelW) / 2;
    const colX = { a: mirrorX(labelW, colW, W, rtl), b: mirrorX(labelW + colW, colW, W, rtl) };
    const labX = mirrorX(0, labelW, W, rtl);
    const topPad = winner ? Math.round(fs * 0.8) : 0;
    const headH = Math.round(fs * 2.6);
    const rowH = Math.min(fs * 3.2, (H - topPad - headH - 8) / n);
    // winner frame (behind everything)
    let frame: HTMLElement | undefined;
    let badge: HTMLElement | undefined;
    if (winner) {
      frame = h('div', {
        class: 'cmp-frame',
        style: `left:${colX[winner] + 6}px;top:${topPad}px;width:${colW - 12}px;height:${headH + rowH * n + 6}px;border-color:${accent};box-shadow:0 0 40px ${rgba(accent, 0.35)}, inset 0 0 40px ${rgba(accent, 0.08)}`,
      });
      badge = h(
        'div',
        {
          class: 'cmp-badge',
          dir: 'auto',
          style: `left:${colX[winner] + colW / 2}px;top:${topPad}px;background:${accent};color:${theme.colors.bg};font-size:${Math.round(fs * 0.62)}px`,
        },
        p.badge,
      );
      root.append(frame);
    }
    // header
    (['a', 'b'] as const).forEach((k) => {
      const sd = sides[k];
      const el = h('div', {
        class: 'cmp-head',
        style: `left:${colX[k] + 14}px;top:${topPad + 10}px;width:${colW - 28}px;height:${headH - 20}px;background:${rgba(sd.c, 0.14)};border-color:${rgba(sd.c, 0.6)};color:${sd.c}`,
      });
      if (sd.icon) el.append(icon(sd.icon, Math.round(fs * 1.05), sd.c, 2.2));
      const tt = textEl(theme, sd.title, { cls: 'cmp-ht', size: Math.round(fs * 1.05), weight: 800 });
      el.append(tt);
      root.append(el);
      fitTo(tt, colW - 40 - (sd.icon ? fs * 1.5 : 0), headH - 24, Math.round(fs * 1.05), 16);
    });
    const cell = (v: Verdict, k: 'a' | 'b', y: number) => {
      const el = h('div', {
        class: 'cmp-cell',
        style: `left:${colX[k]}px;width:${colW}px;top:${y}px;height:${rowH}px`,
      });
      if (typeof v === 'boolean') {
        const c = v ? theme.colors.lime : theme.colors.red;
        const sz = Math.round(Math.min(rowH * 0.62, fs * 1.6));
        el.append(
          h(
            'span',
            {
              class: 'cmp-mark',
              style: `width:${sz}px;height:${sz}px;background:${rgba(c, 0.16)};border-color:${rgba(c, 0.6)}`,
            },
            icon(v ? 'check' : 'x', sz * 0.62, c, 3),
          ),
        );
      } else {
        const tx = textEl(theme, String(v), { cls: 'cmp-v', size: fs, weight: 700 });
        el.append(tx);
        return { el, fit: tx };
      }
      return { el, fit: undefined };
    };
    const views = rows.map((r, i) => {
      const y = topPad + headH + i * rowH;
      const row = h('div', { class: 'cmp-row', style: `top:${y}px;height:${rowH}px` });
      const lab = textEl(theme, r.label, {
        cls: 'cmp-label',
        size: fs,
        style: `left:${labX + 16}px;width:${labelW - 32}px;top:${(rowH - fs * 1.4) / 2}px;text-align:${rtl ? 'right' : 'left'}`,
      });
      row.append(lab);
      const ca = cell(r.a, 'a', 0);
      const cb = cell(r.b, 'b', 0);
      row.append(ca.el, cb.el);
      root.append(row);
      fitTo(lab, labelW - 32, fs * 1.4, fs, 16);
      if (ca.fit) fitTo(ca.fit, colW - 28, rowH - 8, fs, 16);
      if (cb.fit) fitTo(cb.fit, colW - 28, rowH - 8, fs, 16);
      return { row, cells: { a: ca.el, b: cb.el }, at: itemAt(ctx, i, p.stagger, r.at) };
    });
    if (badge) root.append(badge);
    const lastAt = views[n - 1].at;
    const wAt = typeof p.winner === 'object' && typeof p.winner.at === 'number' ? p.winner.at : lastAt + 0.5;
    return {
      update(t) {
        for (const v of views) reveal(v.row, t, v.at, { dx: rtl ? 36 : -36, dur: 0.4 });
        if (frame && badge && winner) {
          const wk = reveal(frame, t, wAt, { s0: 0.94, dur: 0.45 });
          reveal(badge, t, wAt + 0.15, { s0: 0.5, dur: 0.4, base: 'translate(-50%, -50%)' });
          const loser = winner === 'a' ? 'b' : 'a';
          for (const v of views) css(v.cells[loser], 'opacity', (1 - 0.45 * wk).toFixed(3));
        }
      },
    };
  },
};

// ------------------------------------------------------------------ before-after

interface Panel {
  label: string;
  text?: string;
  src?: string;
  color: string;
}

export const beforeAfter: RuntimeComponent = {
  name: 'before-after',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const before = p.before as Panel;
    const after = p.after as Panel;
    const rtl = textDir(before.label, before.text, after.label, after.text) === 'rtl';
    root.classList.add('rf-card');
    const splitX = rtl ? W * (1 - p.split) : W * p.split;
    const startX = rtl ? 0 : W;
    // Region of each panel's content: before on the inline-start side.
    const regions = rtl
      ? { before: [splitX, W] as const, after: [0, splitX] as const }
      : { before: [0, splitX] as const, after: [splitX, W] as const };
    const layer = (pn: Panel, which: 'before' | 'after') => {
      const c = resolve(pn.color);
      const el = h('div', {
        class: `ba-layer ba-${which}`,
        style: `background:linear-gradient(160deg, ${rgba(c, 0.16)}, ${rgba(c, 0.03)} 70%), var(--card)`,
      });
      if (pn.src) el.append(h('img', { class: 'ba-img', src: ctx.asset(pn.src), alt: '' }));
      const [r0, r1] = regions[which];
      const rw = r1 - r0;
      const pad = 30;
      const chip = h(
        'div',
        {
          class: 'ba-chip',
          dir: 'auto',
          style: `top:${pad}px;${(which === 'before') !== rtl ? `left:${r0 + pad}px` : `right:${W - r1 + pad}px`};color:${c};border-color:${rgba(c, 0.6)};background:${rgba(theme.colors.bg, 0.7)}`,
        },
        pn.label,
      );
      el.append(chip);
      if (pn.text) {
        const tx = textEl(theme, pn.text, {
          cls: 'ba-text',
          size: p.fontSize,
          style: `left:${r0 + pad}px;width:${rw - 2 * pad}px;top:${pad + 70}px;height:${H - pad * 2 - 70}px`,
        });
        el.append(tx);
        root.append(el);
        fitTo(tx, rw - 2 * pad, H - pad * 2 - 70, p.fontSize, 18);
      } else root.append(el);
      return el;
    };
    layer(before, 'before');
    const afterEl = layer(after, 'after');
    const divider = h('div', { class: 'ba-div' });
    const knob = h('div', { class: 'ba-knob' });
    const chev = s('svg', { viewBox: '0 0 24 24', width: 34, height: 34 });
    chev.append(
      s('path', {
        d: 'M9 6 3 12l6 6M15 6l6 6-6 6',
        fill: 'none',
        stroke: theme.colors.bg,
        'stroke-width': 2.6,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }),
    );
    knob.append(chev);
    divider.append(knob);
    root.append(divider);
    const at = typeof p.at === 'number' ? p.at : ctx.el.enter.t + ctx.el.enter.dur + 0.3;
    return {
      update(t) {
        const k = easeInOutCubic(progress(t, at, p.dur));
        const x = startX + (splitX - startX) * k;
        css(
          afterEl,
          'clip-path',
          rtl ? `inset(0 ${(W - x).toFixed(2)}px 0 0)` : `inset(0 0 0 ${x.toFixed(2)}px)`,
        );
        css(divider, 'left', `${(x - 2).toFixed(2)}px`);
        const vis = t >= at ? clamp((t - at) / 0.15) : 0;
        css(divider, 'opacity', vis.toFixed(3));
        css(
          knob,
          'transform',
          `translate(-50%, -50%) scale(${(0.6 + 0.4 * easeOutBack(2)(progress(t, at, 0.4))).toFixed(4)})`,
        );
      },
    };
  },
};

// ------------------------------------------------------------------ ranking

export const ranking: RuntimeComponent = {
  name: 'ranking',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const f: NumFmt = p;
    const raw = p.items as { label: string; value: number; color?: string; icon?: string }[];
    const items = p.sort
      ? raw
          .map((x, i) => ({ x, i }))
          .sort((a, b) => b.x.value - a.x.value || a.i - b.i)
          .map((e) => e.x)
      : raw;
    const n = items.length;
    const rtl = textDir(...items.map((x) => x.label)) === 'rtl';
    root.dir = rtl ? 'rtl' : 'ltr';
    const max = p.max ?? Math.max(1e-9, ...items.map((x) => x.value));
    const base = resolve(p.color);
    const accent = resolve(p.accent);
    const rowH = H / n;
    const badge = Math.round(Math.min(rowH * 0.72, fs * 2.1));
    const barH = Math.round(clamp(rowH * 0.26, 10, 30));
    const views = items.map((it, r) => {
      const c = r === 0 ? accent : colorOr(it.color, base);
      const row = h('div', { class: 'rk-row', style: `height:${rowH}px;gap:${Math.round(fs * 0.7)}px` });
      const num = h(
        'div',
        {
          class: 'rk-num',
          style: `width:${badge}px;height:${badge}px;font-size:${Math.round(badge * 0.46)}px;color:${r === 0 ? theme.colors.bg : c};background:${r === 0 ? c : rgba(c, 0.14)};border-color:${rgba(c, 0.7)}`,
        },
        String(r + 1),
      );
      const body = h('div', { class: 'rk-body' });
      const line = h('div', { class: 'rk-line', style: `font-size:${fs}px` });
      if (it.icon) line.append(h('span', { class: 'rk-ic' }, icon(it.icon, Math.round(fs * 1.05), c, 2)));
      const lab = textEl(theme, it.label, { cls: 'rk-label', weight: 700 });
      const val = numEl('rk-val', `color:${c}`);
      line.append(lab);
      if (p.values) line.append(h('i', { class: 'rf-sp' }), val);
      const track = h('div', { class: 'rk-track', style: `height:${barH}px` });
      const fill = h('i', {
        class: 'rk-fill',
        style: `background:linear-gradient(${rtl ? 270 : 90}deg, ${rgba(c, 0.5)}, ${c});box-shadow:0 0 22px ${rgba(c, 0.4)}`,
      });
      track.append(fill);
      body.append(line, track);
      row.append(num, body);
      root.append(row);
      const seq = p.order === 'bottom-up' ? n - 1 - r : r;
      return { it, row, num, val, fill, lab, at: itemAt(ctx, seq, p.stagger) };
    });
    const trackW = W - badge - Math.round(fs * 0.7);
    for (const v of views) {
      v.val.textContent = fmtNum(v.it.value, f);
      fitTo(
        v.lab,
        trackW - (p.values ? v.val.offsetWidth + 20 : 0) - (v.it.icon ? fs * 1.6 : 0),
        fs * 1.5,
        fs,
        16,
      );
    }
    return {
      update(t) {
        for (const v of views) {
          reveal(v.row, t, v.at, { dx: rtl ? 30 : -30, dur: 0.35 });
          const g = easeOutCubic(progress(t, v.at + 0.1, p.dur));
          css(v.fill, 'width', `${(clamp(v.it.value / max) * g * 100).toFixed(3)}%`);
          text(v.val, fmtNum(v.it.value * g, f));
          const pop = t >= v.at ? easeOutBack(2.4)(progress(t, v.at, 0.35)) : 0;
          css(v.num, 'transform', `scale(${(0.5 + 0.5 * pop).toFixed(4)})`);
        }
      },
    };
  },
};
