/**
 * A small provider layer for the optional scene suggestions. One call, `chatJson`, returns a JSON
 * object for a JSON Schema, from any of:
 *
 * - **openai**: any OpenAI-compatible Chat Completions server (Ollama `/v1`, LM Studio, llama.cpp
 *   server, vLLM, OpenRouter, OpenAI, Groq, Gemini's OpenAI endpoint, Mistral, DeepSeek…);
 * - **anthropic**: the Anthropic Messages API (a forced tool call carries the schema);
 * - **ollama**: Ollama's native `/api/chat`, whose `format` grammar constrains decoding.
 *
 * Structured output, best first: `response_format` JSON Schema → Ollama grammar → plain JSON with a
 * validate-and-repair loop (at most two retries). Configuration comes only from the environment or
 * `<config dir>/llm.json`; nothing is configured by default, and callers then use the keyword
 * dictionary instead.
 */
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type ProviderKind = 'openai' | 'anthropic' | 'ollama';

export interface LlmConfig {
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey?: string;
  /** Where the settings came from. */
  source: 'env' | 'file' | 'default';
}

/**
 * Per-user config folder (LLM settings, the server token): $REELFORGE_CONFIG_DIR, else %APPDATA%,
 * ~/Library/Application Support or $XDG_CONFIG_HOME (~/.config).
 */
export function configDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home = os.homedir(),
): string {
  if (env.REELFORGE_CONFIG_DIR) return path.resolve(env.REELFORGE_CONFIG_DIR);
  if (platform === 'win32')
    return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'reelforge');
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'reelforge');
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'reelforge');
}

const DEFAULTS: Record<ProviderKind, { baseUrl: string; model: string }> = {
  ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen2.5:1.5b' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-3-5-haiku-latest' },
};

/** Provider implied by a base URL when none is set. */
export function guessProvider(baseUrl: string): ProviderKind {
  const u = baseUrl.toLowerCase();
  if (u.includes('anthropic.com')) return 'anthropic';
  if (/:11434\/?$/.test(u)) return 'ollama';
  return 'openai';
}

/** Settings from env (`REELFORGE_LLM_*`, legacy `REELFORGE_OLLAMA`), else `llm.json`, else local Ollama. */
export function llmConfig(): LlmConfig {
  const env = process.env;
  let file: Partial<Omit<LlmConfig, 'source'>> = {};
  const f = path.join(configDir(), 'llm.json');
  if (existsSync(f)) {
    try {
      file = JSON.parse(readFileSync(f, 'utf8'));
    } catch {
      /* an unreadable file is the same as no file */
    }
  }
  const baseUrl = env.REELFORGE_LLM_BASE_URL ?? env.REELFORGE_OLLAMA ?? file.baseUrl;
  const providerIn = (env.REELFORGE_LLM_PROVIDER ?? file.provider) as ProviderKind | undefined;
  const provider: ProviderKind =
    providerIn && providerIn in DEFAULTS ? providerIn : baseUrl ? guessProvider(baseUrl) : 'ollama';
  const fromEnv = Boolean(
    env.REELFORGE_LLM_BASE_URL ||
      env.REELFORGE_OLLAMA ||
      env.REELFORGE_LLM_PROVIDER ||
      env.REELFORGE_LLM_MODEL,
  );
  return {
    provider,
    baseUrl: (baseUrl ?? DEFAULTS[provider].baseUrl).replace(/\/$/, ''),
    model: env.REELFORGE_LLM_MODEL ?? file.model ?? DEFAULTS[provider].model,
    apiKey: env.REELFORGE_LLM_API_KEY ?? file.apiKey,
    source: fromEnv ? 'env' : Object.keys(file).length ? 'file' : 'default',
  };
}

export interface ChatJsonRequest {
  system: string;
  user: string;
  /** JSON Schema of the answer (an object). */
  schema: Record<string, unknown>;
  /** Returns problems with a parsed answer ([] when it is usable); drives the repair loop. */
  validate?: (value: unknown) => string[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface ChatJsonResult {
  value: unknown;
  /** Which structured-output strategy produced the answer. */
  strategy: 'json-schema' | 'grammar' | 'tool' | 'repair';
  attempts: number;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`HTTP ${status}: ${body.slice(0, 300)}`);
  }
}

async function post(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<any> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await r.text();
  if (!r.ok) throw new HttpError(r.status, text);
  return JSON.parse(text);
}

/** The first JSON object in a reply (models sometimes wrap it in prose or a code fence). */
export function extractJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* fall through */
    }
  }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('The model did not answer with JSON');
}

type Msg = { role: 'user' | 'assistant'; content: string };

