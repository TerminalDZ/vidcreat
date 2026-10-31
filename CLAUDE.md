# CLAUDE.md

@AGENTS.md

Task guides live in `skills/` (Agent Skills format); the `get_guide` tool reads them too.

- MCP server `reelforge` is configured in `.mcp.json` (approve it, or check with `claude mcp list`).
  Tools are named `mcp__reelforge__<tool>`.
- Look at `preview_frames` images before you say an episode is done. Poll `get_render_status`
  after `render_episode`.
- After code changes: `pnpm typecheck && pnpm lint && pnpm test:unit`.
