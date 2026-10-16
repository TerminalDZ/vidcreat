/** People & messaging components: person-card, chat, notification, speech-bubble, lower-third. */
import { clamp, easeOutBack, easeOutCubic, progress } from '../anim.js';
import { css, h, s } from '../dom.js';
import { icon } from '../icons.js';
import { resolve, rgba } from '../color.js';
import type { MountCtx, RuntimeComponent } from '../types.js';
import {
  colorOr,
  contrastText,
  fitWithin,
  initialsOf,
  itemAt,
  reveal,
  svgBox,
  textDir,
  textEl,
} from './chart.js';
import { fontFor, keyframeValue, Reveal } from './util.js';
import type { Theme } from '@reelforge/core';

/** Round avatar: an assets/ image, an icon, or the initials of a name. */
function avatar(
  theme: Theme,
  ctx: MountCtx,
  size: number,
  c: string,
  o: { src?: string; icon?: string; name: string; initials?: string },
): HTMLElement {
  const el = h('div', {
    class: 'pc-av',
    style: `width:${size}px;height:${size}px;border-color:${c};background:linear-gradient(150deg, ${rgba(c, 0.35)}, ${rgba(c, 0.1)})`,
  });
  if (o.src) el.append(h('img', { src: ctx.asset(o.src), alt: '' }));
  else if (o.icon) el.append(icon(o.icon, Math.round(size * 0.5), c, 2));
  else {
    const ini = o.initials ?? initialsOf(o.name);
    el.append(
      h(
        'span',
        {
          style: `font-size:${Math.round(size * (ini.length > 2 ? 0.3 : 0.38))}px;color:${c};font-family:${fontFor(theme, ini)}`,
        },
        ini,
      ),
    );
  }
  return el;
}

// ------------------------------------------------------------------ person-card

export const personCard: RuntimeComponent = {
  name: 'person-card',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const c = resolve(p.color);
    const rtl = textDir(p.name, p.role, p.sub) === 'rtl';
    const vert = p.layout === 'vertical';
    root.classList.add('rf-card');
    root.dir = rtl ? 'rtl' : 'ltr';
    root.classList.add(vert ? 'v' : 'hz');
    const pad = Math.round(Math.min(W, H) * (vert ? 0.08 : 0.14));
    root.style.padding = `${pad}px`;
    const lines = 1 + (p.role ? 1 : 0) + (p.sub ? 1 : 0);
    const av = Math.round(vert ? Math.min(W * 0.42, H * 0.42) : Math.min(H - 2 * pad, W * 0.3));
    root.append(avatar(theme, ctx, av, c, p));
    const txt = h('div', { class: 'pc-txt' });
    const tw = vert ? W - 2 * pad : W - 2 * pad - av - pad * 0.8;
    const room = vert ? H - 2 * pad - av - 16 : H - 2 * pad;
    const nameFs = Math.round(Math.min(room / (lines + 0.6), vert ? W * 0.1 : 50));
    const name = textEl(theme, p.name, { cls: 'pc-name', size: nameFs, weight: 800 });
    txt.append(name);
    const subs: HTMLElement[] = [];
    if (p.role) {
      const r = textEl(theme, p.role, { cls: 'pc-role', size: Math.round(nameFs * 0.62), color: c });
      txt.append(r);
      subs.push(r);
    }
    if (p.sub) {
      const r = textEl(theme, p.sub, { cls: 'pc-sub', size: Math.round(nameFs * 0.5) });
      txt.append(r);
      subs.push(r);
    }
    root.append(txt);
    let badge: HTMLElement | undefined;
    if (p.badge) {
      badge = h(
        'span',
        { class: 'pc-badge', dir: 'auto', style: `background:${c};color:${contrastText(c)}` },
        p.badge,
      );
      root.append(badge);
    }
    fitWithin(name, tw - (badge && !vert ? 0 : 0), nameFs * 1.3, nameFs, 16);
    for (const x of subs) fitWithin(x, tw, nameFs, Number.parseFloat(x.style.fontSize) || 20, 12);
    return {
      update(t) {
        reveal(txt, t, ctx.el.enter.t + 0.15, { dx: vert ? 0 : rtl ? -20 : 20, dy: vert ? 14 : 0, dur: 0.4 });
        if (badge) reveal(badge, t, ctx.el.enter.t + 0.4, { s0: 0.5, dur: 0.35 });
      },
    };
  },
};

// ------------------------------------------------------------------ chat

