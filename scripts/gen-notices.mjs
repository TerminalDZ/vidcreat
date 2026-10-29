// Generates THIRD-PARTY-NOTICES.md: every production dependency and bundled asset, with its full
// license text (required attribution for MIT / ISC / Apache-2.0 / OFL components).
// Usage: node scripts/gen-notices.mjs   (after `pnpm install` and `pnpm build`)
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Fixed arguments; Windows needs a shell to run pnpm.cmd, so pass one command string there.
const data = JSON.parse(
  process.platform === 'win32'
    ? execSync('pnpm licenses list --json --prod -r', { cwd: root, encoding: 'utf8' })
    : execFileSync('pnpm', ['licenses', 'list', '--json', '--prod', '-r'], { cwd: root, encoding: 'utf8' }),
);

/** Every font the runtime bundles (from the built fonts folder), so the notices cannot fall behind. */
const fontsDir = path.join(root, 'packages/runtime/dist/page/fonts');
if (!existsSync(path.join(fontsDir, 'fonts.css'))) throw new Error('Run `pnpm build` first (packages/runtime/dist/page/fonts).');
const css = readFileSync(path.join(fontsDir, 'fonts.css'), 'utf8');
const fonts = readdirSync(fontsDir)
  .filter((n) => n.endsWith('.LICENSE.txt'))
  .map((n) => {
    const prefix = n.replace(/\.LICENSE\.txt$/, '');
    const family = css.match(new RegExp(`font-family: '([^']+)'[^}]*url\\(\\./${prefix}-(?:latin|arabic)`))?.[1] ?? prefix;
    const text = readFileSync(path.join(fontsDir, n), 'utf8').replace(/\r\n?/g, '\n').trim();
    const copyright = (text.match(/Copyright[^\n]*?(?=\s+\S+\.ttf:|\n|$)/)?.[0] ?? '').replace(/\s*\(https?:[^)]*\)/, '').trim();
    return { prefix, family, copyright, text };
  })
  .sort((a, b) => a.family.localeCompare(b.family));

const lf = (s) => s.replace(/\r\n?/g, '\n').trim();
const licenseText = (dir) => {
  if (!dir || !existsSync(dir)) return undefined;
  const f = readdirSync(dir).find((n) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(n));
  return f ? lf(readFileSync(path.join(dir, f), 'utf8')) : undefined;
};

let md = `# Third-party notices

ReelForge includes, uses or downloads the open-source components listed below. Each is used under its
own license, reproduced or referenced here. These licenses apply to those components only; ReelForge
itself is licensed under the Apache License 2.0 (see [LICENSE](LICENSE) and [NOTICE](NOTICE)), and its
documentation and examples under CC BY 4.0 (see [docs/LICENSE-CONTENT.md](docs/LICENSE-CONTENT.md)).

## External tools (not bundled)

| Tool | License | How it is used |
|---|---|---|
| FFmpeg (with libx264) | LGPL-2.1+ / GPL-2.0+ depending on the build | Installed separately by the user and called as an external program. Not distributed with ReelForge. |
| Chromium (Playwright build) | BSD-3-Clause and others | Downloaded by \`reelforge doctor --fix\` / Playwright from Microsoft's CDN. Not distributed with ReelForge. |

## Bundled fonts (SIL Open Font License 1.1)

| Font | Copyright | Files |
|---|---|---|
${fonts.map((x) => `| ${x.family} | ${x.copyright.replace(/\|/g, '/')} | \`packages/runtime/dist/page/fonts/${x.prefix}-*.woff2\` |`).join('\n')}

