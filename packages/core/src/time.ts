/**
 * Time expressions (SRS §5).
 *
 *   expr     := base offset*
 *   base     := NUMBER "s" | NUMBER | LINE_ID | LINE_ID ".end" | LINE_ID ":" QUOTED ("#" INT)?
 *             | LINE_ID "." INT | "@" SCENE_ID ("." ("start"|"end"))?
 *   offset   := ("+"|"-") NUMBER "s"?
 */
import { closest, round3 } from './util.js';
import { normalizeWord, splitWords } from './text.js';

export type TimeBase =
  | { kind: 'seconds'; value: number }
  | { kind: 'line'; id: string; part: 'start' | 'end' }
  | { kind: 'word'; id: string; word: string; occurrence: number }
  | { kind: 'wordIndex'; id: string; index: number }
  | { kind: 'scene'; id: string; part: 'start' | 'end' };

export interface TimeExpr {
  base: TimeBase;
  offset: number;
  source: string;
}

export class TimeError extends Error {
  constructor(
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
  }
}

const ID = '[A-Za-z_][A-Za-z0-9_]*';
const NUM = '\\d+(?:\\.\\d+)?|\\.\\d+';
const RE_SECONDS = new RegExp(`^(${NUM})s?`);
const RE_SCENE = new RegExp(`^@(${ID})(?:\\.(start|end))?`);
const RE_WORD = new RegExp(`^(${ID}):(?:'([^']+)'|"([^"]+)"|‘([^’]+)’)(?:#(\\d+))?`);
const RE_LINE_END = new RegExp(`^(${ID})\\.end\\b`);
const RE_LINE_IDX = new RegExp(`^(${ID})\\.(\\d+)(?![\\d.])`);
const RE_LINE = new RegExp(`^(${ID})`);
const RE_OFFSET = new RegExp(`^([+-])\\s*(${NUM})s?`);

export function parseTime(input: string | number): TimeExpr {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new TimeError(`"${input}" is not a finite number of seconds`);
    return { base: { kind: 'seconds', value: input }, offset: 0, source: String(input) };
  }
  const source = input;
  let s = input.trim();
  if (!s)
    throw new TimeError(
      'Empty time expression',
      "Use seconds ('12.5s'), a line ('l7') or a word (\"l7:'word'\")",
    );
  let base: TimeBase;
  let m: RegExpMatchArray | null;
  if ((m = s.match(RE_SCENE))) {
    base = { kind: 'scene', id: m[1], part: (m[2] as 'start' | 'end') ?? 'start' };
  } else if ((m = s.match(RE_WORD))) {
    const word = (m[2] ?? m[3] ?? m[4]).trim();
    const occurrence = m[5] ? Number(m[5]) : 1;
    if (occurrence < 1) throw new TimeError(`Occurrence "#${m[5]}" must be ≥ 1 in "${source}"`);
    base = { kind: 'word', id: m[1], word, occurrence };
  } else if ((m = s.match(RE_LINE_END))) {
    base = { kind: 'line', id: m[1], part: 'end' };
  } else if ((m = s.match(RE_LINE_IDX))) {
    base = { kind: 'wordIndex', id: m[1], index: Number(m[2]) };
  } else if (/^\d|^\./.test(s) && (m = s.match(RE_SECONDS))) {
    base = { kind: 'seconds', value: Number(m[1]) };
  } else if ((m = s.match(RE_LINE))) {
    base = { kind: 'line', id: m[1], part: 'start' };
  } else {
    throw new TimeError(
      `Cannot parse time expression "${source}"`,
      "Valid forms: 12.5s, l7, l7.end, l7+0.4, l7:'word', l7:'word'#2, l7.3, @scene.end",
    );
  }
  s = s.slice(m[0].length).trimStart();
  let offset = 0;
  while (s.length) {
    const o = s.match(RE_OFFSET);
    if (!o) {
      throw new TimeError(
        `Unexpected "${s}" in time expression "${source}"`,
        'Offsets look like +0.4 or -0.2',
      );
    }
    offset += (o[1] === '-' ? -1 : 1) * Number(o[2]);
    s = s.slice(o[0].length).trimStart();
  }
  return { base, offset, source };
}

