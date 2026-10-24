/**
 * `alignEpisode`: cues.json from the voice recording, with the best engine available.
 *
 * - dsp (always available, ~10 ms per minute): lines split at pauses by text length, words by
 *   syllables (see @reelforge/audio align.ts).
 * - whisper (after `reelforge align --setup`): word timings from Whisper matched to the script by
 *   fuzzy DTW, then corrected by this recording's measured lag and snapped to real pause ends.
 * - vad: Silero speech mask instead of the energy threshold, for both engines.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { analyzeSpeech, pausesIn, refineOnset, type PcmAudio, type SpeechMap } from '@reelforge/audio';
import {
  autoCues,
  compileEpisode,
  readCues,
  splitWords,
  syllableCount,
  writeCues,
  type CuesFile,
  type EpisodePaths,
} from '@reelforge/core';
import { matchWords, timeWords, type HeardWord } from './match.js';
import { resample } from './resample.js';
import { AssistError, runtimeInstalled, vadFile, whisperCached, type WhisperSize } from './setup.js';
import { transcribeWords } from './whisper.js';
import { vadMask, vadProbabilities } from './vad.js';

export type AlignEngine = 'auto' | 'dsp' | 'whisper';

export interface AlignOptions {
  /** auto (default): whisper when installed, else dsp. */
  engine?: AlignEngine;
  /** Whisper size (default base). */
  model?: WhisperSize;
  /** Use Silero VAD for speech detection (default: when downloaded). */
  vad?: boolean;
  /** Place every word too (default true). */
  words?: boolean;
  /** Replace cues the person marked by hand (default false: refuse). */
  force?: boolean;
  /** Write cues.json (default true). `writer` replaces the atomic file write (studio undo history). */
  write?: boolean;
  writer?: (file: string, text: string) => void;
  decode?: (file: string) => PcmAudio;
  onProgress?: (stage: string) => void;
}

export interface LongPause {
  /** Seconds where the silence starts, and its length. */
  at: number;
  len: number;
  /** Line after the pause. */
  before: string;
}

export interface AlignResult {
  cues: CuesFile;
  /** 0..1 per line: low values deserve a listen. */
  confidence: Record<string, number>;
  engine: 'dsp' | 'whisper';
  vad: boolean;
  /** Whisper only: share of script words matched to heard words. */
  matched?: number;
  /** Silences of 1 s or more between lines (candidates to trim). */
  pauses: LongPause[];
  ms: { analysis: number; vad?: number; asr?: number; total: number };
  written: boolean;
  file: string;
  /** Why an engine fell back to dsp. */
  note?: string;
}

const now = () => performance.now();
const r3 = (t: number) => Math.round(t * 1000) / 1000;

/** True when cues.json holds cues a person marked (not draft, not automatic). */
export function hasManualCues(file: string): boolean {
  if (!existsSync(file)) return false;
  const c = readCues(file).cues;
  return Boolean(c && !c.draft && !c.auto && Object.keys(c.cues).length);
}

export async function alignEpisode(paths: EpisodePaths, opts: AlignOptions = {}): Promise<AlignResult> {
  const t0 = now();
  const progress = opts.onProgress ?? (() => undefined);
  const r = compileEpisode(paths, { draftCues: true, decode: opts.decode });
  const voice = r.voice;
  if (!r.spec || !r.script.length)
    throw new AssistError('The script has no lines yet, or episode.yaml has errors');
  if (!voice) throw new AssistError(`No voice recording: record ${r.spec.audio.voice} first`);
  if (opts.write !== false && !opts.force && hasManualCues(paths.cues))
    throw new AssistError(
      'cues.json holds cues you marked by hand; replace them with --force (or confirm in the editor)',
    );
  const script = r.script;
  let engine: 'dsp' | 'whisper' = 'dsp';
  let note: string | undefined;
  const want = opts.engine ?? 'auto';
  const size = opts.model ?? 'base';
  if (want === 'whisper' || (want === 'auto' && runtimeInstalled() && whisperCached(size))) {
    if (!runtimeInstalled())
      throw new AssistError('Whisper is not installed. Run `reelforge align --setup` once.');
    engine = 'whisper';
  }
  const useVad = opts.vad ?? (runtimeInstalled() && existsSync(vadFile()));
  const ms: AlignResult['ms'] = { analysis: 0, total: 0 };

  let mono16: Float32Array | undefined;
  const to16 = () => (mono16 ??= resample(voice.mono, voice.sampleRate, 16000));
  let gate: Uint8Array | undefined;
  if (useVad) {
    progress('vad');
    const tv = now();
    const frames = Math.max(1, Math.ceil(voice.mono.length / Math.round(voice.sampleRate * 0.01)));
    gate = vadMask(await vadProbabilities(to16()), frames);
    ms.vad = Math.round(now() - tv);
  }
  progress('analysis');
  const ta = now();
  const map = analyzeSpeech(voice.mono, voice.sampleRate, { gate });
  ms.analysis = Math.round(now() - ta);

  const dsp = autoCues(script, { ...voice, file: path.basename(voice.file) }, { words: opts.words, map });
  let result: CuesFile = dsp.cues;
  let confidence = dsp.confidence;
  let matched: number | undefined;
  if (engine === 'whisper') {
    progress('whisper');
    const tw = now();
    const heard = await transcribeWords(to16(), { size, lang: r.spec.meta.lang });
    ms.asr = Math.round(now() - tw);
    const w = whisperCues(script, heard, voice.mono, map, dsp.cues, opts.words !== false);
    matched = w.matched;
    if (w.matched < 0.35) {
      engine = 'dsp';
      note = `Whisper matched only ${Math.round(w.matched * 100)}% of the script words; kept the pause-based cues`;
    } else {
      result = { ...dsp.cues, cues: w.cues, words: w.words };
      confidence = w.confidence;
    }
  }
  const pauses = longPauses(map, script, result.cues);
  let written = false;
  if (opts.write !== false) {
    const text = `${JSON.stringify({ ...result, updated: new Date().toISOString() }, null, 2)}\n`;
    if (opts.writer) opts.writer(paths.cues, text);
    else writeCues(paths.cues, result);
    written = true;
  }
  ms.total = Math.round(now() - t0);
  return {
    cues: result,
    confidence,
    engine,
    vad: useVad,
    matched,
    pauses,
    ms,
    written,
    file: paths.cues,
    note,
  };
}

