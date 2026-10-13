# ADR-008: Procedural SFX instead of sample libraries

- Status: accepted · Date: 2026-10-15

## Decision

Eight sounds (whoosh, hit, ding, err, glitch, tick, tap and typing bursts) are synthesized in
TypeScript at 48 kHz from oscillators and seeded noise, placed at timeline events, peak-normalized to
−0.9 dBFS and mixed under the voice with sidechain ducking.

## Consequences

No sample licensing, no binary assets, deterministic output (buffer hashes are tested) and a
consistent series sound. Sounds are simpler than designed samples, which suits the minimal look.
