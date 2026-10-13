# ADR-005: Parallel frame-range workers and segment concatenation

- Status: accepted · Date: 2026-10-15

## Decision

The frame range is split into N contiguous ranges (default: cores − 1). Each worker owns a Chromium
process and an ffmpeg process (`image2pipe` JPEG → x264 CRF 14 `veryfast` intermediate). Segments are
joined with the concat demuxer (stream copy) and the total frame count is verified. A crashed worker
is retried once.

## Consequences

- Near-linear scaling with cores; memory stays bounded per worker.
- Separate browsers (not tabs) avoid renderer-process sharing that would serialize work.
- Intermediate segments are visually lossless; the final master/share encodes read them once.
