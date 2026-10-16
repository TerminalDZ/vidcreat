# GitHub Copilot instructions — ReelForge

ReelForge turns a voice recording plus `episodes/<id>/episode.yaml` into 1080×1920 vertical
explainer videos. **Read `AGENTS.md` at the repository root** for the full guide. The essentials
follow.

- **Make videos through the `reelforge` MCP server** (configured in `.vscode/mcp.json`; enable it in
  Copilot Chat agent mode). The tools are: list_episodes, get_episode, create_episode, edit_episode,
  write_episode_yaml, validate_episode, preview_frames, list_components, get_component_schema,
  draft_cues, set_cues, render_episode, get_render_status, cancel_render, open_editor, doctor.
- **Workflow:**
  1. Write a script with one spoken sentence per line.
  2. Create the episode.
  3. Design scenes with elements entering on the words that name them (`at: "l3:'word'"`).
  4. Validate (0 errors).
  5. Preview frames.
  6. The person records the voice, marks cues in the editor (`reelforge edit <id>`) and renders.
- **Coordinates are stage coordinates:** 1080 × 1000, origin at the top-left of the stage. Keep
  `x ≥ 60` and `x + w ≤ 1020`, and `x + w ≤ 920` below y = 600 (the platform UI's right rail).
- **Use only the 21 components and their schema props** (`docs/components.md`). Unknown keys are
  errors.
- **Code changes:** TypeScript strict in a pnpm workspace. Run
  `pnpm typecheck && pnpm lint && pnpm test:unit`. `render(t)` in `packages/runtime` must stay pure
  and deterministic. Local servers must stay on 127.0.0.1 with same-origin checks.
