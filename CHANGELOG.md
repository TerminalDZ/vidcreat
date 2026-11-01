# Changelog

All notable changes to ReelForge are documented here. The project follows
[Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- **Automatic cues** (`reelforge align`, **Auto-mark from voice** in Cues mode, **Auto cues** on the
  dashboard, MCP `align_cues`): every line and word aligned to the recording. Works without any model
  (pause detection + dynamic programming over the known script, ~0.05 s per minute of voice). Optional
  speech models (`reelforge align --setup`, installed on demand into the user cache, ~180 MB): Whisper
  word timings matched to the script by fuzzy DTW, and Silero VAD for speech vs music/noise. Measured on
  recorded speech with known timings: every line within 100 ms (mean 15 ms), also under background music.
  Hand-marked cues are never replaced without confirmation; the editor makes it one undo step.
- **Voice noise cleanup**: `audio.denoise: true` / `render --denoise` / a checkbox in the render dialogs.
  RNNoise (bundled 290 KB model, ffmpeg `arnndn`) before loudness mastering; ~15 dB less noise between
  sentences in tests, voice level unchanged.
- **V-14 pacing check**: lines spoken faster than 3.5 words/s (too fast to read in captions), a hook
  that starts after 3 s, and silences of 1.5 s or more in the recording.
- **Smart insert**: suggestions per line in the editor's Insert panel and MCP `suggest_scene` — a keyword
  dictionary (English and Arabic) that picks the component, fills its props from the line and makes it
  enter on the word that names it. Optional local LLM (Ollama, `qwen2.5:1.5b`) with output constrained to
  the component schemas.

### Fixed

- Renders failed the output check with `pixel format yuvj420p` on ffmpeg 7+: frames are now converted to
  limited-range BT.709 yuv420p.
- The dashboard and editor are responsive (side panels become drawers on tablets and phones).

## 1.0.0 — 2026-10-16

First public release.

### Highlights

- **Visual editor** (`reelforge edit`): canvas with zoom/pan, hover and selection, drag and resize with
  smart guides, nudging and in-place text editing; layers panel with drag-to-reorder and rename; component
  library with drag-and-drop; schema-driven inspector for every property (scrubbable numbers, theme color
  swatches, word-anchored times, lists, effects, states, YAML view); Premiere-style multi-track timeline
  (scenes, script cues, layer tracks, waveform, SFX) with magnetic snapping to spoken words; undo/redo
  across `episode.yaml` and `cues.json`; ⌘K command palette, context menus, a shortcut sheet, resizable
  panels and a first-run tour. Edits keep the comments and formatting of `episode.yaml`.
- **Project dashboard** (`reelforge studio`): create English or Arabic episodes, upload recordings (WAV,
  MP3, M4A, OGG, FLAC…), open the editor, validate and render with live progress, play and download.
- **Cues mode**: mark sentence starts with Space at 0.5×–1× speed, nudge by 50/10 ms, re-mark any line,
  word mode, snap to onset, undo, autosave; or drag cues on the timeline.
- **Review mode**: true 1080×1920 preview synced to the audio, hot reload on save, platform safe-zone,
  stage and element-box overlays, every check with click-to-select, error banner that keeps the last good frame.
- **AI agents (optional)**: `reelforge mcp`, a Model Context Protocol server (create, read, edit, validate,
  preview frames as images, render) plus instruction files for Claude Code, Codex, Cursor, Copilot,
  Gemini CLI and Windsurf (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, …) and ready-made MCP configs.
- **Examples**: the 9-episode “System Design” series in English, and the same series in Arabic.
- **21 animated components**: title, label, code, node, arrow, chip, stamp, table, lanes, checklist,
  counter, meter, timeline, grid, bucket, phone, quote, particles, trap, cta, icon.
- **Motion**: 17 enter and 9 exit animations (including `reveal`, `spring`, `drop`, `blur` and
  `wipe`), per-element easing (`smooth`, `snappy`, `gentle`, `linear`), six scene transitions
  (crossfade, cut, slide-up, zoom, push, blur) and slow camera moves (drift, push-in, pull-out).
  Everything renders with sub-pixel precision, so slow moves stay smooth; frame-by-frame motion
  tests guard against jumps and stutter. The inspector previews any animation with one click.
- **Captions in English and Arabic**: word-by-word karaoke highlight, correct RTL/LTR mixing, `الـ term`
  kept together, punctuation on the correct side.
- **Procedural sound effects** and voice mastering to −14 LUFS with ducking and a limiter.
- **Rendering**: deterministic parallel frame capture; H.264 master (CRF 18) and a size-capped share
  file for TikTok, Reels and Shorts, plus SRT captions, a contact sheet and `publish.md`; every output is
  verified (codec, profile, pixel format, frame rate, AAC 48 kHz, faststart, size).
- **Validation**: 13 rules with `file:line:col` locations and fix hints.
- **Themes and presets** in editable YAML; `reelforge theme new --accent #hex`.
- **CLI**: `studio`, `new` (`--lang`), `edit`, `cue`, `dev`, `mcp`, `validate`, `render` (`--all`),
  `snap` (`--cover`), `doctor`, `schema`, `theme new`.
- One-command installers for Windows, macOS and Linux.
