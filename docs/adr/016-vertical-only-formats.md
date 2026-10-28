# ADR-016: Keep 9:16 as the only format for 1.0; square, portrait and landscape on the roadmap

- Status: accepted · Date: 2026-11-01

## Context

Requests for square (1080×1080), 4:5 portrait (1080×1350) and 16:9 landscape (1920×1080) output
came up while preparing the open-source release. Presets already describe the canvas, the header,
the stage band and the platform safe zones in YAML (`presets/*.preset.yaml`), so a new preset looks
cheap. It is not, because of how element geometry works:

- Every element is placed in **absolute stage coordinates**: a 1080 × 1000 box between the header
  (y 270) and the captions (y 1300). Episodes, templates, blueprints, skills, the editor's guides and
  the V-6/V-7/V-8 checks all assume that box.
- A square or 4:5 canvas has 1080 or 1350 px of height for header, stage and captions together; the
  stage would shrink to roughly 600–850 px. Existing layouts would overflow or overlap (V-6, V-8),
  and texts sized for 1000 px would no longer fit (V-9).
- A landscape canvas changes the aspect of the stage itself (wide, not tall). Diagrams laid out as
  columns would need to become rows; no uniform scale keeps them readable.

Doing this properly means a **relative layout model** (anchors, flow or grid placement, or per-format
`place` overrides) across the compiler, runtime, editor, lint rules, templates and every example:
a rewrite of the layout contract, not a preset.

## Decision

ReelForge 1.0 ships **9:16 only** (`tiktok`, `reels`, `shorts`). Additional formats are on the
roadmap behind a relative placement model, designed in a separate ADR before any code. Until then,
people who need another format can render 9:16 and crop or pad with ffmpeg, accepting that the
layout is not adapted.

## Consequences

- The Timeline contract and golden frames stay stable for the first release.
- Templates, blueprints and skills can keep using fixed, tested coordinates, which is what makes
  them reliable for small models.
- The roadmap item is explicit: relative placement first (likely `place: { anchor, w%, h% }` with
  per-preset resolution in the compiler), then square, 4:5 and 16:9 presets with their own safe zones.
