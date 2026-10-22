# ADR-014: One tool registry, three transports

- Status: accepted · Date: 2026-11-01

## Context

Agents drove ReelForge through about eighteen tools that were declared by hand inside the stdio MCP
server (`packages/cli/src/mcp.ts`), with hand-written JSON Schemas. Clients that cannot spawn a
process (remote agents, web UIs, OpenAI-compatible frameworks, GPT Actions) had no way in, and a
second transport would have meant declaring every tool again and letting the copies drift.

## Decision

Tools are defined once, in `packages/studio/src/tools/` (one file per group, listed in
`registry.ts`). Each tool has a stable `name`, a `title`, a short `description`, a Zod input schema
(and an output schema where it helps), its toolsets, MCP annotations (`readOnlyHint`, …) and a
`handler(args, ctx)`. The context gives the project root, the voice decoder of the host (the CLI
injects its FFmpeg decoder), the shared `RenderRunner`, progress reporting and `openStudio`. JSON
Schemas are generated from Zod (`zod-to-json-schema`); arguments are validated with the same Zod
schema, and invalid arguments come back as a readable tool error.

Three transports serve the registry and declare nothing of their own:

- **MCP stdio**: `reelforge mcp [--toolsets …]`, a thin line reader in the CLI over the shared
  JSON-RPC dispatcher (`tools/mcp.ts`). Protocol versions 2025-06-18, 2025-03-26 and 2024-11-05,
  progress notifications, stdout carries protocol messages only.
- **MCP Streamable HTTP**: `POST /mcp` on the dashboard (`reelforge studio`). JSON responses (single
  or batch), `Mcp-Session-Id` issued on `initialize` and checked afterwards, `MCP-Protocol-Version`
  checked when sent, `DELETE` ends a session, `GET` answers 405 (no server-initiated stream).
- **REST**: `GET /api/v1/tools` (`?format=openai` gives function definitions),
  `POST /api/v1/tools/<name>` with the arguments as the JSON body, returning
  `{ ok, result, text, images? }` (`ok: false` with `error` when the tool reported a problem; HTTP
  errors only for transport problems), `GET /api/v1/health` and `GET /api/v1/openapi.json`, an
  OpenAPI 3.1 document with one operation per tool (`operationId` = tool name, request body = the
  tool's JSON Schema).

Toolsets are tags on tools: `basic` (list, read, create, validate, preview, suggest, cues, render
status, guide), `design` (edit, YAML, components, schemas, suggest), `render` (render, status,
cancel, editor, doctor) and `all` (default). `--toolsets` and `?toolsets=` select the union.

Every write tool returns the validation summary, `fixes` (from each issue's hint) and `next` (the
recommended next step) in its structured result. `preview_frames` returns, per time, a layout
description (visible elements with canvas boxes and layers, overlaps between base elements as V-8
measures them, platform safe-zone intersections) next to the image. `get_guide` serves task guides
from `skills/<name>/SKILL.md` (Agent Skills layout) in the project or the installation.

The dashboard also serves `/llms.txt`, `/llms-full.txt` (built by `pnpm docs:llms`) and
`/.well-known/mcp.json`, a server card generated from the registry.

**Stability promise.** Tool names, their input arguments and the `/api/v1` paths follow semantic
versioning from 1.0: within a major version, tools and arguments are only added (new optional
arguments, new tools, new result fields), never renamed, removed or made stricter. The internal
dashboard endpoints (`/api/project`, `/api/render`, …) are not part of this promise and may change
with the UI.

## Consequences

Adding a tool is one definition plus one entry in `registry.ts`, and it appears in every transport,
the OpenAPI document and the server card. The studio package owns the tools (it already owns the
render queue and the structured YAML edits) and gains `zod` and `zod-to-json-schema`, the versions
core uses. HTTP MCP and REST need `reelforge studio` running; stdio does not. Progress
notifications are only sent over stdio, because HTTP answers with plain JSON.