/** When message i shows (after its typing indicator for incoming messages); same rule as core events. */
const messageAt = (
  ctx: MountCtx,
  i: number,
  m: { from: string; at?: number },
  stagger: number,
  typing: number,
) => {
  const t0 = itemAt(ctx, i, stagger, m.at);
  return { typeAt: t0, showAt: t0 + (m.from === 'them' ? typing : 0) };
};

export const chat: RuntimeComponent = {
  name: 'chat',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const msgs = p.messages as {
      text: string;
      from: 'me' | 'them';
      name?: string;
      time?: string;
      at?: number;
    }[];
    const rtl =
      p.dir === 'rtl' || (p.dir === 'auto' && textDir(p.title, ...msgs.map((m) => m.text)) === 'rtl');
    const c = resolve(p.color);
    root.classList.add('rf-card');
    root.dir = rtl ? 'rtl' : 'ltr';
    let top = 0;
    if (p.title) {
      const head = h('div', { class: 'ch-head', style: `height:${Math.round(fs * 2.3)}px` });
      head.append(avatar(theme, ctx, Math.round(fs * 1.5), c, { name: p.title }));
      const tt = textEl(theme, p.title, { size: Math.round(fs * 0.9), weight: 800 });
      head.append(tt, h('i', { class: 'ch-dot', style: `background:${theme.colors.lime}` }));
      root.append(head);
      fitWithin(tt, W - fs * 4, fs * 1.4, Math.round(fs * 0.9), 14);
      top = Math.round(fs * 2.3);
    }
    const pad = 22;
    const area = h('div', { class: 'ch-area', style: `top:${top}px` });
    const col = h('div', { class: 'ch-col' });
    area.append(col);
    root.append(area);
    const areaH = H - top - pad;
    const maxW = (W - 2 * pad) * 0.78;
    let y = pad;
    const gap = Math.round(fs * 0.45);
    const views = msgs.map((m, i) => {
      const mine = m.from === 'me';
      const end = mine !== rtl; // sits on the right edge of the box
      const bub = h('div', {
        class: `ch-bub ${mine ? 'me' : 'them'}`,
        dir: 'auto',
        style: `max-width:${maxW}px;font-size:${fs}px;${end ? 'right' : 'left'}:${pad}px;top:${y}px;${mine ? `background:${c};color:${contrastText(c)}` : ''};border-${end ? 'bottom-right' : 'bottom-left'}-radius:8px;transform-origin:${end ? '100%' : '0'} 100%`,
      });
      if (m.name && !mine) bub.append(h('div', { class: 'ch-name', style: `color:${c}` }, m.name));
      bub.append(h('div', { class: 'ch-text', style: `font-family:${fontFor(theme, m.text)}` }, m.text));
      if (m.time) bub.append(h('div', { class: 'ch-time', dir: 'ltr' }, m.time));
      col.append(bub);
      const bh = bub.offsetHeight || fs * 2.2;
      const typing = h('div', {
        class: 'ch-typing',
        style: `${end ? 'right' : 'left'}:${pad}px;top:${y}px;height:${Math.round(fs * 1.9)}px`,
      });
      const dots = [0, 1, 2].map(() => h('i'));
      typing.append(...dots);
      col.append(typing);
      const tm = messageAt(ctx, i, m, p.stagger, p.typing);
      const v = { bub, typing, dots, y, bottom: y + bh, mine, end, ...tm };
      y += bh + gap;
      return v;
    });
    // Scroll so the newest message is in view: one eased step per appearance.
    const scrollKfs = views.map((v) => ({
      at: v.mine ? v.showAt : v.typeAt,
      value: Math.max(0, v.bottom - areaH + pad),
      dur: 0.35,
    }));
    return {
      update(t) {
        const scroll = keyframeValue(scrollKfs, t, 0, easeOutCubic);
        css(col, 'transform', `translateY(${(-scroll).toFixed(2)}px)`);
        for (const v of views) {
          reveal(v.bub, t, v.showAt, { s0: 0.6, dy: 16, dur: 0.35 });
          const typingOn = !v.mine && t >= v.typeAt && t < v.showAt;
          css(v.typing, 'visibility', typingOn ? 'visible' : 'hidden');
          v.dots.forEach((d, k) => {
            const ph = Math.sin((t - v.typeAt) * 9 - k * 0.9);
            css(d, 'transform', `translateY(${(typingOn ? -5 * Math.max(0, ph) : 0).toFixed(2)}px)`);
            css(d, 'opacity', (0.45 + 0.55 * Math.max(0, ph)).toFixed(3));
          });
        }
      },
    };
  },
};

