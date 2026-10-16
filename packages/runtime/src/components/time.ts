/** Time components: calendar, clock (and countdown), schedule-board, appointment. */
import { clamp, easeInOutCubic, easeOutBack, progress } from '../anim.js';
import { attr, css, h, s, text } from '../dom.js';
import { icon } from '../icons.js';
import { resolve, rgba } from '../color.js';
import type { RuntimeComponent } from '../types.js';
import {
  colorOr,
  contrastText,
  fitWithin,
  flash,
  itemAt,
  mirrorX,
  polar,
  reveal,
  ringArc,
  svgBox,
  textDir,
  textEl,
} from './chart.js';
import {
  clockSeconds,
  digitsOf,
  flapChar,
  flapSettle,
  formatClock,
  formatCountdown,
  monthGrid,
  MONTHS,
  WEEKDAYS,
} from './timeutil.js';
import { isArabic, statusColor } from './util.js';

// ------------------------------------------------------------------ calendar

export const calendar: RuntimeComponent = {
  name: 'calendar',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const lang: 'en' | 'ar' = p.lang;
    const names: string[] = p.weekdays ?? WEEKDAYS[lang];
    const monthName: string = p.monthName ?? MONTHS[lang][p.month - 1];
    const rtl = lang === 'ar' || textDir(monthName, ...names) === 'rtl';
    const grid = monthGrid(p.year, p.month, p.weekStart);
    const num = (v: number | string) => digitsOf(v, p.digits);
    const base = resolve(p.color);
    const accent = resolve(p.accent);
    root.classList.add('rf-card');
    root.dir = rtl ? 'rtl' : 'ltr';
    const pad = Math.round(Math.min(W, H) * 0.05);
    const headH = Math.round(fs * 2.2);
    const wkH = Math.round(fs * 1.5);
    const iw = W - 2 * pad;
    const cw = iw / 7;
    const chh = (H - 2 * pad - headH - wkH) / grid.rows;
    const head = h('div', {
      class: 'cal-head',
      style: `left:${pad}px;right:${pad}px;top:${pad}px;height:${headH}px`,
    });
    const mName = textEl(theme, monthName, { size: Math.round(fs * 1.3), weight: 800 });
    const year = h(
      'span',
      { class: 'cal-year rf-num', style: `font-size:${Math.round(fs * 1.05)}px;color:${base}` },
      num(p.year),
    );
    head.append(mName, year);
    root.append(head);
    fitWithin(mName, iw * 0.7, headH, Math.round(fs * 1.3), 14);
    const weekend = new Set(lang === 'ar' ? [5, 6] : [0, 6]);
    grid.order.forEach((wd, col) => {
      const lab = textEl(theme, names[wd], {
        cls: 'cal-wd',
        size: Math.round(fs * (lang === 'ar' ? 0.56 : 0.62)),
        style: `left:${pad + mirrorX(col * cw, cw, iw, rtl)}px;width:${cw}px;top:${pad + headH}px;color:${weekend.has(wd) ? rgba(theme.colors.ink, 0.42) : theme.colors.dim}`,
      });
      root.append(lab);
      fitWithin(lab, cw - 4, wkH, Math.round(fs * (lang === 'ar' ? 0.56 : 0.62)), 10);
    });
    const cellOf = (day: number) => grid.cells[clamp(day, 1, grid.days) - 1];
    const cellBox = (day: number) => {
      const c = cellOf(day);
      return { x: pad + mirrorX(c.col * cw, cw, iw, rtl), y: pad + headH + wkH + c.row * chh };
    };
    const d = Math.min(cw, chh) * 0.84;
    // highlight discs (behind the numbers)
    const days = (p.days as (number | { day: number; at?: number; color?: string; label?: string })[]).map(
      (x) => (typeof x === 'number' ? { day: x } : x),
    );
    const marks = days
      .filter((x) => x.day <= grid.days)
      .map((x, i) => {
        const b = cellBox(x.day);
        const c = colorOr(x.color, accent);
        const disc = h('i', {
          class: 'cal-disc',
          style: `left:${b.x + (cw - d) / 2}px;top:${b.y + (chh - d) / 2}px;width:${d}px;height:${d}px;background:${c};box-shadow:0 0 26px ${rgba(c, 0.55)}`,
        });
        root.append(disc);
        return { ...x, disc, c, at: itemAt(ctx, i, p.stagger, x.at) };
      });
    const numbers = grid.cells.map((c) => {
      const b = cellBox(c.day);
      const el = h(
        'span',
        {
          class: 'cal-day rf-num',
          style: `left:${b.x}px;top:${b.y}px;width:${cw}px;height:${chh}px;font-size:${Math.round(Math.min(fs, chh * 0.42))}px;color:${weekend.has(grid.order[c.col]) ? theme.colors.dim : theme.colors.ink}`,
        },
        num(c.day),
      );
      root.append(el);
      return el;
    });
    const labels = marks.map((m) => {
      if (!m.label) return undefined;
      const b = cellBox(m.day);
      const size = Math.round(Math.min(fs * 0.42, chh * 0.2));
      const el = textEl(theme, m.label, {
        cls: 'cal-note',
        size,
        weight: 700,
        style: `left:${b.x}px;width:${cw}px;top:${b.y + chh * 0.68}px;color:${contrastText(m.c)}`,
      });
      root.append(el);
      fitWithin(el, cw - 6, size * 1.3, size, 9);
      return el;
    });
    return {
      update(t) {
        marks.forEach((m, i) => {
          const vis = t >= m.at;
          const k = vis ? easeOutBack(2.2)(progress(t, m.at, 0.4)) : 0;
          css(m.disc, 'visibility', vis ? 'visible' : 'hidden');
          css(m.disc, 'transform', `scale(${k.toFixed(4)})`);
          const nEl = numbers[m.day - 1];
          css(nEl, 'color', vis ? contrastText(m.c) : '');
          css(nEl, 'font-weight', vis ? '800' : '');
          const lab = labels[i];
          if (lab) reveal(lab, t, m.at + 0.15, { dy: 6, dur: 0.3 });
        });
      },
    };
  },
};

