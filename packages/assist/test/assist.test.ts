import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  alignEpisode,
  assistStatus,
  fold,
  hasManualCues,
  llmStatus,
  matchWords,
  resample,
  similarity,
  suggestWithLlm,
  timeWords,
  vadMask,
  whisperCues,
  whisperLanguage,
  type HeardWord,
} from '@reelforge/assist';
import { analyzeSpeech, decodeWav, toMono } from '@reelforge/audio';
import { autoCues, episodePaths, INSTALL_ROOT, splitWords } from '@reelforge/core';

const ZIRA = path.join(INSTALL_ROOT, 'fixtures/align/en-zira');

function copyFixture(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'rf-assist-'));
  cpSync(ZIRA, dir, { recursive: true });
  return dir;
}

const truth = JSON.parse(readFileSync(path.join(ZIRA, 'truth.json'), 'utf8')) as {
  lines: Record<string, number>;
  words: Record<string, number[]>;
};

describe('fuzzy word matching', () => {
  it('folds spelling variants and scores similarity', () => {
    expect(fold('Captions,')).toBe('captions');
    expect(fold('المشكلة')).toBe(fold('المشكله'));
    expect(fold('إنتا')).toBe(fold('انتا'));
    expect(similarity('reelforge', 'reelforge')).toBe(1);
    expect(similarity('forge', 'forged')).toBeGreaterThan(0.8);
    expect(similarity('cat', 'elephant')).toBe(0);
  });

  it('matches through recognizer mistakes, merges, fillers and skipped words', () => {
    const script = ['Meet', 'ReelForge.', 'Write', 'your', 'script,', 'one', 'sentence', 'per', 'line.'];
    // "ReelForge" heard as two words, a filler, "your" missed, "sentence" misheard.
    const heard = ['meet', 'real', 'forge', 'um', 'write', 'script', 'one', 'sentense', 'per', 'line'];
    expect(matchWords(script, heard)).toEqual([0, 1, 4, -1, 5, 6, 7, 8, 9]);
  });

  it('matches two script words heard as one', () => {
    expect(matchWords(['rate', 'limiter', 'decides'], ['ratelimiter', 'decides'])).toEqual([0, -1, 1]);
  });

  it('interpolates unmatched words by syllables between anchors', () => {
    const heard: HeardWord[] = [
      { text: 'a', start: 1, end: 1.2 },
      { text: 'd', start: 2.2, end: 2.4 },
    ];
    const { times, matched } = timeWords([0, -1, -1, 1], heard, [1, 1, 3, 1]);
    expect(matched).toBe(2);
    expect(times[0]).toBe(1);
    expect(times[1]).toBeCloseTo(1.2, 5); // right after the anchor word ends
    expect(times[2]).toBeCloseTo(1.45, 5); // 1/4 of the remaining 1.0 s
    expect(times[3]).toBe(2.2);
  });

  it('maps BCP-47 tags to Whisper languages', () => {
    expect(whisperLanguage('ar-EG')).toBe('arabic');
    expect(whisperLanguage('en-US')).toBe('english');
    expect(whisperLanguage('xx')).toBeUndefined();
  });
});

