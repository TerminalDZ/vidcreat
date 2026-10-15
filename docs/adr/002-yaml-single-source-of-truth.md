# ADR-002: YAML is the only authoring format; the studio writes cues only

- Status: accepted · Date: 2026-10-15

## Context

A timeline GUI would create a second source of truth, merge conflicts and hidden state.

## Decision

`episode.yaml` is the single authoring surface, diff-able and reviewable in Git. The studio is a
viewer plus a cue marker: its only write is `PUT /cues`, which writes `cues.json` atomically.

## Consequences

- Episodes are reproducible from the repository alone (G6), and review happens in pull requests.
- Authors need a text editor; the JSON Schema (`reelforge schema`) provides autocompletion.
- Errors carry `file:line:col` because the parser keeps YAML source positions.
