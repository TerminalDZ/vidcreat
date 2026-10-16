/**
 * Media & text components: image, logo, kinetic-text, bullet-list, callout, spotlight, split-screen,
 * pricing-table, qr-code, rating, and the vitals monitor.
 */
import { clamp, easeInOutCubic, easeInOutSine, easeOutBack, easeOutCubic, progress } from '../anim.js';
import { attr, css, h, s, text } from '../dom.js';
import { icon } from '../icons.js';
import { resolve, rgba } from '../color.js';
import { encodeQr } from '../qr.js';
import type { RuntimeComponent } from '../types.js';
import {
  arrowHead,
  colorOr,
  contrastText,
  defId,
  drawStroke,
  fitWithin,
  fmtNum,
  itemAt,
  lifetime,
  mirrorX,
  numEl,
  reveal,
  svgBox,
  textDir,
  textEl,
  type Pt,
} from './chart.js';
import { fitText, fontFor, keyframeValue, parseAccent } from './util.js';

// ------------------------------------------------------------------ image

export const image: RuntimeComponent = {
  name: 'image',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    root.style.borderRadius = `${p.radius}px`;
    const img = h('img', { class: 'im-img', src: ctx.asset(p.src), alt: '', style: `object-fit:${p.fit}` });
    root.append(h('div', { class: 'im-frame' }, img));
    let cap: HTMLElement | undefined;
    if (p.caption) {
      const fs = Math.round(Math.min(40, H * 0.07));
      const band = h('div', { class: 'im-cap', style: `padding:${fs * 1.6}px ${fs}px ${fs * 0.7}px` });
      cap = textEl(theme, p.caption, { size: fs, weight: 700, color: '#ffffff' });
      band.append(cap);
      root.append(band);
      fitWithin(cap, W - fs * 2, fs * 1.4, fs, 14);
    }
    const life = lifetime(ctx);
    const dir: Record<string, [number, number]> = {
      center: [0, 0],
      left: [1, 0],
      right: [-1, 0],
      up: [0, 1],
      down: [0, -1],
    };
    const [dx, dy] = dir[p.pan] ?? [0, 0];
    return {
      update(t) {
        if (!p.kenburns) return;
        const k = easeInOutSine(progress(t, life.start, life.end - life.start));
        const sc = 1 + (p.zoom - 1) * k;
        // the pan never shows an edge: it stays within the margin the zoom has created
        const tx = p.fit === 'cover' ? ((dx * (sc - 1)) / 2) * W * (2 * k - 1) * 0.9 : 0;
        const ty = p.fit === 'cover' ? ((dy * (sc - 1)) / 2) * H * (2 * k - 1) * 0.9 : 0;
        css(img, 'transform', `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${sc.toFixed(5)})`);
      },
    };
  },
};

// ------------------------------------------------------------------ logo

export const logo: RuntimeComponent = {
  name: 'logo',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const accent = resolve(p.accent);
    const tagFs = Math.round(Math.min(30, H * 0.13));
    const tagH = p.tagline ? tagFs * 1.8 : 0;
    let tag: HTMLElement | undefined;
    if (p.src) {
      root.append(
        h('img', { class: 'lg-img', src: ctx.asset(p.src), alt: '', style: `height:${H - tagH}px` }),
      );
    } else {
      const row = h('div', { class: 'lg-row', style: `height:${H - tagH}px` });
      const size = Math.min(p.size, (H - tagH) * 0.8);
      if (p.icon) {
        const mk = h('span', {
          class: 'lg-mark',
          style: `width:${size * 1.05}px;height:${size * 1.05}px;background:${accent};box-shadow:0 0 30px ${rgba(accent, 0.45)}`,
        });
        mk.append(icon(p.icon, Math.round(size * 0.62), contrastText(accent), 2.2));
        row.append(mk);
      }
      const word = h('span', {
        class: 'lg-word',
        dir: 'auto',
        'data-fit': true,
        style: `color:${resolve(p.color)};font-family:${fontFor(theme, p.text)}`,
      });
      for (const seg of parseAccent(p.text))
        word.append(
          seg.accent ? h('span', { style: `color:${accent}` }, seg.text) : document.createTextNode(seg.text),
        );
      row.append(word);
      root.append(row);
      fitWithin(word, W - (p.icon ? size * 1.35 : 0), H - tagH, size, 18);
    }
    if (p.tagline) {
      tag = textEl(theme, p.tagline, { cls: 'lg-tag', size: tagFs, style: `height:${tagH}px` });
      root.append(tag);
      fitWithin(tag, W, tagH, tagFs, 12);
    }
    return {
      update(t) {
        if (tag) reveal(tag, t, ctx.el.enter.t + ctx.el.enter.dur * 0.8, { dy: 10, dur: 0.4 });
      },
    };
  },
};

// ------------------------------------------------------------------ kinetic-text

