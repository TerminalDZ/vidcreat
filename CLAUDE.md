# CLAUDE.md

@AGENTS.md

## Claude Code specifics

- The `reelforge` MCP server is configured in `.mcp.json`. Approve it when Claude Code asks (or run
  `claude mcp list` to check). Its tools are named `mcp__reelforge__<tool>`.
- To make a video, follow **Part 1** of AGENTS.md: script → `create_episode` → design scenes with
  `edit_episode` → `validate_episode` → `preview_frames` (look at the images) → iterate.
- Renders take minutes. Call `render_episode`, then poll `get_render_status` between other work.
- When you change source code, run `pnpm typecheck && pnpm lint && pnpm test:unit` before you
  finish.
