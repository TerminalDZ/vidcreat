# ReelForge

**Voice recording + one YAML file → a finished vertical explainer video** (1080×1920, 30 fps) for TikTok,
Instagram Reels and YouTube Shorts. Animated diagrams, code that types itself, race-condition lanes,
stamps, word-by-word English and Arabic captions (Arabic keeps mixed-in English terms in order), procedural
sound effects and platform-ready encoding, all designed in a visual editor.

- **A real editor.** Canvas with smart guides, layers, a schema-driven inspector for every property,
  a multi-track timeline that snaps to your words, undo/redo, ⌘K command palette and shortcuts.
- **Offline, no running costs.** No network after install, no subscription, no per-video fees.
- **No generated media.** No speech recognition, no TTS, no generative models in the engine. Timing comes from cues you mark.
- **AI-ready (optional).** `reelforge mcp` lets Claude, Cursor, Copilot, Codex and Gemini build and check episodes; see [AGENTS.md](AGENTS.md).
- **Deterministic.** The same inputs always give the same frames (`render(t)` is a pure function).
- **English and Arabic.** LTR and RTL word-by-word captions; Arabic with English terms keeps `الـ client` together.

| Command                                    | What it does                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `reelforge studio`                         | the project dashboard: create, upload voice, open the editor, validate, render, play outputs                    |
| `reelforge new <id> [--lang en\|ar]`       | create `episodes/<id>/episode.yaml` from a commented template                                                   |
| `reelforge edit <id>`                      | the visual editor: canvas, layers, inspector, timeline (writes `episode.yaml`, keeps comments)                  |
| `reelforge cue <id>`                       | the editor in Cues mode: mark the start of each script line while listening (writes `cues.json`)                |
| `reelforge dev <id>`                       | the editor in Review mode: checks, safe zones, element outlines                                                 |
| `reelforge mcp`                            | Model Context Protocol server for AI agents                                                                     |
| `reelforge validate <id>`                  | schema, cues, timing, overlap, safe zones, text overflow (V-1…V-14)                                             |
| `reelforge render <id>`                    | `out/<id>.master.mp4`, `out/<id>.share.mp4`, `.srt`, `.sheet.jpg`, `publish.md` (`--all` renders every episode) |
| `reelforge snap <id> <t…>`                 | PNG frames at times (or `l7`, `l7:'word'`) plus a contact sheet; `--cover` writes `out/<id>.cover.png`          |
| `reelforge theme new <name> --accent #hex` | generate a series theme from one accent color                                                                   |
| `reelforge doctor [--fix]`                 | check Node, ffmpeg, Chromium and fonts                                                                          |
| `reelforge schema`                         | write the JSON Schema for editor autocompletion                                                                 |

## Screenshots

![The ReelForge editor](docs/screenshots/01-editor-overview.jpg)

More in [docs/screenshots](docs/screenshots/README.md): smart guides, timeline, command palette, Cues and
Review modes, every Season 1 episode, the component gallery and the CLI.

## Install

Requirements: **Node.js 22 LTS** and **ffmpeg 6+** (the installers offer to install ffmpeg for you).
Full instructions with screenshots: `documentation/index.html`.

| System        | Install                    | Open the dashboard               |
| ------------- | -------------------------- | -------------------------------- |
| Windows 10/11 | double-click `install.bat` | double-click `start.bat`         |
| macOS         | `./install.sh` in Terminal | double-click `ReelForge.command` |
| Linux         | `./install.sh`             | `./start.sh`                     |

The installer checks Node.js, installs ffmpeg (with your confirmation), installs the dependencies,
downloads the pinned Chromium used for rendering and runs `reelforge doctor`. The command line is
`reelforge.cmd` (Windows) or `./reelforge` (macOS/Linux).

**From source (developers):** `corepack enable && pnpm install && pnpm build && pnpm reelforge doctor --fix`.

## Tutorial: a 30-second episode

```bash
./reelforge new ep10 --series "SYSTEM DESIGN"     # --lang ar for an Arabic voice-over
./reelforge edit ep10
```

1. **Write the script** in the editor's **Script** tab: one spoken sentence per line.
2. **Design scenes.** **Insert** a component (or drag it onto the canvas), move and resize it, edit its
   properties in the inspector, and make it enter on the word that names it (target button, or drag its
   clip on the timeline: clips snap to words). Everything is saved to `episode.yaml`.
3. **Record** `episodes/ep10/voice.wav` with any recorder (the dashboard's **Upload voice** converts
   MP3/M4A/OGG/FLAC). Until then, estimated cues give realistic timing.
4. **Mark cues** in **Cues** mode (**Alt+2**): press **Space** at the start of each line
   (1 / 2 / 3 switch to 0.5× / 0.75× / 1×). **Backspace** undoes, **←/→** nudge, **W** marks words.
5. **Review** (**Alt+3**): every issue has a fix hint; **Z** shows the platform safe zones.
6. **Render** (**⌘/Ctrl+Enter**), then upload `out/ep10.share.mp4` with the caption from `out/publish.md`.

Prefer text? `episode.yaml` is plain YAML with a JSON Schema for autocompletion; edits in your text editor
and in the visual editor stay in sync. Try the bundled examples: `./reelforge edit examples/season1/ep01`
(English) or `examples/season1-arabic/ep01` (Arabic); render them with `--silent` before recording.

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
  studio/    localhost servers: dashboard and the editor (canvas, inspector, timeline, cues, review)
  cli/       the `reelforge` command and the MCP server
themes/      default, season1, workshop
presets/     tiktok, reels, shorts (editable)
examples/season1/          English example series (ep01…ep09)
examples/season1-arabic/   the same series in Arabic
examples/promo/intro/      a 45-second product intro, made with ReelForge (silent)
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
pnpm check:licenses    # dependency license allow-list check
UPDATE_GOLDEN=1 pnpm test:browser   # refresh golden frames after an intended visual change
node scripts/gen-components-doc.mjs # regenerate docs/components.md from the schemas
```

Adding a component: add its prop schema and defaults in `packages/core/src/components/`, its DOM
implementation in `packages/runtime/src/components/`, an entry in the gallery fixture
(`fixtures/golden/components/episode.yaml`), then refresh the golden frames.

## License

Commercial software sold on Envato Market (CodeCanyon) under the Regular / Extended License — see
[LICENSE.md](LICENSE.md). The videos you make are yours. Open-source components (bundled fonts under the
SIL OFL 1.1, npm packages under MIT / ISC / Apache-2.0) keep their own licenses — see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). FFmpeg and Chromium are installed separately.
