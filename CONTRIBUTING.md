# Contributing to ReelForge

Thank you for helping. This guide covers the development setup, a tour of the code, the common kinds of
contributions and the checks a pull request must pass.

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE)
(documentation and examples under [CC BY 4.0](docs/LICENSE-CONTENT.md)), and you agree to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

You need **Node.js 22**, **pnpm 10** (through Corepack), **Git** and **FFmpeg 6+** on your `PATH`.
Playwright downloads the pinned Chromium build.

### Windows 10/11

```powershell
winget install OpenJS.NodeJS.LTS Gyan.FFmpeg Git.Git
corepack enable
git clone https://github.com/TerminalDZ/vidcreat.git; cd vidcreat
pnpm install; pnpm build
pnpm exec playwright install chromium
pnpm reelforge doctor
```

Git converts line endings for you (`.gitattributes` keeps LF everywhere except `*.bat`, `*.cmd` and
`*.ps1`). Edit files with an editor that respects `.editorconfig`, and avoid tools that write a UTF-8 BOM
or UTF-16. `pnpm lint` runs a mojibake check that catches broken encodings.

### macOS

```bash
brew install node@22 ffmpeg git
corepack enable
git clone https://github.com/TerminalDZ/vidcreat.git && cd vidcreat
pnpm install && pnpm build
pnpm exec playwright install chromium
pnpm reelforge doctor
```

### Linux

```bash
# Debian/Ubuntu shown; use your package manager elsewhere. Node.js 22 from your distribution or nodejs.org.
sudo apt-get install -y ffmpeg git
corepack enable
git clone https://github.com/TerminalDZ/vidcreat.git && cd vidcreat
pnpm install && pnpm build
pnpm exec playwright install --with-deps chromium
pnpm reelforge doctor
```

### Optional: speech models

Alignment tests that use real models are skipped by default. To run them:

```bash
pnpm reelforge align --setup                 # downloads the optional speech models once
REELFORGE_TEST_MODELS=1 pnpm test:unit
node scripts/eval-assist.mjs                 # cue accuracy and speed against ground truth
```

## Architecture tour

ReelForge is a pnpm workspace. Dependencies point downwards: `cli` → `studio` → `renderer` → `runtime`
→ `core` → `audio`, with `assist` used by `studio` and `cli`.

| Package             | Responsibility                                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/audio`    | WAV reading and writing, envelopes, onset detection, procedural sound effects. No dependencies.                                                                                                                                                                                |
| `packages/core`     | The `episode.yaml` schema (Zod), time expressions, captions and bidi, themes, presets, the compiler that produces the **Timeline**, validation rules (V-1…V-14), draft and DSP cues, keyword suggestions. The Timeline (`src/types.ts`) is the only contract with the runtime. |
| `packages/assist`   | Optional helpers: cue alignment (DSP, or Whisper and Silero VAD installed on demand into the user cache) and scene suggestions through a local LLM. Nothing in the render path depends on it.                                                                                  |
| `packages/runtime`  | The browser page: a pure `render(t)` that draws every component as DOM/SVG. No `Date.now()`, no unseeded randomness, no timers.                                                                                                                                                |
| `packages/renderer` | Chromium workers capture frame ranges, FFmpeg encodes x264 segments, concatenates them, masters loudness and verifies the outputs with ffprobe. Also `doctor`.                                                                                                                 |
| `packages/studio`   | Local servers: the dashboard (`reelforge studio`) and the editor with its Cues and Review modes. Vite clients live in `client/`.                                                                                                                                               |
| `packages/cli`      | The `reelforge` command and the MCP server (`src/mcp.ts`).                                                                                                                                                                                                                     |

Design decisions are recorded in [docs/adr](docs/adr). Read them before changing a boundary.

Rules that keep the project trustworthy:

- `render(t)` stays pure and deterministic. The same inputs must give byte-identical frames.
- Local servers bind to `127.0.0.1`, check Host and Origin, and accept JSON-only writes. See
  [SECURITY.md](SECURITY.md).
- The editor changes `episode.yaml` through structured operations that keep comments
  (`packages/studio/src/server/edit.ts`).
- Never weaken a test to make it pass.

## Common contributions

### Add a component

1. Add its prop schema and defaults in `packages/core/src/components/`.
2. Add its runtime in `packages/runtime/src/components/`.
3. Add it to the gallery in `fixtures/golden/components/episode.yaml`.
4. Regenerate `docs/components.md` with `node scripts/gen-components-doc.mjs`.
5. Refresh the golden frames (see below) and review the new images.

### Add a theme

Copy `themes/default.theme.yaml` to `themes/<name>.theme.yaml` and change the tokens, or generate one
with `pnpm reelforge theme new <name> --accent "#hex"`. Check it with an example episode
(`meta.theme: <name>`) and `reelforge snap`. Themes contain no code.

### Add an industry pack

Industry packs live in `packs/<industry>/`. Each pack has a manifest that is validated by a Zod schema
when it is loaded, plus the templates, themes and example scripts it provides. This format is new: read
the pack schema in `packages/core` and an existing pack before you start, and open an
[industry pack request](https://github.com/TerminalDZ/vidcreat/issues/new?template=industry_pack_request.yml)
first so the scope can be agreed.

### Add a skill

Skills live in `skills/<name>/SKILL.md` and follow the Agent Skills format: YAML front matter with a
`name` and a one-sentence `description` of when to use the skill, followed by concise Markdown
instructions. Keep each skill focused on one task, refer to commands and files that exist, and test it by
following the instructions yourself on a fresh episode.

### Golden frames

Browser tests compare rendered frames with the images in `fixtures/golden/`. After an intended visual
change, refresh them and review every changed image before you commit:

```bash
UPDATE_GOLDEN=1 pnpm test:browser
```

On Windows PowerShell: `$env:UPDATE_GOLDEN=1; pnpm test:browser; Remove-Item Env:UPDATE_GOLDEN`.
Failing comparisons write `*.diff.png` files next to the goldens (ignored by Git).

## Quality gate

Every pull request must pass:

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:browser
```

`pnpm lint` runs ESLint, Prettier and the mojibake check. Run `pnpm format` to fix formatting. If you
add or update a production dependency, also run `pnpm check:licenses` and regenerate
`THIRD-PARTY-NOTICES.md` with `node scripts/gen-notices.mjs`. CI runs the same checks on Linux, Windows
and macOS.

## Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(runtime): add a gauge component
fix(core): keep the Arabic definite article with English terms
docs(manual): explain denoise for phone recordings
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`. Use the package
name as the scope. Mark breaking changes with `!` and a `BREAKING CHANGE:` footer.

Before you open a pull request:

- keep it focused on one change, and explain why it is needed;
- add or update tests and documentation;
- add an entry under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) for user-visible changes;
- for a significant design change, add an ADR in `docs/adr/`.

The maintainer reviews every pull request. See [GOVERNANCE.md](GOVERNANCE.md) for how decisions are made.
