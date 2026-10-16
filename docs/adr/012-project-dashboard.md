# ADR-012: A project dashboard with write actions

- Status: accepted · Date: 2026-10-16

## Context

ADR-002 keeps YAML as the only authoring surface and the per-episode studio writes only `cues.json`.
Buyers on CodeCanyon also expect a graphical entry point: creating episodes, adding a recording,
starting renders and finding the results without a terminal.

## Decision

`reelforge studio` serves a dashboard (localhost only) whose write actions are limited to project
housekeeping, never scene data:

- create an episode from the template (`episodes/<id>/episode.yaml`),
- store an uploaded recording as the episode's voice file (converted to WAV with ffmpeg),
- write draft cues when none exist,
- start/cancel one render job, open the per-episode studio, open a folder in the file manager.

Security: bound to 127.0.0.1, Host/Origin checks on every request and WebSocket, JSON-only POST bodies
(blocks HTML-form CSRF), every path resolved inside the project root, output files served only from
`out/`, uploads capped at 1 GB and limited to audio extensions.

## Consequences

Scene design stays in YAML (reviewable, diff-able). Non-technical users can run the whole workflow
from the browser; the CLI remains the automation surface.