// ------------------------------------------------------------------ clock

export const clock: RuntimeComponent = {
  name: 'clock',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const accent = resolve(p.accent);
    const ink = resolve(p.color);
    const countdown = p.mode === 'countdown';
    const labH = p.label ? Math.round(Math.min(46, H * 0.12)) : 0;
    const S = Math.min(W, H - labH - (labH ? 12 : 0));
    const cx = W / 2;
    const cy = S / 2 + (H - labH - S) / 2;
    let lab: HTMLElement | undefined;
    if (p.label) {
      lab = textEl(theme, p.label, {
        cls: 'ck-label',
        size: Math.round(labH * 0.62),
        style: `top:${H - labH}px;height:${labH}px`,
      });
      root.append(lab);
      fitWithin(lab, W, labH, Math.round(labH * 0.62), 12);
    }
    const start = typeof p.at === 'number' ? p.at : ctx.el.enter.t + ctx.el.enter.dur;
    const remainingAt = (t: number) => Math.max(0, p.from - Math.max(0, t - start));

    if (p.face === 'digital') {
      const card = h('div', {
        class: 'ck-digital rf-card',
        style: `left:0;top:${(H - labH - S * 0.62) / 2}px;width:${W}px;height:${S * 0.62}px`,
      });
      const big = h('div', { class: 'ck-big rf-num', 'data-fit': true, style: `color:${ink}` });
      const ampm = h('span', { class: 'ck-ampm', style: `color:${accent}` });
      card.append(big, ampm);
      root.append(card);
      big.textContent = countdown
        ? formatCountdown(p.from)
        : formatClock(0, p.hours, p.seconds).text.replace(/\d/g, '8');
      fitWithin(big, W - 60 - (p.hours === '12' ? 90 : 0), S * 0.5, Math.round(S * 0.42), 20);
      return {
        update(t) {
          if (countdown) {
            const r = remainingAt(t);
            text(big, formatCountdown(r));
            const fl = r <= 0 ? flash(t, start + p.from, 0.8) : 0;
            css(big, 'color', r <= 0 ? accent : ink);
            css(
              card,
              'box-shadow',
              r <= 0 ? `0 0 ${(30 + 50 * fl).toFixed(0)}px ${rgba(accent, 0.5)}` : 'none',
            );
            text(ampm, '');
          } else {
            const f = formatClock(clockSeconds(p.time, p.keyframes, t, easeInOutCubic), p.hours, p.seconds);
            text(big, f.text);
            text(ampm, f.ampm);
          }
        },
      };
    }

    const R = S / 2 - 8;
    const svg = svgBox(W, H);
    root.append(svg);
    svg.append(
      s('circle', {
        cx,
        cy,
        r: R,
        fill: theme.colors.card,
        stroke: rgba(theme.colors.ink, 0.16),
        'stroke-width': 4,
        style: `filter:drop-shadow(0 18px 40px ${rgba('#000000', 0.25)})`,
      }),
    );
    if (countdown) {
      const th = R * 0.12;
      const rr = R - th / 2 - 10;
      svg.append(
        s('circle', {
          cx,
          cy,
          r: rr,
          fill: 'none',
          stroke: rgba(theme.colors.ink, 0.08),
          'stroke-width': th,
        }),
      );
      const arc = s('circle', {
        cx,
        cy,
        r: rr,
        fill: 'none',
        stroke: accent,
        'stroke-width': th,
        'stroke-linecap': 'round',
        transform: `rotate(-90 ${cx} ${cy})`,
        style: `filter:drop-shadow(0 0 12px ${rgba(accent, 0.6)})`,
      });
      svg.append(arc);
      const inner = (rr - th) * 1.5;
      const big = h('div', {
        class: 'ck-cd rf-num',
        'data-fit': true,
        style: `left:${cx - inner / 2}px;top:${cy - inner * 0.3}px;width:${inner}px;height:${inner * 0.6}px;color:${ink}`,
      });
      root.append(big);
      const short = p.from <= 99;
      big.textContent = short ? String(Math.ceil(p.from)) : formatCountdown(p.from);
      fitWithin(big, inner, inner * 0.6, Math.round(inner * (short ? 0.52 : 0.3)), 18);
      return {
        update(t) {
          const r = remainingAt(t);
          ringArc(arc, rr, 1 - r / p.from, r / p.from);
          attr(arc, 'opacity', r > 0 ? '1' : '0');
          text(big, short ? String(Math.ceil(r - 1e-6)) : formatCountdown(r));
          const tick = t >= start && r > 0 ? 1 - clamp(((t - start) % 1) / 0.25) : 0;
          css(big, 'transform', `scale(${(1 + 0.06 * tick).toFixed(4)})`);
          css(big, 'color', r <= 0 ? accent : ink);
        },
      };
    }
    // analog dial
    for (let i = 0; i < 60; i++) {
      const major = i % 5 === 0;
      const a = polar(cx, cy, R - 14, (i / 60) * Math.PI * 2);
      const b = polar(cx, cy, R - (major ? 34 : 22), (i / 60) * Math.PI * 2);
      svg.append(
        s('line', {
          x1: a.x.toFixed(2),
          y1: a.y.toFixed(2),
          x2: b.x.toFixed(2),
          y2: b.y.toFixed(2),
          stroke: rgba(theme.colors.ink, major ? 0.75 : 0.25),
          'stroke-width': major ? 5 : 2,
          'stroke-linecap': 'round',
        }),
      );
    }
    const hand = (len: number, w: number, c: string) => {
      const l = s('line', {
        x1: cx,
        y1: cy + len * 0.14,
        x2: cx,
        y2: cy - len,
        stroke: c,
        'stroke-width': w,
        'stroke-linecap': 'round',
      });
      svg.append(l);
      return l;
    };
    const hh = hand(R * 0.5, Math.max(6, R * 0.055), ink);
    const mm = hand(R * 0.74, Math.max(4, R * 0.035), ink);
    const ss = p.seconds ? hand(R * 0.8, 2.5, accent) : undefined;
    svg.append(s('circle', { cx, cy, r: Math.max(7, R * 0.05), fill: accent }));
    return {
      update(t) {
        const sec = clockSeconds(p.time, p.keyframes, t, easeInOutCubic);
        const rot = (el: SVGElement, deg: number) =>
          attr(el, 'transform', `rotate(${deg.toFixed(3)} ${cx} ${cy})`);
        rot(hh, ((sec / 3600) % 12) * 30);
        rot(mm, ((sec / 60) % 60) * 6);
        if (ss) rot(ss, (Math.floor(sec) % 60) * 6);
      },
    };
  },
};

