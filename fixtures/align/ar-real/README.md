# Arabic alignment fixture (recorded by a person)

The other fixtures in `fixtures/align/` are synthesized English speech with exact word timings. This
one measures automatic cues on **real Arabic speech** that mixes in English terms, the case most
ReelForge episodes use. It needs a recording and hand-checked timings, which only a person can make.
Until `voice.wav` and `truth.json` exist, `node scripts/eval-align.mjs`, `scripts/eval-assist.mjs`
and the unit tests skip this folder with a notice.

## 1. Record `voice.wav`

- Read the six lines of `episode.yaml` naturally, in one take, with a short breath between lines.
- Any quiet room and any microphone; a phone is fine (it is a realistic case).
- Save as `fixtures/align/ar-real/voice.wav`. Mono 16 kHz keeps the file small (about 30 KB per
  second); convert with `ffmpeg -i take.m4a -ac 1 -ar 16000 -c:a pcm_s16le voice.wav`.

## 2. Mark the true timings by hand

1. `reelforge cue fixtures/align/ar-real` opens the editor in Cues mode.
2. Mark every line with **Space** while listening at **0.5×** (keys 1/2/3 change the speed).
3. For each line: select it, press **W**, play, and press **Space** on every word. Use **S** (snap to
   onset) and **←/→** (Shift: 10 ms) to make each mark land on the start of the word. Do not use
   _Auto-mark_: the point is an independent reference.
4. When every line and word is marked, turn the saved `cues.json` into `truth.json`:

   ```bash
   node scripts/eval-align.mjs --truth-from-cues fixtures/align/ar-real
   ```

   Then delete `cues.json` (the fixture must not ship cues, so the aligners start from nothing).

## 3. Measure

```bash
pnpm build
node scripts/eval-align.mjs        # pause-based engine
node scripts/eval-assist.mjs       # all engines (Whisper/VAD after `reelforge align --setup`)
```

Commit `voice.wav`, `truth.json` and any README notes about the recording conditions.
