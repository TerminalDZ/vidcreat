# Changelog

All notable changes to ReelForge are documented here. The project follows
[Semantic Versioning](https://semver.org/).

## 1.0.0 — 2026-10-16

First public release.

### Highlights

- **Project dashboard** (`reelforge studio`): create episodes, upload recordings (WAV, MP3, M4A, OGG,
  FLAC…), mark cues, preview, validate and render with live progress, play and download the results.
- **Cue marker**: mark sentence starts with Space at 0.5×–1× speed, nudge by 50/10 ms, re-mark any line,
  word mode, snap to onset, undo, autosave.
- **Live preview**: true 1080×1920 preview synced to the audio, hot reload on save, platform safe-zone,
  stage and element-box overlays, lint panel with click-to-seek, error overlay that keeps the last good frame.
- **21 animated components**: title, label, code, node, arrow, chip, stamp, table, lanes, checklist,
  counter, meter, timeline, grid, bucket, phone, quote, particles, trap, cta, icon.
- **Arabic-first captions**: word-by-word karaoke highlight, correct RTL/LTR mixing, `الـ term` kept
  together, punctuation on the correct side.
- **Procedural sound effects** and voice mastering to −14 LUFS with ducking and a limiter.
- **Rendering**: deterministic parallel frame capture; H.264 master (CRF 18) and a size-capped share
  file for TikTok, Reels and Shorts, plus SRT captions, a contact sheet and `publish.md`; every output is
  verified (codec, profile, pixel format, frame rate, AAC 48 kHz, faststart, size).
- **Validation**: 13 rules with `file:line:col` locations and fix hints.
- **Themes and presets** in editable YAML; `reelforge theme new --accent #hex`.
- **CLI**: `studio`, `new`, `cue`, `dev`, `validate`, `render` (`--all`), `snap` (`--cover`), `doctor`,
  `schema`, `theme new`.
- **Nine example episodes** (Season 1 of "System Design بالعربي").
- One-command installers for Windows, macOS and Linux.
