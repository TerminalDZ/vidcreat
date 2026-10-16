/** Place & movement components: map, route, floor-plan, building, container-stack. */
import { clamp, easeInOutCubic, easeOutBack, easeOutCubic, progress } from '../anim.js';
import { attr, css, h, s } from '../dom.js';
import { icon } from '../icons.js';
import { mix, resolve, rgba } from '../color.js';
import { WORLD } from '../data/world.js';
import { decodeRings, greatCircle, project, straightPath, VIEWS, type Bounds } from '../geo.js';
import type { RuntimeComponent } from '../types.js';
import {
  colorOr,
  contrastText,
  defId,
  drawStroke,
  fitWithin,
  flash,
  itemAt,
  mirrorX,
  palette,
  partialPolyline,
  pathD,
  polyLengths,
  reveal,
  smoothPath,
  svgBox,
  textDir,
  textEl,
  type Pt,
} from './chart.js';
import { keyframeValue } from './util.js';

type Kf = { at: number; value: number; dur?: number };

const VEHICLE_ICON: Record<string, string> = {
  truck: 'truck',
  ship: 'ship',
  plane: 'plane',
  ambulance: 'ambulance',
  train: 'train-front',
  car: 'car',
  bus: 'bus',
  bike: 'bike',
};
/** Vehicles drawn facing right, mirrored when they travel left. */
const FACING = new Set(['truck', 'ambulance', 'car', 'bus', 'bike']);

/** A round vehicle marker (icon on a colored disc) centred on its position. */
function vehicleMarker(name: string, size: number, c: string): { el: HTMLElement; glyph: HTMLElement } {
  const glyph = h(
    'span',
    { class: 'rf-veh-g' },
    icon(VEHICLE_ICON[name] ?? name, Math.round(size * 0.56), contrastText(c), 2.2),
  );
  const el = h(
    'div',
    {
      class: 'rf-veh',
      style: `width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;background:${c};box-shadow:0 0 0 ${Math.round(size * 0.12)}px ${rgba(c, 0.25)}, 0 8px 26px ${rgba(c, 0.45)}`,
    },
    glyph,
  );
  return { el, glyph };
}

/** Places a vehicle marker at the head of a partially drawn path (hidden when `show` is false). */
function moveMarker(m: { el: HTMLElement; glyph: HTMLElement }, part: Pt[], show: boolean, facing: boolean) {
  const tip = part[part.length - 1];
  const prev = part[Math.max(0, part.length - 2)];
  css(m.el, 'left', `${tip.x.toFixed(1)}px`);
  css(m.el, 'top', `${tip.y.toFixed(1)}px`);
  css(m.el, 'visibility', show ? 'visible' : 'hidden');
  if (facing) css(m.glyph, 'transform', tip.x < prev.x - 0.01 ? 'scaleX(-1)' : 'none');
}

// ------------------------------------------------------------------ map

type LonLat = { lon: number; lat: number };
interface MapPin extends LonLat {
  id?: string;
  label?: string;
  color?: string;
  at?: number;
}

