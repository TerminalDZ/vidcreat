# ADR-011: Static film grain by default

- Status: accepted · Date: 2026-10-15

## Context

FR-RT-5 asks for grain chosen from pre-generated tiles by frame index. Measured on a 6 s excerpt of
`examples/season1/ep01` (master settings, CRF 18): no grain 1.9 Mb/s, grain refreshed every frame
64.5 Mb/s, every 6 frames 21.5 Mb/s, static 5.9 Mb/s. Per-frame noise is incompressible: it makes
masters ~500 MB, slows every encode, and starves the size-capped share file of bits for the actual
content. TikTok/Reels/Shorts re-encode uploads and remove fine grain anyway.

## Decision

Grain is a seeded noise texture whose offset is chosen from 8 positions by frame index at the rate
`theme.chrome.grain_fps`. The default is `0` (static texture). Series that want animated grain can set
e.g. `grain_fps: 6` and accept the bitrate cost.

## Consequences

The look keeps its texture, renders stay deterministic, and share files spend their bits on text and
diagrams.
