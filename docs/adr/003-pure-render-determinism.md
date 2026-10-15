# ADR-003: Pure render(t) and determinism rules

- Status: accepted · Date: 2026-10-15

## Decision

The visual state is a pure function of `(timeline, t)`:

- no wall clock, no CSS animations/transitions (forced off by the base stylesheet), no `Math.random`;
- randomness comes from seeded hashes (`rnd(seed)`, `mulberry32`) keyed by element id and frame index;
- state changes are derived from `states[]` up to `t` (with `$since` times), never accumulated.

## Consequences

- Any frame can be rendered in any order by any worker (NFR-4, tested by rendering frames
  {0, 90, 179} in different orders and comparing SHA-1s).
- Partial re-render and scrubbing in the studio are trivially correct.
- Components must be written as functions of time; a unit test renders the gallery forwards and
  backwards and compares the DOM.
