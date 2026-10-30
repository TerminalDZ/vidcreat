# Quick start: your first video in 10 minutes

This walk-through makes a 30-second episode from an industry template, previews it without a recording,
then adds your voice and renders. You need ReelForge [installed](installation.md) and `reelforge doctor`
passing. Commands use `reelforge`; on Windows type `reelforge.cmd`, on macOS and Linux `./reelforge`.

## 1. Create an episode from a template (1 minute)

```bash
reelforge new clinic-intro --pack healthcare --template patient-journey --lang en
```

This writes `episodes/clinic-intro/episode.yaml` with a script, scenes and estimated (draft) cues, so the
episode previews immediately. Use `--lang ar` for an Arabic voice-over. The [pack catalog](../reference/packs.md)
lists every pack and template, and the dashboard offers the same choice under **+ New episode** →
**Start from template**.

Prefer a blank start? `reelforge new ep10 --series "SYSTEM DESIGN"` creates a commented template, or click
**+ New episode** in the dashboard (`start.bat` / `./start.sh`).

## 2. Open the editor and make it yours (4 minutes)

```bash
reelforge edit clinic-intro
```

- In the **Script** tab on the left, edit the lines. Keep **one spoken sentence per line**, about
  2.3 words per second. Line 1 is your hook.
- Click an element on the canvas and change its text in the inspector, or double-click to edit in place.
  Words between `**` get the accent color: `**Duplicate** Charge`.
- To make an element appear on a word, put the playhead on that word and click the **target** button next
  to **Enter at**. The editor writes a time such as `l3:'desk'`, which stays on the word after you re-record.
- **Insert** adds a component (or drag one onto the canvas). Drag clips on the timeline to retime them;
  they snap to your words.

Everything is saved to `episode.yaml` as you go, with comments kept.

## 3. Check it (1 minute)

Switch to **Review** (**Alt+3**). Each issue, such as text that overflows or an element under the platform
buttons, comes with a fix hint; click it to jump to the element. From the command line:

```bash
reelforge validate clinic-intro
reelforge snap clinic-intro l1+1 l3+1        # PNG frames in episodes/clinic-intro/out/snaps
```

## 4. Record and align (3 minutes)

Record yourself reading the script with any app (phone, Audacity, OBS…), leaving a short pause between
sentences. In the dashboard click **Upload voice** (WAV, MP3, M4A, OGG, OPUS or FLAC are converted to
`voice.wav`), or save the file as `episodes/clinic-intro/voice.wav`. Then mark the cues:

```bash
reelforge align clinic-intro
```

Open **Cues** mode (**Alt+2**), listen through once and fix any line by ear (press **Space** at the start of
a line). [Timing, cues and alignment](timing.md) explains the details.

## 5. Render (1 minute to start)

```bash
reelforge render clinic-intro
```

Or click **Render** (**⌘/Ctrl+Enter**) in the editor. When it finishes, upload
`episodes/clinic-intro/out/clinic-intro.share.mp4` with the caption and hashtags from `out/publish.md`.
No recording yet? `reelforge render clinic-intro --silent` renders a preview with the draft timing.

> Prefer working with an AI assistant? See [AI integration](ai.md). An assistant can write the script,
> build the scenes and check the frames for you through the MCP server.