export const map: RuntimeComponent = {
  name: 'map',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const world = p.view === 'world';
    const bounds: Bounds = typeof p.view === 'string' ? VIEWS[p.view] : p.view;
    const proj = project(bounds, W, H, world);
    const base = resolve(p.color);
    const accent = resolve(p.accent);
    const ink = theme.colors.ink;
    const svg = svgBox(W, H);
    root.append(svg);
    const clipId = defId(ctx, 'clip');
    const defs = s('defs');
    const clip = s('clipPath', { id: clipId });
    clip.append(s('rect', { x: 0, y: 0, width: W, height: H, rx: 24 }));
    defs.append(clip);
    svg.append(defs);
    const g = s('g', { 'clip-path': `url(#${clipId})` });
    svg.append(g);
    if (p.graticule) {
      const step = world ? 30 : 10;
      const d: string[] = [];
      for (let lon = Math.ceil(bounds.west / step) * step; lon <= bounds.east; lon += step) {
        const a = proj(lon, bounds.north);
        const b = proj(lon, bounds.south);
        d.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)}V${b.y.toFixed(1)}`);
      }
      for (let lat = Math.ceil(bounds.south / step) * step; lat <= bounds.north; lat += step) {
        const a = proj(bounds.west, lat);
        const b = proj(bounds.east, lat);
        d.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)}H${b.x.toFixed(1)}`);
      }
      g.append(
        s('path', {
          d: d.join(''),
          fill: 'none',
          stroke: rgba(ink, 0.08),
          'stroke-width': 1.5,
          'stroke-dasharray': '4 8',
        }),
      );
    }
    // countries to highlight, by alpha-2 or alpha-3 code
    const wanted = new Map<string, { color?: string; at?: number; i: number }>();
    (p.countries as (string | { code: string; color?: string; at?: number })[]).forEach((c, i) => {
      const spec = typeof c === 'string' ? { code: c } : c;
      wanted.set(spec.code.toUpperCase(), { color: spec.color, at: spec.at, i });
    });
    // Countries outside the view are skipped (with a margin, so coasts never pop at the edges).
    const margin = (bounds.east - bounds.west) * 0.15;
    const land: string[] = [];
    const lit: { el: SVGPathElement; c: string; at: number }[] = [];
    for (const c of WORLD) {
      const rings = decodeRings(c.d);
      const inView = rings.some((r) =>
        r.some(
          ([lon, lat]) =>
            lon >= bounds.west - margin &&
            lon <= bounds.east + margin &&
            lat >= bounds.south - margin &&
            lat <= bounds.north + margin,
        ),
      );
      if (!inView) continue;
      const d = rings
        .map(
          (r) =>
            `M${r
              .map(([lon, lat]) => {
                const q = proj(lon, lat);
                return `${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
              })
              .join('L')}Z`,
        )
        .join('');
      const hit = wanted.get(c.id) ?? (c.a2 ? wanted.get(c.a2) : undefined);
      if (hit) {
        const col = colorOr(hit.color, base);
        const el = s('path', { d, stroke: col, 'stroke-width': 2, 'stroke-linejoin': 'round' });
        lit.push({ el, c: col, at: hit.at ?? ctx.el.enter.t + 0.3 + hit.i * 0.12 });
      } else land.push(d);
    }
    g.append(
      s('path', {
        d: land.join(''),
        fill: rgba(ink, 0.1),
        stroke: rgba(ink, 0.24),
        'stroke-width': 1.2,
        'stroke-linejoin': 'round',
      }),
    );
    for (const l of lit) g.append(l.el);

    // pins
    const pins = p.pins as MapPin[];
    const byId = new Map<string, LonLat>();
    for (const pin of pins) if (pin.id) byId.set(pin.id, pin);
    const pinViews = pins.map((pin, i) => {
      const q = proj(pin.lon, pin.lat);
      const c = colorOr(pin.color, accent);
      const dot = h('div', {
        class: 'mp-pin',
        style: `left:${q.x.toFixed(1)}px;top:${q.y.toFixed(1)}px;background:${c};box-shadow:0 0 0 5px ${rgba(c, 0.25)}, 0 0 22px ${rgba(c, 0.8)}`,
      });
      const ring = h('i', {
        class: 'mp-ring',
        style: `left:${q.x.toFixed(1)}px;top:${q.y.toFixed(1)}px;border-color:${c}`,
      });
      root.append(ring, dot);
      let lab: HTMLElement | undefined;
      if (pin.label) {
        const maxW = W * 0.42;
        lab = textEl(theme, pin.label, { cls: 'mp-lab', size: fs, weight: 700 });
        lab.style.borderColor = rgba(c, 0.6);
        root.append(lab);
        fitWithin(lab, maxW - 28, fs * 1.5, fs, 14);
        const lw = Math.min(maxW, lab.offsetWidth || maxW);
        const lh = lab.offsetHeight || fs * 1.6;
        const above = q.y - lh - 22 >= 0;
        const x = clamp(q.x - lw / 2, 4, W - lw - 4);
        lab.style.left = `${x.toFixed(1)}px`;
        lab.style.top = `${(above ? q.y - lh - 20 : q.y + 20).toFixed(1)}px`;
      }
      return { dot, ring, lab, at: itemAt(ctx, i, p.stagger, pin.at) };
    });

    // routes between pins (or explicit lon/lat points)
    const pt = (v: string | LonLat): LonLat | undefined => (typeof v === 'string' ? byId.get(v) : v);
    const routes = (
      p.routes as {
        from: string | LonLat;
        to: string | LonLat;
        at?: number;
        dur: number;
        path: string;
        vehicle: string;
        dashed: boolean;
        color?: string;
      }[]
    ).flatMap((r, i) => {
      const a = pt(r.from);
      const b = pt(r.to);
      if (!a || !b) return [];
      const geoPts = r.path === 'straight' ? straightPath(a, b) : greatCircle(a, b);
      const pts = geoPts.map((q) => proj(q.lon, q.lat));
      const acc = polyLengths(pts);
      const c = colorOr(r.color, accent);
      // Dashed routes are drawn through a mask whose stroke grows, so the dash pattern stays put.
      const line = s('path', {
        d: pathD(pts),
        fill: 'none',
        stroke: r.dashed ? '#fff' : c,
        'stroke-width': r.dashed ? 12 : 4.5,
        'stroke-linecap': 'round',
        style: r.dashed ? undefined : `filter:drop-shadow(0 0 8px ${rgba(c, 0.6)})`,
      });
      let dash: SVGPathElement | undefined;
      if (r.dashed) {
        const mid = defId(ctx, `route${i}`);
        const mask = s('mask', {
          id: mid,
          maskUnits: 'userSpaceOnUse',
          x: -W,
          y: -H,
          width: 3 * W,
          height: 3 * H,
        });
        mask.append(line);
        defs.append(mask);
        dash = s('path', {
          d: pathD(pts),
          fill: 'none',
          stroke: c,
          'stroke-width': 4.5,
          'stroke-linecap': 'round',
          'stroke-dasharray': '10 10',
          mask: `url(#${mid})`,
        });
        svg.append(dash);
      } else svg.append(line);
      const marker = r.vehicle !== 'none' ? vehicleMarker(r.vehicle, Math.round(fs * 1.9), c) : undefined;
      if (marker) root.append(marker.el);
      return [{ r, pts, acc, line, dash, marker, at: itemAt(ctx, pins.length + i, p.stagger, r.at) }];
    });
    for (const pv of pinViews) {
      root.append(pv.ring, pv.dot);
      if (pv.lab) root.append(pv.lab);
    }
    for (const rt of routes) if (rt.marker) root.append(rt.marker.el);

    return {
      update(t) {
        for (const l of lit) {
          const k = t < l.at ? 0 : easeOutCubic(progress(t, l.at, 0.5));
          attr(l.el, 'fill', mix(theme.colors.card, l.c, 0.2 + 0.55 * k));
          attr(l.el, 'stroke-opacity', (0.3 + 0.7 * k).toFixed(3));
        }
        for (const pv of pinViews) {
          reveal(pv.dot, t, pv.at, { s0: 0.2, dur: 0.4, base: 'translate(-50%, -50%)' });
          if (pv.lab) reveal(pv.lab, t, pv.at + 0.12, { dy: 10, dur: 0.35 });
          const ph = t < pv.at ? 0 : (((t - pv.at) % 1.6) + 1.6) % 1.6;
          css(pv.ring, 'visibility', t >= pv.at ? 'visible' : 'hidden');
          css(pv.ring, 'transform', `translate(-50%, -50%) scale(${(1 + ph * 1.6).toFixed(3)})`);
          css(pv.ring, 'opacity', (t >= pv.at ? 0.8 * (1 - ph / 1.6) : 0).toFixed(3));
        }
        for (const rt of routes) {
          const k = t < rt.at ? 0 : easeInOutCubic(progress(t, rt.at, rt.r.dur));
          const total = rt.acc[rt.acc.length - 1];
          drawStroke(rt.line, total, k);
          if (rt.marker) {
            const part = partialPolyline(rt.pts, rt.acc, Math.max(0.001, k));
            // The vehicle stays at the destination once it arrives.
            moveMarker(rt.marker, part, t >= rt.at, FACING.has(rt.r.vehicle));
            css(rt.marker.el, 'opacity', '1');
          }
        }
      },
    };
  },
};

