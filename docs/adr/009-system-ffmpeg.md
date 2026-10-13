# ADR-009: System ffmpeg instead of a bundled binary

- Status: accepted · Date: 2026-10-15

## Decision

ReelForge calls the system `ffmpeg`/`ffprobe` (≥ 6.0, overridable with `REELFORGE_FFMPEG` /
`REELFORGE_FFPROBE`). `reelforge doctor` checks the version, encoders (libx264, aac, mjpeg) and
filters (loudnorm, sidechaincompress, alimiter) and prints per-OS install steps.

## Consequences

libx264 is GPL: bundling it would change the distribution license and add ~80 MB per platform.
Users install ffmpeg once with their package manager.