export const kineticText: RuntimeComponent = {
  name: 'kinetic-text',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const accent = resolve(p.accent);
    const ink = resolve(p.color);
    const words = parseAccent(p.text).flatMap((seg) =>
      seg.text
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => ({ w, accent: seg.accent })),
    );
    const rtl = textDir(p.text) === 'rtl';
    const wrap = h('div', {
      class: `kt-wrap kt-${p.style}`,
      dir: rtl ? 'rtl' : 'ltr',
      'data-fit': true,
      style: `width:${W}px;justify-content:${p.align === 'center' ? 'center' : p.align === 'left' ? 'flex-start' : 'flex-end'};font-weight:${p.weight};font-family:${fontFor(theme, p.text)}`,
    });
    const beats = (p.beats as { at: number }[]).map((b) => b.at);
    const views = words.map((x, i) => {
      const el = h('span', { class: 'kt-w' });
      const hl = h('i', { class: 'kt-hl', style: `background:${accent};box-shadow:0 0 0 0.09em ${accent}` });
      const tx = h('span', { class: 'kt-t' }, x.w);
      el.append(hl, tx);
      wrap.append(el);
      const last = beats.length - 1;
      const at =
        i < beats.length
          ? beats[i]
          : last >= 0
            ? beats[last] + (i - last) * p.stagger
            : ctx.el.enter.t + i * p.stagger;
      return { el, hl, tx, accent: x.accent, at };
    });
    root.append(wrap);
    fitText(wrap, W, H - 6, p.size ?? Math.round(Math.min(150, H * 0.42)), 20);
    return {
      update(t) {
        for (const v of views) {
          const vis = t >= v.at;
          const raw = vis ? progress(t, v.at, 0.4) : 0;
          if (p.style === 'highlight') {
            css(v.el, 'opacity', vis ? '1' : '0.22');
            css(v.tx, 'color', v.accent && vis ? contrastText(accent) : ink);
            const hk = v.accent && vis ? easeOutCubic(raw) : 0;
            css(v.hl, 'transform', `scaleX(${hk.toFixed(4)})`);
            css(v.hl, 'transform-origin', rtl ? '100% 50%' : '0 50%');
            css(v.el, 'transform', 'none');
            continue;
          }
          css(v.tx, 'color', v.accent ? accent : ink);
          css(v.hl, 'transform', 'scaleX(0)');
          css(v.el, 'visibility', vis ? 'visible' : 'hidden');
          css(v.el, 'opacity', vis ? clamp(raw * 2.2).toFixed(3) : '0');
          if (p.style === 'pop') {
            const k = easeOutBack(2.4)(raw);
            css(v.el, 'transform', raw >= 1 ? 'none' : `scale(${(0.3 + 0.7 * k).toFixed(4)})`);
          } else {
            const k = easeOutCubic(raw);
            css(v.el, 'transform', raw >= 1 ? 'none' : `translateY(${((1 - k) * 0.7).toFixed(4)}em)`);
          }
        }
      },
    };
  },
};

// ------------------------------------------------------------------ bullet-list

export const bulletList: RuntimeComponent = {
  name: 'bullet-list',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const items = (p.items as (string | { text: string; sub?: string; icon?: string; at?: number })[]).map(
      (x) => (typeof x === 'string' ? { text: x } : x),
    );
    const n = items.length;
    const rtl = textDir(p.title, ...items.flatMap((x) => [x.text, x.sub])) === 'rtl';
    const c = resolve(p.color);
    root.dir = rtl ? 'rtl' : 'ltr';
    let top = 0;
    if (p.title) {
      const tt = textEl(theme, p.title, { cls: 'bl-title', size: Math.round(fs * 0.62) });
      root.append(tt);
      fitWithin(tt, W, fs, Math.round(fs * 0.62), 12);
      top = Math.round(fs * 1.3);
    }
    const hasSub = items.some((x) => x.sub);
    const rowH = Math.min(fs * (hasSub ? 2.7 : 1.9), (H - top) / n);
    const size = Math.round(Math.min(fs, rowH * (hasSub ? 0.42 : 0.6)));
    const mk = Math.round(size * 1.15);
    top += Math.max(0, (H - top - n * rowH) / 2);
    const views = items.map((it, i) => {
      const row = h('div', {
        class: 'bl-row',
        style: `top:${top + i * rowH}px;height:${rowH}px;gap:${Math.round(size * 0.6)}px`,
      });
      const m = h('span', { class: `bl-mk ${p.marker}`, style: `width:${mk}px;height:${mk}px` });
      if (p.marker === 'dot')
        m.append(
          h('i', {
            style: `width:${mk * 0.42}px;height:${mk * 0.42}px;background:${c};box-shadow:0 0 14px ${rgba(c, 0.7)}`,
          }),
        );
      else if (p.marker === 'dash')
        m.append(h('i', { style: `width:${mk * 0.7}px;height:${Math.max(4, mk * 0.14)}px;background:${c}` }));
      else if (p.marker === 'number') {
        m.style.cssText += `;border:3px solid ${c};color:${c};font-size:${Math.round(mk * 0.5)}px`;
        m.textContent = String(i + 1);
      } else {
        m.style.cssText += `;background:${rgba(c, 0.16)}`;
        m.append(icon(p.marker === 'check' ? 'check' : (it.icon ?? 'check'), Math.round(mk * 0.64), c, 2.6));
      }
      const body = h('div', { class: 'bl-body' });
      const tx = textEl(theme, it.text, { size, weight: 700 });
      body.append(tx);
      let sub: HTMLElement | undefined;
      if (it.sub) {
        sub = textEl(theme, it.sub, { cls: 'bl-sub', size: Math.round(size * 0.66) });
        body.append(sub);
      }
      row.append(m, body);
      root.append(row);
      const bw = W - mk - size * 0.6;
      fitWithin(tx, bw, size * 1.35, size, 14);
      if (sub) fitWithin(sub, bw, size, Math.round(size * 0.66), 12);
      return { row, m, at: itemAt(ctx, i, p.stagger, it.at) };
    });
    return {
      update(t) {
        for (const v of views) {
          reveal(v.row, t, v.at, { dx: rtl ? 30 : -30, dur: 0.4 });
          const k = t >= v.at ? easeOutBack(2.4)(progress(t, v.at, 0.4)) : 0;
          css(v.m, 'transform', `scale(${(0.4 + 0.6 * k).toFixed(4)})`);
        }
      },
    };
  },
};

