# AI agents & MCP

ReelForge works on its own: you write the script, design scenes in the editor and render. If you
use an AI assistant, it can do the heavy lifting for you:

- write the script;
- build every scene;
- check the result by looking at rendered frames;
- fix problems.

You stay in control. You record your own voice, mark the cues by ear and approve the result in the
editor.

Assistants connect through the **Model Context Protocol (MCP)**, an open standard supported by
Claude, Cursor, GitHub Copilot, Windsurf, Codex, Gemini CLI, Cline and others. ReelForge ships an
MCP server:

```bash
./reelforge mcp          # macOS / Linux
reelforge.cmd mcp        # Windows
```

You don't run this yourself. Your AI client starts it when needed. It talks over standard
input/output, runs on your computer and never sends your files anywhere. The AI service only sees
what your client sends it.

## What the assistant can do

| Tool                                                     | What it does                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `list_episodes`                                          | Lists the episodes and examples in the project                                 |
| `get_episode`                                            | Reads an episode: the YAML plus a compiled outline (line times, element boxes) |
| `create_episode`                                         | Creates an episode from a script (English or Arabic)                           |
| `edit_episode` / `write_episode_yaml`                    | Changes scenes, elements, timing and settings (comments in your file are kept) |
| `validate_episode`                                       | Runs every check (schema, timing, pacing, overlap, safe zones, text overflow)  |
| `preview_frames`                                         | Renders still frames and **shows them to the assistant**                       |
| `list_components` / `get_component_schema`               | Lists the 21 components and their exact properties                             |
| `draft_cues` / `set_cues`                                | Writes estimated or known line timings                                         |
| `align_cues`                                             | Marks every line and word from your recording automatically                    |
| `suggest_scene`                                          | Proposes elements for a line (dictionary, or your local LLM via Ollama)        |
| `render_episode` / `get_render_status` / `cancel_render` | Renders the final videos in the background, reports progress, cancels          |
| `open_editor`                                            | Opens the visual editor so you can review and fine-tune                        |
| `doctor`                                                 | Checks Node.js, FFmpeg, Chromium and fonts                                     |

It also offers the **make_explainer** prompt. Give it a topic and the assistant follows the whole
workflow.

## Setup by client

The project folder already contains ready-made configuration for Claude Code, Cursor, VS Code and
Gemini CLI. For the other clients, add the server yourself. In the examples below, replace
`/path/to/ReelForge` with the folder where you unzipped ReelForge. On Windows, write it like
`C:/Users/you/ReelForge`.

### Claude Code

Open a terminal in the ReelForge folder and run `claude`. The included `.mcp.json` registers the
server; approve it when asked. To add it by hand:

```bash
claude mcp add reelforge -- node packages/cli/bin/reelforge.js mcp
```

Try: _"Make a 40-second English episode about database indexes, preview it and fix any issues."_

### Claude Desktop

Open **Settings → Developer → Edit Config**. This opens `claude_desktop_config.json`, which lives
in `~/Library/Application Support/Claude/` on macOS and in `%APPDATA%\Claude\` on Windows. Add:

```json
{
  "mcpServers": {
    "reelforge": {
      "command": "node",
      "args": ["/path/to/ReelForge/packages/cli/bin/reelforge.js", "mcp", "--root", "/path/to/ReelForge"]
    }
  }
}
```

Restart Claude Desktop. ReelForge then appears in the tools menu.

### Cursor

Open the ReelForge folder. The included `.cursor/mcp.json` registers the server, and
`.cursor/rules/reelforge.mdc` teaches the agent the rules. Enable **reelforge** in
**Settings → MCP**.

### VS Code with GitHub Copilot

Open the ReelForge folder. The included `.vscode/mcp.json` registers the server; click **Start**
above it. In Copilot Chat, choose **Agent** mode and enable the ReelForge tools.
`.github/copilot-instructions.md` gives Copilot the project rules.

### Windsurf

Go to **Settings → Cascade → MCP servers → View raw config** (`~/.codeium/windsurf/mcp_config.json`)
and add the same `mcpServers` block as for Claude Desktop. The rules are in
`.windsurf/rules/reelforge.md`.

### OpenAI Codex CLI

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.reelforge]
command = "node"
args = ["/path/to/ReelForge/packages/cli/bin/reelforge.js", "mcp", "--root", "/path/to/ReelForge"]
```

Codex reads `AGENTS.md` automatically.

### Gemini CLI

Run `gemini` in the ReelForge folder. The included `.gemini/settings.json` registers the server and
`GEMINI.md` loads the rules. Check it with `/mcp`.

### Cline, Roo Code, Continue, Zed and others

Any client that supports **stdio** MCP servers works. Use `node` as the command, with the arguments
`/path/to/ReelForge/packages/cli/bin/reelforge.js mcp --root /path/to/ReelForge`.

## Instruction files for agents

| File                              | Read by                                                             |
| --------------------------------- | ------------------------------------------------------------------- |
| `AGENTS.md`                       | Codex, Cursor, Copilot, Windsurf, Zed, Aider, Jules and most agents |
| `CLAUDE.md`                       | Claude Code (imports AGENTS.md)                                     |
| `GEMINI.md`                       | Gemini CLI (imports AGENTS.md)                                      |
| `.github/copilot-instructions.md` | GitHub Copilot                                                      |
| `.cursor/rules/reelforge.mdc`     | Cursor                                                              |
| `.windsurf/rules/reelforge.md`    | Windsurf                                                            |
| `llms.txt`                        | Assistants that look for an llms.txt index                          |

They describe the workflow, the episode format, the layout rules and a quality checklist. Edit them
to add your own house style, for example your series' colors, tone of voice or standard ending.

## Tips

- **Ask the assistant to look.** Say _"preview the frames and fix anything that looks off"_. The
  assistant receives the frames as images.
- **Keep the voice human.** ReelForge never generates voices. Record yourself, then mark cues in
  the editor's **Cues** mode. Word-anchored timing such as `l3:'bucket'` follows your real
  delivery automatically.
- **Review in the editor.** Ask for `open_editor` to get a link. Everything the assistant wrote is
  editable visually, and every change can be undone.
- **Large changes:** the assistant can rewrite the whole `episode.yaml`. The file is checked before
  it is saved, and invalid YAML is refused.