// ------------------------------------------------------------------ schedule-board

interface Change {
  t: number;
  text: string;
  status?: string;
}

export const scheduleBoard: RuntimeComponent = {
  name: 'schedule-board',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const fs: number = p.fontSize;
    const c = resolve(p.color);
    const cols: string[] = p.columns;
    const rows = p.rows as { cells: string[]; at?: number; status?: string }[];
    const updates = p.updates as { at: number; row: number; col: number; text: string; status?: string }[];
    root.classList.add('rf-card');
    const pad = 22;
    const headH = Math.round(fs * 2);
    const colH = Math.round(fs * 1.3);
    const rowH = Math.min(fs * 2.4, (H - pad * 2 - headH - colH) / rows.length);
    const ncol = cols.length;
    const chars = cols.map((col, j) =>
      Math.max(
        3,
        col.length * 0.6,
        ...rows.map((r) => (r.cells[j] ?? '').length),
        ...updates.filter((u) => u.col === j).map((u) => u.text.length),
      ),
    );
    const weights: number[] = p.widths ?? chars;
    const sum = weights.reduce((a, b) => a + b, 0);
    const iw = W - pad * 2;
    const gapC = 18;
    const colW = weights.map((w) => ((iw - gapC * (ncol - 1)) * w) / sum);
    const colX = colW.map((_, j) => pad + colW.slice(0, j).reduce((a, b) => a + b, 0) + gapC * j);
    const head = h('div', {
      class: 'sb-head',
      style: `left:${pad}px;right:${pad}px;top:${pad}px;height:${headH}px;color:${c}`,
    });
    head.append(icon(p.icon, Math.round(fs * 1.2), c, 2));
    const title = textEl(theme, p.title, {
      cls: 'sb-title',
      size: Math.round(fs * 1.05),
      weight: 800,
      kind: 'mono',
    });
    head.append(title);
    root.append(head);
    fitWithin(title, iw - fs * 2, headH, Math.round(fs * 1.05), 14);
    cols.forEach((col, j) => {
      const el = textEl(theme, col, {
        cls: 'sb-col',
        size: Math.round(fs * 0.55),
        kind: 'mono',
        style: `left:${colX[j]}px;width:${colW[j]}px;top:${pad + headH}px`,
      });
      root.append(el);
      fitWithin(el, colW[j], colH, Math.round(fs * 0.55), 10);
    });
    const rowAt = rows.map((r, i) => itemAt(ctx, i, p.stagger, r.at));
    // Every cell's history of texts: blank, the row's text when it appears, then updates.
    const cells = rows.map((r, i) =>
      cols.map((_, j) => {
        const hist: Change[] = [
          { t: -1e9, text: '' },
          { t: rowAt[i], text: (r.cells[j] ?? '').toUpperCase(), status: r.status },
        ];
        for (const u of updates)
          if (u.row === i && u.col === j)
            hist.push({ t: u.at, text: u.text.toUpperCase(), status: u.status });
        hist.sort((a, b) => a.t - b.t);
        return hist;
      }),
    );
    const views = rows.map((r, i) => {
      const y = pad + headH + colH + i * rowH;
      const line = h('div', {
        class: 'sb-row',
        style: `left:${pad}px;right:${pad}px;top:${y}px;height:${rowH}px`,
      });
      root.append(line);
      return cols.map((_, j) => {
        const n = chars[j];
        const arabic = cells[i][j].some((x) => isArabic(x.text));
        const box = h('div', {
          class: 'sb-cell',
          style: `left:${colX[j] - pad}px;width:${colW[j]}px;height:${rowH}px`,
        });
        line.append(box);
        if (arabic) {
          const el = textEl(theme, '', { cls: 'sb-ar', size: Math.round(fs * 0.9), weight: 700 });
          box.append(el);
          return { arabic, tiles: [] as HTMLElement[], whole: el, n };
        }
        const tw = Math.min(fs * 0.86, (colW[j] - 2 * (n - 1)) / n);
        const tiles = Array.from({ length: n }, () => {
          const tile = h('span', {
            class: 'sb-ch rf-num',
            style: `width:${tw.toFixed(1)}px;height:${(rowH * 0.78).toFixed(1)}px;font-size:${Math.min(fs, tw * 1.3).toFixed(1)}px`,
          });
          box.append(tile);
          return tile;
        });
        return { arabic, tiles, whole: undefined as HTMLElement | undefined, n };
      });
    });
    return {
      update(t) {
        views.forEach((cellViews, i) => {
          let status: string | undefined;
          cellViews.forEach((cv, j) => {
            const hist = cells[i][j];
            let k = 0;
            for (let q = 0; q < hist.length; q++) if (hist[q].t <= t) k = q;
            const cur = hist[k];
            const prev = hist[Math.max(0, k - 1)];
            if (cur.status) status = cur.status;
            const seed = ctx.seed + i * 31 + j * 7 + k * 101;
            if (cv.whole) {
              const flipK = progress(t, cur.t, p.flip * 0.6);
              text(cv.whole, flipK < 0.5 ? prev.text : cur.text);
              css(cv.whole, 'transform', `scaleY(${Math.abs(Math.cos(Math.PI * flipK)).toFixed(3)})`);
              return;
            }
            cv.tiles.forEach((tile, ci) => {
              const ch = flapChar(prev.text, cur.text, ci, t, cur.t, p.flip, seed);
              text(tile, ch === ' ' ? '\u00a0' : ch);
              const spinning = t >= cur.t && t < flapSettle(cur.t, p.flip, ci, cv.n);
              css(
                tile,
                'transform',
                spinning ? `scaleY(${(0.55 + 0.45 * Math.abs(Math.cos(t * 40 + ci))).toFixed(3)})` : 'none',
              );
            });
          });
          const sc = status ? statusColor(theme, status, theme.colors.ink) : theme.colors.ink;
          const last = cellViews[cellViews.length - 1];
          for (const tile of last.tiles) css(tile, 'color', sc);
          if (last.whole) css(last.whole, 'color', sc);
        });
      },
    };
  },
};

