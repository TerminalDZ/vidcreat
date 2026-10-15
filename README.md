# ReelForge

**Voice recording + one YAML file → a finished vertical explainer video** (1080×1920, 30 fps) for TikTok,
Instagram Reels and YouTube Shorts. Animated diagrams, code that types itself, race-condition lanes,
stamps, word-by-word Arabic captions with correctly mixed English terms, procedural sound effects and
platform-ready encoding.

- **Offline and free.** No network after install, no paid service, open-source dependencies only.
- **No AI.** No speech recognition, no TTS, no generative models. Timing comes from cues you mark.
- **Deterministic.** The same inputs always give the same frames (`render(t)` is a pure function).
- **Arabic first.** RTL captions with English terms, `الـ client` kept together, punctuation on the right side.

| Command                    | What it does                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `reelforge new <id>`       | create `episodes/<id>/episode.yaml` from a commented template                       |
| `reelforge cue <id>`       | studio: mark the start of each script line while listening (writes `cues.json`)     |
| `reelforge dev <id>`       | studio: live preview synced to the audio, safe-zone overlay, lint panel, hot reload |
| `reelforge validate <id>`  | schema, cues, timing, overlap, safe zones, text overflow (V-1…V-13)                 |
| `reelforge render <id>`    | `out/<id>.master.mp4`, `out/<id>.share.mp4`, `.srt`, `.sheet.jpg`, `publish.md`     |
| `reelforge snap <id> <t…>` | PNG frames at times (or `l7`, `l7:'word'`) plus a contact sheet                     |
| `reelforge doctor [--fix]` | check Node, ffmpeg, Chromium and fonts                                              |
| `reelforge schema`         | write the JSON Schema for editor autocompletion                                     |

## Install

Requirements: **Node.js 22+**, **pnpm 10** (`corepack enable`), **ffmpeg 6+** with libx264 and aac.

```bash
git clone <this repo> reelforge && cd reelforge
pnpm install
pnpm build
pnpm reelforge doctor --fix      # installs the pinned Chromium if needed and checks ffmpeg
```

ffmpeg: `sudo apt install ffmpeg` (Debian/Ubuntu) · `brew install ffmpeg` (macOS) ·
`winget install Gyan.FFmpeg` (Windows). To use `reelforge` without the `pnpm` prefix, run
`pnpm link --global` once.

## Tutorial: a 30-second episode

```bash
pnpm reelforge new ep10 --series "SYSTEM DESIGN"
```

1. **Write the script.** Open `episodes/ep10/episode.yaml`. Put one spoken sentence per `script` line.
2. **Record** `episodes/ep10/voice.wav` with any recorder (no recording yet? `pnpm reelforge cue ep10 --draft`
   writes estimated cues so you can preview anyway).
3. **Mark cues.** `pnpm reelforge cue ep10` opens the studio. Press **Space** at the start of each line
   (1 / 2 / 3 switch to 0.5× / 0.75× / 1×). **Backspace** undoes, **←/→** nudge the selected cue,
   click a line to re-mark it, **W** marks individual words. Every change is saved to `cues.json`.
4. **Describe scenes** with components (see [docs/components.md](docs/components.md)) and make
   elements enter on the words that name them: `enter: { at: "l3:'Idempotency'" }`.
5. **Preview** with `pnpm reelforge dev ep10`. Save the YAML and the preview reloads in place.
   **Z** shows the platform safe zones, **E** element boxes, **?** all shortcuts.
6. **Validate** with `pnpm reelforge validate ep10`. Each issue has `file:line:col` and a fix hint.
7. **Render** with `pnpm reelforge render ep10`, then upload `out/ep10.share.mp4` with the caption from
   `out/publish.md`.

Try it on the bundled examples: `pnpm reelforge dev examples/season1/ep01` (they ship with draft cues;
record a `voice.wav` and re-mark to render them, or `pnpm reelforge render examples/season1/ep01 --silent`).

## Render options

```
reelforge render <id> [--preset tiktok|reels|shorts] [--workers N] [--from 12 --to 20]
                      [--share-size 28] [--no-sfx] [--no-share] [--lossless] [--fast]
                      [--silent] [--keep-tmp] [--no-measure] [--json] [--verbose]
```

Configuration follows 12-Factor: flags, or environment variables
`REELFORGE_ROOT`, `REELFORGE_PRESET`, `REELFORGE_WORKERS`, `REELFORGE_SHARE_SIZE`, `REELFORGE_JPEG_QUALITY`,
`REELFORGE_PORT`, `REELFORGE_NO_OPEN`, `REELFORGE_FFMPEG`, `REELFORGE_FFPROBE`, `REELFORGE_CHROMIUM`.
`NO_COLOR` disables colors. `--json` prints machine-readable output (progress events while rendering).
Ctrl+C aborts cleanly and removes partial files.

Outputs (verified with ffprobe): H.264 High, yuv420p, 30/1 fps CFR, AAC 48 kHz, `moov` atom first.
The master uses CRF 18; the share file is two-pass encoded to fit `--share-size` MB.
The voice is mastered to −14 LUFS (two-pass loudnorm), SFX are ducked under it, and a limiter keeps peaks below −0.45 dBFS.

## Repository layout

```
packages/
  audio/     WAV io, envelopes, onset detection, procedural SFX
  core/      schema, time expressions, captions, themes, presets, compiler, lint
  runtime/   browser page: pure render(t), series chrome, 21 components
  renderer/  Chromium workers, ffmpeg pipeline, measuring pass, doctor
  studio/    localhost server + cue marker / preview client (Vite)
  cli/       the `reelforge` command
themes/      default, season1, workshop
presets/     tiktok, reels, shorts (editable)
examples/season1/ep01…ep09
fixtures/    mini (integration), golden frames, seeded lint bugs
docs/        PRD, SRS, authoring guide, component reference, ADRs
```

Architecture decisions are in [docs/adr](docs/adr). The compiled timeline (`Timeline` in
`packages/core/src/types.ts`) is the only contract between the compiler and the runtime.

## Development

```bash
pnpm build             # all packages
pnpm test              # unit + browser/integration suites
pnpm test:unit         # fast, no browser
pnpm coverage          # unit coverage (≥ 85% lines on core/runtime/audio)
pnpm typecheck && pnpm lint
pnpm licenses          # dependency license allow-list check
UPDATE_GOLDEN=1 pnpm test:browser   # refresh golden frames after an intended visual change
node scripts/gen-components-doc.mjs # regenerate docs/components.md from the schemas
```

Adding a component: add its prop schema and defaults in `packages/core/src/components/`, its DOM
implementation in `packages/runtime/src/components/`, an entry in the gallery fixture
(`fixtures/golden/components/episode.yaml`), then refresh the golden frames.

## License

MIT. Bundled fonts (Cairo, JetBrains Mono, Space Grotesk) are under the SIL Open Font License 1.1.
ffmpeg is used as an external system binary.
