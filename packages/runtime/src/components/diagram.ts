/** Diagram components: node, arrow, chip, icon, particles. */
import { mulberry32 } from '@reelforge/audio';
import { clamp, easeInOutCubic, easeOutBack, easeOutCubic, progress } from '../anim.js';
import { attr, css, h, s, text } from '../dom.js';
import { icon as iconSvg } from '../icons.js';
import { rgba, resolve } from '../color.js';
import type { RuntimeComponent } from '../types.js';
import { fontFor, statusColor } from './util.js';

export const node: RuntimeComponent = {
  name: 'node',
  mount(root, p, theme) {
    const titleEl = h('div', { class: 'n-title', dir: 'auto', 'data-fit': true });
    const subEl = h('div', { class: 'n-sub', dir: 'auto' });
    const top = h('div', { class: 'n-top' });
    let iconWrap: HTMLElement | undefined;
    if (p.icon) {
      iconWrap = h('span', { style: 'display:flex' });
      top.append(iconWrap);
    }
    top.append(titleEl);
    const dot = h('i', { class: 'n-dot' });
    const spin = h('i', { class: 'n-spin' });
    const badge = h('span', { class: 'n-badge' });
    root.append(top, subEl, dot, spin, badge);
    let lastIconColor = '';
    return {
      update(t, _l, st) {
        const status = String(st.status ?? p.status);
        const base = resolve(String(st.color ?? p.color));
        const c = status === 'idle' ? base : statusColor(theme, status, base);
        const since = st.$since.status ?? -1e9;
        const flash = status !== 'idle' && since > -1e9 ? 1 - clamp((t - since) / 0.7) : 0;
        text(titleEl, String(st.title ?? p.title));
        titleEl.style.fontFamily = fontFor(theme, String(st.title ?? p.title));
        const sub = st.sub ?? p.sub;
        text(subEl, sub === undefined ? '' : String(sub));
        css(subEl, 'display', sub === undefined ? 'none' : 'block');
        css(subEl, 'color', status === 'idle' ? theme.colors.dim : c);
        css(root, 'border-color', c);
        css(root, 'background', `linear-gradient(160deg, ${rgba(c, 0.13 + 0.12 * flash)}, ${rgba(theme.colors.card, 0.96)} 70%)`);
        css(root, 'box-shadow', `0 0 ${(40 + 50 * flash).toFixed(0)}px ${rgba(c, 0.22 + 0.4 * flash)}, inset 0 0 0 1px ${rgba(c, 0.25)}`);
        css(root, 'opacity', status === 'off' ? '0.45' : '1');
        css(root, 'transform', flash > 0 ? `scale(${(1 + 0.05 * Math.sin(Math.PI * (1 - flash))).toFixed(4)})` : 'none');
        const b = st.badge ?? p.badge;
        css(badge, 'display', b ? 'block' : 'none');
        if (b) {
          text(badge, String(b));
          css(badge, 'background', rgba(c, 0.2));
          css(badge, 'color', c);
        }
        css(dot, 'display', !b && status !== 'busy' && status !== 'idle' ? 'block' : 'none');
        css(dot, 'background', c);
        css(dot, 'box-shadow', `0 0 14px ${c}`);
        css(spin, 'display', !b && status === 'busy' ? 'block' : 'none');
        css(spin, 'border-top-color', c);
        css(spin, 'border-right-color', c);
        css(spin, 'transform', `rotate(${((t * 360 * 1.4) % 360).toFixed(1)}deg)`);
        if (iconWrap && lastIconColor !== c) {
          lastIconColor = c;
          iconWrap.replaceChildren(iconSvg(p.icon, 44, c, 2));
        }
      },
    };
  },
};

interface Pt {
  x: number;
  y: number;
}

/** Samples an arrow path as a polyline with cumulative lengths. */
export function samplePath(points: Pt[], route: string): { pts: Pt[]; acc: number[]; len: number; d: string } {
  let pts: Pt[];
  let d: string;
  if (route === 'curve' && points.length === 3) {
    const [a, c, b] = points;
    pts = [];
    for (let i = 0; i <= 40; i++) {
      const k = i / 40;
      pts.push({ x: (1 - k) ** 2 * a.x + 2 * (1 - k) * k * c.x + k * k * b.x, y: (1 - k) ** 2 * a.y + 2 * (1 - k) * k * c.y + k * k * b.y });
    }
    d = `M${a.x} ${a.y} Q${c.x} ${c.y} ${b.x} ${b.y}`;
  } else {
    pts = points;
    d = points.map((q, i) => `${i ? 'L' : 'M'}${q.x} ${q.y}`).join(' ');
  }
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, acc, len: acc[acc.length - 1] || 1, d };
}