// ------------------------------------------------------------------ route

export const route: RuntimeComponent = {
  name: 'route',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const stops = p.stops as { label: string; sub?: string; x?: number; y?: number }[];
    const n = stops.length;
    const rtl = textDir(...stops.flatMap((x) => [x.label, x.sub])) === 'rtl';
    const base = resolve(p.color);
    const accent = resolve(p.accent);
    const markerSize = Math.round(Math.min(H * 0.24, fs * 2.4));
    const labelH = fs * 2.6;
    const padX = Math.max(markerSize * 0.7, Math.min(W / (n * 2), fs * 4));
    const midY = H / 2;
    const amp = Math.min(H / 2 - labelH - markerSize * 0.6, H * 0.14);
    const pts: Pt[] = stops.map((st, i) => {
      if (st.x !== undefined && st.y !== undefined) return { x: mirrorX(st.x * W, 0, W, rtl), y: st.y * H };
      const x = padX + ((W - 2 * padX) * i) / Math.max(1, n - 1);
      const y = i === 0 || i === n - 1 ? midY : midY + (i % 2 ? -1 : 1) * Math.max(0, amp);
      return { x: mirrorX(x, 0, W, rtl), y };
    });
    const path = p.curve ? smoothPath(pts, 20) : pts;
    const acc = polyLengths(path);
    const total = acc[acc.length - 1] || 1;
    // the length along the path where each stop sits
    const stopAt = pts.map((q) => {
      let best = 0;
      let bd = Infinity;
      path.forEach((r, i) => {
        const d = Math.hypot(r.x - q.x, r.y - q.y);
        if (d < bd) [bd, best] = [d, i];
      });
      return acc[best] / total;
    });
    const svg = svgBox(W, H);
    root.append(svg);
    const d = pathD(path);
    svg.append(
      s('path', {
        d,
        fill: 'none',
        stroke: rgba(theme.colors.ink, 0.28),
        'stroke-width': 5,
        'stroke-linecap': 'round',
        'stroke-dasharray': '1 14',
      }),
    );
    const done = s('path', {
      d,
      fill: 'none',
      stroke: base,
      'stroke-width': 7,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      style: `filter:drop-shadow(0 0 10px ${rgba(base, 0.55)})`,
    });
    svg.append(done);
    const views = stops.map((st, i) => {
      const q = pts[i];
      const end = i === 0 || i === n - 1;
      const dot = h('div', {
        class: 'rt-stop',
        style: `left:${q.x}px;top:${q.y}px;width:${end ? 30 : 22}px;height:${end ? 30 : 22}px`,
      });
      const below = st.x !== undefined ? q.y < H / 2 : q.y >= midY - 1;
      const bw = Math.min(W * 0.34, (W - 2 * padX) / Math.max(1, n - 1) + padX);
      const box = h('div', {
        class: 'rt-lab',
        style: `left:${clamp(q.x - bw / 2, 0, W - bw)}px;width:${bw}px;${below ? `top:${q.y + markerSize * 0.62}px` : `bottom:${H - q.y + markerSize * 0.62}px`}`,
      });
      const tt = textEl(theme, st.label, { size: fs, weight: 700 });
      box.append(tt);
      let sub: HTMLElement | undefined;
      if (st.sub) {
        sub = textEl(theme, st.sub, { cls: 'rt-sub', size: Math.round(fs * 0.68) });
        box.append(sub);
      }
      root.append(dot, box);
      fitWithin(tt, bw, fs * 1.4, fs, 14);
      if (sub) fitWithin(sub, bw, fs, Math.round(fs * 0.68), 12);
      return { dot, box, end, frac: stopAt[i] };
    });
    const marker = vehicleMarker(p.vehicle, markerSize, accent);
    root.append(marker.el);
    const kfs = p.progress as Kf[] | undefined;
    const start = ctx.el.enter.t + ctx.el.enter.dur;
    const progressAt = (t: number) =>
      kfs ? clamp(keyframeValue(kfs, t, 0, easeInOutCubic, 1)) : easeInOutCubic(progress(t, start, p.dur));
    // time each stop is reached (for its flash): first frame at which progress passes it
    return {
      update(t) {
        const k = progressAt(t);
        drawStroke(done, total, k);
        attr(done, 'opacity', k > 0.001 ? '1' : '0');
        const part = partialPolyline(path, acc, Math.max(0.0005, k));
        moveMarker(marker, part, t >= ctx.el.enter.t, FACING.has(p.vehicle));
        views.forEach((v, i) => {
          const reached = k >= v.frac - 1e-3;
          reveal(v.box, t, ctx.el.enter.t + 0.1 + i * 0.12, { dy: 10, dur: 0.35 });
          css(v.dot, 'background', reached ? base : theme.colors.card);
          css(v.dot, 'border-color', reached ? base : rgba(theme.colors.ink, 0.45));
          css(v.dot, 'box-shadow', reached ? `0 0 18px ${rgba(base, 0.7)}` : 'none');
        });
      },
    };
  },
};

