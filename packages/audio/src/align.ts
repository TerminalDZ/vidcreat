/**
 * Model-free cue alignment (DSP only). The script is known, so the audio only has to be split into
 * N lines and each line into its words:
 *
 * 1. `analyzeSpeech` turns the samples into a 10 ms energy track and a voiced/silent mask with an
 *    adaptive noise floor (percentiles of the track, hysteresis, click and stop-gap cleanup).
 * 2. `alignLines` picks one boundary per line among the pauses with dynamic programming: each line
 *    should hold voiced time proportional to its text weight, and boundaries prefer long pauses.
 * 3. `alignWords` assigns the pauses inside a line to word gaps (punctuation helps), spreads the
 *    other words by syllables over the voiced time and snaps them to onsets.
 *
 * Everything is O(samples) plus a small DP; no allocation proportional to the sample count.
 * Pure and deterministic, browser and Node safe.
 */

export interface SpeechMap {
  sampleRate: number;
  /** Seconds per frame (10 ms). */
  hop: number;
  frames: number;
  /** Frame energy in dB (30 ms window centred on the frame). */
  db: Float32Array;
  /** 1 when the frame holds speech. */
  voiced: Uint8Array;
  /** voicedBefore[f] = voiced frames in [0, f). Length frames + 1. */
  voicedBefore: Int32Array;
  floorDb: number;
  speechDb: number;
  thresholdDb: number;
  /** First voiced frame and the frame after the last voiced frame. */
  first: number;
  last: number;
}

export interface Pause {
  /** First silent frame. */
  from: number;
  /** First voiced frame after the pause. */
  to: number;
}

export interface AnalyzeOptions {
  /** External speech mask (e.g. from a VAD) at the same 10 ms hop; replaces the energy mask. */
  voiced?: Uint8Array;
  /**
   * Speech gate at the same hop (e.g. a VAD): frames where it is 0 are silent even when loud
   * (music beds, breaths, room noise). Keeps the energy mask's precise edges inside speech.
   */
  gate?: Uint8Array;
}

const HOP_SEC = 0.01;
const MIN_VOICED_SEC = 0.03; // shorter bursts are clicks
const FILL_GAP_SEC = 0.05; // shorter gaps are stop consonants, not pauses

/** dB value at percentile `p` of `db` (histogram at 0.25 dB: O(n), no sort). */
function percentile(db: Float32Array, p: number): number {
  const lo = -120;
  const bins = new Uint32Array(4 * 140 + 1);
  for (let i = 0; i < db.length; i++)
    bins[Math.max(0, Math.min(bins.length - 1, Math.round((db[i] - lo) * 4)))]++;
  const target = p * db.length;
  let acc = 0;
  for (let b = 0; b < bins.length; b++) {
    acc += bins[b];
    if (acc >= target) return lo + b / 4;
  }
  return 20;
}

/** Sets runs of `value` shorter than `minLen` frames (bounded on both sides) to the opposite value. */
function dropShortRuns(mask: Uint8Array, value: 0 | 1, minLen: number): void {
  let i = 0;
  while (i < mask.length) {
    if (mask[i] !== value) {
      i++;
      continue;
    }
    let j = i;
    while (j < mask.length && mask[j] === value) j++;
    if (j - i < minLen && i > 0 && j < mask.length) mask.fill(value ? 0 : 1, i, j);
    i = j;
  }
}