// ------------------------------------------------------------------ callout

export const callout: RuntimeComponent = {
  name: 'callout',
  handles: ['draw'],
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const c = resolve(p.color);
    const lab = textEl(theme, p.text, { cls: 'co-lab', size: p.fontSize, weight: 700 });
    lab.style.borderColor = c;
    lab.style.boxShadow = `0 0 26px ${rgba(c, 0.3)}`;
    root.append(lab);
    fitWithin(lab, W - 40, H - 16, p.fontSize, 14);
    const target = p.to as Pt | undefined;
    const svg = svgBox(W, H);
    root.prepend(svg);
    let line: SVGPathElement | undefined;
    let head: SVGPolygonElement | undefined;
    let ring: SVGCircleElement | undefined;
    let len = 1;
    if (target && typeof target === 'object') {
      const cx = W / 2;
      const cy = H / 2;
      const dx = target.x - cx;
      const dy = target.y - cy;
      const lw = Math.min(W, (lab.offsetWidth || W) + 4) / 2;
      const lh = Math.min(H, (lab.offsetHeight || H) + 4) / 2;
      const k = Math.min(lw / Math.max(1e-6, Math.abs(dx)), lh / Math.max(1e-6, Math.abs(dy)));
      const a = { x: cx + dx * Math.min(1, k), y: cy + dy * Math.min(1, k) };
      const dist = Math.hypot(target.x - a.x, target.y - a.y) || 1;
      const stop = Math.min(p.ring ? 26 : 8, dist / 3);
      const b = {
        x: target.x - ((target.x - a.x) / dist) * stop,
        y: target.y - ((target.y - a.y) / dist) * stop,
      };
      const bend = p.curve ? dist * 0.25 : 0;
      const m = {
        x: (a.x + b.x) / 2 - ((b.y - a.y) / dist) * bend,
        y: (a.y + b.y) / 2 + ((b.x - a.x) / dist) * bend,
      };
      line = s('path', {
        d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)}Q${m.x.toFixed(1)} ${m.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
        fill: 'none',
        stroke: c,
        'stroke-width': 4,
        'stroke-linecap': 'round',
        style: `filter:drop-shadow(0 0 8px ${rgba(c, 0.6)})`,
      });
      len = dist + bend * 0.6;
      head = s('polygon', { points: arrowHead(b, Math.atan2(b.y - m.y, b.x - m.x), 18), fill: c });
      svg.append(line, head);
      if (p.ring) {
        ring = s('circle', { cx: target.x, cy: target.y, r: 18, fill: 'none', stroke: c, 'stroke-width': 4 });
        svg.append(ring);
      }
    }
    return {
      update(t, local) {
        reveal(lab, t, ctx.el.enter.t, { s0: 0.8, dur: 0.35 });
        const k = easeInOutCubic(local.enterRaw);
        if (line) drawStroke(line, len, k);
        if (head) attr(head, 'opacity', clamp((k - 0.85) / 0.15).toFixed(3));
        if (ring) {
          const since = t - (ctx.el.enter.t + ctx.el.enter.dur);
          const ph = since < 0 ? 0 : (since % 1.4) / 1.4;
          attr(ring, 'opacity', since < 0 ? '0' : (1 - 0.6 * ph).toFixed(3));
          attr(ring, 'r', (18 + 10 * ph).toFixed(2));
        }
      },
    };
  },
};

// ------------------------------------------------------------------ spotlight