// ------------------------------------------------------------------ floor-plan

interface Room {
  id?: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  icon?: string;
  color?: string;
}

/** The highlight active at t: the latest one started and not yet ended. */
function activeHighlight<T extends { at: number; until?: number }>(hs: T[], t: number): T | undefined {
  let cur: T | undefined;
  for (const x of hs)
    if (x.at <= t && (x.until === undefined || t < x.until) && (!cur || x.at >= cur.at)) cur = x;
  return cur;
}

export const floorPlan: RuntimeComponent = {
  name: 'floor-plan',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const rooms = p.rooms as Room[];
    const rtl = textDir(...rooms.map((r) => r.label)) === 'rtl';
    // the outer wall is drawn 6 px outside the grid: keep it inside the box
    const unit = Math.min((W - 14) / p.cols, (H - 14) / p.rows);
    const ox = (W - unit * p.cols) / 2;
    const oy = (H - unit * p.rows) / 2;
    const base = resolve(p.color);
    const accent = resolve(p.accent);
    root.append(
      h('div', {
        class: 'fp-wall',
        style: `left:${ox - 6}px;top:${oy - 6}px;width:${unit * p.cols + 12}px;height:${unit * p.rows + 12}px`,
      }),
    );
    const views = rooms.map((r, i) => {
      const c = colorOr(r.color, base);
      const x = ox + mirrorX(r.x * unit, r.w * unit, unit * p.cols, rtl);
      const y = oy + r.y * unit;
      const w = r.w * unit;
      const hh = r.h * unit;
      const el = h('div', {
        class: 'fp-room',
        style: `left:${x + 3}px;top:${y + 3}px;width:${w - 6}px;height:${hh - 6}px`,
      });
      const size = Math.round(Math.min(fs, hh * 0.3, w * 0.22));
      const showIcon = r.icon && hh > size * 3.4;
      if (showIcon) el.append(h('span', { class: 'fp-ic' }, icon(r.icon!, Math.round(size * 1.5), c, 2)));
      const lab = textEl(theme, r.label, { cls: 'fp-lab', size, weight: 700 });
      el.append(lab);
      root.append(el);
      fitWithin(lab, w - 22, size * 1.5, size, 11);
      return { r, el, c, at: itemAt(ctx, i, p.stagger) };
    });
    const hs = (p.highlights as { at: number; room: string; until?: number; color?: string }[])
      .slice()
      .sort((a, b) => a.at - b.at);
    return {
      update(t) {
        const cur = activeHighlight(hs, t);
        const target = cur ? views.find((v) => v.r.id === cur.room || v.r.label === cur.room) : undefined;
        for (const v of views) {
          reveal(v.el, t, v.at, { s0: 0.92, dur: 0.4 });
          const on = v === target;
          const c = on ? colorOr(cur?.color, accent) : v.c;
          const fl = on && cur ? flash(t, cur.at, 0.8) : 0;
          css(v.el, 'border-color', on ? c : rgba(c, 0.55));
          css(v.el, 'background', rgba(c, on ? 0.24 + 0.2 * fl : 0.07));
          css(
            v.el,
            'box-shadow',
            on ? `0 0 ${(30 + 40 * fl).toFixed(0)}px ${rgba(c, 0.45)}, inset 0 0 0 2px ${c}` : 'none',
          );
          css(v.el, 'color', on ? c : theme.colors.ink);
          css(v.el, 'filter', target && !on ? 'saturate(0.6) brightness(0.85)' : 'none');
        }
      },
    };
  },
};

