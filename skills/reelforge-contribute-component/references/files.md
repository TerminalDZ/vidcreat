# Files, step by step

## 1. Core schema (`packages/core/src/components/`)

- `schemas.ts`: text and diagram components; exports `ICONS` and shared enums.
- `visual.ts`: data and structure components (charts, KPIs, comparisons, processes, hierarchies).
- `fragments.ts`: shared pieces. Reuse instead of redefining:
  `valueKeyframes()`, `numberFormat(suffix)`, `stagger(d)`, `animDur(d)`, `fontSize(d)`,
  `datum()`, `focus()`, `axisBounds()`, `treeNodes(fields)`.
- Helpers from `../schema/common.js`: `color()` (theme color name or CSS color), `time()` (time
  expression), `int()`.

Conventions the compiler relies on:

| Key name                                | Treated as                               |
| --------------------------------------- | ---------------------------------------- |
| `at`, `until` (any depth)               | Time expression, resolved to seconds     |
| `strike`, `highlight` (non-boolean)     | Time expression                          |
| `color`, `accent`, `danger`, `colors[]` | Theme color name or CSS color            |
| keys listed in `endpoints`              | Element id, `id.side`, or `{x, y}` point |

## 2. Core registry (`components/index.ts`)

```ts
gauge: {
  name: 'gauge',
  schema: V.gaugeProps,
  description: 'Half-circle gauge that sweeps to its value (keyframable).',
  size: { w: 600, h: 360 },
  enter: 'fade',
  events: (p, el) => [{ t: el.enter.t + p.dur, sound: 'ding', gain_db: -10 }],
},
```

The description is what `list_components` shows to agents: say what it draws and when to use it in
one line.

## 3. Runtime (`packages/runtime/src/components/`)

```ts
export const gauge: RuntimeComponent = {
  name: 'gauge',
  mount(root, props, theme, ctx) {
    // build DOM/SVG once
    return {
      update(t, local, state) {
        // set attributes from t, local.enterP, keyframeValue(...) — nothing else
      },
    };
  },
};
```

Register it in `COMPONENT_REGISTRY`. `handles` lists enter animations the component draws itself
(for example `count`), so the wrapper only fades it in.

## 4. Gallery and golden frames

- Add a scene to `fixtures/golden/components/episode.yaml` and a cue for its line in
  `fixtures/golden/components/cues.json`. The scene id names the golden frame
  (`fixtures/golden/components/frames/<scene id>.png`).
- `UPDATE_GOLDEN=1 pnpm test:browser` writes new frames. Open them and check the result before
  keeping them; the golden frame is the reference for every later change.

## 5. Docs

`node scripts/gen-components-doc.mjs` regenerates `docs/components.md` from the schemas
(`pnpm docs` also rebuilds the site). Do not edit the generated file by hand.

## 6. Studio

Add a `case` to `starterProps()` in `packages/studio/client/src/actions.ts` returning props that
are valid and look good at the default size. Use the `at` argument for keyframes so the insert
animates at the playhead.

## 7. Suggestions (optional)

A rule in `packages/core/src/suggest.ts` (`RULES`) maps English and Arabic keywords to the
component with props built from the line. Every suggestion is validated against the schema before
it is returned; add a case to `packages/core/test/suggest.test.ts`.
