---
trigger: always_on
description: ReelForge video authoring and code rules
---

# ReelForge

Follow `AGENTS.md` at the project root: Part 1 covers making videos, Part 2 covers the code.

To work on episodes, use the `reelforge` MCP server. Add it in Windsurf → Settings → Cascade → MCP
servers → View raw config, with `node` as the command and the arguments
`/path/to/ReelForge/packages/cli/bin/reelforge.js mcp --root /path/to/ReelForge`
(see docs/manual/15-ai-agents.md).

Script with one sentence per line. Elements enter on spoken words (`l3:'word'`). Keep coordinates
inside the stage safe area. Validate to 0 errors. Preview frames before you report done.