// ------------------------------------------------------------------ building

export const building: RuntimeComponent = {
  name: 'building',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const floors = p.floors as { label: string; sub?: string; icon?: string; color?: string }[];
    const n = floors.length;
    const rtl = textDir(...floors.flatMap((f) => [f.label, f.sub])) === 'rtl';
    const base = resolve(p.color);
    const accent = resolve(p.accent);
    const hs = (p.highlights as { at: number; floor: number; until?: number }[])
      .slice()
      .sort((a, b) => a.at - b.at);
    const shaft = hs.length ? 34 : 0;
    const roofH = Math.min(70, H * 0.09);
    const groundH = 14;
    const gap = 6;
    const fh = (H - roofH - groundH - gap * (n - 1)) / n;
    const bx = shaft ? shaft + 10 : 0;
    const bw = W - bx;
    // roof and ground line
    const svg = svgBox(W, H);
    root.append(svg);
    const rx0 = mirrorX(bx, bw, W, rtl);
    svg.append(
      s('path', {
        d: `M${rx0 + 10} ${roofH - 4}L${rx0 + bw * 0.5} 6L${rx0 + bw - 10} ${roofH - 4}Z`,
        fill: rgba(base, 0.14),
        stroke: rgba(base, 0.7),
        'stroke-width': 3,
        'stroke-linejoin': 'round',
      }),
      s('line', {
        x1: 0,
        x2: W,
        y1: H - groundH / 2,
        y2: H - groundH / 2,
        stroke: rgba(theme.colors.ink, 0.35),
        'stroke-width': 4,
        'stroke-linecap': 'round',
      }),
    );
    const numW = p.numbers ? Math.round(Math.min(fh * 0.7, fs * 2)) : 0;
    const views = floors.map((f, i) => {
      const c = colorOr(f.color, base);
      const y = H - groundH - (i + 1) * fh - i * gap;
      const el = h('div', {
        class: 'bd-floor',
        dir: rtl ? 'rtl' : 'ltr',
        style: `left:${rx0}px;top:${y}px;width:${bw}px;height:${fh}px`,
      });
      let num: HTMLElement | undefined;
      if (p.numbers) {
        num = h(
          'span',
          {
            class: 'bd-num rf-num',
            style: `width:${numW}px;height:${numW}px;font-size:${Math.round(numW * 0.46)}px`,
          },
          i === 0 ? p.ground : String(i),
        );
        el.append(num);
      }
      const size = Math.round(Math.min(fs, fh * 0.4));
      const body = h('div', { class: 'bd-body' });
      const lab = textEl(theme, f.label, { size, weight: 700 });
      body.append(lab);
      let sub: HTMLElement | undefined;
      if (f.sub && fh > size * 2.4) {
        sub = textEl(theme, f.sub, { cls: 'bd-sub', size: Math.round(size * 0.66) });
        body.append(sub);
      }
      el.append(body);
      const iconS = Math.round(Math.min(fh * 0.5, fs * 1.4));
      if (f.icon) el.append(h('span', { class: 'bd-ic' }, icon(f.icon, iconS, c, 2)));
      else {
        const win = h('span', { class: 'bd-win' });
        for (let k = 0; k < 3; k++)
          win.append(h('i', { style: `width:${iconS * 0.5}px;height:${iconS * 0.7}px` }));
        el.append(win);
      }
      root.append(el);
      const tw = bw - numW - iconS * 2 - 60;
      fitWithin(lab, tw, size * 1.4, size, 12);
      if (sub) fitWithin(sub, tw, size, Math.round(size * 0.66), 11);
      return { el, num, c, at: ctx.el.enter.t + i * p.stagger };
    });
    let car: HTMLElement | undefined;
    const carH = Math.min(fh - 8, 44);
    const sx = mirrorX(0, shaft, W, rtl);
    const floorY = (f: number) => H - groundH - (f + 1) * fh - f * gap + fh / 2;
    if (shaft) {
      root.append(
        h('div', {
          class: 'bd-shaft',
          style: `left:${sx}px;width:${shaft}px;top:${roofH}px;bottom:${groundH}px`,
        }),
      );
      car = h('div', { class: 'bd-car', style: `left:${sx + 5}px;width:${shaft - 10}px;height:${carH}px` });
      root.append(car);
    }
    const kfs: Kf[] = hs.map((x) => ({ at: x.at, value: clamp(x.floor, 0, n - 1), dur: 0.6 }));
    return {
      update(t) {
        const cur = activeHighlight(hs, t);
        const active = cur ? clamp(cur.floor, 0, n - 1) : -1;
        views.forEach((v, i) => {
          reveal(v.el, t, v.at, { dy: 24, dur: 0.4 });
          const on = i === active;
          const fl = on && cur ? flash(t, cur.at + 0.5, 0.8) : 0;
          const c = on ? accent : v.c;
          css(v.el, 'border-color', on ? c : rgba(c, 0.45));
          css(
            v.el,
            'background',
            `linear-gradient(90deg, ${rgba(c, on ? 0.26 + 0.2 * fl : 0.1)}, ${rgba(theme.colors.card, 0.96)} 80%)`,
          );
          css(v.el, 'box-shadow', on ? `0 0 ${(28 + 36 * fl).toFixed(0)}px ${rgba(c, 0.45)}` : 'none');
          if (v.num) {
            css(v.num, 'background', on ? c : rgba(c, 0.16));
            css(v.num, 'color', on ? contrastText(c) : c);
          }
        });
        if (car) {
          const f = kfs.length ? keyframeValue(kfs, t, kfs[0].value, easeInOutCubic) : 0;
          css(car, 'top', `${(floorY(f) - carH / 2).toFixed(1)}px`);
          css(car, 'opacity', t >= (hs[0]?.at ?? 0) - 0.3 ? '1' : '0');
          css(car, 'background', active >= 0 ? accent : rgba(theme.colors.ink, 0.4));
        }
      },
    };
  },
};