/** One request through the configured provider. `mode` picks the structured-output feature. */
async function complete(
  c: LlmConfig,
  r: ChatJsonRequest,
  messages: Msg[],
  mode: 'native' | 'plain',
): Promise<{ text?: string; value?: unknown }> {
  const timeout = r.timeoutMs ?? 180_000;
  const auth: Record<string, string> = c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {};
  if (c.provider === 'ollama') {
    const j = await post(
      `${c.baseUrl}/api/chat`,
      {
        model: c.model,
        stream: false,
        ...(mode === 'native' ? { format: r.schema } : { format: 'json' }),
        keep_alive: '5m',
        options: { temperature: r.temperature ?? 0.2, num_predict: r.maxTokens ?? 400, num_ctx: 2048 },
        messages: [{ role: 'system', content: r.system }, ...messages],
      },
      auth,
      timeout,
    );
    return { text: j.message?.content ?? '' };
  }
  if (c.provider === 'anthropic') {
    const j = await post(
      `${c.baseUrl}/v1/messages`,
      {
        model: c.model,
        max_tokens: r.maxTokens ?? 1024,
        temperature: r.temperature ?? 0.2,
        system: r.system,
        messages,
        ...(mode === 'native'
          ? {
              tools: [{ name: 'answer', description: 'Return the answer.', input_schema: r.schema }],
              tool_choice: { type: 'tool', name: 'answer' },
            }
          : {}),
      },
      { 'x-api-key': c.apiKey ?? '', 'anthropic-version': '2023-06-01' },
      timeout,
    );
    const blocks = (j.content ?? []) as { type: string; text?: string; input?: unknown }[];
    const tool = blocks.find((b) => b.type === 'tool_use');
    if (tool) return { value: tool.input };
    return { text: blocks.map((b) => b.text ?? '').join('') };
  }
  const j = await post(
    `${c.baseUrl}/chat/completions`,
    {
      model: c.model,
      temperature: r.temperature ?? 0.2,
      max_tokens: r.maxTokens ?? 1024,
      messages: [{ role: 'system', content: r.system }, ...messages],
      ...(mode === 'native'
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'answer', schema: r.schema, strict: false },
            },
          }
        : {}),
    },
    auth,
    timeout,
  );
  return { text: j.choices?.[0]?.message?.content ?? '' };
}

/**
 * A JSON answer for `r.schema`. Tries the provider's native structured output; servers that reject
 * it (HTTP 400/422) get the schema in the prompt instead. Answers that do not parse or fail
 * `r.validate` are sent back with the problems, at most twice.
 */
export async function chatJson(r: ChatJsonRequest, config: LlmConfig = llmConfig()): Promise<ChatJsonResult> {
  const nativeName =
    config.provider === 'openai' ? 'json-schema' : config.provider === 'ollama' ? 'grammar' : 'tool';
  let mode: 'native' | 'plain' = 'native';
  const plainUser = () =>
    `${r.user}\n\nAnswer with one JSON object only, matching this JSON Schema:\n${JSON.stringify(r.schema)}`;
  const messages: Msg[] = [{ role: 'user', content: r.user }];
  let lastProblems: string[] = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    let out: { text?: string; value?: unknown };
    try {
      out = await complete(config, r, messages, mode);
    } catch (e) {
      if (mode === 'native' && e instanceof HttpError && (e.status === 400 || e.status === 422)) {
        mode = 'plain';
        messages[0] = { role: 'user', content: plainUser() };
        attempt--;
        continue;
      }
      throw e;
    }
    let value: unknown;
    let problems: string[];
    try {
      value = out.value !== undefined ? out.value : extractJson(out.text ?? '');
      problems = r.validate?.(value) ?? [];
    } catch (e) {
      problems = [(e as Error).message];
    }
    if (!problems.length)
      return { value, strategy: attempt > 1 || mode === 'plain' ? 'repair' : nativeName, attempts: attempt };
    lastProblems = problems;
    messages.push(
      { role: 'assistant', content: out.text ?? JSON.stringify(out.value ?? null) },
      {
        role: 'user',
        content: `That answer has problems:\n- ${problems.slice(0, 8).join('\n- ')}\nReply with the corrected JSON object only.`,
      },
    );
  }
  throw new Error(
    `The model's answer stayed invalid after 2 retries: ${lastProblems.slice(0, 3).join('; ')}`,
  );
}

export interface ProviderStatus {
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  source: LlmConfig['source'];
  /** An API key is configured (never returned). */
  hasKey: boolean;
  /** The server answered. */
  running: boolean;
  /** The model is known to be available (listed by the server, or a cloud provider with a key). */
  available: boolean;
}

/** Why the configured model cannot answer, as a hint the person can act on. */
export function llmUnavailableReason(s: ProviderStatus): string {
  if (s.provider === 'ollama')
    return s.running
      ? `the model ${s.model} is not pulled: run \`ollama pull ${s.model}\``
      : `no model server at ${s.baseUrl}. Optional: start Ollama or LM Studio, or set REELFORGE_LLM_BASE_URL and REELFORGE_LLM_MODEL (plus REELFORGE_LLM_API_KEY for a cloud API)`;
  if (!s.hasKey && s.provider === 'anthropic') return 'set REELFORGE_LLM_API_KEY for the Anthropic API';
  return `the model server at ${s.baseUrl} did not answer${s.hasKey ? '' : ' (no API key: REELFORGE_LLM_API_KEY)'}`;
}

/** Whether suggestions can use the configured model right now (quick, 2 s timeout). */
export async function providerStatus(c: LlmConfig = llmConfig()): Promise<ProviderStatus> {
  const base = {
    provider: c.provider,
    baseUrl: c.baseUrl,
    model: c.model,
    source: c.source,
    hasKey: Boolean(c.apiKey),
  };
  const get = async (url: string, headers: Record<string, string> = {}) => {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new HttpError(r.status, '');
    return r.json() as Promise<any>;
  };
  try {
    if (c.provider === 'ollama') {
      const j = await get(`${c.baseUrl}/api/tags`);
      const names = ((j.models ?? []) as { name: string }[]).map((m) => m.name);
      return {
        ...base,
        running: true,
        available: names.some((n) => n === c.model || n === `${c.model}:latest`),
      };
    }
    if (c.provider === 'anthropic')
      return { ...base, running: Boolean(c.apiKey), available: Boolean(c.apiKey) };
    const j = await get(`${c.baseUrl}/models`, c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {});
    const ids = ((j.data ?? []) as { id: string }[]).map((m) => m.id);
    // Some servers list nothing or only aliases; a reachable server with a configured model counts.
    return {
      ...base,
      running: true,
      available: !ids.length || ids.includes(c.model) || c.source !== 'default',
    };
  } catch {
    return { ...base, running: false, available: false };
  }
}
