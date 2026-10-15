/** Screen components: phone mock and THE TRAP interstitial. */
import { caretOn, clamp, easeOutBack, easeOutCubic, jitter, progress } from '../anim.js';
import { css, h, text } from '../dom.js';
import { icon } from '../icons.js';
import { rgba, resolve } from '../color.js';
import type { RuntimeComponent } from '../types.js';
import { fontFor } from './util.js';

const NOTE_H = 112;

export const phone: RuntimeComponent = {
  name: 'phone',
  mount(root, p, theme, ctx) {
    const scr = h('div', { class: 'scr' });
    const wifi = h('span', { style: 'display:flex' });
    const sb = h('div', { class: 'sb' }, h('span', {}, '9:41'), h('span', { class: 'ic' }, wifi, h('span', { style: `width:38px;height:18px;border-radius:5px;border:2px solid ${theme.colors.ink};padding:2px;display:flex` }, h('i', { style: `flex:1;background:${theme.colors.ink};border-radius:2px` }))));
    const offB = h('div', { class: 'offb' });
    offB.append(icon('wifi-off', 26, theme.colors.red, 2.4), document.createTextNode('NO CONNECTION'));
    const off = h('div', { class: 'off' }, offB);
    const btnLabel = h('span', { dir: 'auto' });
    const spin = h('i', { class: 'spin' });
    const ripple = h('i', { class: 'ripple', style: 'display:none' });
    const btn = h('div', { class: 'btn', style: `background:${theme.colors.lime};color:#07080c` }, spin, btnLabel, ripple);
    const app = h(
      'div',
      { class: 'app' },
      h('div', { class: 'ah' }, 'Secure checkout'),
      h('div', { class: 'at', dir: 'auto', style: `font-family:${fontFor(theme, p.title)}` }, p.title),
    );
    if (p.item || p.amount) {
      const item = h('div', { class: 'item', dir: 'auto' });
      if (p.item) item.append(h('div', { style: `font-family:${fontFor(theme, p.item)}` }, p.item));
      if (p.amount) item.append(h('div', { class: 'amt' }, p.amount));
      app.append(item);
    }
    app.append(btn);
    const okIcon = h('div', { style: 'display:flex' });
    okIcon.append(icon('check', 120, theme.colors.lime, 2.4));
    const okText = h('b', { dir: 'auto' });
    const ok = h('div', { class: 'ok', style: 'display:none' }, okIcon, okText);
    scr.append(sb, off, app, ok);
    const notes = (p.notifications as { title: string; text: string; at?: number; color: string; icon: string }[]).map((n) => {
      const c = resolve(n.color);
      const ni = h('div', { class: 'ni', style: `background:${rgba(c, 0.18)}` });
      ni.append(icon(n.icon, 34, c, 2.2));
      const el = h(
        'div',
        { class: 'nt', style: 'display:none' },
        ni,
        h('div', { class: 'nb' }, h('div', { class: 'nh' }, n.title), h('div', { class: 'nx', dir: 'auto', style: `font-family:${fontFor(theme, n.text)}` }, n.text)),
      );
      scr.append(el);
      return { n, el };
    });
    root.append(scr, h('div', { class: 'notch' }));
    const taps = (p.taps as { at: number }[]).map((x) => x.at);
    let wifiOff: boolean | null = null;
    return {
      update(t, _l, st) {
        const offline = Boolean(st.offline ?? p.offline);
        if (offline !== wifiOff) {
          wifiOff = offline;
          wifi.replaceChildren(icon(offline ? 'wifi-off' : 'wifi', 24, offline ? theme.colors.red : theme.colors.ink, 2.4));
        }
        const offK = offline ? easeOutCubic(progress(t, st.$since.offline ?? -1e9, 0.35)) : 0;
        css(off, 'opacity', offK.toFixed(3));
        css(off, 'transform', `translateY(${((1 - offK) * -20).toFixed(2)}px)`);
        const loading = Boolean(st.loading ?? p.loading);
        css(spin, 'display', loading ? 'block' : 'none');
        css(spin, 'transform', `rotate(${((t * 400) % 360).toFixed(1)}deg)`);
        text(btnLabel, loading ? '' : String(st.button ?? p.button));
        // taps
        let tapK = -1;
        for (const at of taps) if (t >= at && t < at + 0.5) tapK = (t - at) / 0.5;
        css(ripple, 'display', tapK >= 0 ? 'block' : 'none');
        if (tapK >= 0) {
          css(ripple, 'transform', `scale(${(1 + 9 * easeOutCubic(tapK)).toFixed(3)})`);
          css(ripple, 'opacity', (0.6 * (1 - tapK)).toFixed(3));
        }
        const press = tapK >= 0 && tapK < 0.3 ? Math.sin((tapK / 0.3) * Math.PI) : 0;
        css(btn, 'transform', `scale(${(1 - 0.05 * press).toFixed(4)})`);
        css(btn, 'background', offline && !loading ? rgba(theme.colors.lime, 0.8) : theme.colors.lime);
        // success overlay
        const success = st.success ?? p.success;
        const sK = success ? easeOutBack(1.8)(progress(t, st.$since.success ?? ctx.el.enter.t, 0.45)) : 0;
        css(ok, 'display', success ? 'flex' : 'none');
        css(ok, 'opacity', clamp(sK * 1.5).toFixed(3));
        css(okIcon, 'transform', `scale(${(0.5 + 0.5 * sK).toFixed(4)})`);
        text(okText, typeof success === 'string' ? success : 'Payment complete');
        okText.style.fontFamily = fontFor(theme, okText.textContent ?? '');
        // notifications: explicit `at`, or the first N from state.notifications
        const count = Number(st.notifications ?? 0);
        const shown = notes
          .map((x, i) => ({ ...x, at: x.n.at ?? (i < count ? (st.$since.notifications ?? 0) + (i - (count - 1)) * 0 : undefined) }))
          .filter((x) => x.at !== undefined && t >= x.at)
          .sort((a, b) => (b.at as number) - (a.at as number));
        for (const x of notes) css(x.el, 'display', 'none');
        shown.slice(0, 4).forEach((x, i) => {
          const k = easeOutBack(1.6)(progress(t, x.at as number, 0.45));
          const y = 64 + i * NOTE_H;
          css(x.el, 'display', 'flex');
          css(x.el, 'top', `${y}px`);
          css(x.el, 'transform', `translateY(${((1 - k) * -150).toFixed(2)}px)`);
          css(x.el, 'opacity', clamp(k * 1.4).toFixed(3));
        });
      },
    };
  },
};