export const spotlight: RuntimeComponent = {
  name: 'spotlight',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const tg = p.target as { x: number; y: number; w: number; h: number };
    const pad: number = p.padding;
    const box = { x: tg.x - pad, y: tg.y - pad, w: tg.w + 2 * pad, h: tg.h + 2 * pad };
    const c = resolve(p.color);
    const svg = svgBox(W, H);
    const id = defId(ctx, 'mask');
    const mask = s('mask', { id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H });
    const hole =
      p.shape === 'circle' ? s('ellipse', { fill: '#000' }) : s('rect', { fill: '#000', rx: 26, ry: 26 });
    mask.append(s('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }), hole);
    const defs = s('defs');
    defs.append(mask);
    const shade = s('rect', { x: 0, y: 0, width: W, height: H, fill: theme.colors.bg, mask: `url(#${id})` });
    const ringEl =
      p.shape === 'circle' ? s('ellipse', { fill: 'none' }) : s('rect', { fill: 'none', rx: 26, ry: 26 });
    attr(ringEl, 'stroke', c);
    attr(ringEl, 'stroke-width', 3);
    attr(ringEl, 'stroke-dasharray', '10 8');
    svg.append(defs, shade, ringEl);
    root.append(svg);
    let lab: HTMLElement | undefined;
    if (p.label) {
      lab = textEl(theme, p.label, { cls: 'sl-lab', size: 34, weight: 700 });
      root.append(lab);
      fitWithin(lab, W * 0.8, 60, 34, 16);
      const lw = lab.offsetWidth || 300;
      const lh = lab.offsetHeight || 54;
      const below = box.y + box.h + 18 + lh <= H;
      lab.style.left = `${clamp(box.x + box.w / 2 - lw / 2, 10, W - lw - 10)}px`;
      lab.style.top = `${below ? box.y + box.h + 18 : Math.max(10, box.y - lh - 18)}px`;
    }
    const start = typeof p.at === 'number' ? p.at : ctx.el.enter.t;
    const until = typeof p.until === 'number' ? p.until : undefined;
    const setShape = (el: SVGElement, b: typeof box) => {
      if (p.shape === 'circle') {
        attr(el, 'cx', (b.x + b.w / 2).toFixed(1));
        attr(el, 'cy', (b.y + b.h / 2).toFixed(1));
        attr(el, 'rx', ((b.w / 2) * Math.SQRT2).toFixed(1));
        attr(el, 'ry', ((b.h / 2) * Math.SQRT2).toFixed(1));
      } else {
        attr(el, 'x', b.x.toFixed(1));
        attr(el, 'y', b.y.toFixed(1));
        attr(el, 'width', b.w.toFixed(1));
        attr(el, 'height', b.h.toFixed(1));
      }
    };
    return {
      update(t) {
        const inK = t < start ? 0 : easeOutCubic(progress(t, start, 0.5));
        const outK = until !== undefined && t >= until ? easeOutCubic(progress(t, until, 0.4)) : 0;
        const k = inK * (1 - outK);
        // the hole closes in from a wider frame while the rest dims
        const grow = 1 + 0.5 * (1 - inK);
        const b = {
          x: box.x - (box.w * (grow - 1)) / 2,
          y: box.y - (box.h * (grow - 1)) / 2,
          w: box.w * grow,
          h: box.h * grow,
        };
        setShape(hole, b);
        setShape(ringEl, b);
        attr(shade, 'opacity', (p.dim * k).toFixed(3));
        attr(ringEl, 'opacity', k.toFixed(3));
        attr(ringEl, 'stroke-dashoffset', (-(t * 30) % 1000).toFixed(1));
        if (lab) {
          css(lab, 'opacity', clamp((k - 0.4) / 0.6).toFixed(3));
          css(lab, 'visibility', k > 0.4 ? 'visible' : 'hidden');
        }
      },
    };
  },
};

// ------------------------------------------------------------------ split-screen

interface Half {
  title: string;
  text?: string;
  src?: string;
  icon?: string;
  color: string;
}

export const splitScreen: RuntimeComponent = {
  name: 'split-screen',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const a = p.a as Half;
    const b = p.b as Half;
    const rtl = textDir(a.title, a.text, b.title, b.text) === 'rtl';
    const cols = p.split === 'columns';
    const gap = 18;
    const pw = cols ? (W - gap) / 2 : W;
    const ph = cols ? H : (H - gap) / 2;
    const bs = p.badge ? Math.round(Math.min(110, fs * 2.4)) : 0;
    const panel = (x: Half, i: number) => {
      const c = resolve(x.color);
      const left = cols ? mirrorX(i * (pw + gap), pw, W, rtl) : 0;
      const top = cols ? 0 : i * (ph + gap);
      const el = h('div', {
        class: 'ss-panel',
        dir: 'auto',
        style: `left:${left}px;top:${top}px;width:${pw}px;height:${ph}px;border-color:${rgba(c, 0.55)};background:linear-gradient(165deg, ${rgba(c, 0.18)}, ${rgba(theme.colors.card, 0.97)} 70%)`,
      });
      const pad = Math.round(Math.min(pw, ph) * 0.08);
      const mediaH = x.src ? ph * (cols ? 0.46 : 0.5) : x.icon ? Math.min(ph * 0.3, fs * 2.6) : 0;
      if (x.src) {
        const m = h('div', { class: 'ss-media', style: `height:${mediaH}px` });
        m.append(h('img', { src: ctx.asset(x.src), alt: '' }));
        el.append(m);
      } else if (x.icon) {
        const m = h('div', { class: 'ss-icon', style: `height:${mediaH}px;margin:${pad}px ${pad}px 0` });
        m.append(icon(x.icon, Math.round(mediaH * 0.8), c, 1.8));
        el.append(m);
      }
      // keep text clear of the centre badge: extra padding on the side that faces it
      const inner = cols ? ((i === 0) !== rtl ? 'right' : 'left') : i === 0 ? 'bottom' : 'top';
      const body = h('div', {
        class: 'ss-body',
        style: `padding:${pad}px;padding-${inner}:${pad + (bs ? bs / 2 : 0)}px`,
      });
      const tfs = Math.round(fs * 1.1);
      const tt = textEl(theme, x.title, { size: tfs, weight: 800, color: c });
      body.append(tt);
      let tx: HTMLElement | undefined;
      if (x.text) {
        tx = h(
          'div',
          { class: 'ss-text', dir: 'auto', 'data-fit': true, style: `font-family:${fontFor(theme, x.text)}` },
          x.text,
        );
        body.append(tx);
      }
      el.append(body);
      root.append(el);
      const bw = pw - 2 * pad - (cols && bs ? bs / 2 : 0) - 6;
      fitWithin(tt, bw, tfs * 1.35, tfs, 16);
      const rest =
        ph - mediaH - (x.icon && !x.src ? pad : 0) - 2 * pad - tfs * 1.5 - (!cols && bs ? bs / 2 : 0);
      if (tx) {
        tx.style.height = `${Math.max(20, rest)}px`;
        fitWithin(tx, bw, Math.max(20, rest), Math.round(fs * 0.8), 14);
      }
      return { el, at: ctx.el.enter.t + i * p.stagger };
    };
    const views = [panel(a, 0), panel(b, 1)];
    let badge: HTMLElement | undefined;
    if (p.badge) {
      badge = h(
        'div',
        {
          class: 'ss-badge',
          dir: 'auto',
          style: `width:${bs}px;height:${bs}px;left:${W / 2 - bs / 2}px;top:${H / 2 - bs / 2}px;font-size:${Math.round(bs * 0.32)}px`,
        },
        p.badge,
      );
      root.append(badge);
    }
    const lastAt = views[1].at;
    return {
      update(t) {
        views.forEach((v, i) =>
          reveal(
            v.el,
            t,
            v.at,
            cols ? { dx: (i === 0) !== rtl ? -40 : 40, dur: 0.45 } : { dy: i ? 30 : -30, dur: 0.45 },
          ),
        );
        if (badge) reveal(badge, t, lastAt + 0.3, { s0: 0.3, dur: 0.4 });
      },
    };
  },
};

