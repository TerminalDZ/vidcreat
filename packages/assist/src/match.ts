/**
 * Fuzzy DTW between the known script words and the words a recognizer heard. Only the recognizer's
 * timings are used: its spelling just guides the matching, so recognition mistakes (dialects,
 * English terms inside Arabic) cost nothing as long as most words roughly match.
 */
import { normalizeWord } from '@reelforge/core';

export interface HeardWord {
  text: string;
  start: number;
  end: number;
}

/** Folds spellings the recognizer and the script often disagree on (Arabic letter variants). */
export function fold(word: string): string {
  return normalizeWord(word)
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[ؤئ]/g, 'ء')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Similarity in [0, 1]: 1 − normalized edit distance (prefix-tolerant for clipped words). */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const n = a.length;
  const m = b.length;
  if (Math.abs(n - m) > Math.max(n, m) * 0.6) return 0;
  let prev = new Uint16Array(m + 1);
  let cur = new Uint16Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return 1 - prev[m] / Math.max(n, m);
}

const SKIP_SCRIPT = -0.35; // a script word the recognizer missed
const SKIP_HEARD = -0.2; // an extra heard word (filler, false start)
const MATCH_BIAS = 0.45; // similarity above this counts as evidence

/**
 * For every script word, the heard word whose start it takes, or -1. Allows 1:1, 1:2 (script word
 * heard as two words) and 2:1 (two script words heard as one) matches. O(n·m) time and memory.
 */
export function matchWords(script: string[], heard: string[]): number[] {
  const S = script.map(fold);
  const H = heard.map(fold);
  const n = S.length;
  const m = H.length;
  const W = m + 1;
  const score = new Float64Array((n + 1) * W);
  const move = new Uint8Array((n + 1) * W); // 1 diag, 2 skip script, 3 skip heard, 4 1:2, 5 2:1
  for (let i = 1; i <= n; i++) {
    score[i * W] = i * SKIP_SCRIPT;
    move[i * W] = 2;
  }
  for (let j = 1; j <= m; j++) {
    score[j] = j * SKIP_HEARD;
    move[j] = 3;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best = score[(i - 1) * W + j - 1] + similarity(S[i - 1], H[j - 1]) - MATCH_BIAS;
      let mv = 1;
      const a = score[(i - 1) * W + j] + SKIP_SCRIPT;
      if (a > best) {
        best = a;
        mv = 2;
      }
      const b = score[i * W + j - 1] + SKIP_HEARD;
      if (b > best) {
        best = b;
        mv = 3;
      }
      if (j >= 2) {
        const c = score[(i - 1) * W + j - 2] + similarity(S[i - 1], H[j - 2] + H[j - 1]) - MATCH_BIAS;
        if (c > best) {
          best = c;
          mv = 4;
        }
      }
      if (i >= 2) {
        const d = score[(i - 2) * W + j - 1] + similarity(S[i - 2] + S[i - 1], H[j - 1]) - MATCH_BIAS;
        if (d > best) {
          best = d;
          mv = 5;
        }
      }
      score[i * W + j] = best;
      move[i * W + j] = mv;
    }
  }
  const out = new Array<number>(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const mv = move[i * W + j];
    if (mv === 1) {
      if (similarity(S[i - 1], H[j - 1]) >= MATCH_BIAS) out[i - 1] = j - 1;
      i--;
      j--;
    } else if (mv === 4) {
      if (similarity(S[i - 1], H[j - 2] + H[j - 1]) >= MATCH_BIAS) out[i - 1] = j - 2;
      i--;
      j -= 2;
    } else if (mv === 5) {
      if (similarity(S[i - 2] + S[i - 1], H[j - 1]) >= MATCH_BIAS) out[i - 2] = j - 1; // second word interpolated
      i -= 2;
      j--;
    } else if (mv === 2) i--;
    else j--;
  }
  return out;
}

/**
 * Start time of every script word: matched words take the heard start, the others are
 * interpolated by `weights` (syllables) between their matched neighbours. Returns null entries
 * only when nothing matched at all.
 */
export function timeWords(
  match: number[],
  heard: HeardWord[],
  weights: number[],
): { times: (number | null)[]; matched: number } {
  const n = match.length;
  const times: (number | null)[] = match.map((j) => (j >= 0 ? heard[j].start : null));
  const anchors = times.map((t, i) => (t === null ? -1 : i)).filter((i) => i >= 0);
  if (!anchors.length) return { times, matched: 0 };
  // Seconds per syllable from the matched stretch, for words before the first / after the last anchor.
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  let syl = 0;
  for (let k = first; k < last; k++) syl += weights[k];
  const sps = last > first && syl > 0 ? (times[last]! - times[first]!) / syl : 0.2;
  for (let k = first - 1; k >= 0; k--) times[k] = Math.max(0, times[k + 1]! - weights[k] * sps);
  for (let k = last + 1; k < n; k++) {
    const prevEnd = match[k - 1] >= 0 ? heard[match[k - 1]].end : times[k - 1]! + weights[k - 1] * sps;
    times[k] = Math.max(times[k - 1]! + 0.04, prevEnd);
  }
  for (let a = 0; a + 1 < anchors.length; a++) {
    const i0 = anchors[a];
    const i1 = anchors[a + 1];
    if (i1 - i0 < 2) continue;
    // Start the gap after the heard end of the anchor word, not its start.
    const from = match[i0] >= 0 ? Math.min(heard[match[i0]].end, times[i1]!) : times[i0]!;
    let w = 0;
    for (let k = i0 + 1; k < i1; k++) w += weights[k];
    let acc = 0;
    for (let k = i0 + 1; k < i1; k++) {
      times[k] = from + ((times[i1]! - from) * acc) / (w + 1e-9);
      acc += weights[k];
    }
  }
  for (let k = 1; k < n; k++) if (times[k]! <= times[k - 1]!) times[k] = times[k - 1]! + 0.04;
  return { times, matched: anchors.length };
}
