---
name: reelforge-contribute-component
description: >-
  Use when adding or changing a ReelForge component in the source code (packages/core schema, packages/runtime renderer, gallery, golden frames, docs, studio starter props). Covers the required files, determinism rules and the tests to run.
---

# Contribute a component

A component is a contract in two halves: a **Zod schema with defaults** in `@reelforge/core`
(validated at compile time) and a **pure renderer** in `@reelforge/runtime` (drawn at time `t` in
Chromium). The compiled Timeline is the only thing passed between them.

## Files to touch, in order

1. **Schema** in `packages/core/src/components/`: props in `schemas.ts` (text, diagrams) or
   `visual.ts` (data and structure), reusing `fragments.ts` (`valueKeyframes`, `numberFormat`,
   `stagger`, `animDur`, `fontSize`, `datum`, `focus`, `treeNodes`). Every object `.strict()`,
   sensible `.default()`s, sizes bounded (`.min()`/`.max()` on arrays).
2. **Registry** entry in `packages/core/src/components/index.ts` (`COMPONENTS`): `name`, `schema`,
   one-line `description`, default `size`, `layer`, `enter`, `endpoints`/`fill` if relevant, and
   `events` for default sounds (use `itemTime`/`itemEvents` so sounds match the runtime schedule).
3. **Runtime** in `packages/runtime/src/components/<group>.ts` implementing `RuntimeComponent`
   (`name`, `mount(root, props, theme, ctx)` returning `{ update(t, local, state) }`), and list it
   in `COMPONENT_REGISTRY` (`packages/runtime/src/components/index.ts`). Styles in
   `packages/runtime/src/styles.ts`.
4. **Gallery**: a scene for it in `fixtures/golden/components/episode.yaml` (and its cue in
   `cues.json`) showing the default look and the main options.
5. **Docs**: `node scripts/gen-components-doc.mjs` regenerates `docs/components.md`; mention it in
   `AGENTS.md` only if the component list there changes.
6. **Studio**: a valid, good-looking default in `starterProps()`
   (`packages/studio/client/src/actions.ts`) so the editor's insert gives a useful element.
7. Optional: a keyword rule in `packages/core/src/suggest.ts` so `suggest_scene` proposes it.
8. **Golden frames**: `UPDATE_GOLDEN=1 pnpm test:browser`, then inspect the new PNGs before
   committing them.

Details per step: [files](references/files.md).

## Determinism rules

- `update(t, …)` is a pure function of `t`, props, theme and resolved state. No `Date.now()`,
  `performance.now()`, `Math.random()` (use `ctx.seed` and `local.frame` for seeded jitter), no
  timers, no `requestAnimationFrame`, no CSS transitions or animations that run on their own.
- Seeking backwards must produce the same frame as playing forward: never accumulate state across
  `update` calls; derive everything from `t`.
- Reuse the helpers in `packages/runtime/src/components/util.ts` (`fitText`, `fontFor`,
  `parseAccent`, `keyframeValue`, `statusColor`, `Reveal`) instead of re-implementing them. Load
  nothing over the network; assets come through `ctx.asset()`.
- Support right-to-left text (`isArabic`, `fontFor`) wherever a prop holds user text.
- Times in props are already resolved to seconds by the compiler for keys named `at`/`until`; do
  not parse expressions in the runtime.

More: [determinism-and-tests](references/determinism-and-tests.md).

## Good and bad schema

Good: strict, defaults, bounded, theme color names, time keys named `at`.

```ts
export const gaugeProps = z
  .object({
    value: z.number(),
    max: z.number().positive().default(100),
    label: z.string().optional(),
    keyframes: valueKeyframes().optional(),
    color: color().default('lime'),
    dur: animDur(1.0),
  })
  .strict();
```

Bad: loose object, unbounded arrays, hex-only colors, a time key the compiler will not resolve.

```ts
export const gaugeProps = z.object({
  value: z.any(),
  ticks: z.array(z.number()),
  hex: z.string().regex(/^#/),
  startTime: z.string(),
});
```

Gallery entry (valid episode YAML):

```yaml
scenes:
  - id: stat_card
    at: l12
    elements:
      - use: stat-card
        id: kpi
        props: { label: 'On-time arrivals', value: 92, suffix: '%', delta: 4 }
        place: { x: 330, y: 300, w: 420, h: 260 }
        enter: { at: l12, anim: rise }
```

## Checklist

- [ ] Schema strict with defaults; registry entry with description, size, layer, enter, events.
- [ ] Runtime registered; `update(t)` pure and deterministic (seek test passes).
- [ ] Gallery scene added; golden frames regenerated and inspected.
- [ ] `docs/components.md` regenerated; studio `starterProps` added.
- [ ] `pnpm typecheck && pnpm lint && pnpm test:unit` pass; `pnpm test:browser` passes.
- [ ] No test weakened to make it pass.