// ------------------------------------------------------------------ pricing-table (and price tag)

interface Plan {
  name: string;
  price: number | string;
  was?: number | string;
  period?: string;
  features: string[];
  featured: boolean;
  badge?: string;
  color?: string;
}

const priceText = (v: number | string, cur: string) =>
  typeof v === 'number' ? fmtNum(v, { prefix: cur, decimals: Number.isInteger(v) ? 0 : 2 }) : v;

export const pricingTable: RuntimeComponent = {
  name: 'pricing-table',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const plans = p.plans as Plan[];
    const base = resolve(p.color);
    const accent = resolve(p.accent);
    const rtl = textDir(...plans.flatMap((x) => [x.name, x.period, x.badge, ...x.features])) === 'rtl';
    root.dir = rtl ? 'rtl' : 'ltr';

    if (p.variant === 'tag') {
      const pl = plans[0];
      const c = colorOr(pl.color, accent);
      const tw = Math.min(W * 0.86, H * 1.5);
      const tH = Math.min(H * 0.8, tw * 0.62);
      const tag = h('div', {
        class: 'pt-tag',
        style: `width:${tw}px;height:${tH}px;left:${(W - tw) / 2}px;top:${(H - tH) / 2}px;background:${c};color:${contrastText(c)}`,
      });
      tag.append(h('i', { class: 'pt-hole', style: `${rtl ? 'right' : 'left'}:${tH * 0.2}px` }));
      const body = h('div', {
        class: 'pt-tbody',
        style: `${rtl ? 'right' : 'left'}:${tH * 0.42}px;${rtl ? 'left' : 'right'}:${tH * 0.12}px`,
      });
      const name = textEl(theme, pl.name, { cls: 'pt-tname', size: Math.round(tH * 0.12), weight: 700 });
      const price = numEl('pt-tprice');
      price.textContent = priceText(pl.price, p.currency);
      price.setAttribute('data-fit', '');
      body.append(name, price);
      let was: HTMLElement | undefined;
      if (pl.was !== undefined) {
        was = numEl('pt-was');
        was.textContent = priceText(pl.was, p.currency);
        body.append(was);
      }
      tag.append(body);
      root.append(tag);
      const bw = tw - tH * 0.54;
      fitWithin(name, bw, tH * 0.18, Math.round(tH * 0.12), 12);
      fitWithin(price, bw, tH * 0.42, Math.round(tH * 0.36), 18);
      if (was) fitWithin(was, bw, tH * 0.16, Math.round(tH * 0.12), 12);
      let badge: HTMLElement | undefined;
      if (pl.badge) {
        const bs = Math.round(tH * 0.42);
        badge = h(
          'div',
          {
            class: 'pt-burst',
            dir: 'auto',
            style: `width:${bs}px;height:${bs}px;${rtl ? 'left' : 'right'}:${(W - tw) / 2 - bs * 0.25}px;top:${(H - tH) / 2 - bs * 0.4}px;background:${base};color:${contrastText(base)};font-size:${Math.round(bs * 0.26)}px`,
          },
          pl.badge,
        );
        root.append(badge);
      }
      return {
        update(t) {
          const k = t >= ctx.el.enter.t ? progress(t, ctx.el.enter.t, 1.1) : 0;
          // a hanging tag settling: damped swing around its hole
          const swing = (1 - k) * Math.cos(k * Math.PI * 3.5) * 9;
          css(tag, 'transform', `rotate(${((rtl ? 4 : -4) + swing).toFixed(3)}deg)`);
          css(tag, 'transform-origin', `${rtl ? 100 - (tH * 0.2 * 100) / tw : (tH * 0.2 * 100) / tw}% 50%`);
          if (badge) reveal(badge, t, ctx.el.enter.t + 0.5, { s0: 0.2, dur: 0.4, base: 'rotate(12deg)' });
        },
      };
    }

    const n = plans.length;
    const gap = 18;
    const lift = 18;
    const cw = (W - gap * (n - 1)) / n;
    const views = plans.map((pl, i) => {
      const c = colorOr(pl.color, pl.featured ? accent : base);
      const x = mirrorX(i * (cw + gap), cw, W, rtl);
      const top = pl.featured ? 0 : lift;
      const el = h('div', {
        class: `pt-card${pl.featured ? ' on' : ''}`,
        style: `left:${x}px;top:${top}px;width:${cw}px;height:${H - lift}px;border-color:${pl.featured ? c : 'var(--line)'};${pl.featured ? `box-shadow:0 0 40px ${rgba(c, 0.35)}` : ''}`,
      });
      const pad = Math.round(Math.min(cw * 0.1, 30));
      el.style.padding = `${pad + (pl.badge ? fs * 0.5 : 0)}px ${pad}px ${pad}px`;
      const name = textEl(theme, pl.name, { cls: 'pt-name', size: Math.round(fs * 0.8), color: c });
      const priceRow = h('div', { class: 'pt-price' });
      const price = numEl('pt-pv');
      price.textContent = priceText(pl.price, p.currency);
      priceRow.append(price);
      if (pl.period) priceRow.append(h('span', { class: 'pt-per', dir: 'auto' }, pl.period));
      el.append(name, priceRow);
      let was: HTMLElement | undefined;
      if (pl.was !== undefined) {
        was = numEl('pt-was');
        was.textContent = priceText(pl.was, p.currency);
        el.append(was);
      }
      const feats = h('div', { class: 'pt-feats' });
      const ffs = Math.round(fs * 0.72);
      const featEls = pl.features.map((f) => {
        const r = h('div', { class: 'pt-feat', style: `font-size:${ffs}px` });
        r.append(icon('check', Math.round(ffs * 1.05), c, 2.6));
        const te = textEl(theme, f, { size: ffs });
        r.append(te);
        feats.append(r);
        return te;
      });
      el.append(feats);
      root.append(el);
      if (pl.badge) {
        const b = h(
          'div',
          {
            class: 'pt-badge',
            dir: 'auto',
            style: `background:${c};color:${contrastText(c)};font-size:${Math.round(fs * 0.55)}px;top:${top}px;left:${x + cw / 2}px`,
          },
          pl.badge,
        );
        root.append(b);
        el.dataset.badge = '1';
      }
      const iw = cw - 2 * pad;
      fitWithin(name, iw, fs * 1.2, Math.round(fs * 0.8), 12);
      fitWithin(price, iw - (pl.period ? fs * 2.6 : 0), fs * 2.4, Math.round(fs * 1.9), 18);
      for (const te of featEls) fitWithin(te, iw - ffs * 1.6, ffs * 1.4, ffs, 11);
      return { el, at: itemAt(ctx, i, p.stagger) };
    });
    const badges = [...root.querySelectorAll<HTMLElement>('.pt-badge')];
    return {
      update(t) {
        for (const v of views) reveal(v.el, t, v.at, { dy: 30, dur: 0.45 });
        let bi = 0;
        plans.forEach((pl, i) => {
          if (!pl.badge) return;
          reveal(badges[bi++], t, views[i].at + 0.3, { s0: 0.5, dur: 0.35, base: 'translate(-50%, -50%)' });
        });
      },
    };
  },
};