describe('resample', () => {
  const tone = (f: number, sr: number, sec: number) =>
    Float32Array.from({ length: Math.round(sr * sec) }, (_, i) => Math.sin((2 * Math.PI * f * i) / sr));
  const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

  it('keeps speech-band tones and removes what 16 kHz cannot hold', () => {
    const pass = resample(tone(1000, 48000, 1), 48000);
    expect(pass.length).toBe(16000);
    expect(rms(pass.subarray(200, 15800))).toBeCloseTo(Math.SQRT1_2, 1);
    const stop = resample(tone(11000, 44100, 1), 44100);
    expect(rms(stop.subarray(200, 15800))).toBeLessThan(0.02);
    expect(resample(pass, 16000)).toBe(pass);
  });

  it('is fast: 30 s of 48 kHz far faster than real time', () => {
    // ~0.1 s alone (2 min takes ~0.3–0.5 s); a loaded parallel test runner on a busy machine can be
    // 10× slower, so the bound only catches a real regression (per-tap sin/cos took ~30× longer).
    const x = tone(440, 48000, 30);
    const t0 = performance.now();
    resample(x, 48000);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe('vadMask', () => {
  it('applies hysteresis and drops blips', () => {
    // 32 ms chunks: speech 10 chunks, a one-chunk blip, a short dip inside speech.
    const p = Float32Array.from([
      0, 0, 0.9, 0.9, 0.4, 0.9, 0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.1, 0.8, 0, 0, 0, 0,
    ]);
    const m = vadMask(p, Math.round((p.length * 512) / 160));
    const at = (sec: number) => m[Math.round(sec * 100)];
    expect(at(0.03)).toBe(0);
    expect(at(0.14)).toBe(1); // 0.4 stays on (hysteresis)
    expect(at(0.33)).toBe(0);
    expect(at(0.43)).toBe(0); // the single 32 ms chunk at 0.42 s is too short
  });
});

describe('whisperCues (recognizer timings fused with the pause analysis)', () => {
  it('removes a constant recognizer lag and lands lines on real onsets', () => {
    const pcm = decodeWav(readFileSync(path.join(ZIRA, 'voice.wav')));
    const mono = toMono(pcm);
    const map = analyzeSpeech(mono, pcm.sampleRate);
    const spec = readFileSync(path.join(ZIRA, 'episode.yaml'), 'utf8');
    const script = [...spec.matchAll(/- text: '(.*)'/g)].map((m, i) => ({
      id: `l${i + 1}`,
      text: m[1].replace(/''/g, "'"),
    }));
    // A fake recognizer: true word times + 150 ms lag + jitter, with mistakes in the text.
    const heard: HeardWord[] = [];
    script.forEach((l) =>
      splitWords(l.text).forEach((w, k) => {
        const t = truth.words[l.id][k] + 0.15 + ((k * 37) % 7) * 0.006;
        heard.push({ text: w === 'ReelForge.' ? 'real forge' : w, start: t, end: t + 0.2 });
      }),
    );
    const dsp = autoCues(
      script,
      { mono, sampleRate: pcm.sampleRate, duration: mono.length / pcm.sampleRate, file: 'v.wav' },
      { map },
    );
    const r = whisperCues(script, heard, mono, map, dsp.cues, true);
    expect(r.matched).toBeGreaterThan(0.9);
    for (const l of script) expect(Math.abs(r.cues[l.id] - truth.lines[l.id])).toBeLessThan(0.06);
    expect(Object.keys(r.words)).toHaveLength(script.length);
  });
});

const LLM_ENV = [
  'REELFORGE_OLLAMA',
  'REELFORGE_LLM_PROVIDER',
  'REELFORGE_LLM_BASE_URL',
  'REELFORGE_LLM_MODEL',
  'REELFORGE_LLM_API_KEY',
  'REELFORGE_CONFIG_DIR',
] as const;
/** Sets LLM env vars for one test and returns a restore function (deleting unset ones). */
function withEnv(vars: Partial<Record<(typeof LLM_ENV)[number], string>>): () => void {
  const prev = Object.fromEntries(LLM_ENV.map((k) => [k, process.env[k]]));
  for (const k of LLM_ENV) delete process.env[k];
  process.env.REELFORGE_CONFIG_DIR = mkdtempSync(path.join(os.tmpdir(), 'rf-cfg-'));
  Object.assign(process.env, vars);
  return () => {
    for (const k of LLM_ENV)
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
  };
}

describe('suggestWithLlm (Ollama, schema-constrained)', () => {
  it('sends a grammar from the component schemas and keeps only valid, safe elements (mock server)', async () => {
    let seen:
      | {
          format: {
            properties: {
              elements: {
                items: { oneOf: { properties: { use: { const: string }; word: { enum: string[] } } }[] };
              };
            };
          };
        }
      | undefined;
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'qwen2.5:1.5b' }] }));
        seen = JSON.parse(body);
        res.end(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                elements: [
                  { use: 'chip', word: 'race', props: { text: 'race condition' } },
                  {
                    use: 'arrow',
                    word: 'clients',
                    props: {
                      from: 'clients',
                      to: 'server',
                      label: 'a very long label that goes on and on and on forever',
                    },
                  },
                  { use: 'title', word: 'Two', props: { text: 'x', bogus: 1 } },
                ],
              }),
            },
          }),
        );
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const restore = withEnv({
      REELFORGE_LLM_PROVIDER: 'ollama',
      REELFORGE_LLM_BASE_URL: `http://127.0.0.1:${port}`,
    });
    try {
      expect((await llmStatus()).available).toBe(true);
      const r = await suggestWithLlm(
        { id: 'l2', text: 'Two clients race to send the request.' },
        { elementIds: ['srv'] },
      );
      const items = seen!.format.properties.elements.items.oneOf;
      expect(items.map((i) => i.properties.use.const)).toContain('lanes'); // dictionary pick offered
      expect(items[0].properties.word.enum).toEqual([
        'Two',
        'clients',
        'race',
        'to',
        'send',
        'the',
        'request',
      ]);
      expect(r.rejected).toBe(1); // unknown prop "bogus"
      expect(r.suggestions.map((s) => s.use)).toEqual(['chip', 'arrow']);
      expect(r.suggestions[0].enter.at).toBe("l2:'race'");
      const arrow = r.suggestions[1].props;
      expect(arrow.from).toEqual({ x: 160, y: 500 }); // "clients" is not an element of the scene
      expect(String(arrow.label).length).toBeLessThanOrEqual(48);
    } finally {
      restore();
      server.close();
    }
  });

  it('reports Ollama as not running when nothing listens', async () => {
    const restore = withEnv({ REELFORGE_OLLAMA: 'http://127.0.0.1:9' });
    try {
      expect(await llmStatus()).toMatchObject({ running: false, available: false });
    } finally {
      restore();
    }
  });

  it.skipIf(!process.env.REELFORGE_TEST_MODELS)(
    'real local model returns schema-valid elements (REELFORGE_TEST_MODELS=1)',
    async () => {
      const r = await suggestWithLlm({
        id: 'l1',
        text: 'CPU hits a hundred percent, and the database is choking.',
      });
      expect(r.suggestions.length).toBeGreaterThan(0);
      expect(r.rejected).toBe(0);
    },
    300_000,
  );
});

