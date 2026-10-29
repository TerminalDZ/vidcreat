// Pins the optional speech models to a Hugging Face commit and records the SHA-256 of every file
// `reelforge align --setup` downloads. Output: packages/assist/runtime/models.json (committed).
//   node scripts/pin-assist-models.mjs     (network; rerun only to move to newer model commits)
// Large ONNX files use the SHA-256 Hugging Face publishes for LFS objects; small files are hashed here.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'packages/assist/runtime/models.json');

/** Files a transformers.js Whisper pipeline reads (quantized encoder + merged decoder). */
const WHISPER_FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];
const MODELS = {
  'whisper-tiny': { repo: 'onnx-community/whisper-tiny_timestamped', files: WHISPER_FILES },
  'whisper-base': { repo: 'onnx-community/whisper-base_timestamped', files: WHISPER_FILES },
  'whisper-small': { repo: 'onnx-community/whisper-small_timestamped', files: WHISPER_FILES },
  'silero-vad': { repo: 'onnx-community/silero-vad', files: ['onnx/model.onnx'] },
};

const README = path.join(ROOT, 'packages/assist/runtime/README.md');
const mb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

/** README with the pins and hashes, generated from models.json (no network). */
function writeReadme(pins) {
  const rows = Object.entries(pins).flatMap(([key, m]) =>
    Object.entries(m.files).map(
      ([f, meta]) => `| ${key} | ${m.repo} @ \`${m.revision.slice(0, 12)}\` | \`${f}\` | ${mb(meta.size)} | \`${meta.sha256}\` |`,
    ),
  );
  writeFileSync(
    README,
    `# Optional speech-model runtime

This folder pins everything \`reelforge align --setup\` installs into the user cache. Nothing here is
used by the render engine.

- \`package.json\` + \`package-lock.json\`: the runtime (\`@huggingface/transformers\` and its dependencies,
  including \`onnxruntime-node\`), installed with \`npm ci\`, so every package version and integrity hash
  comes from the committed lockfile. Files for other platforms are removed after install.
- \`models.json\`: each model is pinned to a Hugging Face **commit** (\`revision\`) and every file to its
  **SHA-256**. ReelForge downloads the files itself, checks them before they are used, and loads them
  with transformers.js remote models disabled. A mismatch stops setup with an error and installs
  nothing.

Regenerate the pins with \`node scripts/pin-assist-models.mjs\` (only to move to newer model commits)
and review the diff before committing; \`--readme\` rebuilds this file only. \`HF_ENDPOINT\` points
downloads at a mirror.

| Model | Repository @ revision | File | Size | SHA-256 |
| ----- | --------------------- | ---- | ---- | ------- |
${rows.join('\n')}

Licenses: Whisper weights MIT (OpenAI), Silero VAD MIT (Silero Team), transformers.js Apache-2.0,
onnxruntime MIT. See THIRD-PARTY-NOTICES.md.
`,
  );
  console.log(`wrote ${path.relative(ROOT, README)}`);
}

if (process.argv.includes('--readme')) {
  writeReadme(JSON.parse(readFileSync(OUT, 'utf8')));
  process.exit(0);
}

const api = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
};

const out = {};
for (const [key, m] of Object.entries(MODELS)) {
  const { sha: revision } = await api(`https://huggingface.co/api/models/${m.repo}`);
  const files = {};
  for (const f of m.files) {
    const dir = path.posix.dirname(f) === '.' ? '' : `/${path.posix.dirname(f)}`;
    const tree = await api(`https://huggingface.co/api/models/${m.repo}/tree/${revision}${dir}`);
    const entry = tree.find((e) => e.path === f);
    if (!entry) throw new Error(`${m.repo}@${revision}: ${f} not found`);
    let sha256 = entry.lfs?.oid;
    if (!sha256) {
      const r = await fetch(`https://huggingface.co/${m.repo}/resolve/${revision}/${f}`);
      if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
      sha256 = createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');
    }
    files[f] = { sha256, size: entry.lfs?.size ?? entry.size };
  }
  out[key] = { repo: m.repo, revision, files };
  console.log(`${key}: ${m.repo}@${revision.slice(0, 12)} (${Object.keys(files).length} files)`);
}
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${path.relative(ROOT, OUT)}`);
writeReadme(out);
