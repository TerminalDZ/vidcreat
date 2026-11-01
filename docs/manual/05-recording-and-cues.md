# Recording and cues

## Recording tips

- Record in a quiet room, 20–30 cm from the microphone. Any sample rate works; ReelForge masters the
  loudness for you (−14 LUFS).
- Read one script line per breath and leave a short pause (0.3–0.5 s) between lines. Pauses make marking
  faster and give animations room.
- Re-recording later? Upload the new take: ReelForge warns that the voice changed so you can re-check the
  cues.
- Recorded on a phone or in a noisy room? Turn on **Clean up noise** (episode settings, or
  `audio: { denoise: true }`, or `reelforge render --denoise`). RNNoise removes hiss, hum and room noise
  from the voice before mastering; in tests it lowers the noise between sentences by about 15 dB without
  changing the voice level.

## Automatic cues

Click **Auto-mark from voice** in Cues mode, **Auto cues** on the dashboard, or run
`reelforge align <id>`. ReelForge already knows the script, so it only has to find where each line and
each word starts in the recording. Then listen through once and fix any line by ear (amber lines are the
ones it was least sure about). The result is one undo step (**⌘/Ctrl+Z**).

Two engines:

| Engine                 | Needs                                    | Speed (1 min of voice) | How it works                                                                                                                                                           |
| ---------------------- | ---------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pauses** (default)   | nothing                                  | ~0.05 s                | Finds the pauses, then splits the recording into the script's lines so each line's length matches its text (dynamic programming). Words follow the syllables.          |
| **Whisper** (optional) | `reelforge align --setup` once (~180 MB) | ~20 s on a laptop CPU  | A speech model hears the words; only its **timings** are used, matched to your script, so dialects and English terms in Arabic don't matter. Best for words and music. |

With the optional models installed, a 2 MB voice-activity model (Silero VAD) also tells speech from
music, breaths and room noise. Measured on recorded speech with known timings, every line lands within
100 ms (average 15 ms), with or without background music. Words land within 100 ms about 80% of the time,
so give precise hits (a stamp on one exact word) a listen in word mode.

`reelforge align --status` shows what is installed. Models live in your user cache
(`%LOCALAPPDATA%\reelforge`, `~/Library/Caches/reelforge` or `~/.cache/reelforge`; `$REELFORGE_CACHE`
moves it) and are never used while rendering. Cues you marked by hand are never replaced unless you
confirm (`--force` on the command line).

## Cues mode

A **cue** is the moment a script line starts. Everything in the episode is timed relative to cues, so a
re-recorded line only needs its cue moved — every animation follows.

Open the editor and switch to **Cues** (**Alt+2**), or click **Mark cues** on the dashboard. The script
is listed on the right, the playhead and waveform are on the timeline.

![Cues mode](assets/07-editor-cues.jpg)

| Key                           | Action                                                              |
| ----------------------------- | ------------------------------------------------------------------- |
| **Enter** / **K**             | Play / pause                                                        |
| **1 / 2 / 3**                 | Speed 0.5× / 0.75× / 1× (slower = more accurate)                    |
| **Space**                     | Mark the next unmarked line at the playhead                         |
| **Click a line** or **↑ / ↓** | Select a line to re-mark it (then press Space)                      |
| **← / →**                     | Nudge the selected cue by 50 ms (**Shift**: 10 ms)                  |
| **Backspace**                 | Undo the last change                                                |
| **S** / **A**                 | Snap the selected cue to the nearest voice onset / toggle auto-snap |
| **G**                         | Jump to the selected cue                                            |
| **W**                         | Word mode: mark each word of the selected line with Space           |
| **J / L**, **, / .**          | Back / forward 1 s, previous / next frame                           |

Every change is saved instantly to `cues.json` and can be undone with **⌘/Ctrl+Z**. Lines out of order
are shown in red. You can also drag a line's clip on the **Script** track of the timeline, in Edit or
Cues mode.

## Word mode

By default ReelForge estimates when each word starts from its length. For precise hits (a stamp landing
exactly on “twice”), select the line, press **W**, play, and press **Space** on each word.

![Word mode](assets/08-editor-cues-word-mode.jpg)
