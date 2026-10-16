# Recording and cues

## Recording tips

- Record in a quiet room, 20–30 cm from the microphone. Any sample rate works; ReelForge masters the
  loudness for you (−14 LUFS).
- Read one script line per breath and leave a short pause (0.3–0.5 s) between lines. Pauses make marking
  faster and give animations room.
- Re-recording later? Upload the new take: ReelForge warns that the voice changed so you can re-check the
  cues.

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