// ------------------------------------------------------------------ qr-code

export const qrCode: RuntimeComponent = {
  name: 'qr-code',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const qr = encodeQr(p.text, p.ecc);
    const labFs = Math.round(Math.min(32, H * 0.07));
    const labH = p.label ? labFs * 2 : 0;
    const S = Math.min(W, H - labH);
    const quiet = 4;
    const n = qr.size + quiet * 2;
    const card = h('div', {
      class: 'qr-card',
      style: `left:${(W - S) / 2}px;top:0;width:${S}px;height:${S}px;background:${p.background}`,
    });
    const svg = s('svg', {
      viewBox: `0 0 ${n} ${n}`,
      width: S,
      height: S,
      'shape-rendering': 'crispEdges',
      style: 'position:absolute;left:0;top:0',
    });
    let d = '';
    qr.modules.forEach((row, y) => {
      for (let x = 0; x < qr.size; x++) {
        if (!row[x]) continue;
        let e = x;
        while (e + 1 < qr.size && row[e + 1]) e++;
        d += `M${x + quiet} ${y + quiet}h${e - x + 1}v1h${-(e - x + 1)}z`;
        x = e;
      }
    });
    svg.append(s('path', { d, fill: resolve(p.color) }));
    card.append(svg);
    root.append(card);
    let lab: HTMLElement | undefined;
    if (p.label) {
      lab = textEl(theme, p.label, {
        cls: 'qr-lab',
        size: labFs,
        weight: 700,
        style: `top:${S + labFs * 0.4}px`,
      });
      root.append(lab);
      fitWithin(lab, W, labFs * 1.5, labFs, 12);
    }
    const start = ctx.el.enter.t;
    return {
      update(t) {
        if (p.draw) {
          const k = easeInOutCubic(progress(t, start, 0.9));
          const x = (k * 200).toFixed(2);
          css(svg, 'clip-path', k >= 1 ? 'none' : `polygon(0 0, ${x}% 0, 0 ${x}%)`);
        }
        if (lab) reveal(lab, t, start + 0.6, { dy: 8, dur: 0.35 });
      },
    };
  },
};