The documentation site also bundles Readex Pro (from \`@fontsource-variable/readex-pro\`, OFL-1.1) for its
Arabic pages; its license text is the Readex Pro entry below.

## Bundled model: RNNoise voice cleanup

| File | Origin | License |
|---|---|---|
| \`packages/renderer/assets/rnnoise/sh.rnnn\` | "somnolent-hogwash" model of rnnoise-nu by Gregor Richards (<https://github.com/GregorR/rnnoise-models>; file from <https://github.com/richardpl/arnndn-models>) | Its author states the trained models are not creative works and not subject to copyright. |

The model is passed to FFmpeg's \`arnndn\` filter when \`audio.denoise: true\` (or \`reelforge render
--denoise\`). The RNNoise code that runs it (Copyright Xiph.Org Foundation and Jean-Marc Valin,
BSD-3-Clause) is part of FFmpeg, which is a system binary installed by the user and is not bundled with
ReelForge.

## Bundled data: icons and map outlines

| Data | Files | License |
|---|---|---|
| Lucide icons (a subset of ~230, vendored by \`scripts/vendor-icons.mjs\` from \`lucide-static\`) | \`packages/runtime/src/data/lucide-icons.ts\` (license: \`packages/runtime/src/data/LICENSE-lucide.txt\`) | ISC (some icons derived from Feather, MIT); full text below |
| Natural Earth 1:110m Admin 0 – Countries (simplified by \`scripts/gen-world-map.mjs\`) | \`packages/runtime/src/data/world.ts\` | Public domain (<https://www.naturalearthdata.com/about/terms-of-use/>) |

## Test fixtures (repository only)

| Files | Origin | Notes |
|---|---|---|
| \`fixtures/align/en-zira/voice.wav\`, \`fixtures/align/en-david-fast/voice.wav\` | Synthesized on Windows with the built-in speech voices (Microsoft Zira and David) by \`scripts/make-speech-fixture.ps1\`, which also writes the exact word timings | Used only to measure cue alignment in tests. They are not part of any ReelForge package or install. Replace them with your own recordings (see \`fixtures/align/ar-real/README.md\`) if their terms do not suit your use. |

## npm packages (runtime dependencies)

| Package | Version | License | Author | Homepage |
|---|---|---|---|---|
`;
const entries = [];
for (const [license, pkgs] of Object.entries(data)) {
  for (const p of pkgs) {
    const author = typeof p.author === 'string' ? p.author : (p.author?.name ?? '');
    entries.push({ ...p, license, author });
  }
}
entries.sort((a, b) => a.name.localeCompare(b.name));
for (const e of entries) md += `| ${e.name} | ${e.versions.join(', ')} | ${e.license} | ${e.author} | ${e.homepage ?? ''} |\n`;

// Static section: nothing below is installed by `pnpm install` or shipped in a ReelForge package, so
// `pnpm licenses` cannot see it.
md += `
## Components downloaded on demand (\`reelforge align --setup\`)

Speech alignment works without any model. For higher accuracy, \`reelforge align --setup\` downloads the
optional components below **once** into the user cache folder (\`%LOCALAPPDATA%\\reelforge\` on Windows,
\`~/Library/Caches/reelforge\` on macOS, \`~/.cache/reelforge\` on Linux, or \`$REELFORGE_CACHE\`). After that,
alignment runs offline. ReelForge does not distribute these components; they are fetched from the npm
registry and the model hub by the user's machine, under their own licenses.

| Component | License | Notes |
|---|---|---|
| @huggingface/transformers | Apache-2.0 | Runs the Whisper model. Installed with npm into the user cache. |
| onnxruntime-node, onnxruntime-web | MIT | ONNX inference runtime, a dependency of @huggingface/transformers. Also runs the Silero VAD model. |
| sharp | Apache-2.0 | Image library, a dependency of @huggingface/transformers. Not used by ReelForge. |
| libvips (prebuilt binary used by sharp) | LGPL-3.0-or-later | Installed by npm on demand into the user cache as part of sharp; not distributed by ReelForge. |
| Silero VAD model | MIT | By snakers4 (<https://github.com/snakers4/silero-vad>); ONNX file from <https://huggingface.co/onnx-community/silero-vad>. Separates speech from music and noise. |
| Whisper model weights (tiny, base, small) | MIT | By OpenAI (<https://github.com/openai/whisper>); ONNX conversions with word timestamps from \`onnx-community/whisper-*_timestamped\` on the model hub. |

## Optional software installed by the user (not distributed)

Scene suggestions can use a local language model through a locally installed Ollama server (MIT). The
default model, Qwen2.5 1.5B (\`qwen2.5:1.5b\`, Apache-2.0), is pulled by the user with Ollama. ReelForge
talks to the server on \`127.0.0.1\` by default; without it, suggestions come from a built-in keyword dictionary.
`;

md += '\n## License texts\n';
for (const e of entries) {
  const text = licenseText(e.paths?.[0]);
  md += `\n### ${e.name} (${e.license})\n\n\`\`\`text\n${text ?? `${e.license} — see ${e.homepage ?? 'the package repository'}`}\n\`\`\`\n`;
}
const lucide = path.join(root, 'packages/runtime/src/data/LICENSE-lucide.txt');
if (existsSync(lucide)) md += `\n### Lucide icons (ISC)\n\n\`\`\`text\n${lf(readFileSync(lucide, 'utf8'))}\n\`\`\`\n`;
for (const x of fonts) md += `\n### Font: ${x.family} (OFL-1.1)\n\n\`\`\`text\n${x.text}\n\`\`\`\n`;
writeFileSync(path.join(root, 'THIRD-PARTY-NOTICES.md'), md);
console.log(`wrote THIRD-PARTY-NOTICES.md (${entries.length} packages, ${fonts.length} fonts)`);
