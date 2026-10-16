/** `code`: a code card with token colors that types itself (SRS §6.3). */
import { codeScheduleRt } from './schedule.js';
import { caretOn, easeOutCubic, progress, typedCount } from '../anim.js';
import { css, h } from '../dom.js';
import { rgba } from '../color.js';
import type { RuntimeComponent } from '../types.js';

const KEYWORDS = new Set(
  (
    'const let var function return if else for while do switch case break continue new class extends implements interface type enum ' +
    'import from export default async await try catch finally throw typeof instanceof in of void null undefined true false this super ' +
    'def lambda pass with as elif None True False and or not is yield raise except global nonlocal ' +
    'func go defer chan select struct map package range fn mut pub impl use match loop where ' +
    'SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE BEGIN COMMIT ROLLBACK FOR AND OR NOT NULL ON CONFLICT DO NOTHING ' +
    'CREATE TABLE INDEX UNIQUE PRIMARY KEY REFERENCES JOIN LEFT RIGHT INNER GROUP BY ORDER LIMIT RETURNING TRANSACTION IF EXISTS LOCK SHARE NOWAIT SKIP LOCKED'
  ).split(' '),
);

export interface Tok {
  text: string;
  cls?: string;
}

const TOKEN_RE =
  /(\/\/.*$|#.*$|--.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d[\d_.]*\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)|([{}()[\];,.:=+\-*/<>!&|?%^~]+)|(\s+)|(.)/gm;

/** Simple, deterministic highlighter for TS/JS, Python, Go, Rust and SQL snippets. */
export function highlight(line: string): Tok[] {
  const out: Tok[] = [];
  for (const m of line.matchAll(TOKEN_RE)) {
    const [s, com, str, num, fn, id, op] = m;
    if (com) out.push({ text: s, cls: 'tk-com' });
    else if (str) out.push({ text: s, cls: 'tk-str' });
    else if (num) out.push({ text: s, cls: 'tk-num' });
    else if (fn) out.push({ text: s, cls: KEYWORDS.has(fn) ? 'tk-kw' : 'tk-fn' });
    else if (id)
      out.push({ text: s, cls: KEYWORDS.has(id) ? 'tk-kw' : /^[A-Z][a-z]/.test(id) ? 'tk-ty' : undefined });
    else if (op) out.push({ text: s, cls: 'tk-op' });
    else out.push({ text: s });
  }
  return out;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function render(toks: Tok[], n: number, color?: string): string {
  let left = n;
  let html = '';
  for (const tk of toks) {
    if (left <= 0) break;
    const chars = [...tk.text];
    const part = chars.slice(0, left).join('');
    left -= chars.length;
    html += color || !tk.cls ? esc(part) : `<span class="${tk.cls}">${esc(part)}</span>`;
  }
  return html;
}

export const code: RuntimeComponent = {
  name: 'code',
  handles: ['type'],
  mount(root, p, theme, ctx) {
    root.classList.add('rf-card');
    const lines = (p.lines as (string | { text: string; color?: string; at?: number; dim?: boolean })[]).map(
      (l) => (typeof l === 'string' ? { text: l } : l),
    );
    const bar = h('div', { class: 'bar' }, h('i'), h('i'), h('i'));
    if (p.title) bar.append(h('b', {}, p.title));
    const body = h('div', { class: 'body', style: `font-size:${p.fontSize}px` });
    root.append(bar, body);
    const typing = p.typing !== false;
    const enterEnd = ctx.el.enter.t + (ctx.el.enter.anim === 'type' ? 0 : ctx.el.enter.dur);
    const sched = codeScheduleRt(lines, p.cps, enterEnd);
    const caret = h('span', { class: 'caret' });
    const views = lines.map((l, i) => {
      const hl = h('div', { class: 'hl', style: 'display:none' });
      const tx = h('span', { class: 'tx', style: l.color ? `color:${l.color}` : '' });
      const ln = h('div', { class: 'ln', style: l.dim ? 'opacity:.42' : '' });
      if (p.numbers) ln.append(h('span', { class: 'no' }, String(i + 1)));
      ln.append(hl, tx);
      body.append(ln);
      return { ln, tx, hl, toks: highlight(l.text), total: [...l.text].length, color: l.color, last: -1 };
    });
    const highlights = (p.highlight as { line: number; at?: number; until?: number; color: string }[]).map(
      (x) => ({
        ...x,
        at: x.at ?? enterEnd,
      }),
    );
    return {
      update(t) {
        let typingLine = -1;
        views.forEach((v, i) => {
          const s = sched[i];
          const n = typing ? typedCount(t, s.start, p.cps, v.total) : v.total;
          if (n !== v.last) {
            v.tx.innerHTML = render(v.toks, n, v.color);
            v.last = n;
          }
          if (typing && t >= s.start && n < v.total) typingLine = i;
          css(v.ln, 'visibility', typing && t < s.start && n === 0 ? 'hidden' : 'visible');
        });
        if (p.caret) {
          let target = typingLine;
          if (target < 0) {
            // after typing: caret blinks at the end of the last started line
            for (let i = views.length - 1; i >= 0; i--)
              if (t >= sched[i].start) {
                target = i;
                break;
              }
          }
          const show = target >= 0 && (typingLine >= 0 || caretOn(t));
          if (target < 0) caret.remove();
          else if (caret.previousSibling !== views[target].tx) views[target].tx.after(caret);
          css(caret, 'opacity', show ? '1' : '0');
        }
        for (const v of views) css(v.hl, 'display', 'none');
        for (const x of highlights) {
          const v = views[x.line - 1];
          if (!v || t < x.at || (x.until !== undefined && t >= x.until)) continue;
          const k = easeOutCubic(progress(t, x.at, 0.3));
          css(v.hl, 'display', 'block');
          css(v.hl, 'transform', `scaleX(${k.toFixed(4)})`);
          css(v.hl, 'background', rgba(x.color, 0.14));
          css(v.hl, 'border-color', x.color);
        }
        void theme;
      },
    };
  },
};
