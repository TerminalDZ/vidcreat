# ADR-013: Assisted cue alignment

- Status: accepted · Date: 2026-11-01 · Supersedes ADR-004 in part

## Context

ADR-004 chose human-marked cues: the author presses Space at the start of each line. It works, but
it is the slowest step for long episodes, and most of it is mechanical: the script is already known,
so the recording only has to be split into the lines and words that are written down. ADR-004's
reason for avoiding speech recognition was that the render engine must contain no AI/ML (G3) and
that timing must survive re-recording one sentence. Neither requires the cues themselves to be
hand-made.

## Decision

Cues may be **suggested by the machine** and then checked by ear. Suggested cues are an authoring aid
only:

1. **Engines** (`@reelforge/assist`, `reelforge align`, the editor's _Auto-mark from voice_, MCP
   `align_cues`):
   - **DSP** (always available, no model): an energy/pause analysis and a dynamic-programming split of
     the recording into the script's lines weighted by syllables; words by syllables, punctuation and
     energy valleys (`packages/audio/src/align.ts`).
   - **Silero VAD** (optional): a speech/non-speech gate so music beds and room noise do not create
     false pauses.
   - **Whisper word timings** (optional): the recognizer's word _timings_ are matched to the known
     script by fuzzy DTW. Its transcript is discarded, so recognition errors do not reach the video.
2. Suggested cues are written to `cues.json` with **`auto: true`** (V-3 info until a person saves
   them in Cues mode, which clears the flag).
3. They **never overwrite cues a person marked** unless the person confirms (`--force`, a dialog in
   the editor; the editor's write is one undo step).
4. Models are **never used at render time**. The renderer reads `cues.json` like any other cues file,
   so rendering stays deterministic and offline (ADR-003). The optional models are downloaded once by
   `reelforge align --setup`, pinned to a revision and checked by SHA-256 (see
   `packages/assist/runtime/README.md`); after that, alignment also runs offline.

## Consequences

- Marking a long episode becomes "align, listen once, fix the amber lines".
- ADR-004 still holds for the manual workflow and for the guarantee that animations follow lines and
  words, not seconds.
- Accuracy is measured, not assumed: `node scripts/eval-align.mjs` and `scripts/eval-assist.mjs` run
  against recordings with known word timings (`fixtures/align/`). An Arabic fixture recorded by a
  person is scaffolded in `fixtures/align/ar-real/`.
- The project no longer claims "no AI" without qualification: the render engine contains none, and
  the optional authoring helpers are local and opt-in.
