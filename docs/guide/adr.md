# Architecture decision records

Each decision record (ADR) documents one significant design decision: its context, the decision and its
consequences. The [architecture guide](../architecture.md) explains how the decisions fit together in
the code.

| ADR                                                     | Decision                                               |
| ------------------------------------------------------- | ------------------------------------------------------ |
| [001](../adr/001-dom-svg-rendering-surface.md)          | DOM/SVG in headless Chromium as the rendering surface  |
| [002](../adr/002-yaml-single-source-of-truth.md)        | YAML is the only authoring format                      |
| [003](../adr/003-pure-render-determinism.md)            | Pure `render(t)` and determinism rules                 |
| [004](../adr/004-human-marked-cues.md)                  | Human-marked cues (superseded in part by ADR-013)      |
| [005](../adr/005-parallel-frame-range-workers.md)       | Parallel frame-range workers and segment concatenation |
| [006](../adr/006-master-and-share-outputs.md)           | Two outputs: master and size-targeted share file       |
| [007](../adr/007-caption-bidi-strategy.md)              | Caption bidi strategy                                  |
| [008](../adr/008-procedural-sfx.md)                     | Procedural sound effects instead of sample libraries   |
| [009](../adr/009-system-ffmpeg.md)                      | System FFmpeg instead of a bundled binary              |
| [010](../adr/010-monorepo-package-boundaries.md)        | Monorepo with pnpm workspaces and package boundaries   |
| [011](../adr/011-static-grain-by-default.md)            | Static film grain by default                           |
| [012](../adr/012-project-dashboard.md)                  | A project dashboard with write actions                 |
| [013](../adr/013-assisted-cue-alignment.md)             | Assisted cue alignment                                 |
| [014](../adr/014-one-tool-registry-three-transports.md) | One tool registry, three transports                    |
| [015](../adr/015-local-server-security.md)              | Local server security for AI endpoints                 |
| [016](../adr/016-vertical-only-formats.md)              | 9:16 is the only format for 1.0                        |

For a significant design change, add a new record in `docs/adr/` (see [Contributing](contributing.md)).
