# Determinism and tests

## Why

The same `episode.yaml`, cues and voice must always produce the same frames. Frames are rendered
out of order by parallel Chromium workers, so a component that depends on call order, wall-clock
time or randomness produces flicker, mismatched segments and failing golden tests.

## Rules

| Do                                                      | Don't                                             |
| ------------------------------------------------------- | ------------------------------------------------- |
| Derive every value from `t`, `local`, props and `state` | Keep counters or "previous value" between updates |
| Seeded jitter from `ctx.seed` and `local.frame`         | `Math.random()`, `crypto.getRandomValues()`       |
| Ease with the shared easing functions                   | CSS `transition`/`animation`, Web Animations      |
| Build DOM in `mount`, mutate attributes in `update`     | Create or remove nodes on every frame             |
| Bundled fonts and `ctx.asset()` paths                   | Network fonts, remote images                      |
| Clamp progress to 0..1                                  | Rely on `t` being inside the scene                |

## Tests to run

```bash
pnpm typecheck
pnpm lint
pnpm test:unit                       # schemas, compiler, runtime primitives, gallery mount
pnpm test:browser                    # golden frames (needs Chromium); UPDATE_GOLDEN=1 to refresh
pnpm test                            # everything, including FFmpeg integration
```

What already covers a new component automatically:

- `packages/runtime/test/runtime.test.ts`: every core component has a runtime implementation; the
  whole gallery mounts and renders; `render(t)` is idempotent and order-independent.
- `tests/frames.test.ts`: the component gallery matches its golden frames.

Add your own:

- A schema test for defaults and rejected props (unknown key, out-of-range values).
- If the component sequences items, a test that core `events` times match the runtime schedule
  (shared `itemTime`).
- If it has a suggestion rule, a `suggest.test.ts` case in English and in Arabic.

Never loosen a tolerance or delete a golden frame to make a test pass; fix the component or
regenerate the golden after an intended visual change and inspect it.
