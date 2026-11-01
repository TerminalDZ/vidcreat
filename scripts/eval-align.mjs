// Measures cue alignment against ground truth: line and word start errors, and speed.
//   node scripts/eval-align.mjs            (needs `pnpm build`)
// Each fixture is also tested with added noise (phone-like recording) and a quieter take.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeWav, toMono, mulberry32 } from '../packages/audio/dist/index.js';
import { autoCues, parseYaml } from '../packages/core/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'fixtures', 'align');

function noisy(mono, sr, snrDb, seed) {
  const rnd = mulberry32(seed);
  let p = 0;
  for (const v of mono) p += v * v;
  p /= mono.length;
  const amp = Math.sqrt((p / Math.pow(10, snrDb / 10)) * 3);
  const out = new Float32Array(mono.length);
  for (let i = 0; i < mono.length; i++)
    out[i] = mono[i] + (rnd() * 2 - 1) * amp + 0.15 * amp * Math.sin((2 * Math.PI * 50 * i) / sr);
  return out;
}

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return {
    mean: Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 1000),
    p50: Math.round(q(0.5) * 1000),
    p90: Math.round(q(0.9) * 1000),
    max: Math.round(s[s.length - 1] * 1000),
    within100: Math.round((s.filter((x) => x <= 0.1).length / s.length) * 100),
  };
};

const variants = [
  ['clean', (m) => m],
  ['noise 20dB', (m, sr) => noisy(m, sr, 20, 7)],
  ['noise 10dB', (m, sr) => noisy(m, sr, 10, 9)],
  ['quiet -24dB', (m) => m.map((v) => v * 0.063)],
];
const all = { lines: [], words: [] };
for (const name of readdirSync(DIR)) {
  const dir = path.join(DIR, name);
  if (!existsSync(path.join(dir, 'truth.json'))) continue;
  const truth = JSON.parse(readFileSync(path.join(dir, 'truth.json'), 'utf8').replace(/^\uFEFF/, ''));
  const spec = parseYaml(readFileSync(path.join(dir, 'episode.yaml'), 'utf8'), 'episode.yaml').data;
  const script = spec.script.map((l, i) => ({ id: `l${i + 1}`, text: l.text }));
  const pcm = decodeWav(readFileSync(path.join(dir, 'voice.wav')));
  const base = toMono(pcm);
  for (const [vname, fx] of variants) {
    const mono = fx(base, pcm.sampleRate);
    const r = autoCues(script, {
      mono,
      sampleRate: pcm.sampleRate,
      duration: mono.length / pcm.sampleRate,
      file: 'voice.wav',
    });
    const le = script.map((l) => Math.abs(r.cues.cues[l.id] - truth.lines[l.id]));
    const we = [];
    for (const l of script) {
      const t = truth.words[l.id];
      const got = r.cues.words[l.id];
      if (t && got) t.forEach((v, k) => we.push(Math.abs(got[k] - v)));
    }
    all.lines.push(...le);
    all.words.push(...we);
    if (process.env.VERBOSE) {
      const signed = [];
      for (const l of script) {
        const t = truth.words[l.id];
        const got = r.cues.words[l.id];
        if (t && got) t.forEach((v, k) => signed.push([got[k] - v, `${l.id}.${k}`]));
      }
      const bias = signed.reduce((a, [d]) => a + d, 0) / signed.length;
      const worst = signed.sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).slice(0, 5);
      console.log(
        `   bias ${Math.round(bias * 1000)} ms, worst`,
        worst.map(([d, id]) => `${id}:${Math.round(d * 1000)}`).join(' '),
      );
      console.log(
        '   line bias',
        Math.round(
          (script.reduce((a, l) => a + r.cues.cues[l.id] - truth.lines[l.id], 0) / script.length) * 1000,
        ),
      );
    }
    const bad = script
      .filter((l, i) => le[i] > 0.15)
      .map((l) => `${l.id}(${(r.cues.cues[l.id] - truth.lines[l.id]).toFixed(2)})`);
    console.log(
      `${name.padEnd(14)} ${vname.padEnd(12)} lines ${JSON.stringify(stats(le))} words ${JSON.stringify(stats(we))} ${r.ms} ms${bad.length ? '  off: ' + bad.join(' ') : ''}`,
    );
  }
}
console.log('ALL lines', JSON.stringify(stats(all.lines)), 'words', JSON.stringify(stats(all.words)));