// ------------------------------------------------------------------ appointment

const STATUS: Record<string, { color: string; text: string; icon: string }> = {
  confirmed: { color: 'lime', text: 'CONFIRMED', icon: 'circle-check' },
  pending: { color: 'amber', text: 'PENDING', icon: 'hourglass' },
  cancelled: { color: 'red', text: 'CANCELLED', icon: 'circle-x' },
  done: { color: 'cyan', text: 'DONE', icon: 'check' },
};

export const appointment: RuntimeComponent = {
  name: 'appointment',
  mount(root, p, theme, ctx) {
    const W = ctx.box.w;
    const H = ctx.box.h;
    const c = resolve(p.color);
    const rtl = textDir(p.title, p.place, p.person, p.date, p.statusText) === 'rtl';
    root.classList.add('rf-card');
    root.dir = rtl ? 'rtl' : 'ltr';
    root.style.boxShadow = `inset ${rtl ? -8 : 8}px 0 0 ${c}, 0 24px 60px rgba(0,0,0,.25)`;
    const pad = Math.round(Math.min(W, H) * 0.1);
    const icS = Math.round(Math.min(H * 0.34, 120));
    const tile = h('div', {
      class: 'ap-ic',
      style: `width:${icS}px;height:${icS}px;top:${pad}px;${rtl ? 'right' : 'left'}:${pad}px;background:${rgba(c, 0.16)};border-color:${rgba(c, 0.5)}`,
    });
    tile.append(icon(p.icon, Math.round(icS * 0.56), c, 2));
    root.append(tile);
    const x0 = pad + icS + Math.round(pad * 0.7);
    const bodyW = W - x0 - pad;
    const titleFs = Math.round(Math.min(H * 0.15, 52));
    const rowFs = Math.round(Math.min(H * 0.095, 32));
    const body = h('div', {
      class: 'ap-body',
      style: `${rtl ? 'right' : 'left'}:${x0}px;width:${bodyW}px;top:${pad - 4}px;bottom:${pad}px`,
    });
    const chip = h('span', { class: 'ap-chip' });
    const chipIc = h('span', { class: 'ap-chip-ic' });
    const chipTx = h('span', { dir: 'auto' });
    chip.append(chipIc, chipTx);
    body.append(chip);
    const title = textEl(theme, p.title, { cls: 'ap-title', size: titleFs, weight: 800 });
    body.append(title);
    const rows: [string, string][] = [];
    rows.push(['calendar', p.time ? `${p.date}  ·  ${p.time}` : p.date]);
    if (p.place) rows.push(['map-pin', p.place]);
    if (p.person) rows.push(['user', p.person]);
    const rowEls = rows.map(([ic, tx]) => {
      const r = h('div', { class: 'ap-row', style: `font-size:${rowFs}px` });
      r.append(icon(ic, Math.round(rowFs * 1.05), theme.colors.dim, 2));
      const te = textEl(theme, tx, { size: rowFs });
      r.append(te);
      body.append(r);
      return { r, te };
    });
    root.append(body);
    fitWithin(title, bodyW, titleFs * 1.3, titleFs, 18);
    for (const r of rowEls) fitWithin(r.te, bodyW - rowFs * 1.6, rowFs * 1.4, rowFs, 14);
    let lastStatus = '';
    return {
      update(t, _l, st) {
        const status = String(st.status ?? p.status);
        const def = STATUS[status] ?? STATUS.confirmed;
        const sc = theme.colors[def.color] ?? c;
        if (status !== lastStatus) {
          lastStatus = status;
          chipIc.replaceChildren(icon(def.icon, Math.round(rowFs * 0.8), sc, 2.4));
        }
        text(chipTx, st.status !== undefined ? def.text : (p.statusText ?? def.text));
        const since = st.$since.status;
        const fl = since !== undefined ? flash(t, since, 0.8) : 0;
        css(chip, 'color', sc);
        css(chip, 'border-color', rgba(sc, 0.6));
        css(chip, 'background', rgba(sc, 0.12 + 0.25 * fl));
        css(chip, 'font-size', `${Math.round(rowFs * 0.72)}px`);
        reveal(chip, t, ctx.el.enter.t + ctx.el.enter.dur * 0.6, {
          s0: 0.6,
          dur: 0.35,
          base: fl > 0 ? `scale(${(1 + 0.08 * fl).toFixed(4)})` : undefined,
        });
      },
    };
  },
};