export const trap: RuntimeComponent = {
  name: 'trap',
  handles: ['glitch'],
  mount(root, p, theme, ctx) {
    const c = resolve(p.color);
    const bg = h('div', { class: 'bg' });
    const word = `${p.title} · `.repeat(14);
    const tapeA = h('div', { class: 'tape', style: `top:${ctx.box.h * 0.16}px;background:${c};transform:rotate(-7deg)` }, word);
    const tapeB = h('div', { class: 'tape', style: `top:${ctx.box.h * 0.74}px;background:${c};transform:rotate(5deg)` }, word);
    const warn = h('div', { style: 'display:flex' });
    warn.append(icon('warn', 190, c, 1.6));
    const title = h('div', { class: 'tt', style: `color:${c};font-family:${fontFor(theme, p.title)}` }, p.title);
    const center = h('div', { class: 'center' }, warn, title);
    if (p.sub) center.append(h('div', { class: 'ts', dir: 'auto' }, p.sub));
    root.append(bg, tapeA, tapeB, center);
    const start = typeof p.at === 'number' ? p.at : ctx.el.enter.t;
    const until = typeof p.until === 'number' ? p.until : undefined;
    return {
      update(t) {
        const inK = easeOutCubic(progress(t, start, 0.45));
        const outK = until !== undefined ? easeOutCubic(progress(t, until, 0.35)) : 0;
        const vis = t >= start && outK < 1;
        css(root, 'visibility', vis ? 'visible' : 'hidden');
        if (!vis) return;
        css(root, 'opacity', (1 - outK).toFixed(3));
        css(bg, 'opacity', inK.toFixed(3));
        const drift = ((t - start) * 60) % 400;
        css(tapeA, 'transform', `rotate(-7deg) translateX(${((1 - inK) * -1200 - drift).toFixed(1)}px)`);
        css(tapeB, 'transform', `rotate(5deg) translateX(${((1 - inK) * 1200 + drift - 400).toFixed(1)}px)`);
        const g = 1 - clamp((t - start) / 0.6);
        const j = jitter(ctx.seed, t, 24);
        css(title, 'text-shadow', g > 0.02 ? `${(g * 14 * (1 + j)).toFixed(1)}px 0 rgba(255,74,92,.9), ${(-g * 14 * (1 - j)).toFixed(1)}px 0 rgba(85,220,255,.9)` : `0 0 60px ${rgba(c, 0.45)}`);
        css(title, 'transform', `translateX(${(j * 18 * g).toFixed(1)}px) scale(${(0.9 + 0.1 * easeOutBack(2)(progress(t, start, 0.4))).toFixed(4)})`);
        const pulse = 1 + 0.06 * Math.sin((t - start) * Math.PI * 2 * 1.2);
        css(warn, 'transform', `scale(${(easeOutBack(2.4)(progress(t, start + 0.1, 0.45)) * pulse).toFixed(4)})`);
        css(warn, 'opacity', caretOn(t * 0.5) || t - start > 1.2 ? '1' : '0.75');
      },
    };
  },
};