export function analyzeSpeech(mono: Float32Array, sampleRate: number, opts: AnalyzeOptions = {}): SpeechMap {
  const hopN = Math.max(1, Math.round(sampleRate * HOP_SEC));
  const frames = Math.max(1, Math.ceil(mono.length / hopN));
  const block = new Float64Array(frames);
  for (let f = 0, i = 0; f < frames; f++) {
    const end = Math.min(mono.length, i + hopN);
    let s = 0;
    for (; i < end; i++) s += mono[i] * mono[i];
    block[f] = s;
  }
  const db = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const a = Math.max(0, f - 1);
    const b = Math.min(frames - 1, f + 1);
    let s = 0;
    for (let k = a; k <= b; k++) s += block[k];
    db[f] = 10 * Math.log10(s / ((b - a + 1) * hopN) + 1e-12);
  }
  // With a gate, the floor and speech levels come from the frames it marks (music under the voice
  // would otherwise raise the floor).
  let floorDb: number;
  let speechDb: number;
  const gate = opts.gate && opts.gate.length >= frames ? opts.gate : undefined;
  if (gate) {
    const inside: number[] = [];
    for (let f = 0; f < frames; f++) if (gate[f]) inside.push(db[f]);
    speechDb = inside.length ? percentile(Float32Array.from(inside), 0.95) : percentile(db, 0.95);
    floorDb = percentile(db, 0.1);
  } else {
    floorDb = percentile(db, 0.1);
    speechDb = percentile(db, 0.95);
  }
  const range = speechDb - floorDb;
  // Relative to the noise floor, but never far below the speech: digitally silent gaps (−120 dB)
  // would otherwise put the threshold under the breath before a word.
  const thresholdDb = Math.max(floorDb + Math.max(6, Math.min(18, range * 0.35)), speechDb - 40);
  let voiced: Uint8Array;
  if (opts.voiced && opts.voiced.length >= frames) {
    voiced = opts.voiced.slice(0, frames);
  } else {
    voiced = new Uint8Array(frames);
    if (range < 8) voiced.fill(1);
    else {
      // Hysteresis: start above the threshold, stay on until 4 dB below it.
      let on = false;
      for (let f = 0; f < frames; f++) {
        on = on ? db[f] > thresholdDb - 4 : db[f] > thresholdDb;
        voiced[f] = on ? 1 : 0;
      }
    }
    if (gate) {
      // The gate decides whether there is speech, the energy only where its edges fall: the gate
      // is coarse (32 ms for Silero), the energy is not but breaks up under music or noise.
      // Deep inside gated speech → speech; within 60 ms of a gate edge → energy; outside → silence.
      const pad = 6;
      const wide = new Uint8Array(frames);
      const core = new Uint8Array(frames);
      for (let f = 0; f < frames; f++)
        if (gate[f]) wide.fill(1, Math.max(0, f - pad), Math.min(frames, f + pad + 1));
      for (let f = 0; f < frames; f++) {
        let all = 1;
        for (let k = Math.max(0, f - pad); k <= Math.min(frames - 1, f + pad) && all; k++) all = gate[k];
        core[f] = all;
      }
      for (let f = 0; f < frames; f++) voiced[f] = core[f] ? 1 : voiced[f] & wide[f];
    }
    dropShortRuns(voiced, 1, Math.round(MIN_VOICED_SEC / HOP_SEC));
    dropShortRuns(voiced, 0, Math.round(FILL_GAP_SEC / HOP_SEC));
  }
  const voicedBefore = new Int32Array(frames + 1);
  let first = -1;
  let last = 0;
  for (let f = 0; f < frames; f++) {
    voicedBefore[f + 1] = voicedBefore[f] + voiced[f];
    if (voiced[f]) {
      if (first < 0) first = f;
      last = f + 1;
    }
  }
  if (first < 0) {
    first = 0;
    last = frames;
  }
  return {
    sampleRate,
    hop: HOP_SEC,
    frames,
    db,
    voiced,
    voicedBefore,
    floorDb,
    speechDb,
    thresholdDb,
    first,
    last,
  };
}

/** Silent runs strictly between `from` and `to` frames, at least `minFrames` long. */
export function pausesIn(map: SpeechMap, from: number, to: number, minFrames = 1): Pause[] {
  const out: Pause[] = [];
  let f = Math.max(from, 0);
  const end = Math.min(to, map.frames);
  while (f < end && !map.voiced[f]) f++; // skip leading silence
  while (f < end) {
    if (map.voiced[f]) {
      f++;
      continue;
    }
    let g = f;
    while (g < end && !map.voiced[g]) g++;
    if (g < end && g - f >= minFrames) out.push({ from: f, to: g });
    f = g;
  }
  return out;
}