describe('alignEpisode', () => {
  it('writes automatic cues (dsp) and reports timings and long pauses', async () => {
    const dir = copyFixture();
    const r = await alignEpisode(episodePaths(dir, INSTALL_ROOT), { engine: 'dsp', vad: false });
    expect(r.engine).toBe('dsp');
    expect(r.written).toBe(true);
    const saved = JSON.parse(readFileSync(path.join(dir, 'cues.json'), 'utf8'));
    expect(saved.auto).toBe(true);
    expect(saved.audio.sha1).toMatch(/^[0-9a-f]{40}$/);
    for (const [id, t] of Object.entries(truth.lines)) expect(Math.abs(saved.cues[id] - t)).toBeLessThan(0.1);
    expect(r.ms.total).toBeLessThan(2000);
    expect(r.pauses.every((p) => p.len >= 1)).toBe(true);
    // A second run may replace automatic cues.
    await alignEpisode(episodePaths(dir, INSTALL_ROOT), { engine: 'dsp', vad: false, words: false });
  });

  it('never overwrites hand-marked cues unless forced, and can use the studio writer', async () => {
    const dir = copyFixture();
    const file = path.join(dir, 'cues.json');
    writeFileSync(
      file,
      JSON.stringify({ version: 1, audio: { file: 'voice.wav', duration: 44 }, cues: { l1: 0.7 } }),
    );
    expect(hasManualCues(file)).toBe(true);
    await expect(
      alignEpisode(episodePaths(dir, INSTALL_ROOT), { engine: 'dsp', vad: false }),
    ).rejects.toThrow(/marked by hand/);
    const writes: string[] = [];
    const r = await alignEpisode(episodePaths(dir, INSTALL_ROOT), {
      engine: 'dsp',
      vad: false,
      force: true,
      writer: (f, text) => writes.push(`${path.basename(f)}:${JSON.parse(text).auto}`),
    });
    expect(r.written).toBe(true);
    expect(writes).toEqual(['cues.json:true']);
  });

  it('explains what is missing', async () => {
    const dir = copyFixture();
    writeFileSync(path.join(dir, 'voice.wav'), Buffer.alloc(0));
    await expect(alignEpisode(episodePaths(dir, INSTALL_ROOT), { engine: 'dsp' })).rejects.toThrow(
      /No voice/,
    );
  });

  const st = assistStatus();
  // Real models are slow (~1 min): run with REELFORGE_TEST_MODELS=1 after `reelforge align --setup`.
  it.skipIf(!process.env.REELFORGE_TEST_MODELS || !st.installed || !st.whisper.base || !st.vad)(
    'aligns with Whisper + VAD (real model, REELFORGE_TEST_MODELS=1)',
    async () => {
      const dir = copyFixture();
      const r = await alignEpisode(episodePaths(dir, INSTALL_ROOT), { engine: 'whisper', write: false });
      expect(r.engine).toBe('whisper');
      expect(r.vad).toBe(true);
      expect(r.matched).toBeGreaterThan(0.9);
      for (const [id, t] of Object.entries(truth.lines))
        expect(Math.abs(r.cues.cues[id] - t)).toBeLessThan(0.1);
    },
    180_000,
  );
});