// ------------------------------------------------------------------ container-stack

export const containerStack: RuntimeComponent = {
  name: 'container-stack',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const items = p.containers as { code: string; label?: string; color?: string; at?: number }[];
    const n = items.length;
    const cols = Math.min(p.cols, n);
    const rows = Math.ceil(n / cols);
    const gap = 10;
    const cw = (W - gap * (cols - 1)) / cols;
    const ch = Math.min(cw * 0.42, (H - gap * (rows - 1)) / rows);
    const colors = palette(
      theme,
      p.color,
      n,
      items.map((x) => x.color),
    );
    const accent = resolve(p.accent);
    const views = items.map((it, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = col * (cw + gap);
      const y = H - (row + 1) * ch - row * gap;
      const c = colors[i];
      const txt = contrastText(c);
      const el = h('div', {
        class: 'cs-box',
        style: `left:${x}px;top:${y}px;width:${cw}px;height:${ch}px;background:repeating-linear-gradient(90deg, ${c} 0 ${Math.max(6, cw / 18)}px, ${mix(c, '#000000', 0.16)} ${Math.max(6, cw / 18)}px ${Math.max(9, cw / 12)}px);color:${txt}`,
      });
      const plate = h('div', {
        class: 'cs-plate',
        style: `background:${rgba(mix(c, '#000000', 0.25), 0.55)}`,
      });
      const size = Math.round(Math.min(fs, ch * 0.3, cw * 0.11));
      const code = textEl(theme, it.code, {
        cls: 'cs-code',
        size,
        weight: 800,
        kind: 'mono',
        color: '#ffffff',
      });
      plate.append(code);
      if (it.label) {
        const lab = textEl(theme, it.label, {
          cls: 'cs-lab',
          size: Math.round(size * 0.75),
          color: '#ffffff',
        });
        plate.append(lab);
      }
      el.append(plate);
      root.append(el);
      fitWithin(code, cw - 34, size * 1.4, size, 10);
      for (const t of plate.querySelectorAll<HTMLElement>('.cs-lab'))
        fitWithin(t, cw - 34, size, Math.round(size * 0.75), 9);
      return { el, c, at: itemAt(ctx, i, p.stagger, it.at) };
    });
    const fIndex = typeof p.focus === 'number' ? p.focus : p.focus?.index;
    const fAt =
      typeof p.focus === 'object' && typeof p.focus.at === 'number'
        ? p.focus.at
        : (views[n - 1]?.at ?? ctx.el.enter.t) + 0.6;
    return {
      update(t) {
        const fk = fIndex !== undefined && fIndex < n && t >= fAt ? easeOutCubic(progress(t, fAt, 0.4)) : 0;
        views.forEach((v, i) => {
          const vis = t >= v.at;
          const k = vis ? easeOutBack(1.4)(progress(t, v.at, 0.45)) : 0;
          const focused = i === fIndex;
          const lift = focused ? -10 * fk : 0;
          css(v.el, 'visibility', vis ? 'visible' : 'hidden');
          css(v.el, 'opacity', vis ? clamp(k * 3).toFixed(3) : '0');
          css(v.el, 'transform', `translateY(${((1 - k) * -90 + lift).toFixed(2)}px)`);
          css(
            v.el,
            'filter',
            fIndex !== undefined && !focused && fk > 0
              ? `brightness(${(1 - 0.35 * fk).toFixed(3)}) saturate(${(1 - 0.4 * fk).toFixed(3)})`
              : 'none',
          );
          css(
            v.el,
            'box-shadow',
            focused && fk > 0
              ? `0 0 0 ${(4 * fk).toFixed(1)}px ${accent}, 0 0 ${(40 * fk).toFixed(0)}px ${rgba(accent, 0.6)}`
              : '0 6px 18px rgba(0,0,0,.25)',
          );
        });
      },
    };
  },
};
