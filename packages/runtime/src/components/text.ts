/** Text components: title, label, quote, stamp, counter, cta. */
import { caretOn, clamp, easeOutBack, easeOutCubic, formatNumber, progress, typedCount } from '../anim.js';
import { css, h, text } from '../dom.js';
import { icon } from '../icons.js';
import { rgba } from '../color.js';
import type { RuntimeComponent } from '../types.js';
import { fitText, fontFor, isArabic, keyframeValue, parseAccent, Reveal } from './util.js';

export const title: RuntimeComponent = {
  name: 'title',
  handles: ['type'],
  mount(root, p, theme, ctx) {
    const plain = String(p.text).replace(/\*\*/g, '');
    const rtl = isArabic(plain);
    root.style.textAlign = p.align;
    root.style.fontFamily = fontFor(theme, plain, p.font);
    root.style.fontWeight = String(p.weight);
    root.style.color = p.color;
    root.dir = rtl ? 'rtl' : 'ltr';
    if (rtl) root.style.lineHeight = '1.3';
    const reveal = new Reveal(
      parseAccent(String(p.text)).map((s) => ({ text: s.text, color: s.accent ? p.accent : undefined })),
    );
    const main = h('div', { class: 't-main', 'data-fit': true });
    main.append(reveal.el);
    root.append(main);
    let sub: HTMLElement | undefined;
    if (p.sub) {
      sub = h('div', { class: 't-sub', dir: 'auto' }, p.sub);
      root.append(sub);
    }
    const subH = sub ? 70 : 0;
    main.style.maxHeight = `${ctx.box.h - subH}px`;
    fitText(main, ctx.box.w, ctx.box.h - subH, p.size ?? theme.type.title, 28);
    const typing = ctx.el.enter.anim === 'type';
    const cps = Number(ctx.el.enter.params.cps ?? 22);
    return {
      update(t) {
        if (typing) reveal.set(typedCount(t, ctx.el.enter.t, cps, reveal.total));
        if (sub) {
          const k = typing ? progress(t, ctx.el.enter.t + reveal.total / cps, 0.4) : 1;
          css(sub, 'opacity', k.toFixed(3));
        }
      },
    };
  },
};

export const label: RuntimeComponent = {
  name: 'label',
  mount(root, p, theme) {
    root.style.color = p.color;
    root.style.fontSize = `${p.size ?? theme.type.label}px`;
    root.style.justifyContent =
      p.align === 'center' ? 'center' : p.align === 'right' ? 'flex-end' : 'flex-start';
    if (p.dot) root.append(h('i', { class: 'dot' }));
    root.append(h('span', { dir: 'auto', 'data-fit': true }, p.text));
    return { update() {} };
  },
};