/**
 * Sample-accurate speech onset near a pause end: the first 1 ms step after `t - 40 ms` whose 5 ms
 * RMS climbs within 6 dB of the speech threshold. Returns `t` when nothing qualifies.
 */
export function refineOnset(mono: Float32Array, map: SpeechMap, t: number): number {
  const sr = map.sampleRate;
  const step = Math.max(1, Math.round(sr * 0.001));
  const win = Math.max(1, Math.round(sr * 0.005));
  const a = Math.max(0, Math.round((t - 0.04) * sr));
  const b = Math.min(mono.length - win, Math.round((t + 0.03) * sr));
  const need = Math.pow(10, (map.thresholdDb - 6) / 10);
  for (let s = a; s <= b; s += step) {
    let e = 0;
    for (let i = s; i < s + win; i++) e += mono[i] * mono[i];
    if (e / win >= need) {
      // The window starts up to 5 ms early: take its first sample above the level.
      const amp = Math.sqrt(need);
      let i = s;
      while (i < s + win - 1 && Math.abs(mono[i]) < amp) i++;
      return Math.round((i / sr) * 1000) / 1000;
    }
  }
  return Math.round(t * 1000) / 1000;
}

export interface LineAlignment {
  /** Line start times in seconds (ms precision). */
  starts: number[];
  /** 0..1 per line: how clearly a pause marks its start and how well its length fits the text. */
  confidence: number[];
}

export interface LineAlignOptions {
  /** Relative tolerance of a line's voiced time against its text weight (log scale). */
  sigma?: number;
  /** Reward for placing a boundary in a pause of 0.6 s or longer. */
  pauseReward?: number;
}

/**
 * Splits the speech into `weights.length` lines. Boundaries sit at pause ends (speech onsets);
 * the first line starts at the first speech onset.
 */
