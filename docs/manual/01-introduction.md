# Introduction

**ReelForge** turns a voice recording and one YAML file into a finished vertical explainer video —
1080×1920 at 30 fps, ready for **TikTok**, **Instagram Reels** and **YouTube Shorts**.

![The ReelForge editor](assets/01-editor-overview.jpg)

You write what you say, sentence by sentence, and describe what appears on screen and **on which word**.
ReelForge animates diagrams, code, tables and titles exactly when you say them, adds word-by-word
captions, sound effects and series branding, masters the audio and encodes platform-ready files.

## Highlights

- **A real editor, made simple.** Place components on the frame like in a design tool, retime them on a
  timeline like in a video editor, edit every property in the inspector, with undo, smart guides,
  a command palette and keyboard shortcuts for everything.
- **Timed to your words.** Elements appear on the word that names them. Re-record a sentence and everything
  after it stays in sync, because animations follow your words, not seconds.
- **English and Arabic.** Word-by-word captions in English, and in Arabic with correct right-to-left layout
  when English terms are mixed in: `الـ client` stays together and `؟` lands on the correct side.
- **Works with AI assistants (optional).** A built-in MCP server lets Claude, Cursor, Copilot, Codex,
  Gemini and others write scripts, build scenes and check frames for you.
- **21 animated components** for technical explainers: nodes and arrows with moving packets, code that types
  itself, race-condition lanes, tables, timelines, meters, counters, token buckets, a phone mock, stamps…
- **Professional sound**: procedural sound effects on every hit and transition, voice mastered to −14 LUFS
  (the platforms' loudness target), effects ducked under the voice.
- **Platform-ready output**: an archival master MP4, a share MP4 that fits the upload limit you choose,
  SRT captions, a contact sheet and a `publish.md` with your caption, hashtags and pinned comment.
- **Offline and private.** Everything runs on your computer. No account, no subscription, no upload.
- **No generated media.** The video engine never generates voices or visuals: your voice, your words, your design, consistent every time. (AI assistants are optional.)
- **Deterministic.** The same inputs always produce the same frames.

## What is in the package

| Folder / file                                | Contents                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `install.bat`, `install.sh`                  | One-command installers for Windows, macOS and Linux                    |
| `start.bat`, `start.sh`, `ReelForge.command` | Open the dashboard                                                     |
| `reelforge.cmd`, `reelforge`                 | The command-line interface                                             |
| `examples/season1/`                          | Nine complete example episodes in English (“System Design”)            |
| `examples/season1-arabic/`                   | The same series in Arabic with English technical terms                 |
| `examples/promo/intro/`                      | A 45-second ReelForge intro video, a showcase of animations            |
| `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, …     | Instructions for AI assistants (see [AI agents & MCP](#ai-agents-mcp)) |
| `themes/`, `presets/`                        | Editable visual themes and platform layouts                            |
| `documentation/`                             | This documentation (offline)                                           |
| `packages/`                                  | Full TypeScript source code                                            |
| `LICENSE.md`, `THIRD-PARTY-NOTICES.md`       | License terms and open-source credits                                  |

## Requirements

|                  | Minimum                                                  | Recommended                                             |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| Operating system | Windows 10, macOS 13, Ubuntu 22.04 (or any recent Linux) | Windows 11, macOS 14+, Ubuntu 24.04                     |
| CPU / RAM        | 4 cores, 8 GB                                            | 8 threads or more, 16 GB (renders scale with cores)     |
| Disk             | 2 GB free (plus ~2 GB temporary space per render)        | SSD                                                     |
| Software         | **Node.js 22 LTS**, **ffmpeg 6+**                        | installed automatically by the installer where possible |

A 2-minute episode renders in roughly 5–10 minutes on an 8-thread laptop.
