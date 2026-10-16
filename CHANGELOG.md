# Changelog

All notable changes to ReelForge are documented here. The project follows
[Semantic Versioning](https://semver.org/).

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
