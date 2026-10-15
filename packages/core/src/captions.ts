/**
 * Caption engine (SRS §9): tokenization of mixed Arabic/English text and chunking.
 * The output is pure data; the runtime turns `parts` into DOM (`<bdi>` for Latin parts).
 */
import { ARABIC_RE, hasArabic, NBSP, normalizeWord, splitWords, TATWEEL } from './text.js';
import type { CaptionChunk, CaptionPart, CaptionToken } from './types.js';
import { round3 } from './util.js';

/** A tokenization unit: one or more consecutive words shown and timed together. */
export interface Unit {
  text: string;
  /** Index of the first and last (inclusive) word of the line. */
  first: number;
  last: number;
}

/** §9.2 rule 1: a Latin word, optionally followed by one trailing punctuation mark. */
const LATIN_WORD_RE = /^[A-Za-z][A-Za-z0-9'’\-_]*[؟،.,?!]?$/;
const ENDS_WITH_PUNCT_RE = /[؟،.,?!؛:]$/;
/** Latin runs inside a token: letters/digits with internal spaces, dots, hyphens, apostrophes. */
const LATIN_RUN_RE = /[A-Za-z0-9](?:[A-Za-z0-9'’\-_+#/&]|[  .](?=[A-Za-z0-9]))*/g;

/**
 * Tokenizes the words of a line. Rules 1–2 (Latin run merge, tatweel joiner) only apply when the
 * line contains Arabic script; otherwise every word is its own unit.
 */
export function tokenizeWords(words: string[]): Unit[] {
  const arabic = words.some((w) => ARABIC_RE.test(w));
  let units: Unit[] = words.map((w, i) => ({ text: w, first: i, last: i }));
  if (!arabic) return units;

  // Rule 1: merge consecutive Latin words ("Duplicate Charge", "Double-entry ledger؟").
  const merged: Unit[] = [];
  for (const u of units) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      LATIN_WORD_RE.test(u.text) &&
      LATIN_WORD_RE.test(prev.text.split(' ').pop() ?? '') &&
      /^[A-Za-z]/.test(prev.text) &&
      !ENDS_WITH_PUNCT_RE.test(prev.text)
    ) {
      prev.text = `${prev.text} ${u.text}`;
      prev.last = u.last;
    } else {
      merged.push({ ...u });
    }
  }
  units = merged;

  // Rule 2: a token ending with tatweel joins the next token with NO-BREAK SPACE.
  const joined: Unit[] = [];
  for (let i = 0; i < units.length; i++) {
    const u = { ...units[i] };
    while (u.text.endsWith(TATWEEL) && i + 1 < units.length) {
      const next = units[++i];
      u.text = `${u.text}${NBSP}${next.text}`;
      u.last = next.last;
    }
    joined.push(u);
  }
  return joined;
}

/**
 * Splits a token into display parts. Rules 3–4: every Latin run is isolated (rendered in `<bdi>`);
 * trailing punctuation stays outside the isolate so it lands on the correct side.
 * In an LTR (non-Arabic) chunk no isolation is needed.
 */
export function tokenParts(text: string, rtl: boolean): CaptionPart[] {
  if (!rtl) return [{ text, latin: false }];
  const parts: CaptionPart[] = [];
  let last = 0;
  for (const m of text.matchAll(LATIN_RUN_RE)) {
    if (!/[A-Za-z]/.test(m[0])) continue;
    const at = m.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at), latin: false });
    parts.push({ text: m[0], latin: true });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), latin: false });
  return parts;
}

const chars = (units: Unit[]) => units.reduce((n, u) => n + [...u.text].length, 0) + Math.max(0, units.length - 1);

/** §9.1: split at punctuation closest to the middle, then by word count, until ≤ maxChars. */
export function chunkUnits(units: Unit[], maxChars: number): Unit[][] {
  if (units.length <= 1 || chars(units) <= maxChars) return [units];
  const total = chars(units);
  let best = -1;
  let bestDist = Infinity;
  let acc = 0;
  for (let i = 1; i < units.length; i++) {
    acc += [...units[i - 1].text].length + 1;
    if (ENDS_WITH_PUNCT_RE.test(units[i - 1].text)) {
      const d = Math.abs(acc - total / 2);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
  }
  const at = best > 0 ? best : Math.ceil(units.length / 2);
  return [...chunkUnits(units.slice(0, at), maxChars), ...chunkUnits(units.slice(at), maxChars)];
}

/** Applies `break: [...]`: forces a chunk boundary before the listed words. */
export function forcedBreaks(units: Unit[], breaks: string[]): Unit[][] {
  if (!breaks.length) return [units];
  const keys = new Set(breaks.map(normalizeWord));
  const groups: Unit[][] = [[]];
  for (const u of units) {
    const firstWord = normalizeWord(splitWords(u.text.replaceAll(NBSP, ' '))[0] ?? '');
    const whole = normalizeWord(u.text.replaceAll(NBSP, ' '));
    if (groups[groups.length - 1].length && (keys.has(firstWord) || keys.has(whole))) groups.push([]);
    groups[groups.length - 1].push(u);
  }
  return groups.filter((g) => g.length);
}

export interface CaptionLineInput {
  id: string;
  text: string;
  caption: string; // 'auto' | 'none' | custom text
  breaks: string[];
  start: number;
  next: number;
  wordStarts: number[];
}

/** Builds caption chunks for the whole script (FR-CORE-4). */
export function buildCaptions(
  lines: CaptionLineInput[],
  opts: { maxChars: number; duration: number },
): CaptionChunk[] {
  const chunks: (CaptionChunk & { lineIndex: number; lineNext: number })[] = [];
  lines.forEach((line, lineIndex) => {
    if (line.caption === 'none') return;
    const custom = line.caption !== 'auto';
    const words = splitWords(custom ? line.caption : line.text);
    if (!words.length) return;
    let starts = line.wordStarts;
    if (custom || starts.length !== words.length) {
      // Custom caption text: spread its words evenly over the line span.
      const span = Math.max(0.05, line.next - line.start - 0.18);
      starts = words.map((_, i) => round3(line.start + (span * i) / words.length));
    }
    const rtl = hasArabic(words.join(' '));
    const units = tokenizeWords(words);
    for (const group of forcedBreaks(units, line.breaks)) {
      for (const chunkUnitsList of chunkUnits(group, opts.maxChars)) {
        const tokens: CaptionToken[] = chunkUnitsList.map((u) => ({
          start: starts[u.first],
          parts: tokenParts(u.text, rtl),
          english: rtl && /[A-Za-z]/.test(u.text),
          text: u.text,
        }));
        chunks.push({
          lineId: line.id,
          start: tokens[0].start,
          end: 0,
          dir: rtl ? 'rtl' : 'ltr',
          tokens,
          text: chunkUnitsList.map((u) => u.text).join(' '),
          lineIndex,
          lineNext: line.next,
        });
      }
    }
  });
  // Visibility: until the next chunk's start when it follows in the same or the next line,
  // otherwise until this line's end + 0.3 s (also the rule for the episode's last chunk).
  return chunks.map((c, i) => {
    const next = chunks[i + 1];
    const contiguous = next && next.lineIndex - c.lineIndex <= 1;
    const end = contiguous ? next.start : Math.min(opts.duration, c.lineNext + 0.3);
    const { lineIndex: _li, lineNext: _ln, ...chunk } = c;
    return { ...chunk, end: round3(Math.max(end, c.start + 0.05)) };
  });
}