export function pointAt(path: { pts: Pt[]; acc: number[]; len: number }, k: number): Pt & { angle: number } {
  const target = clamp(k) * path.len;
  let i = 1;
  while (i < path.acc.length - 1 && path.acc[i] < target) i++;
  const a = path.pts[i - 1];
  const b = path.pts[i];
  const seg = path.acc[i] - path.acc[i - 1] || 1;
  const f = (target - path.acc[i - 1]) / seg;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

function headPoints(tip: Pt, angle: number, size: number): string {
  const back = { x: tip.x - Math.cos(angle) * size, y: tip.y - Math.sin(angle) * size };
  const nx = -Math.sin(angle) * size * 0.55;
  const ny = Math.cos(angle) * size * 0.55;
  return `${tip.x},${tip.y} ${back.x + nx},${back.y + ny} ${back.x - nx},${back.y - ny}`;
}

export const arrow: RuntimeComponent = {
  name: 'arrow',
  handles: ['draw'],
  mount(root, p, theme, ctx) {
    const { w, h: hh } = ctx.box;
    const path = samplePath(p.points as Pt[], p.route);
    const svg = s('svg', { width: w, height: hh, viewBox: `0 0 ${w} ${hh}` });
    const maskId = `m-${ctx.el.id.replace(/[^\w-]/g, '')}-${ctx.seed % 100000}`;
    const mask = s('mask', { id: maskId, maskUnits: 'userSpaceOnUse', x: -50, y: -50, width: w + 100, height: hh + 100 });
    const maskPath = s('path', { d: path.d, fill: 'none', stroke: '#fff', 'stroke-width': p.width + 12, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    mask.append(maskPath);
    const defs = s('defs');
    defs.append(mask);
    const glow = s('path', { d: path.d, fill: 'none', 'stroke-width': p.width * 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.16 });
    const line = s('path', { d: path.d, fill: 'none', 'stroke-width': p.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    const g = s('g', { mask: `url(#${maskId})` });
    g.append(glow, line);
    const headEnd = s('polygon');
    const headStart = s('polygon');
    svg.append(defs, g, headEnd, headStart);
    root.append(svg);
    let labelEl: HTMLElement | undefined;
    const mid = pointAt(path, 0.5);
    if (p.label) {
      labelEl = h('div', { class: 'a-label', dir: 'auto', style: `left:${mid.x}px;top:${mid.y}px;font-family:${fontFor(theme, p.label, 'mono')}` }, p.label);
      root.append(labelEl);
    }
    const packets = (p.packets as { at: number; dur: number; color?: string; reverse: boolean; label?: string }[]).map((pk) => {
      const dot = h('i', { class: 'a-pk', style: 'display:none' });
      const lab = pk.label ? h('span', { class: 'a-pkl', style: 'display:none' }, pk.label) : undefined;
      root.append(dot);
      if (lab) root.append(lab);
      return { ...pk, dot, lab };
    });
    const hs = Math.max(16, p.width * 3.6);
    const drawing = ctx.el.enter.anim === 'draw';
    return {
      update(t, local, st) {
        const c = resolve(String(st.color ?? p.color));
        const dashed = Boolean(st.dashed ?? p.dashed);
        const k = drawing ? easeInOutCubic(local.enterRaw) : 1;
        attr(maskPath, 'stroke-dasharray', `${path.len} ${path.len}`);
        attr(maskPath, 'stroke-dashoffset', (path.len * (1 - k)).toFixed(2));
        attr(line, 'stroke', c);
        attr(glow, 'stroke', c);
        attr(line, 'stroke-dasharray', dashed ? `${p.width * 3} ${p.width * 2.6}` : 'none');
        attr(line, 'stroke-dashoffset', dashed ? (-(t * 60) % 1000).toFixed(1) : '0');
        const headK = clamp((k - 0.85) / 0.15);
        const end = pointAt(path, 1);
        const start = pointAt(path, 0);
        const showEnd = p.head === 'end' || p.head === 'both';
        const showStart = p.head === 'start' || p.head === 'both';
        attr(headEnd, 'points', headPoints(end, end.angle, hs));
        attr(headEnd, 'fill', c);
        attr(headEnd, 'opacity', showEnd ? headK.toFixed(3) : '0');
        const s0 = pointAt(path, 0.001);
        attr(headStart, 'points', headPoints(start, s0.angle + Math.PI, hs));
        attr(headStart, 'fill', c);
        attr(headStart, 'opacity', showStart ? headK.toFixed(3) : '0');
        if (labelEl) {
          const lk = easeOutBack(2)(progress(local.enterRaw, 0.45, 0.4));
          css(labelEl, 'opacity', clamp(lk).toFixed(3));
          css(labelEl, 'transform', `translate(-50%, -50%) scale(${(0.7 + 0.3 * lk).toFixed(4)})`);
          css(labelEl, 'color', c);
          css(labelEl, 'border-color', rgba(c, 0.6));
          if (st.label !== undefined) text(labelEl, String(st.label));
        }
        for (const pk of packets) {
          const active = t >= pk.at && t <= pk.at + pk.dur;
          css(pk.dot, 'display', active ? 'block' : 'none');
          if (pk.lab) css(pk.lab, 'display', active ? 'block' : 'none');
          if (!active) continue;
          const q = easeInOutCubic((t - pk.at) / pk.dur);
          const pt = pointAt(path, pk.reverse ? 1 - q : q);
          const pc = resolve(pk.color ?? c);
          const fade = Math.min(1, (t - pk.at) / 0.08, (pk.at + pk.dur - t) / 0.08);
          css(pk.dot, 'left', `${pt.x.toFixed(1)}px`);
          css(pk.dot, 'top', `${pt.y.toFixed(1)}px`);
          css(pk.dot, 'background', pc);
          css(pk.dot, 'box-shadow', `0 0 24px 6px ${rgba(pc, 0.7)}`);
          css(pk.dot, 'opacity', clamp(fade).toFixed(3));
          if (pk.lab) {
            css(pk.lab, 'left', `${pt.x.toFixed(1)}px`);
            css(pk.lab, 'top', `${pt.y.toFixed(1)}px`);
            css(pk.lab, 'color', pc);
          }
        }
      },
    };
  },
};

export const chip: RuntimeComponent = {
  name: 'chip',
  mount(root, p, theme, ctx) {
    const pill = h('div', { class: 'pill', style: `font-size:${p.size}px;font-family:${fontFor(theme, p.text, 'mono')}` });
    const label = h('span', { dir: 'auto', 'data-fit': true });
    let iconWrap: HTMLElement | undefined;
    if (p.icon) {
      iconWrap = h('span', { style: 'display:flex' });
      pill.append(iconWrap);
    }
    pill.append(label);
    const strike = h('i', { class: 'strike', style: 'display:none' });
    pill.append(strike);
    root.append(pill);
    const strikeAt = typeof p.strike === 'number' ? p.strike : p.strike === true ? ctx.el.enter.t + ctx.el.enter.dur : undefined;
    let lastC = '';
    return {
      update(t, _l, st) {
        const c = resolve(String(st.color ?? p.color));
        text(label, String(st.text ?? p.text));
        const variant = String(st.variant ?? p.variant);
        if (variant === 'solid') {
          css(pill, 'background', c);
          css(pill, 'border-color', c);
          css(pill, 'color', theme.colors.bg);
        } else if (variant === 'outline') {
          css(pill, 'background', 'transparent');
          css(pill, 'border-color', c);
          css(pill, 'color', c);
        } else {
          css(pill, 'background', rgba(c, 0.13));
          css(pill, 'border-color', rgba(c, 0.65));
          css(pill, 'color', c);
        }
        css(pill, 'box-shadow', `0 0 36px ${rgba(c, 0.25)}`);
        const sAt = st.strike === true ? st.$since.strike : st.strike === false ? undefined : strikeAt;
        const sk = sAt !== undefined && t >= sAt ? easeOutCubic(progress(t, sAt, 0.3)) : 0;
        css(strike, 'display', sk > 0 ? 'block' : 'none');
        css(strike, 'transform', `scaleX(${sk.toFixed(4)})`);
        css(strike, 'background', theme.colors.red);
        css(label, 'opacity', (1 - 0.45 * sk).toFixed(3));
        if (iconWrap && c !== lastC) {
          lastC = c;
          iconWrap.replaceChildren(iconSvg(p.icon, p.size * 1.1, variant === 'solid' ? theme.colors.bg : c, 2.2));
        }
      },
    };
  },
};

export const iconC: RuntimeComponent = {
  name: 'icon',
  mount(root, p, _theme, ctx) {
    const size = Math.min(p.size, ctx.box.w, ctx.box.h);
    const ring = h('i', { class: 'ring', style: `width:${size}px;height:${size}px;border-color:${p.color};display:none` });
    const wrap = h('div', { style: 'position:relative;display:flex' });
    if (p.src) wrap.append(h('img', { src: ctx.asset(p.src), width: size, height: size, alt: '' }));
    else wrap.append(iconSvg(p.name, size, p.color, 1.8));
    root.append(ring, wrap);
    return {
      update(t, local) {
        if (p.pulse) css(wrap, 'transform', `scale(${(1 + 0.05 * Math.sin(2 * Math.PI * 1.1 * local.since)).toFixed(4)})`);
        if (p.ring) {
          const k = ((local.since % 1.6) + 1.6) % 1.6 / 1.6;
          css(ring, 'display', 'block');
          css(ring, 'transform', `scale(${(0.8 + 0.9 * k).toFixed(4)})`);
          css(ring, 'opacity', ((1 - k) * 0.7).toFixed(3));
        }
        void t;
      },
    };
  },
};

interface Particle {
  ax: number;
  ay: number;
  vx: number;
  vy: number;
  delay: number;
  size: number;
  color: string;
  spin: number;
  phase: number;
  jitter: number;
}

export const particles: RuntimeComponent = {
  name: 'particles',
  mount(root, p, _theme, ctx) {
    const { w, h: hh } = ctx.box;
    const canvas = h('canvas', { width: w, height: hh });
    root.append(canvas);
    const c2d = canvas.getContext?.('2d') ?? null;
    const rand = mulberry32((ctx.seed ^ (p.seed * 2654435761)) >>> 0);
    const colors: string[] = (p.colors as string[] | undefined)?.map((c) => resolve(c)) ?? [resolve(p.color)];
    const from: Pt = p.from ?? (p.kind === 'herd' ? { x: 0, y: hh / 2 } : { x: w / 2, y: hh / 2 });
    const to: Pt = p.to ?? { x: w / 2, y: hh / 2 };
    const list: Particle[] = [];
    for (let i = 0; i < p.count; i++) {
      const ang = rand() * Math.PI * 2;
      const speed = 0.35 + rand() * 0.65;
      list.push({
        ax: (rand() * 2 - 1) * p.spread,
        ay: (rand() * 2 - 1) * p.spread,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        delay: rand(),
        size: p.size * (0.5 + rand() * 0.8),
        color: colors[Math.floor(rand() * colors.length)],
        spin: (rand() * 2 - 1) * 8,
        phase: rand() * Math.PI * 2,
        jitter: rand() * 2 - 1,
      });
    }
    const start = typeof p.at === 'number' ? p.at : ctx.el.enter.t;
    return {
      update(t) {
        if (!c2d) return;
        c2d.clearRect(0, 0, w, hh);
        const el = t - start;
        if (el < 0 && p.kind !== 'dust') return;
        for (const q of list) {
          let x = 0;
          let y = 0;
          let a = 1;
          let r = q.size / 2;
          switch (p.kind) {
            case 'burst':
            case 'confetti': {
              const k = el / p.dur;
              if (k > 1) continue;
              const dist = (p.kind === 'confetti' ? 620 : 520) * easeOutCubic(k);
              x = from.x + q.vx * dist;
              y = from.y + q.vy * dist + (p.kind === 'confetti' ? 900 * k * k : 260 * k * k);
              a = 1 - k ** 2;
              break;
            }
            case 'herd': {
              const d0 = q.delay * p.dur * 0.55;
              const k = (el - d0) / (p.dur * 0.45);
              if (k < 0) continue;
              const e = easeInOutCubic(Math.min(1, k));
              x = from.x + q.ax * 0.25 + (to.x - from.x) * e;
              y = from.y + q.ay + (to.y - from.y - q.ay) * e + Math.sin(q.phase + el * 9) * 6 * (1 - e);
              a = k > 1 ? Math.max(0, 1 - (k - 1) * 3) : 1;
              const tailX = x - (to.x - from.x) * 0.06 * (1 - e);
              const tailY = y - (to.y - from.y) * 0.06 * (1 - e);
              c2d.strokeStyle = rgba(q.color, 0.35 * a);
              c2d.lineWidth = r;
              c2d.beginPath();
              c2d.moveTo(tailX - 30 * (1 - e), tailY);
              c2d.lineTo(x, y);
              c2d.stroke();
              break;
            }
            case 'stream': {
              const k = (((el / p.dur + q.delay) % 1) + 1) % 1;
              x = from.x + (to.x - from.x) * k + q.ax * 0.15 * Math.sin(Math.PI * k);
              y = from.y + (to.y - from.y) * k + q.ay * 0.15 * Math.sin(Math.PI * k);
              a = Math.sin(Math.PI * k);
              break;
            }
            case 'dust': {
              x = (((q.delay * w + q.vx * 30 * t) % w) + w) % w;
              y = ((((q.phase / (Math.PI * 2)) * hh - 18 * t * (0.5 + q.delay)) % hh) + hh) % hh;
              a = 0.25 + 0.25 * Math.sin(q.phase + t * 1.7);
              r *= 0.5;
              break;
            }
          }
          c2d.globalAlpha = clamp(a);
          c2d.fillStyle = q.color;
          if (p.kind === 'confetti') {
            c2d.save();
            c2d.translate(x, y);
            c2d.rotate(q.spin * el);
            c2d.fillRect(-r, -r * 0.45, r * 2, r * 0.9);
            c2d.restore();
          } else {
            c2d.beginPath();
            c2d.arc(x, y, r, 0, Math.PI * 2);
            c2d.fill();
          }
        }
        c2d.globalAlpha = 1;
      },
    };
  },
};
