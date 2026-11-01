# Changelog

All notable changes to ReelForge are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-11-01

First public release, under the Apache License 2.0 (documentation and examples under CC BY 4.0).

### Added

- **Visual editor** (`reelforge edit`): canvas with zoom/pan, hover and selection, drag and resize with
  smart guides, nudging and in-place text editing; layers panel with drag-to-reorder and rename; component
  library with drag-and-drop; schema-driven inspector for every property (scrubbable numbers, theme color
  swatches, word-anchored times, lists, effects, states, YAML view); multi-track timeline (scenes, script
  cues, layer tracks, waveform, SFX) with magnetic snapping to spoken words; undo/redo across
  `episode.yaml` and `cues.json`; ⌘K command palette, context menus, a shortcut sheet, resizable panels
  and a first-run tour. Edits keep the comments and formatting of `episode.yaml`.
- **Project dashboard** (`reelforge studio`): create English or Arabic episodes, upload recordings (WAV,
  MP3, M4A, OGG, FLAC…), open the editor, validate and render with live progress, play and download.
- **Cues mode**: mark sentence starts with Space at 0.5×–1× speed, nudge by 50/10 ms, re-mark any line,
  word mode, snap to onset, undo, autosave; or drag cues on the timeline.
- **Automatic cues** (`reelforge align`, **Auto-mark from voice** in Cues mode, **Auto cues** on the
  dashboard, MCP `align_cues`): every line and word aligned to the recording. Works without any model
  (pause detection and dynamic programming over the known script, about 0.05 s per minute of voice).
  Optional speech models (`reelforge align --setup` downloads them once into the user cache, about
  180 MB; alignment runs offline afterwards): Whisper word timings matched to the script by fuzzy DTW,
  and Silero VAD for speech versus music and noise. Measured on recorded speech with known timings: every
  line within 100 ms (mean 15 ms), also under background music. Hand-marked cues are never replaced
  without confirmation; in the editor the change is one undo step.
- **Smart insert**: suggestions per line in the editor's Insert panel and MCP `suggest_scene`. A keyword
  dictionary (English and Arabic) picks the component, fills its props from the line and makes it enter
  on the word that names it. Optional local LLM (through Ollama, `qwen2.5:1.5b` by default) with output
  constrained to the component schemas.
- **Review mode**: true 1080×1920 preview synced to the audio, hot reload on save, platform safe-zone,
  stage and element-box overlays, every check with click-to-select, and an error banner that keeps the
  last good frame.
- **Agent integration (optional)**: `reelforge mcp`, a Model Context Protocol server (create, read, edit,
  validate, preview frames as images, align, render) plus instruction files (`AGENTS.md`, `CLAUDE.md`,
  `GEMINI.md`, …) and ready-made MCP configurations.
- **Examples**: the 9-episode "System Design" series in English, the same series in Arabic, and a
  45-second product intro.
- **21 animated components**: title, label, code, node, arrow, chip, stamp, table, lanes, checklist,
  counter, meter, timeline, grid, bucket, phone, quote, particles, trap, cta, icon.
- **Motion**: 17 enter and 9 exit animations (including `reveal`, `spring`, `drop`, `blur` and `wipe`),
  per-element easing (`smooth`, `snappy`, `gentle`, `linear`), six scene transitions (crossfade, cut,
  slide-up, zoom, push, blur) and slow camera moves (drift, push-in, pull-out). Everything renders with
  sub-pixel precision, so slow moves stay smooth; frame-by-frame motion tests guard against jumps and
  stutter. The inspector previews any animation with one click.
- **Captions in English and Arabic**: word-by-word karaoke highlight, correct RTL/LTR mixing, `الـ term`
  kept together, punctuation on the correct side.
- **Audio**: procedural sound effects, and voice mastering to −14 LUFS with ducking and a limiter.
- **Voice noise cleanup**: `audio.denoise: true`, `render --denoise` or a checkbox in the render dialogs.
  RNNoise (bundled 290 KB model, FFmpeg `arnndn`) runs before loudness mastering; about 15 dB less noise
  between sentences in tests, with the voice level unchanged.
- **Rendering**: deterministic parallel frame capture; an H.264 master (CRF 18) and a size-capped share
  file, plus SRT captions, a contact sheet and `publish.md`. Every output is verified (codec, profile,
  pixel format, frame rate, AAC 48 kHz, faststart, size).
- **Validation**: 14 rules with `file:line:col` locations and fix hints, including V-14 pacing (lines
  spoken faster than 3.5 words/s, a hook that starts after 3 s, silences of 1.5 s or more).
- **Themes and presets** in editable YAML; `reelforge theme new --accent #hex`.
- **CLI**: `studio`, `new` (`--lang`), `edit`, `cue`, `dev`, `align`, `mcp`, `validate`, `render`
  (`--all`), `snap` (`--cover`), `doctor`, `schema`, `theme new`.
- One-command installers for Windows, macOS and Linux.

### Fixed

- Renders failed the output check with `pixel format yuvj420p` on FFmpeg 7+: frames are now converted to
  limited-range BT.709 yuv420p.
- The dashboard and editor are responsive (side panels become drawers on tablets and phones).

[Unreleased]: https://github.com/TerminalDZ/vidcreat/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/TerminalDZ/vidcreat/releases/tag/v1.0.0
