/**
 * Optional "suggest scene" with a small local LLM (Ollama, e.g. qwen2.5:1.5b). The answer is
 * grammar-constrained: Ollama receives a JSON Schema built from the component Zod schemas (a oneOf
 * over components, each with its exact props) and the entry word restricted to the words of the
 * line, so the model cannot produce an unknown component or prop. Times are always derived from the
 * chosen word (never trusted from the model), and every element is validated with Zod again.
 * Without Ollama, callers fall back to the keyword dictionary (core suggestForLine).
 */
import {
  COMPONENTS,
  episodeJsonSchema,
  splitWords,
  suggestForLine,
  wordExpr,
  type Suggestion,
} from '@reelforge/core';

export const OLLAMA_URL = (): string =>
  (process.env.REELFORGE_OLLAMA ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
export const LLM_MODEL = (): string => process.env.REELFORGE_LLM_MODEL ?? 'qwen2.5:1.5b';

/**
 * Always offered besides the dictionary's picks. Kept small on purpose: every component adds to
 * the grammar and the prompt, and small models on laptops generate only a few tokens per second.
 */
const BASE = ['title', 'chip', 'icon'];
/** One-line hints instead of the full descriptions (shorter prompt = faster on CPU). */
const HINT: Record<string, string> = {
  title: 'big headline, **word** = accent',
  label: 'small caption',
  chip: 'pill with a short term',
  stamp: 'rotated stamp word',
  quote: 'quoted sentence',
  code: 'code that types itself',
  node: 'system box (server, db, client)',
  arrow: 'arrow between two points',
  table: 'table with columns and rows',
  lanes: 'parallel lanes (race conditions)',
  checklist: 'list of checks',
  counter: 'big animated number',
  meter: 'gauge bar with a limit',
  timeline: 'horizontal timeline',
  grid: 'grid of tiles',
  bucket: 'token bucket',
  phone: 'phone app mock',
  icon: 'one icon',
  particles: 'particles',
  trap: '"the trap" warning',
  cta: 'next-episode ending',
};
const TIME_KEYS = new Set(['at', 'until', 'strike', 'highlight']);
const clean = (w: string) => w.replace(/^[«"'“(]+|[»"'”).,!?؟،:;…]+$/g, '');

export interface LlmStatus {
  running: boolean;
  url: string;
  model: string;
  /** The model is pulled. */
  available: boolean;
}

export async function llmStatus(): Promise<LlmStatus> {
  const url = OLLAMA_URL();
  const model = LLM_MODEL();
  try {
    const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(1500) });
    const j = (await r.json()) as { models?: { name: string }[] };
    const names = (j.models ?? []).map((m) => m.name);
    return {
      running: true,
      url,
      model,
      available: names.some((n) => n === model || n === `${model}:latest`),
    };
  } catch {
    return { running: false, url, model, available: false };
  }
}

/** Replaces every time value inside props by the entry word plus a growing offset. */
function retime(v: unknown, at: string, n = { k: 0 }): unknown {
  if (Array.isArray(v)) return v.map((x) => retime(x, at, n));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, x] of Object.entries(v)) {
      if (TIME_KEYS.has(key) && (typeof x === 'string' || typeof x === 'number'))
        out[key] = n.k++ ? `${at}+${(0.4 * (n.k - 1)).toFixed(1)}` : at;
      else out[key] = retime(x, at, n);
    }
    return out;
  }
  return v;
}

/**
 * Makes model output safe to insert: endpoint names that are not elements of the scene become
 * points (an arrow from "client" to "server" would otherwise not compile), and on-screen strings
 * are cut to a few words.
 */
export function tidyProps(
  use: string,
  props: Record<string, unknown>,
  elementIds: string[] = [],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...props };
  if (COMPONENTS[use]?.endpoints) {
    const known = (v: unknown) => typeof v === 'string' && elementIds.includes(v.split('.')[0]);
    if (!known(out.from)) out.from = { x: 160, y: 500 };
    if (!known(out.to)) out.to = { x: 860, y: 500 };
  }
  const shorten = (v: unknown): unknown => {
    if (typeof v === 'string' && v.length > 48) return v.split(/\s+/).slice(0, 6).join(' ').slice(0, 48);
    if (Array.isArray(v)) return v.map(shorten);
    if (v && typeof v === 'object')
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'lines' ? x : shorten(x)]));
    return v;
  };
  return shorten(out) as Record<string, unknown>;
}