// ------------------------------------------------------------------ rating

const STAR = 'M12 2.6l2.82 6.06 6.63.78-4.9 4.53 1.3 6.55L12 17.2l-5.85 3.32 1.3-6.55-4.9-4.53 6.63-.78z';

export const rating: RuntimeComponent = {
  name: 'rating',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const c = resolve(p.color);
    const rtl = textDir(p.label, p.note) === 'rtl';
    root.dir = rtl ? 'rtl' : 'ltr';
    const halves = Math.round(p.value * 2) / 2;
    const numW = p.numbers ? Math.min(W * 0.28, H * 0.95) : 0;
    const textH = p.label || p.note ? Math.min(H * 0.32, 52) : 0;
    const starArea = W - numW - (numW ? 20 : 0);
    const size = Math.min(p.size, starArea / (p.max + (p.max - 1) * 0.12), H - textH - 8);
    let big: HTMLElement | undefined;
    if (p.numbers) {
      big = numEl(
        'rt-big',
        `width:${numW}px;height:${H}px;font-size:${Math.round(Math.min(H * 0.6, numW * 0.45))}px;color:${theme.colors.ink}`,
      );
      big.setAttribute('data-fit', '');
      big.textContent = p.value.toFixed(1);
      root.append(big);
      fitWithin(big, numW, H, Math.round(Math.min(H * 0.6, numW * 0.45)), 18);
    }
    const col = h('div', { class: 'rt-col' });
    const row = h('div', { class: 'rt-stars', style: `gap:${size * 0.12}px;height:${size}px` });
    const id = defId(ctx, 'st');
    const stars = Array.from({ length: p.max }, (_, i) => {
      const svg = s('svg', { viewBox: '0 0 24 24', width: size, height: size, style: 'overflow:visible' });
      const clip = s('clipPath', { id: `${id}${i}` });
      const r = s('rect', { x: 0, y: 0, width: 0, height: 24 });
      clip.append(r);
      const defs = s('defs');
      defs.append(clip);
      svg.append(
        defs,
        s('path', {
          d: STAR,
          fill: rgba(theme.colors.ink, 0.08),
          stroke: rgba(c, 0.55),
          'stroke-width': 1.4,
          'stroke-linejoin': 'round',
        }),
        s('path', {
          d: STAR,
          fill: c,
          stroke: c,
          'stroke-width': 1.4,
          'stroke-linejoin': 'round',
          'clip-path': `url(#${id}${i})`,
          style: `filter:drop-shadow(0 0 6px ${rgba(c, 0.6)})`,
        }),
      );
      // stars fill from the reading start (right in Arabic)
      if (rtl) svg.style.transform = 'scaleX(-1)';
      row.append(svg);
      return r;
    });
    col.append(row);
    let info: HTMLElement | undefined;
    if (p.label || p.note) {
      info = h('div', { class: 'rt-info', style: `height:${textH}px` });
      if (p.label) info.append(textEl(theme, p.label, { size: Math.round(textH * 0.56), weight: 700 }));
      if (p.note) info.append(textEl(theme, p.note, { cls: 'rt-note', size: Math.round(textH * 0.44) }));
      col.append(info);
    }
    root.append(col);
    if (info)
      for (const el of info.querySelectorAll<HTMLElement>('.rf-tx'))
        fitWithin(el, starArea * 0.6, textH, Number.parseFloat(el.style.fontSize), 11);
    const start = ctx.el.enter.t;
    return {
      update(t) {
        const k = easeOutCubic(progress(t, start, p.dur));
        const f = halves * k;
        stars.forEach((r, i) => attr(r, 'width', (clamp(f - i) * 24).toFixed(3)));
        if (big) text(big, (p.value * k).toFixed(1));
      },
    };
  },
};

// ------------------------------------------------------------------ vitals (ECG monitor)

/** One heartbeat (PQRST complex) at phase f ∈ [0, 1): sum of Gaussian bumps, R peak = 1. */
export function ecgWave(f: number): number {
  const g = (mu: number, sd: number, a: number) => a * Math.exp(-(((f - mu) / sd) ** 2) / 2);
  return (
    g(0.18, 0.025, 0.12) +
    g(0.3, 0.009, -0.14) +
    g(0.32, 0.009, 1) +
    g(0.345, 0.011, -0.28) +
    g(0.56, 0.04, 0.26)
  );
}

