# GitHub Copilot instructions — ReelForge

**Read `AGENTS.md` at the repository root** (Part 1: making videos, Part 2: the code). Task guides
live in `skills/`; the `get_guide` tool reads them.

- Make videos through the `reelforge` MCP server (`.vscode/mcp.json`; enable it in Copilot Chat
  agent mode) and look at `preview_frames` images before you say an episode is done.
- Code changes: run `pnpm typecheck && pnpm lint && pnpm test:unit`.
