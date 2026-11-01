/**
 * Automatic cues from the voice recording (no model): the script is known, so the recording is split
 * into its lines at pauses and each line into its words (see @reelforge/audio align.ts).
 * The person then only corrects mistakes by ear in Cues mode.
 */
import { alignLines, alignWords, analyzeSpeech, type SpeechMap } from '@reelforge/audio';
import type { CuesFile } from './cues.js';
import { splitWords, syllableCount } from './text.js';
import { round3 } from './util.js';

/** Punctuation after which a speaker usually pauses. */
const PAUSE_AFTER = /[,.;:?!،؛؟…—)]$/;

/** Expected spoken length of a line in syllables. */
export function lineWeight(text: string): number {
  return splitWords(text).reduce((n, w) => n + syllableCount(w), 0) || 1;
}

export interface AutoCueOptions {
  /** Also place every word (default true). */
  words?: boolean;
  /** Speech mask from a VAD at 10 ms frames (replaces the energy mask). */
  voiced?: Uint8Array;
  /** Pre-computed analysis of the same recording. */
  map?: SpeechMap;
}

export interface AutoCueResult {
  cues: CuesFile;
  /** 0..1 per line id: low values deserve a listen. */
  confidence: Record<string, number>;
  /** Wall time spent, in milliseconds. */
  ms: number;
}

export function autoCues(
  script: { id: string; text: string }[],
  voice: { mono: Float32Array; sampleRate: number; duration: number; sha1?: string; file: string },
  opts: AutoCueOptions = {},
): AutoCueResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const map = opts.map ?? analyzeSpeech(voice.mono, voice.sampleRate, { voiced: opts.voiced });
  const lines = alignLines(
    voice.mono,
    map,
    script.map((l) => lineWeight(l.text)),
  );
  const cues: Record<string, number> = {};
  const words: Record<string, number[]> = {};
  const confidence: Record<string, number> = {};
  script.forEach((l, i) => {
    cues[l.id] = lines.starts[i];
    confidence[l.id] = lines.confidence[i];
    if (opts.words === false) return;
    const ws = splitWords(l.text);
    if (ws.length < 2) return;
    const end = i + 1 < script.length ? lines.starts[i + 1] : voice.duration;
    words[l.id] = alignWords(
      voice.mono,
      map,
      lines.starts[i],
      end,
      ws.map(syllableCount),
      ws.slice(0, -1).map((w) => (PAUSE_AFTER.test(w) ? 1 : 0)),
    );
  });
  const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return {
    cues: {
      version: 1,
      audio: {
        file: voice.file,
        duration: round3(voice.duration),
        ...(voice.sha1 ? { sha1: voice.sha1 } : {}),
      },
      cues,
      words,
      auto: true,
    },
    confidence,
    ms: Math.round(ms * 10) / 10,
  };
}