export function alignLines(
  mono: Float32Array,
  map: SpeechMap,
  weights: number[],
  opts: LineAlignOptions = {},
): LineAlignment {
  const n = weights.length;
  if (n === 0) return { starts: [], confidence: [] };
  const start0 = refineOnset(mono, map, map.first * map.hop);
  if (n === 1) return { starts: [start0], confidence: [1] };
  const sigma = opts.sigma ?? 0.42;
  const reward = opts.pauseReward ?? 1.6;
  const pauses = pausesIn(map, map.first, map.last, 2);
  // Candidate boundaries: index 0 = speech start, 1..M = pauses, M+1 = speech end.
  const M = pauses.length;
  const candFrom = new Int32Array(M + 2); // where the previous line's voice stops
  const candTo = new Int32Array(M + 2); // where the next line's voice starts
  const bonus = new Float64Array(M + 2);
  candFrom[0] = candTo[0] = map.first;
  for (let k = 0; k < M; k++) {
    candFrom[k + 1] = pauses[k].from;
    candTo[k + 1] = pauses[k].to;
    bonus[k + 1] = reward * Math.min(1, ((pauses[k].to - pauses[k].from) * map.hop) / 0.6);
  }
  candFrom[M + 1] = candTo[M + 1] = map.last;
  const vb = map.voicedBefore;
  const total = Math.max(1, vb[map.last] - vb[map.first]);
  let wsum = 0;
  for (const w of weights) wsum += Math.max(1e-6, w);
  const expected = weights.map((w) => (Math.max(1e-6, w) / wsum) * total);
  const inv2s2 = 1 / (2 * sigma * sigma);
  const segCost = (line: number, a: number, b: number): number => {
    const v = vb[candFrom[b]] - vb[candTo[a]];
    if (v <= 0) return Infinity;
    const r = Math.log(v / expected[line]);
    return r * r * inv2s2;
  };
  // D[i][j]: best cost with lines 0..i-1 placed and line i starting at candidate j.
  const C = M + 2;
  const D = new Float64Array(n * C).fill(Infinity);
  const back = new Int32Array(n * C).fill(-1);
  D[0] = 0;
  // A line may hold between 1/5 and 5× its expected voiced time; this bounds the inner loop.
  const lo = Math.log(0.2);
  const hi = Math.log(5);
  for (let i = 1; i < n; i++) {
    for (let j = 1; j <= M; j++) {
      let best = Infinity;
      let arg = -1;
      for (let k = j - 1; k >= 0; k--) {
        const prev = D[(i - 1) * C + k];
        const v = vb[candFrom[j]] - vb[candTo[k]];
        const r = Math.log(Math.max(1, v) / expected[i - 1]);
        if (r > hi) break; // earlier k only make the line longer
        if (prev === Infinity || r < lo) continue;
        const cost = prev + segCost(i - 1, k, j) - bonus[j];
        if (cost < best) {
          best = cost;
          arg = k;
        }
      }
      D[i * C + j] = best;
      back[i * C + j] = arg;
    }
  }
  // The last line runs to the end of speech.
  let bestJ = -1;
  let best = Infinity;
  for (let j = 1; j <= M; j++) {
    const c = D[(n - 1) * C + j] + segCost(n - 1, j, M + 1);
    if (c < best) {
      best = c;
      bestJ = j;
    }
  }
  const idx = new Array<number>(n).fill(0);
  if (bestJ < 0) {
    // Fewer pauses than lines: spread by weight over the voiced time.
    return spreadByWeight(mono, map, weights, start0);
  }
  idx[n - 1] = bestJ;
  for (let i = n - 1; i > 0; i--) idx[i - 1] = back[i * C + idx[i]];
  const starts: number[] = [];
  const confidence: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = idx[i];
    starts.push(i === 0 ? start0 : refineOnset(mono, map, candTo[j] * map.hop));
    const end = i + 1 < n ? idx[i + 1] : M + 1;
    const fit = Math.exp(-segCost(i, j, end));
    const pause = i === 0 ? 1 : Math.min(1, ((candTo[j] - candFrom[j]) * map.hop) / 0.35);
    confidence.push(Math.round(Math.sqrt(fit * pause) * 100) / 100);
  }
  for (let i = 1; i < n; i++) if (starts[i] <= starts[i - 1]) starts[i] = round3(starts[i - 1] + 0.05);
  return { starts, confidence };
}

const round3 = (t: number) => Math.round(t * 1000) / 1000;

/** Fallback without enough pauses: proportional split of the voiced time. */
function spreadByWeight(
  mono: Float32Array,
  map: SpeechMap,
  weights: number[],
  start0: number,
): LineAlignment {
  const times = voicedPositions(map, map.first, map.last, weights);
  return {
    starts: times.map((t, i) => (i === 0 ? start0 : refineOnset(mono, map, t))),
    confidence: weights.map(() => 0.2),
  };
}

/**
 * For units with `weights` spread over the voiced frames of [from, to), the time at which each unit
 * starts (unit 0 starts at the first voiced frame).
 */
function voicedPositions(map: SpeechMap, from: number, to: number, weights: number[]): number[] {
  const vb = map.voicedBefore;
  const total = vb[to] - vb[from];
  let wsum = 0;
  for (const w of weights) wsum += Math.max(1e-6, w);
  const out: number[] = [];
  let acc = 0;
  let f = from;
  while (f < to && !map.voiced[f]) f++;
  for (const w of weights) {
    const target = vb[from] + (acc / wsum) * total;
    while (f < to && (vb[f] < target || !map.voiced[f])) f++;
    out.push(Math.min(f, to) * map.hop);
    acc += Math.max(1e-6, w);
  }
  return out;
}

/**
 * Word starts inside one line. `weights` are per-word syllable counts and `gapBonus[k]` (length
 * words − 1) says how likely a pause follows word k (punctuation). `start` is the line start and
 * `end` the next line's start.
 */