export interface LlmSuggestOptions {
  /** Ids of the elements already in the target scene (arrows may point at them). */
  elementIds?: string[];
  /** Neighbouring lines for context. */
  context?: string[];
  lang?: string;
  /** Abort after this many ms (default 180 s: small models on busy laptops are slow). */
  timeoutMs?: number;
  model?: string;
}

/**
 * Up to three elements for one line from the local LLM. Throws when Ollama is not reachable; the
 * caller decides whether to fall back to the dictionary.
 */
export async function suggestWithLlm(
  line: { id: string; text: string },
  o: LlmSuggestOptions = {},
): Promise<{ suggestions: Suggestion[]; ms: number; model: string; rejected: number }> {
  const t0 = performance.now();
  const words = splitWords(line.text);
  const wordChoices = [...new Set(words.map(clean).filter(Boolean))];
  const dictionary = suggestForLine(line, { limit: 4 });
  const names = [...new Set([...dictionary.map((s) => s.use).slice(0, 3), ...BASE])].filter(
    (n) => COMPONENTS[n],
  );
  const propSchemas = (episodeJsonSchema() as Record<string, unknown>)['x-components'] as Record<
    string,
    unknown
  >;
  const schema = {
    type: 'object',
    properties: {
      elements: {
        type: 'array',
        minItems: 1,
        maxItems: 2,
        items: {
          oneOf: names.map((name) => ({
            type: 'object',
            properties: {
              use: { const: name },
              word: { enum: wordChoices },
              props: propSchemas[name],
            },
            required: ['use', 'word', 'props'],
            additionalProperties: false,
          })),
        },
      },
    },
    required: ['elements'],
  };
  const catalog = names.map((n) => `${n} (${HINT[n] ?? n})`).join(', ');
  const prompt = [
    `Line: "${line.text}"`,
    o.context?.length ? `Context: ${o.context.map((c) => `"${c}"`).join(' ')}` : '',
    `Pick 1-2 on-screen elements from: ${catalog}.`,
    '"word" = the spoken word it appears on. Keep on-screen text to a few words; technical terms in English.',
  ]
    .filter(Boolean)
    .join('\n');
  const model = o.model ?? LLM_MODEL();
  const res = await fetch(`${OLLAMA_URL()}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(o.timeoutMs ?? 180_000),
    body: JSON.stringify({
      model,
      stream: false,
      format: schema,
      // Free the RAM a few minutes after the last suggestion.
      keep_alive: '5m',
      options: { temperature: 0.2, num_predict: 320, num_ctx: 2048 },
      messages: [
        { role: 'system', content: 'You design scenes for short technical explainer videos. JSON only.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { message?: { content?: string } };
  let parsed: { elements?: { use: string; word: string; props: Record<string, unknown> }[] };
  try {
    parsed = JSON.parse(j.message?.content ?? '{}');
  } catch {
    throw new Error('Ollama returned text that is not JSON');
  }
  let rejected = 0;
  const suggestions: Suggestion[] = [];
  for (const el of parsed.elements ?? []) {
    const def = COMPONENTS[el.use];
    let idx = words.findIndex((w) => clean(w) === el.word);
    if (idx < 0) idx = 0;
    const at = wordExpr(line.id, words, idx);
    const props = tidyProps(el.use, retime(el.props ?? {}, at) as Record<string, unknown>, o.elementIds);
    if (!def || !def.schema.safeParse(props).success) {
      rejected++;
      continue;
    }
    suggestions.push({
      use: el.use,
      reason: `LLM: "${clean(words[idx])}" → ${el.use}`,
      word: clean(words[idx]),
      props,
      enter: { at, anim: def.enter ?? 'pop' },
      score: 10 - suggestions.length,
    });
  }
  return { suggestions, ms: Math.round(performance.now() - t0), model, rejected };
}
