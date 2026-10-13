# ADR-004: Human-marked cues instead of speech recognition

- Status: accepted, superseded in part by [ADR-013](013-assisted-cue-alignment.md) (machine-suggested cues) · Date: 2026-10-15

## Context

The product must use no AI/ML (G3). (Since 1.0 this applies to the render engine; optional machine-suggested cues are covered by ADR-013.) Timing must survive re-recording a single sentence.

## Decision

The author marks the start of each script line with Space while listening (at 0.5×–1× speed).
Word times are estimated from letter counts (SRS §5.2) or marked manually in word mode. An optional
"snap to onset" uses a deterministic RMS-envelope rise detector.

## Consequences

- Marking a 90 s episode takes 2–3 minutes; re-recording a line means re-marking one line.
- Animations reference lines and words (`l7:'timeout'`), so they follow the voice automatically.
