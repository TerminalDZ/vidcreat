---
trigger: always_on
description: ReelForge video authoring and code rules
---

# ReelForge

Follow `AGENTS.md` at the project root: Part 1 covers making videos, Part 2 covers the code.

To work on episodes, use the `reelforge` MCP server: run `node packages/cli/bin/reelforge.js mcp`
from the project root, and add it in Windsurf → Settings → Cascade → MCP servers.

Script with one sentence per line. Elements enter on spoken words (`l3:'word'`). Keep coordinates
inside the stage safe area. Validate to 0 errors. Preview frames before you report done.
