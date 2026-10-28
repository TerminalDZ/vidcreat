# cues.json

`episodes/<id>/cues.json` stores line and word start times in seconds of the recording. Tools write
it atomically; do not hand-edit it.

```json
{
  "version": 1,
  "audio": { "file": "voice.wav", "duration": 41.8, "sha1": "…" },
  "cues": { "l1": 0.32, "l2": 3.1, "l3": 6.05 },
  "words": { "l1": [0.32, 0.55, 0.81, 1.2] },
  "auto": true,
  "updated": "…"
}
```

| Field         | Meaning                                                                  |
| ------------- | ------------------------------------------------------------------------ |
| `cues`        | Line id → start time                                                     |
| `words`       | Line id → start time of each word (optional; otherwise estimated)        |
| `audio.sha1`  | Fingerprint of the recording; a mismatch raises V-4 (voice changed)      |
| `draft: true` | Estimated from text (`draft_cues`); V-3 info until real cues exist       |
| `auto: true`  | Aligned automatically (`align_cues`); worth one listen before publishing |
| neither flag  | Marked by hand; `align_cues` keeps them unless `force: true`             |

## Problems and fixes

| Symptom                              | Fix                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------- |
| V-3 missing cue for a new line       | `align_cues` again, or `draft_cues` (overwrite only drafts)            |
| V-3 cues out of order                | The person re-marks the red lines in Cues mode                         |
| V-4 voice changed                    | `align_cues` (with permission `force: true` if cues were hand-marked)  |
| A line flagged with confidence < 0.5 | Person listens in Cues mode (amber), nudges with ← / →, or re-marks    |
| A stamp lands early or late          | Word mode (**W**) on that line, or add `+0.1`/`-0.1` to the expression |
| V-14 hook after 3 s                  | Trim the silence at the start of the recording                         |
| V-14 info: long silence              | Trim it, or fill it with something entering on screen                  |
| V-14 line too fast                   | Split or shorten the line, then re-record that part                    |

## Commands

```bash
./reelforge cue ep10 --draft          # estimated cues
./reelforge align ep10                # lines + words from voice.wav
./reelforge align ep10 --dry-run      # print without writing
./reelforge align ep10 --engine dsp   # pause detection only
./reelforge align --setup             # install the optional speech models once
./reelforge align --status            # what is installed
./reelforge cue ep10                  # editor in Cues mode for the person
```