export const vitals: RuntimeComponent = {
  name: 'vitals',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const c = resolve(p.color);
    const danger = resolve(p.danger);
    root.classList.add('rf-card');
    const rtl = textDir(p.label) === 'rtl';
    const sideW = Math.round(Math.min(W * 0.32, 300));
    const pad = 18;
    const tw = W - sideW - pad * 2;
    const th = H - pad * 2;
    const tx0 = rtl ? W - pad - tw : pad;
    const svg = svgBox(W, H);
    root.append(svg);
    if (p.grid) {
      const d: string[] = [];
      for (let x = 0; x <= tw; x += 30) d.push(`M${(tx0 + x).toFixed(1)} ${pad}v${th}`);
      for (let y = 0; y <= th; y += 30) d.push(`M${tx0} ${(pad + y).toFixed(1)}h${tw}`);
      svg.append(s('path', { d: d.join(''), stroke: rgba(c, 0.09), 'stroke-width': 1, fill: 'none' }));
    }
    const mk = () =>
      s('path', {
        fill: 'none',
        stroke: c,
        'stroke-width': 4,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      });
    const fresh = mk();
    const old = mk();
    attr(old, 'opacity', '0.45');
    const head = s('circle', { r: 7, fill: c });
    svg.append(old, fresh, head);
    const side = h('div', {
      class: 'vt-side',
      dir: rtl ? 'rtl' : 'ltr',
      style: `${rtl ? 'left' : 'right'}:${pad}px;width:${sideW - pad}px;top:${pad}px;bottom:${pad}px`,
    });
    const lab = textEl(theme, p.label, { cls: 'vt-label', size: Math.round(Math.min(26, H * 0.08)) });
    const heart = h('span', { class: 'vt-heart' });
    const heartIcon = icon('heart-pulse', Math.round(H * 0.14), c, 2.2);
    heart.append(heartIcon);
    const val = numEl('vt-val');
    val.setAttribute('data-fit', '');
    const unit = h('span', { class: 'vt-unit' }, p.unit);
    side.append(lab, heart, val, unit);
    root.append(side);
    fitWithin(lab, sideW - pad, 40, Math.round(Math.min(26, H * 0.08)), 12);
    val.textContent = '000';
    fitWithin(val, sideW - pad, H * 0.4, Math.round(H * 0.34), 20);
    // phase table: integral of bpm/60 from the enter time, sampled at 120 Hz
    const kfs = p.keyframes as { at: number; value: number; dur?: number }[] | undefined;
    const bpmAt = (t: number) => (kfs ? keyframeValue(kfs, t, p.bpm, easeInOutCubic, 1) : p.bpm);
    const life = lifetime(ctx);
    const t0 = life.start;
    const rate = 120;
    const table = new Float64Array(Math.ceil((life.end - t0 + 2) * rate) + 2);
    for (let i = 1; i < table.length; i++) table[i] = table[i - 1] + bpmAt(t0 + (i - 0.5) / rate) / 60 / rate;
    const phase = (t: number) => {
      const x = clamp((t - t0) * rate, 0, table.length - 1.001);
      const i = Math.floor(x);
      return table[i] + (table[i + 1] - table[i]) * (x - i);
    };
    const speed = tw / p.window;
    const mid = pad + th * 0.62;
    const amp = th * 0.5;
    const gapPx = tw * 0.06;
    const yAt = (ts: number) => mid - ecgWave(phase(ts) % 1) * amp;
    const X = (x: number) => (rtl ? tx0 + tw - x : tx0 + x);
    return {
      update(t) {
        const since = t - t0;
        if (since < 0) {
          attr(fresh, 'd', '');
          attr(old, 'd', '');
          return;
        }
        const headX = (since * speed) % tw;
        const pts1: string[] = [];
        const pts2: string[] = [];
        for (let x = 0; x <= tw; x += 3) {
          const ahead = x > headX;
          if (ahead && x < headX + gapPx) continue;
          const age = ahead ? (headX + tw - x) / speed : (headX - x) / speed;
          const ts = t - age;
          if (ts < t0) continue;
          (ahead ? pts2 : pts1).push(`${X(x).toFixed(1)} ${yAt(ts).toFixed(1)}`);
        }
        pts1.push(`${X(headX).toFixed(1)} ${yAt(t).toFixed(1)}`);
        attr(fresh, 'd', pts1.length > 1 ? `M${pts1.join('L')}` : '');
        attr(old, 'd', pts2.length > 1 ? `M${pts2.join('L')}` : '');
        attr(head, 'cx', X(headX).toFixed(1));
        attr(head, 'cy', yAt(t).toFixed(1));
        const bpm = bpmAt(t);
        const alarm = p.threshold !== undefined && bpm > p.threshold;
        const col = alarm ? danger : c;
        attr(fresh, 'stroke', col);
        attr(old, 'stroke', col);
        attr(head, 'fill', col);
        css(head, 'filter', `drop-shadow(0 0 10px ${col})`);
        text(val, String(Math.round(bpm)));
        css(val, 'color', alarm ? danger : theme.colors.ink);
        const beat = (phase(t) % 1) - 0.32;
        const pulse = Math.exp(-((beat < 0 ? beat + 1 : beat) * 9));
        css(heart, 'transform', `scale(${(1 + 0.18 * pulse).toFixed(4)})`);
        attr(heartIcon, 'stroke', col);
      },
    };
  },
};