export function alignWords(
  mono: Float32Array,
  map: SpeechMap,
  start: number,
  end: number,
  weights: number[],
  gapBonus: number[] = [],
): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const f0 = Math.max(0, Math.round(start / map.hop));
  let f1 = Math.min(map.frames, Math.round(end / map.hop));
  while (f1 > f0 + 1 && !map.voiced[f1 - 1]) f1--; // drop the trailing pause
  if (n === 1 || f1 - f0 < 2)
    return [round3(start), ...weights.slice(1).map(() => round3(start))].slice(0, n);
  const pauses = pausesIn(map, f0, f1, Math.round(0.08 / map.hop));
  // Expected start of every word if no pause is anchored.
  const naive = voicedPositions(map, f0, f1, weights);
  // Assign pauses (in order) to word gaps (in order) by DP: a pause should sit near the expected
  // gap position, preferably after punctuation; leaving a pause unassigned costs a little.
  const G = n - 1;
  const P = pauses.length;
  const lineVoiced = Math.max(0.2, (map.voicedBefore[f1] - map.voicedBefore[f0]) * map.hop);
  const tol = 0.15 + 0.12 * lineVoiced;
  const score = (p: number, g: number): number => {
    const mid = ((pauses[p].from + pauses[p].to) / 2) * map.hop;
    const d = (mid - naive[g + 1]) / tol;
    const len = Math.min(1, ((pauses[p].to - pauses[p].from) * map.hop) / 0.3);
    return 1.2 - d * d + 1.5 * (gapBonus[g] ?? 0) + 0.5 * len;
  };
  const S = new Float64Array((P + 1) * (G + 1)).fill(-Infinity);
  const choice = new Int8Array((P + 1) * (G + 1)); // 0 = skip pause, 1 = skip gap, 2 = assign
  for (let g = 0; g <= G; g++) S[g] = 0;
  for (let p = 1; p <= P; p++) {
    S[p * (G + 1)] = S[(p - 1) * (G + 1)] - 0.3;
    for (let g = 1; g <= G; g++) {
      const skipPause = S[(p - 1) * (G + 1) + g] - 0.3;
      const skipGap = S[p * (G + 1) + g - 1];
      const assign = S[(p - 1) * (G + 1) + g - 1] + score(p - 1, g - 1);
      let best = skipPause;
      let c = 0;
      if (skipGap > best) {
        best = skipGap;
        c = 1;
      }
      if (assign > best) {
        best = assign;
        c = 2;
      }
      S[p * (G + 1) + g] = best;
      choice[p * (G + 1) + g] = c;
    }
  }
  const anchorAt = new Array<number>(G).fill(-1); // gap → pause index
  for (let p = P, g = G; p > 0 && g > 0; ) {
    const c = choice[p * (G + 1) + g];
    if (c === 2) {
      anchorAt[g - 1] = p - 1;
      p--;
      g--;
    } else if (c === 1) g--;
    else p--;
  }
  // Words between anchors are spread by syllables over the voiced time of their chunk.
  const out = new Array<number>(n);
  out[0] = round3(start);
  let chunkStartWord = 0;
  let chunkFrom = f0;
  const flush = (endWord: number, chunkTo: number) => {
    const ws = weights.slice(chunkStartWord, endWord);
    if (ws.length < 2) return;
    const pos = splitChunk(map, chunkFrom, chunkTo, ws);
    for (let k = 1; k < ws.length; k++) out[chunkStartWord + k] = pos[k];
  };
  for (let g = 0; g < G; g++) {
    if (anchorAt[g] < 0) continue;
    const p = pauses[anchorAt[g]];
    flush(g + 1, p.from);
    out[g + 1] = refineOnset(mono, map, p.to * map.hop);
    chunkStartWord = g + 1;
    chunkFrom = p.to;
  }
  flush(n, f1);
  for (let k = 1; k < n; k++) if (!(out[k] > out[k - 1])) out[k] = round3(out[k - 1] + 0.04);
  return out;
}

/**
 * Word starts inside a stretch of continuous speech [from, to) holding words with syllable
 * `weights`. Syllable nuclei show up as energy peaks; word boundaries sit in the valleys between
 * them. Picks one valley per word boundary by DP so that the number of nuclei before each boundary
 * matches the syllables of the words before it (deeper valleys preferred). Falls back to spreading
 * by syllables over the voiced time when there are too few valleys.
 */
