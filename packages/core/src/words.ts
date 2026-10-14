/** Deterministic word-timing estimation (SRS §5.2) and line timing tables. */
import { letterCount, normalizeWord, splitWords } from './text.js';
import type { LineTiming } from './time.js';
import { round3 } from './util.js';

/** End-of-line pause excluded from the word span. */
export const LINE_TAIL = 0.18;

export function estimateWordStarts(words: string[], cue: number, nextCue: number): number[] {
  if (!words.length) return [];
  let span = nextCue - cue - LINE_TAIL;
  if (span <= 0) span = Math.max(0.05, (nextCue - cue) * 0.8);
  const weights = words.map((w) => Math.max(2, letterCount(w)));
  const total = weights.reduce((a, b) => a + b, 0);
  const out: number[] = [];
  let acc = 0;
  for (const w of weights) {
    out.push(round3(cue + (span * acc) / total));
    acc += w;
  }
  return out;
}

export interface ScriptLineInput {
  id: string;
  text: string;
}

export function buildLineTimings(
  script: ScriptLineInput[],
  cues: Record<string, number>,
  duration: number,
  manualWords: Record<string, number[]> = {},
): Map<string, LineTiming> {
  const map = new Map<string, LineTiming>();
  script.forEach((line, i) => {
    const start = cues[line.id] ?? 0;
    const nextLine = script[i + 1];
    const next = nextLine && cues[nextLine.id] !== undefined ? cues[nextLine.id] : duration;
    const words = splitWords(line.text);
    const manual = manualWords[line.id];
    const starts =
      manual && manual.length === words.length
        ? manual.map(round3)
        : estimateWordStarts(words, start, Math.max(start, next));
    map.set(line.id, {
      id: line.id,
      start,
      next: Math.max(start, next),
      words: words.map((text, k) => ({ text, norm: normalizeWord(text), start: starts[k] })),
    });
  });
  return map;
}