export interface LineTiming {
  id: string;
  start: number;
  /** Start of the next line (or the episode duration for the last line). */
  next: number;
  words: { text: string; norm: string; start: number }[];
}

export interface TimeContext {
  lines: Map<string, LineTiming>;
  duration: number;
  sceneTime?: (id: string, part: 'start' | 'end') => number;
  sceneIds?: () => string[];
}

/** Gap kept before the next line for `l7.end` (SRS §5.1). */
export const LINE_END_GAP = 0.15;

function lineOf(ctx: TimeContext, id: string, source: string): LineTiming {
  const line = ctx.lines.get(id);
  if (!line) {
    const alt = closest(id, ctx.lines.keys());
    throw new TimeError(
      `Unknown script line "${id}" in "${source}"`,
      alt ? `Did you mean "${alt}"?` : undefined,
    );
  }
  return line;
}

function findWord(line: LineTiming, word: string, occurrence: number, source: string): number {
  const target = splitWords(word).map(normalizeWord).filter(Boolean);
  if (!target.length) throw new TimeError(`Empty word in "${source}"`);
  const norms = line.words.map((w) => w.norm);
  const matches: number[] = [];
  const eq = (a: string, b: string, loose: boolean) => (loose ? a.includes(b) : a === b);
  for (const loose of [false, true]) {
    for (let i = 0; i + target.length <= norms.length; i++) {
      if (target.every((t, k) => eq(norms[i + k], t, loose && (k === 0 || k === target.length - 1))))
        matches.push(i);
    }
    if (matches.length >= occurrence) break;
    matches.length = 0;
  }
  if (matches.length < occurrence) {
    const alt = closest(
      word,
      line.words.map((w) => w.text),
    );
    throw new TimeError(
      occurrence > 1
        ? `Word "${word}" occurs fewer than ${occurrence} times in line ${line.id} ("${source}")`
        : `Word "${word}" not found in line ${line.id} ("${source}")`,
      alt ? `Closest word in ${line.id}: "${alt}" → ${line.id}:'${alt}'` : undefined,
    );
  }
  return line.words[matches[occurrence - 1]].start;
}

export function evalTime(expr: TimeExpr, ctx: TimeContext): number {
  const b = expr.base;
  let t: number;
  switch (b.kind) {
    case 'seconds':
      t = b.value;
      break;
    case 'line': {
      const line = lineOf(ctx, b.id, expr.source);
      t = b.part === 'start' ? line.start : Math.max(line.start, line.next - LINE_END_GAP);
      break;
    }
    case 'word':
      t = findWord(lineOf(ctx, b.id, expr.source), b.word, b.occurrence, expr.source);
      break;
    case 'wordIndex': {
      const line = lineOf(ctx, b.id, expr.source);
      const w = line.words[b.index];
      if (!w) {
        throw new TimeError(
          `Word index ${b.index} is out of range for line ${b.id} (${line.words.length} words, 0-based) in "${expr.source}"`,
          `Use ${b.id}.0 … ${b.id}.${Math.max(0, line.words.length - 1)}`,
        );
      }
      t = w.start;
      break;
    }
    case 'scene': {
      if (!ctx.sceneTime) throw new TimeError(`Scene references are not allowed here ("${expr.source}")`);
      const ids = ctx.sceneIds?.() ?? [];
      if (!ids.includes(b.id)) {
        const alt = closest(b.id, ids);
        throw new TimeError(
          `Unknown scene "@${b.id}" in "${expr.source}"`,
          alt ? `Did you mean "@${alt}"?` : undefined,
        );
      }
      t = ctx.sceneTime(b.id, b.part);
      break;
    }
  }
  t = round3(t + expr.offset);
  if (t < 0)
    throw new TimeError(`"${expr.source}" resolves to ${t}s, which is before the start of the episode`);
  if (t > round3(ctx.duration) + 0.0005) {
    throw new TimeError(
      `"${expr.source}" resolves to ${t}s, which is after the end of the episode (${round3(ctx.duration)}s)`,
    );
  }
  return t;
}

export function resolveTime(input: string | number, ctx: TimeContext): number {
  return evalTime(parseTime(input), ctx);
}
