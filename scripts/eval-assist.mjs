// Compares cue engines against ground truth (fixtures/align): dsp, dsp+vad, whisper tiny/base.
//   node scripts/eval-assist.mjs            (needs `pnpm build`; whisper/vad need `reelforge align --setup`)
// Noisy variants are written to a temp folder next to a copy of the fixture.
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeWav, encodeWav, mulberry32, toMono } from '../packages/audio/dist/index.js';
import { INSTALL_ROOT, episodePaths } from '../packages/core/dist/index.js';
import { alignEpisode, assistStatus } from '../packages/assist/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'fixtures', 'align');
const st = assistStatus();
const engines = [
  ['dsp', { engine: 'dsp', vad: false }],
  ...(st.vad ? [['dsp+vad', { engine: 'dsp', vad: true }]] : []),
  ...(st.whisper.tiny ? [['whisper tiny+vad', { engine: 'whisper', model: 'tiny', vad: st.vad }]] : []),
  ...(st.whisper.base ? [['whisper base+vad', { engine: 'whisper', model: 'base', vad: st.vad }]] : []),
];

function noisy(src, dst, snr, kind) {
  const pcm = decodeWav(readFileSync(src));
  const m = toMono(pcm);
  const rnd = mulberry32(5);
  let p = 0;
  for (const v of m) p += v * v;
  const amp = Math.sqrt((p / m.length / Math.pow(10, snr / 10)) * 3);
  let lp = 0;
  const sr = pcm.sampleRate;
  const x = m.map((v, i) => {
    if (kind === 'music') {
      // A chord with a slow tremolo, playing through the pauses too (background music bed).
      const t = i / sr;
      const trem = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.5 * t);
      const chord = [220, 277.2, 329.6, 440].reduce((s, f) => s + Math.sin(2 * Math.PI * f * t), 0) / 4;
      return v + chord * amp * 1.4 * trem;
    }
    const w = rnd() * 2 - 1;
    lp += 0.02 * (w - lp);
    return v + w * amp * 0.6 + lp * amp * 4;
  });
  writeFileSync(dst, encodeWav({ sampleRate: sr, channels: [x] }));
}

const q = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))];
const summary = {};
for (const name of readdirSync(DIR)) {
  const src = path.join(DIR, name);
  if (!existsSync(path.join(src, 'truth.json'))) continue;
  const truth = JSON.parse(readFileSync(path.join(src, 'truth.json'), 'utf8'));
  for (const [variant, snr, kind] of [
    ['clean', null],
    ['noise 12dB', 12, 'noise'],
    ['music 14dB', 14, 'music'],
  ]) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'rf-eval-'));
    cpSync(src, dir, { recursive: true });
    if (snr !== null) noisy(path.join(src, 'voice.wav'), path.join(dir, 'voice.wav'), snr, kind);
    for (const [label, opts] of engines) {
      const r = await alignEpisode(episodePaths(dir, INSTALL_ROOT), { ...opts, write: false });
      const le = Object.keys(truth.lines).map((id) => Math.abs(r.cues.cues[id] - truth.lines[id]));
      const we = [];
      for (const [id, ws] of Object.entries(truth.words))
        ws.forEach((t, k) => r.cues.words[id] && we.push(Math.abs(r.cues.words[id][k] - t)));
      const s = (summary[label] ??= { lines: [], words: [], ms: [] });
      s.lines.push(...le);
      s.words.push(...we);
      s.ms.push(r.ms.total);
      console.log(
        `${name.padEnd(14)} ${variant.padEnd(11)} ${label.padEnd(17)} lines mean ${Math.round((le.reduce((a, b) => a + b, 0) / le.length) * 1000)} max ${Math.round(Math.max(...le) * 1000)} | words p50 ${Math.round(q(we, 0.5) * 1000)} p90 ${Math.round(q(we, 0.9) * 1000)} ≤100ms ${Math.round((we.filter((e) => e <= 0.1).length / we.length) * 100)}% | ${JSON.stringify(r.ms)}${r.matched !== undefined ? ` matched ${Math.round(r.matched * 100)}%` : ''}${r.note ? ' NOTE ' + r.note : ''}`,
      );
    }
  }
}
console.log('\nSUMMARY');
for (const [label, s] of Object.entries(summary))
  console.log(
    `${label.padEnd(17)} lines mean ${Math.round((s.lines.reduce((a, b) => a + b, 0) / s.lines.length) * 1000)} ms, max ${Math.round(Math.max(...s.lines) * 1000)} | words p50 ${Math.round(q(s.words, 0.5) * 1000)} p90 ${Math.round(q(s.words, 0.9) * 1000)} ≤100ms ${Math.round((s.words.filter((e) => e <= 0.1).length / s.words.length) * 100)}% | avg ${Math.round(s.ms.reduce((a, b) => a + b, 0) / s.ms.length)} ms`,
  );
void INSTALL_ROOT;