// ------------------------------------------------------------------ notification

export const notification: RuntimeComponent = {
  name: 'notification',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const items = p.items as {
      title: string;
      text?: string;
      icon: string;
      color?: string;
      time?: string;
      at?: number;
    }[];
    const base = resolve(p.color);
    const th = Math.round(fs * (items.some((x) => x.text) ? 3.4 : 2.4));
    const gap = 16;
    const views = items.map((it, i) => {
      const c = colorOr(it.color, base);
      const rtl = textDir(it.title, it.text) === 'rtl';
      const el = h('div', { class: 'nt-toast', dir: rtl ? 'rtl' : 'ltr', style: `height:${th}px` });
      const ic = h('span', {
        class: 'nt-ic',
        style: `width:${th * 0.62}px;height:${th * 0.62}px;background:${rgba(c, 0.16)}`,
      });
      ic.append(icon(it.icon, Math.round(th * 0.34), c, 2.2));
      const body = h('div', { class: 'nt-body' });
      const title = textEl(theme, it.title, { size: fs, weight: 800 });
      body.append(title);
      let sub: HTMLElement | undefined;
      if (it.text) {
        sub = textEl(theme, it.text, { cls: 'nt-text', size: Math.round(fs * 0.82) });
        body.append(sub);
      }
      el.append(ic, body);
      if (it.time)
        el.append(
          h(
            'span',
            { class: 'nt-time', dir: 'auto', style: `font-size:${Math.round(fs * 0.62)}px` },
            it.time,
          ),
        );
      root.append(el);
      const bw = W - th * 0.62 - 70 - (it.time ? fs * 3 : 0);
      fitWithin(title, bw, fs * 1.35, fs, 14);
      if (sub) fitWithin(sub, bw, fs * 1.2, Math.round(fs * 0.82), 12);
      return { el, at: itemAt(ctx, i, p.stagger, it.at) };
    });
    return {
      update(t) {
        views.forEach((v, i) => {
          // pushed down by every toast that arrived after it (newest on top)
          let shift = 0;
          for (let j = i + 1; j < views.length; j++)
            if (t >= views[j].at) shift += easeOutCubic(progress(t, views[j].at, 0.4)) * (th + gap);
          const vis = t >= v.at;
          const k = vis ? easeOutBack(1.5)(progress(t, v.at, 0.45)) : 0;
          const out = clamp((shift + th - H) / (th * 0.6));
          css(v.el, 'visibility', vis && out < 1 ? 'visible' : 'hidden');
          css(v.el, 'opacity', (clamp(k * 1.6) * (1 - out)).toFixed(3));
          css(
            v.el,
            'transform',
            `translateY(${(shift + (1 - k) * -60).toFixed(2)}px) scale(${(0.92 + 0.08 * clamp(k)).toFixed(4)})`,
          );
        });
      },
    };
  },
};

// ------------------------------------------------------------------ speech-bubble

