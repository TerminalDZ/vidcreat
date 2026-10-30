# FAQ and troubleshooting

## Setup

**The dashboard says “setup issues”.** Click the pill: each failed check shows its fix. Most often ffmpeg is
missing (Windows: `winget install Gyan.FFmpeg`, macOS: `brew install ffmpeg`, Linux: your package
manager). Then restart `start.bat` / `start.sh`.

**“Cannot launch Chromium”.** Run `reelforge doctor --fix`. On Linux, also run the installer again and
accept the system libraries prompt.

**“ffmpeg not found” although I installed it (Windows).** Close every terminal and `start.bat`, then
reopen: Windows only picks up the new PATH in new windows.

More setup fixes are in [Installation](installation.md#troubleshooting).

## Episodes

**A word reference fails: `Word "x" not found in line l7`.** The error shows the closest word in that
line. Words are matched without punctuation and diacritics. For a word containing an apostrophe use double
quotes: `l7:"Conway's"`. You can also use the word index: `l7.3` (4th word).

**The caption wraps over three lines (V-10).** Add `break: ["word"]` to the script line to split the
caption before that word, or lower `captions.max_chars` in the theme.

**Text overflows its box (V-9).** Shorten the text, lower `fontSize`, or enlarge `place.w/h`. Titles,
quotes and stamps shrink automatically to fit.

**An element sits under the TikTok buttons (V-7).** Press **Z** in the editor to show the safe zones, and keep
content out of the red areas. In the lower part of the stage keep `x + w ≤ 920`.

**Two elements overlap (V-8).** Give the first one an `exit` before the second enters, move one of them, or
put badges and stamps on `layer: overlay`.

**A line is “spoken too fast” (V-14).** It has more than about 3.5 words per second. Split it into two lines
or shorten it.

## Fonts, languages and formats

**Can I use my own fonts?** Themes can use any bundled family (Space Grotesk, Inter, Manrope, Playfair
Display, JetBrains Mono, Cairo, Noto Kufi Arabic, Noto Naskh Arabic, Readex Pro). Fonts are bundled so
renders never depend on the machine; other fonts are not supported yet.

**Which languages are supported?** English and Arabic captions, including Arabic sentences with English
terms.

**Can I make square or landscape videos?** Not in 1.0: ReelForge renders 9:16 vertical video only
(ADR-016). Square, portrait and landscape are on the roadmap.

## Offline use, servers and AI

**Does ReelForge need the internet?** Only during installation (dependencies, Chromium, ffmpeg) and for
the one-time download of the optional speech models. Creating, editing and rendering are fully offline.
If you use an AI assistant, the assistant itself needs its own connection and account; ReelForge's MCP
server stays local.

**Can I render on a server or in CI?** Yes: everything is available from the command line (`--json` gives
machine-readable output) and works headless on Linux.

**Does ReelForge send my files anywhere?** No. The servers bind to `127.0.0.1` by default and the render
engine blocks network access. An AI client only sees what it reads through the tools.

## Rights and files

**Can I sell the videos I make?** Yes. The videos are yours, including for clients and monetized channels.
See [License](license.md).

**Where are my files?** Each episode is a folder in `episodes/` containing `episode.yaml`, `voice.wav`,
`cues.json`, `assets/` and `out/`. Back it up like any other folder (Git works well).

## Getting help

Ask in [GitHub Discussions](https://github.com/TerminalDZ/vidcreat/discussions) or open an
[issue](https://github.com/TerminalDZ/vidcreat/issues). Include your operating system, the output of
`reelforge doctor --json` and the command you ran with `--verbose`.
