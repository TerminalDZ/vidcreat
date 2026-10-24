/**
 * Whisper word timings through transformers.js (quantized ONNX, CPU). The transcript itself is
 * thrown away: only word start/end times are kept and matched to the known script (match.ts).
 * The model stays loaded between calls and is released after a few idle minutes to give the
 * memory back (~0.5–0.8 GB while loaded).
 */
import type { HeardWord } from './match.js';
import { loadTransformers, WHISPER_MODELS, type WhisperSize } from './setup.js';

const IDLE_MS = 3 * 60_000;

let loaded: { size: WhisperSize; pipe: Promise<any> } | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;

/** Whisper language name from a BCP-47 tag (ar-EG → arabic). */
export function whisperLanguage(lang: string): string | undefined {
  const map: Record<string, string> = {
    ar: 'arabic',
    en: 'english',
    fr: 'french',
    es: 'spanish',
    de: 'german',
    tr: 'turkish',
    pt: 'portuguese',
    it: 'italian',
    id: 'indonesian',
    ur: 'urdu',
    fa: 'persian',
    hi: 'hindi',
  };
  return map[lang.toLowerCase().split(/[-_]/)[0]];
}

async function pipelineFor(size: WhisperSize): Promise<any> {
  if (loaded?.size !== size) {
    await disposeWhisper();
    const t = await loadTransformers();
    loaded = {
      size,
      pipe: t.pipeline('automatic-speech-recognition', WHISPER_MODELS[size], { dtype: 'q8', device: 'cpu' }),
    };
    loaded.pipe.catch(() => (loaded = undefined));
  }
  return loaded.pipe;
}

export async function disposeWhisper(): Promise<void> {
  if (idle) clearTimeout(idle);
  idle = undefined;
  const l = loaded;
  loaded = undefined;
  if (l) await (await l.pipe.catch(() => undefined))?.dispose?.();
}

/** Words with start/end seconds heard in 16 kHz mono audio. */
export async function transcribeWords(
  mono16k: Float32Array,
  opts: { size?: WhisperSize; lang?: string } = {},
): Promise<HeardWord[]> {
  if (idle) clearTimeout(idle);
  const pipe = await pipelineFor(opts.size ?? 'base');
  try {
    const language = opts.lang ? whisperLanguage(opts.lang) : undefined;
    const out = await pipe(mono16k, {
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5,
      task: 'transcribe',
      ...(language ? { language } : {}),
    });
    const chunks = (out.chunks ?? []) as { text: string; timestamp: [number, number | null] }[];
    return chunks
      .map((c) => ({
        text: c.text.trim(),
        start: c.timestamp[0],
        end: c.timestamp[1] ?? c.timestamp[0] + 0.2,
      }))
      .filter((w) => w.text && Number.isFinite(w.start));
  } finally {
    idle = setTimeout(() => void disposeWhisper(), IDLE_MS);
    idle.unref?.();
  }
}
