/**
 * Turns times back into readable, voice-anchored time expressions: dropping an element on a word
 * writes `l3:'Idempotency'`, so it stays on that word when the line is re-recorded.
 */
import { app } from './app.js';

export interface SnapPoint {
  t: number;
  expr: string;
  label: string;
  kind: 'word' | 'line' | 'scene' | 'playhead' | 'edge';
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function wordExpr(lineId: string, words: { text: string }[], i: number): string {
  const w = words[i].text;
  if (/['"‘’]/.test(w) || !w.trim()) return `${lineId}.${i}`;
  const n = words.slice(0, i + 1).filter((x) => x.text === w).length;
  return `${lineId}:'${w}'${n > 1 ? `#${n}` : ''}`;
}

/** Word and line starts (and scene starts) that times can snap to. */
export function snapPoints(): SnapPoint[] {
  const tl = app.timeline;
  if (!tl) return [];
  const out: SnapPoint[] = [];
  for (const l of tl.script) {
    out.push({ t: l.start, expr: l.id, label: `${l.id} start`, kind: 'line' });
    l.words.forEach((w, i) => {
      if (i === 0) return;
      out.push({ t: w.start, expr: wordExpr(l.id, l.words, i), label: `“${w.text}”`, kind: 'word' });
    });
  }
  for (const s of tl.scenes)
    out.push({ t: s.start, expr: `@${s.id}`, label: `scene ${s.id}`, kind: 'scene' });
  return out.sort((a, b) => a.t - b.t);
}

/** Expression for time t: an exact word/line when t is on one, otherwise "line + offset". */
export function exprFor(t: number): string {
  const tl = app.timeline;
  t = round(Math.max(0, t));
  if (!tl || !tl.script.length) return `${t}s`;
  for (const l of tl.script) {
    if (Math.abs(l.start - t) < 0.0015) return l.id;
    const i = l.words.findIndex((w) => Math.abs(w.start - t) < 0.0015);
    if (i > 0) return wordExpr(l.id, l.words, i);
  }
  let line = null;
  for (const l of tl.script) if (l.start <= t) line = l;
  if (!line) return `${t}s`;
  const off = round(t - line.start);
  return off ? `${line.id}+${off}` : line.id;
}

/** Nearest snap point within `tol` seconds (or null). */
export function nearestSnap(t: number, tol: number, extra: SnapPoint[] = []): SnapPoint | null {
  let best: SnapPoint | null = null;
  for (const p of [...snapPoints(), ...extra]) {
    const d = Math.abs(p.t - t);
    if (d <= tol && (!best || d < Math.abs(best.t - t))) best = p;
  }
  return best;
}

/** Human description of a time expression ("on “Idempotency” in l3"). */
export function describeExpr(v: unknown): string {
  if (typeof v === 'number') return `${v} s`;
  if (typeof v !== 'string') return '';
  const m = v.match(/^([A-Za-z_]\w*):'([^']+)'(?:#(\d+))?(.*)$/);
  if (m) return `on “${m[2]}”${m[3] ? ` (#${m[3]})` : ''} in ${m[1]}${m[4] ? ` ${m[4]}` : ''}`;
  if (/^[A-Za-z_]\w*\.end/.test(v)) return `end of line ${v.split('.')[0]}`;
  if (/^@/.test(v)) return `scene ${v.slice(1)}`;
  if (/^[A-Za-z_]\w*$/.test(v)) return `start of line ${v}`;
  return v;
}
