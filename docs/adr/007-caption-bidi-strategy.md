# ADR-007: Caption bidi strategy (`<bdi>` isolation + tatweel joiner)

- Status: accepted · Date: 2026-10-15

## Context

Arabic captions with English terms break in naive renderers: words flip, "الـ" detaches from its
noun, and punctuation lands on the wrong side.

## Decision

- Consecutive Latin words merge into one token; a token ending in tatweel (الـ, بـ, للـ) joins the next
  with NO-BREAK SPACE.
- Each token is an atomic inline-block (`white-space: nowrap`), so it behaves as one neutral object in
  the paragraph's bidi resolution; inside it, Latin runs are wrapped in `<bdi>`.
- Trailing punctuation stays outside the isolate; the chunk's base direction is RTL when it has Arabic.

## Consequences

Visual order is correct by construction and verified by geometry tests and golden frames for every
case of SRS §9.3. Captions never wrap inside a term.
