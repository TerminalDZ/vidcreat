# ADR-010: Monorepo with pnpm workspaces and package boundaries

- Status: accepted · Date: 2026-10-15

## Decision

| Package    | Depends on                     | Responsibility                                                                        |
| ---------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| `audio`    | —                              | WAV io, envelopes, onset detection, SFX synthesis (pure, browser-safe)                |
| `core`     | audio                          | schema, time expressions, captions, themes, presets, compiler, static lint            |
| `runtime`  | core (types only), audio       | browser page: `render(t)`, chrome, 21 components                                      |
| `renderer` | core, audio, runtime           | Chromium workers, ffmpeg pipeline, measuring pass, doctor                             |
| `studio`   | core, audio, renderer, runtime | localhost server + Vite client (dashboard, visual editor with Edit/Cues/Review modes) |
| `cli`      | all                            | command entry points                                                                  |

The compiled `Timeline` (DR-5) is the only contract between core and runtime. Component prop schemas
live in core; their DOM implementations live in runtime under the same names (a test asserts both
registries match).

## Consequences

The runtime bundle never contains zod or YAML; the core is testable without a browser.