function splitChunk(map: SpeechMap, from: number, to: number, weights: number[]): number[] {
  const m = weights.length;
  const fallback = () => voicedPositions(map, from, to, weights).map(round3);
  const len = to - from;
  if (len < 4) return fallback();
  // 50 ms moving average of the energy track.
  const sm = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let s = 0;
    let c = 0;
    for (let k = Math.max(from, from + i - 2); k <= Math.min(to - 1, from + i + 2); k++, c++) s += map.db[k];
    sm[i] = s / c;
  }
  // Peaks (nuclei): local maxima at least 3 dB above both neighbouring valleys, 70 ms apart.
  const peaks: number[] = [];
  for (let i = 1; i < len - 1; i++) {
    if (sm[i] >= sm[i - 1] && sm[i] > sm[i + 1] && sm[i] > map.thresholdDb) {
      if (peaks.length && i - peaks[peaks.length - 1] < 7) {
        if (sm[i] > sm[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i;
      } else peaks.push(i);
    }
  }
  // Valleys between consecutive peaks, with their depth below the lower peak.
  const valleys: { at: number; depth: number }[] = [];
  const kept: number[] = [];
  for (let p = 0; p < peaks.length; p++) {
    if (!kept.length) {
      kept.push(peaks[p]);
      continue;
    }
    const a = kept[kept.length - 1];
    const b = peaks[p];
    let v = a;
    for (let i = a; i <= b; i++) if (sm[i] < sm[v]) v = i;
    const depth = Math.min(sm[a], sm[b]) - sm[v];
    if (depth < 3) {
      if (sm[b] > sm[a]) kept[kept.length - 1] = b; // same nucleus
      continue;
    }
    valleys.push({ at: v, depth });
    kept.push(b);
  }
  const V = valleys.length;
  const naive = fallback();
  if (V === 0) return naive;
  // Each word boundary either keeps its syllable estimate or moves to a nearby, deep valley.
  // DP over (boundary, valley) keeps the order and uses each valley at most once.
  const voicedSec = (map.voicedBefore[to] - map.voicedBefore[from]) * map.hop;
  const tau = 0.08 + 0.05 * voicedSec;
  const W = m - 1;
  const vt = valleys.map((x) => (from + x.at) * map.hop);
  const gain = (k: number, v: number) => {
    const d = (vt[v] - naive[k + 1]) / tau;
    return 1.4 - d * d + Math.min(1, valleys[v].depth / 10);
  };
  // S[k][v+1]: best total for boundaries 0..k with the last used valley < v+1 (v = -1: none).
  const cols = V + 1;
  const S = new Float64Array((W + 1) * cols).fill(0);
  const pick = new Int32Array(W * cols).fill(-1);
  for (let k = 0; k < W; k++) {
    for (let c = 0; c < cols; c++) {
      // Option 1: boundary k keeps its estimate (valley budget unchanged).
      let best = S[k * cols + c];
      let arg = -1;
      // Option 2: boundary k uses valley c-1 (only valleys after the ones already used).
      if (c > 0) {
        const g = gain(k, c - 1);
        if (g > 0) {
          const cand = S[k * cols + c - 1] + g;
          if (cand > best) {
            best = cand;
            arg = c - 1;
          }
        }
      }
      // Monotone in c: a larger budget is never worse.
      if (c > 0 && S[(k + 1) * cols + c - 1] > best) {
        best = S[(k + 1) * cols + c - 1];
        arg = -2;
      }
      S[(k + 1) * cols + c] = best;
      pick[k * cols + c] = arg;
    }
  }
  const out = naive.slice();
  let c = V;
  for (let k = W - 1; k >= 0; k--) {
    while (pick[k * cols + c] === -2) c--;
    const a = pick[k * cols + c];
    if (a >= 0) {
      out[k + 1] = round3(vt[a]);
      c = a;
    }
  }
  return out;
}