export const speechBubble: RuntimeComponent = {
  name: 'speech-bubble',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const c = resolve(p.color);
    const tail: string = p.tail;
    const thought = p.style === 'thought';
    const tailH = tail === 'none' ? 0 : Math.min(H * 0.22, 60);
    const top = tail.startsWith('top') ? tailH : 0;
    const x0 = 4;
    const y0 = top + 4;
    const x1 = W - 4;
    const y1 = H - (tail.startsWith('bottom') ? tailH : 0) - 4;
    const r = thought ? Math.min((y1 - y0) / 2, 90) : Math.min(36, (y1 - y0) / 3);
    const left = tail.endsWith('left');
    const tx = left ? x0 + (x1 - x0) * 0.2 : x0 + (x1 - x0) * 0.8;
    const tw = Math.min(70, (x1 - x0) * 0.14);
    const svg = svgBox(W, H);
    root.append(svg);
    const f = (n: number) => n.toFixed(1);
    let d = `M${f(x0 + r)} ${f(y0)}`;
    if (tail.startsWith('top') && !thought)
      d += `H${f(tx - tw / 2)}L${f(left ? tx - tw * 0.6 : tx + tw * 0.6)} ${f(y0 - tailH)}L${f(tx + tw / 2)} ${f(y0)}`;
    d += `H${f(x1 - r)}A${r} ${r} 0 0 1 ${f(x1)} ${f(y0 + r)}V${f(y1 - r)}A${r} ${r} 0 0 1 ${f(x1 - r)} ${f(y1)}`;
    if (tail.startsWith('bottom') && !thought)
      d += `H${f(tx + tw / 2)}L${f(left ? tx - tw * 0.6 : tx + tw * 0.6)} ${f(y1 + tailH)}L${f(tx - tw / 2)} ${f(y1)}`;
    d += `H${f(x0 + r)}A${r} ${r} 0 0 1 ${f(x0)} ${f(y1 - r)}V${f(y0 + r)}A${r} ${r} 0 0 1 ${f(x0 + r)} ${f(y0)}Z`;
    const shape = { fill: theme.colors.card, stroke: c, 'stroke-width': 4, 'stroke-linejoin': 'round' };
    svg.append(s('path', { d, ...shape, style: `filter:drop-shadow(0 0 24px ${rgba(c, 0.3)})` }));
    if (thought && tail !== 'none') {
      const down = tail.startsWith('bottom');
      const edge = down ? y1 : y0;
      [0.35, 0.68, 0.95].forEach((k, i) => {
        const rr = tailH * (0.3 - i * 0.08);
        svg.append(
          s('circle', {
            cx: f(tx + (left ? -1 : 1) * tw * 0.5 * k),
            cy: f(edge + (down ? 1 : -1) * tailH * k),
            r: f(Math.max(4, rr)),
            ...shape,
          }),
        );
      });
    }
    const padX = thought ? r * 0.55 + 20 : 34;
    const box = h('div', {
      class: 'sp-text',
      dir: 'auto',
      'data-fit': true,
      style: `left:${x0 + padX}px;top:${y0 + 18}px;width:${x1 - x0 - 2 * padX}px;height:${y1 - y0 - 36}px;font-family:${fontFor(theme, p.text)}`,
    });
    const typed = p.cps > 0 ? new Reveal([{ text: p.text }]) : undefined;
    if (typed) box.append(typed.el);
    else box.textContent = p.text;
    root.append(box);
    fitWithin(box, x1 - x0 - 2 * padX, y1 - y0 - 36, p.fontSize, 16);
    const start = ctx.el.enter.t + ctx.el.enter.dur;
    return {
      update(t) {
        if (typed) typed.set(t < start ? 0 : Math.floor((t - start) * p.cps + 1e-6));
      },
    };
  },
};

// ------------------------------------------------------------------ lower-third

export const lowerThird: RuntimeComponent = {
  name: 'lower-third',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const c = resolve(p.color);
    const rtl = textDir(p.name, p.title) === 'rtl';
    root.dir = rtl ? 'rtl' : 'ltr';
    const hasTitle = Boolean(p.title);
    const nameH = hasTitle ? H * 0.6 : H;
    const bar = h('i', { class: 'lt-bar', style: `background:${c};box-shadow:0 0 24px ${rgba(c, 0.6)}` });
    const panel = h('div', { class: 'lt-panel', style: `height:${nameH}px` });
    if (p.icon) {
      const ic = h('span', {
        class: 'lt-ic',
        style: `width:${nameH * 0.62}px;height:${nameH * 0.62}px;background:${rgba(c, 0.16)}`,
      });
      ic.append(icon(p.icon, Math.round(nameH * 0.38), c, 2.2));
      panel.append(ic);
    }
    const nfs = Math.round(Math.min(p.fontSize, nameH * 0.55));
    const name = textEl(theme, p.name, { cls: 'lt-name', size: nfs, weight: 800 });
    panel.append(name);
    root.append(bar, panel);
    fitWithin(name, W - 60 - (p.icon ? nameH * 0.8 : 0), nameH * 0.9, nfs, 18);
    let band: HTMLElement | undefined;
    if (hasTitle) {
      const tfs = Math.round(Math.min(nfs * 0.5, H * 0.24));
      band = h('div', {
        class: 'lt-band',
        style: `top:${nameH}px;height:${H - nameH}px;background:${c};color:${contrastText(c)}`,
      });
      const tt = textEl(theme, p.title, { cls: 'lt-title', size: tfs, weight: 700 });
      band.append(tt);
      root.append(band);
      fitWithin(tt, W - 60, H - nameH, tfs, 12);
    }
    return {
      update(t) {
        if (band) reveal(band, t, ctx.el.enter.t + ctx.el.enter.dur * 0.6, { dx: rtl ? 40 : -40, dur: 0.4 });
        reveal(name, t, ctx.el.enter.t + 0.1, { dy: 14, dur: 0.4 });
      },
    };
  },
};