export const quote: RuntimeComponent = {
  name: 'quote',
  mount(root, p, theme, ctx) {
    const rtl = isArabic(p.text);
    root.dir = rtl ? 'rtl' : 'ltr';
    root.classList.add('rf-card');
    root.style.textAlign = rtl ? 'right' : 'left';
    const mark = h(
      'div',
      {
        class: 'qm',
        style: `color:${p.color};${rtl ? 'right' : 'left'}:44px;font-family:${fontFor(theme, 'A', 'display')}`,
      },
      rtl ? '”' : '“',
    );
    // Highlighted words are rendered in the accent color.
    const words = new Set((p.highlight as string[]).map((w) => w.toLowerCase()));
    const segs: { text: string; color?: string }[] = [];
    for (const piece of String(p.text).split(/(\s+)/)) {
      const bare = piece.replace(/[.,!?؟،"]/g, '').toLowerCase();
      const color = words.has(bare) ? p.color : undefined;
      const last = segs[segs.length - 1];
      if (last && last.color === color) last.text += piece;
      else segs.push({ text: piece, color });
    }
    const reveal = new Reveal(segs);
    const body = h('div', { class: 'qt', 'data-fit': true, style: `font-family:${fontFor(theme, p.text)}` });
    body.append(reveal.el);
    const author = p.author ? h('div', { class: 'qa', dir: 'auto' }, `— ${p.author}`) : undefined;
    root.append(mark, body);
    if (author) root.append(author);
    fitText(body, ctx.box.w - 120, ctx.box.h - (author ? 180 : 110), p.size, 26);
    const start = ctx.el.enter.t + ctx.el.enter.dur;
    return {
      update(t) {
        const n = typedCount(t, start, p.cps, reveal.total);
        reveal.set(n);
        if (author) css(author, 'opacity', progress(t, start + reveal.total / p.cps, 0.5).toFixed(3));
      },
    };
  },
};

export const stamp: RuntimeComponent = {
  name: 'stamp',
  mount(root, p, theme, ctx) {
    const st = h(
      'div',
      {
        class: 'st',
        style: `color:${p.color};border-color:${p.color};transform:rotate(${p.rot}deg);font-family:${fontFor(theme, p.text)};background:${rgba(p.color, 0.08)};box-shadow:0 0 60px ${rgba(p.color, 0.35)}, inset 0 0 30px ${rgba(p.color, 0.18)}`,
      },
      p.text,
    );
    root.append(st);
    fitText(st, ctx.box.w * 0.92, ctx.box.h * 0.86, p.size, 30);
    return { update() {} };
  },
};

export const counter: RuntimeComponent = {
  name: 'counter',
  mount(root, p) {
    const v = h('div', { class: 'v', style: `font-size:${p.size}px;color:${p.color}` });
    root.append(v);
    if (p.label) root.append(h('div', { class: 'l', dir: 'auto' }, p.label));
    return {
      update(t) {
        const val = keyframeValue(p.keyframes, t, p.from ?? 0, easeOutCubic);
        text(v, `${p.prefix}${formatNumber(val, p.decimals, p.separator)}${p.suffix}`);
      },
    };
  },
};

export const cta: RuntimeComponent = {
  name: 'cta',
  mount(root, p, theme, ctx) {
    const lbl = h('div', { class: 'cl', style: `color:${p.color}` }, p.label);
    const next = h(
      'div',
      { class: 'cn', dir: 'auto', 'data-fit': true, style: `font-family:${fontFor(theme, p.next)}` },
      p.next,
    );
    root.append(lbl, next);
    let input: HTMLElement | undefined;
    let typed: HTMLElement | undefined;
    let caret: HTMLElement | undefined;
    let ph: HTMLElement | undefined;
    let send: HTMLElement | undefined;
    if (p.keyword) {
      const av = h('div', { class: 'av', style: `background:${rgba(p.color, 0.16)}` });
      av.append(icon('user', 38, p.color));
      typed = h('span');
      caret = h('span', {
        class: 'caret',
        style: `display:inline-block;width:3px;height:1.05em;margin:0 2px;vertical-align:-0.15em;background:${p.color}`,
      });
      ph = h(
        'span',
        { class: 'ph', dir: 'auto', style: `font-family:${fontFor(theme, p.prompt)}` },
        p.prompt,
      );
      input = h('div', { class: 'inp' }, typed, caret, ph);
      send = h('div', { class: 'send', style: `background:${theme.colors.line}` }, 'POST');
      root.append(h('div', { class: 'box' }, av, input, send));
    }
    fitText(next, ctx.box.w, Math.max(120, ctx.box.h - (p.keyword ? 300 : 120)), 92, 40);
    const start = typeof p.at === 'number' ? p.at : ctx.el.enter.t + ctx.el.enter.dur + 0.4;
    const chars = [...String(p.keyword ?? '')];
    const cps = 12;
    return {
      update(t) {
        if (!typed || !caret || !ph || !send) return;
        const n = typedCount(t, start, cps, chars.length);
        text(typed, chars.slice(0, n).join(''));
        css(ph, 'display', n === 0 ? 'inline' : 'none');
        const done = n >= chars.length;
        css(caret, 'opacity', !done || caretOn(t) ? '1' : '0');
        const k = done ? clamp(progress(t, start + chars.length / cps, 0.3)) : 0;
        css(send, 'background', k > 0 ? p.color : theme.colors.line);
        css(send, 'transform', `scale(${(1 + 0.12 * Math.sin(Math.PI * k)).toFixed(4)})`);
        const bump = easeOutBack(2.2)(progress(t, start, 0.3));
        css(lbl, 'opacity', String(Math.min(1, 0.6 + 0.4 * bump)));
      },
    };
  },
};
