---
name: reelforge-timing
description: >-
  Use when timing a ReelForge episode to its voice: cues and cues.json, word anchors and time expressions, draft cues before recording, reelforge align / align_cues after recording, low-confidence (amber) lines, hand-marked cues and word mode.
---

# Time an episode to the voice

Everything in an episode is timed relative to **cues**: the moment each script line starts in
`voice.wav`. Elements anchor to lines and words, so when the voice changes only the cues move.

## The timing workflow

1. **Before recording**: `draft_cues` (CLI `reelforge cue <id> --draft`) writes estimated cues from
   the text length. The episode previews and validates realistically. V-3 reports
   "draft cues" as info until real cues exist.
2. **After recording**: `align_cues` (CLI `reelforge align <id>`) finds every line and every word in
   `voice.wav` and writes `cues.json` with `auto: true`.
3. **Check by ear**: lines with confidence < 0.5 are listed in the result (`confidence`, and the
   `next` step names them). In the editor's Cues mode they show in **amber**. The person listens
   to those lines and fixes them; you do not guess.
4. **Re-validate**: `validate_episode`. V-14 now measures the real pace (≤ 3.5 words/s) and hook
   start (≤ 3 s), and reports silences ≥ 1.5 s as info.

Engines: `auto` (Whisper when installed, else pause detection), `dsp` (pauses only, instant),
`whisper` (after `reelforge align --setup`, ~180 MB once, offline afterwards). Lines land within
~100 ms; words about 80% of the time within 100 ms.

## Anchor to words, not seconds

| Expression           | Means                           |
| -------------------- | ------------------------------- |
| `l7`                 | start of line l7                |
| `l7.end`             | start of the next line − 0.15 s |
| `l7:'timeout'`       | first word matching "timeout"   |
| `l7:'request'#2`     | second match in the line        |
| `l7.3`               | 4th word (0-based)              |
| `@hook`, `@hook.end` | a scene's start / end           |
| `…+0.4`, `…-0.2`     | offset in seconds               |
| `12.5s`              | absolute seconds (avoid)        |

Quote expressions containing `:` or `'` in YAML: `at: "l3:'bucket'"`. Use double quotes inside
the expression when the word has an apostrophe: `at: 'l7:"Conway''s"'`. Full rules:
[time-expressions](references/time-expressions.md).

## Good and bad

Good: survives a re-recording.

```yaml
elements:
  - use: stamp
    id: twice
    props: { text: '×2' }
    enter: { at: "l5:'twice'", anim: stamp }
    exit: { at: l6, anim: fade }
```

Bad: breaks as soon as the person speaks faster or slower.

```yaml
elements:
  - use: stamp
    id: twice
    props: { text: '×2' }
    enter: { at: 17.35s, anim: stamp }
    exit: { at: 19s }
```

## Protect hand-marked cues

- `align_cues` refuses to replace cues the person marked by hand unless `force: true`. Do not pass
  `force` without asking.
- Do not edit `cues.json` by hand. Use `set_cues` for known times (`{"l3": 7.42}`), `draft_cues`
  for estimates, `align_cues` for the recording.
- When the voice file changes, V-4 warns: re-run `align_cues` (or ask the person to re-mark).

## Precise hits: word mode

For a stamp or flash that must land exactly on a word, the automatic word time may be up to
~100 ms off. Ask the person to open the editor (`open_editor`), Cues mode, select the line, press
**W** and tap **Space** on each word. Then validate and preview at `"l5:'twice'"`.

## Checklist

- [ ] Draft cues exist before preview; real cues (aligned or marked) before the final render.
- [ ] Every `enter`/`exit`/`fx`/`states` time is a line or word expression, not absolute seconds.
- [ ] Every line with confidence < 0.5 was checked by ear (amber lines in Cues mode).
- [ ] Hand-marked cues were not overwritten (`force` only with permission).
- [ ] No V-2 (unresolvable time), V-3 (missing or out-of-order cues) or V-4 (voice changed).
- [ ] V-14: no line above 3.5 words/s; the hook starts within 3 s.

Reference: [cues-json](references/cues-json.md) (file format, flags and recovery steps).