/**
 * Line and word times from Whisper words. The recognizer's word times lag the audio by a roughly
 * constant amount that depends on the model and voice, so the lag is measured on this recording
 * (Whisper line starts against real pause ends) and removed before snapping.
 */
export function whisperCues(
  script: { id: string; text: string }[],
  heard: HeardWord[],
  mono: Float32Array,
  map: SpeechMap,
  fallback: CuesFile,
  withWords: boolean,
): {
  cues: Record<string, number>;
  words: Record<string, number[]>;
  confidence: Record<string, number>;
  matched: number;
} {
  const words = script.map((l) => splitWords(l.text));
  const flat = words.flat();
  const weights = flat.map(syllableCount);
  const match = matchWords(
    flat,
    heard.map((h) => h.text),
  );
  const { times, matched } = timeWords(match, heard, weights);
  const share = flat.length ? matched / flat.length : 0;
  if (!matched) return { cues: fallback.cues, words: fallback.words, confidence: {}, matched: 0 };
  // Pause ends (speech onsets after ≥ 80 ms of silence), in seconds.
  const onsets = pausesIn(map, map.first, map.last, 8).map((p) => p.to * map.hop);
  onsets.unshift(map.first * map.hop);
  const nearest = (t: number, before: number, after: number) => {
    let best: number | undefined;
    for (const o of onsets)
      if (o >= t - before && o <= t + after && (best === undefined || Math.abs(o - t) < Math.abs(best - t)))
        best = o;
    return best;
  };
  // Lag: median difference between Whisper line starts and the closest real onset.
  const lineStartIdx: number[] = [];
  let k = 0;
  for (const w of words) {
    lineStartIdx.push(k);
    k += w.length;
  }
  const diffs: number[] = [];
  for (const i of lineStartIdx) {
    if (match[i] < 0) continue;
    const o = nearest(times[i]!, 0.5, 0.25);
    if (o !== undefined) diffs.push(times[i]! - o);
  }
  diffs.sort((a, b) => a - b);
  const lag = diffs.length >= 2 ? Math.max(-0.1, Math.min(0.4, diffs[Math.floor(diffs.length / 2)])) : 0.12;
  const fixed = times.map((t) => Math.max(0, (t ?? 0) - lag));

  const cues: Record<string, number> = {};
  const outWords: Record<string, number[]> = {};
  const confidence: Record<string, number> = {};
  let prev = -1;
  script.forEach((l, li) => {
    const i0 = lineStartIdx[li];
    const n = words[li].length;
    let start = fixed[i0];
    const o = nearest(start, 0.25, 0.25);
    start = o !== undefined ? refineOnset(mono, map, o) : r3(start);
    if (start <= prev) start = r3(prev + 0.05);
    cues[l.id] = start;
    prev = start;
    let hits = 0;
    for (let j = i0; j < i0 + n; j++) if (match[j] >= 0) hits++;
    confidence[l.id] = Math.round((hits / n) * 100) / 100;
    if (!withWords || n < 2) return;
    // Fusion: the DSP estimate has sharper edges, Whisper never drifts. Keep the DSP time when the
    // two agree within 120 ms, else trust Whisper (snapped to a pause end when one is close).
    const dspWords = fallback.words[l.id];
    const ws = [start];
    for (let j = i0 + 1; j < i0 + n; j++) {
      let t = fixed[j];
      const d = dspWords?.[j - i0];
      if (d !== undefined && Math.abs(d - t) <= 0.12) t = d;
      else {
        const on = nearest(t, 0.1, 0.1);
        if (on !== undefined) t = refineOnset(mono, map, on);
      }
      ws.push(r3(Math.max(t, ws[ws.length - 1] + 0.04)));
    }
    outWords[l.id] = ws;
  });
  return { cues, words: outWords, confidence, matched: share };
}

/** Silences of at least 1 s between lines, from the speech map. */
function longPauses(map: SpeechMap, script: { id: string }[], cues: Record<string, number>): LongPause[] {
  const out: LongPause[] = [];
  for (const p of pausesIn(map, map.first, map.last, 100)) {
    const end = p.to * map.hop;
    const after = script.find((l) => Math.abs((cues[l.id] ?? -9) - end) < 0.3);
    out.push({ at: r3(p.from * map.hop), len: r3((p.to - p.from) * map.hop), before: after?.id ?? '' });
  }
  return out;
}
