/** End-to-end: render fixtures/mini (SRS §12.1 integration), seeded V-9/V-10 bugs, offline guarantee. */
import { cpSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeWav, encodeWav, mulberry32, toMono } from '@reelforge/audio';
import { compileEpisode, episodePaths } from '@reelforge/core';
import { countFrames, ffprobeJson, measureTimeline, mixAudio, renderEpisode } from '@reelforge/renderer';
import { ROOT } from './helpers.js';

function copyFixture(rel: string): string {
  const dir = path.join(mkdtempSync(path.join(os.tmpdir(), 'rf-it-')), path.basename(rel));
  cpSync(path.join(ROOT, rel), dir, { recursive: true, filter: (src) => !src.includes(`${path.sep}out`) });
  return dir;
}

describe('render pipeline (fixtures/mini)', () => {
  it('produces compliant master, share, SRT, sheet and publish.md', async () => {
    const dir = copyFixture('fixtures/mini');
    const phases = new Set<string>();
    const r = await renderEpisode(episodePaths(dir, ROOT), {
      workers: 2,
      fast: true,
      onProgress: (p) => phases.add(p.phase),
    });
    expect(r.ok).toBe(true);
    expect([...phases]).toEqual(
      expect.arrayContaining(['validate', 'frames', 'concat', 'audio', 'master', 'share', 'extras', 'done']),
    );
    const { master, share, srt, sheet, publish } = r.outputs;
    for (const f of [master, share, srt, sheet, publish]) expect(existsSync(f!)).toBe(true);
    // NFR-13
    expect(r.compliance.master!.problems).toEqual([]);
    expect(r.compliance.share!.problems).toEqual([]);
    expect(statSync(share!).size).toBeLessThanOrEqual(28 * 1048576);
    // a short clip's share file must not be larger than its master
    expect(statSync(share!).size).toBeLessThanOrEqual(statSync(master!).size * 1.05);
    // frame count = ceil(duration × fps); audio duration = voice duration ± 1 frame
    expect(await countFrames(master!)).toBe(180);
    const probe = await ffprobeJson(master!);
    const a = probe.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
    expect(Math.abs(Number(a.duration) - 6)).toBeLessThanOrEqual(1 / 30 + 0.03);
    expect(readFileSync(srt!, 'utf8')).toMatch(/00:00:00,200 --> 00:00:02,100/);
    expect(existsSync(path.join(dir, 'out', '.tmp'))).toBe(false);
  });

  it('renders a partial range to <id>.part.mp4 (FR-REN-9)', async () => {
    const dir = copyFixture('fixtures/mini');
    const r = await renderEpisode(episodePaths(dir, ROOT), { workers: 1, from: 1, to: 2.5, measure: false });
    expect(r.outputs.part).toMatch(/mini\.part\.mp4$/);
    expect(await countFrames(r.outputs.part!)).toBe(45);
  });

  it('refuses to render invalid episodes and episodes without voice', async () => {
    await expect(
      renderEpisode(episodePaths(path.join(ROOT, 'fixtures/lint/v05-exit-before-enter'), ROOT), {
        measure: false,
      }),
    ).rejects.toThrow(/Validation failed/);
    await expect(
      renderEpisode(episodePaths(path.join(ROOT, 'fixtures/golden/captions'), ROOT), { measure: false }),
    ).rejects.toThrow(/--silent/);
  });

  it('cleans up and removes partial files on abort (FR-REN-8)', async () => {
    const dir = copyFixture('fixtures/mini');
    const ac = new AbortController();
    const p = renderEpisode(episodePaths(dir, ROOT), {
      workers: 1,
      measure: false,
      signal: ac.signal,
      onProgress: (pr) => pr.phase === 'frames' && pr.done > 5 && ac.abort(),
    });
    await expect(p).rejects.toThrow(/aborted/i);
    expect(existsSync(path.join(dir, 'out', 'mini.master.mp4'))).toBe(false);
  });
});

describe('voice noise cleanup (audio.denoise, RNNoise via arnndn)', () => {
  it('lowers the noise floor and keeps the voice level', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'rf-dn-'));
    // 8 s of a real voice take with hiss and a low rumble added (a phone in a noisy room).
    const pcm = decodeWav(readFileSync(path.join(ROOT, 'fixtures/align/en-zira/voice.wav')));
    const m = toMono(pcm).subarray(0, pcm.sampleRate * 8);
    const rnd = mulberry32(3);
    let lp = 0;
    const noisy = m.map((v) => {
      const w = rnd() * 2 - 1;
      lp += 0.02 * (w - lp);
      return v + w * 0.02 + lp * 0.12;
    });
    const voice = path.join(tmp, 'voice.wav');
    writeFileSync(voice, encodeWav({ sampleRate: pcm.sampleRate, channels: [noisy] }));
    const sfx = path.join(tmp, 'sfx.wav');
    writeFileSync(sfx, encodeWav({ sampleRate: 48000, channels: [new Float32Array(48000 * 8)] }));
    const level = async (denoise: boolean) => {
      const out = path.join(tmp, `mix-${denoise}.wav`);
      await mixAudio({ voice, sfx, out, duration: 8, sfxGainDb: -16, duck: true, withSfx: false, denoise });
      const x = toMono(decodeWav(readFileSync(out)));
      const db = (a: number, b: number) => {
        let s = 0;
        for (let i = Math.round(a * 48000); i < Math.round(b * 48000); i++) s += x[i] * x[i];
        return 10 * Math.log10(s / ((b - a) * 48000) + 1e-12);
      };
      return { silence: db(0.05, 0.55), speech: db(0.8, 3) }; // the take starts speaking at 0.7 s
    };
    const raw = await level(false);
    const clean = await level(true);
    expect(raw.silence - clean.silence).toBeGreaterThan(8);
    expect(Math.abs(raw.speech - clean.speech)).toBeLessThan(3);
  });

  it('renders with denoise (partial range)', async () => {
    const dir = copyFixture('fixtures/mini');
    const r = await renderEpisode(episodePaths(dir, ROOT), {
      workers: 1,
      from: 0,
      to: 1,
      measure: false,
      denoise: true,
    });
    expect(r.compliance.part!.problems).toEqual([]);
  });
});

describe('headless lint pass (V-9, V-10)', () => {
  for (const [name, rule] of [
    ['v09-text-overflow', 'V-9'],
    ['v10-caption-lines', 'V-10'],
  ]) {
    it(`reports ${rule} for fixtures/lint/${name}`, async () => {
      const r = compileEpisode(episodePaths(path.join(ROOT, 'fixtures/lint', name), ROOT), { voice: null });
      const issues = await measureTimeline(r.timeline!);
      expect(issues.map((i) => i.rule)).toContain(rule);
    });
  }
  it('reports nothing for the clean mini fixture', async () => {
    const r = compileEpisode(episodePaths(path.join(ROOT, 'fixtures/mini'), ROOT));
    expect(await measureTimeline(r.timeline!)).toEqual([]);
  });
});
