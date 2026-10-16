# Troubleshooting and FAQ

**The dashboard says “setup issues”.** Click the pill: each failed check shows its fix. Most often ffmpeg is
missing (Windows: `winget install Gyan.FFmpeg`, macOS: `brew install ffmpeg`, Linux: your package
manager) — then restart `start.bat` / `start.sh`.

**“Cannot launch Chromium”.** Run `reelforge doctor --fix`. On Linux, also run the installer again and
accept the system libraries prompt.

**“ffmpeg not found” although I installed it (Windows).** Close every terminal and `start.bat`, then
reopen: Windows only picks up the new PATH in new windows.

**A word reference fails: `Word "x" not found in line l7`.** The error shows the closest word in that
line. Words are matched without punctuation and diacritics. For a word containing an apostrophe use double
quotes: `l7:"Conway's"`. You can also use the word index: `l7.3` (4th word).

**The caption wraps over three lines (V-10).** Add `break: ["word"]` to the script line to split the
caption before that word, or lower `captions.max_chars` in the theme.

**Text overflows its box (V-9).** Shorten the text, lower `fontSize`, or enlarge `place.w/h`. Titles,
quotes and stamps shrink automatically to fit.

**An element sits under the TikTok buttons (V-7).** Press **Z** in the preview: keep content out of the
red zones.

**Can I use my own fonts?** v1.0 ships Cairo (Arabic), Space Grotesk and JetBrains Mono so renders never
depend on system fonts. Custom fonts are on the roadmap.

**Does ReelForge need the internet?** Only during installation (dependencies, Chromium, ffmpeg). Creating,
previewing and rendering are fully offline.

**Can I render on a server / in CI?** Yes: everything is available from the command line (`--json` gives
machine-readable output) and works headless on Linux.

**Can I sell the videos I make?** Yes — the videos are yours, including for clients and monetized channels.
See [License](#license-and-credits).

**Where are my files?** Each episode is a folder in `episodes/` containing `episode.yaml`, `voice.wav`,
`cues.json`, `assets/` and `out/`. Back it up like any other folder (Git works great).
