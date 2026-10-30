# AI integration

ReelForge works on its own: you write the script, design scenes in the editor and render. If you use an
AI assistant, it can do the heavy lifting: write the script, build every scene, look at rendered frames
and fix problems. You stay in control. You record your own voice, check the cues by ear and approve the
result in the editor.

The render engine contains no AI: it draws every frame deterministically from `episode.yaml`. Two optional
helpers run on your computer:

- **Speech alignment** (`align_cues`, `reelforge align`) marks every line and word from `voice.wav`.
  It works from pause detection alone; `reelforge align --setup` downloads the optional speech models
  (Whisper and Silero VAD) once, and after that alignment runs offline.
- **Scene suggestions** (`suggest_scene`, `suggest_scenes`) use a built-in keyword dictionary, or a
  language model you configure (see [Local and cloud models](#models)).

## Three ways in

All three serve the same tools from one registry, so names, arguments and results are identical
(ADR-014). The [MCP tools reference](../reference/mcp-tools.md) lists every tool.

| Transport           | Start it                             | Endpoint                       | Use it for                                      |
| ------------------- | ------------------------------------ | ------------------------------ | ----------------------------------------------- |
| MCP over stdio      | your client runs `reelforge mcp`     | standard input/output          | Claude Code, Cursor, VS Code, Codex, Gemini CLI |
| MCP Streamable HTTP | `reelforge studio` (keep it running) | `http://127.0.0.1:4310/mcp`    | clients that prefer a URL, several clients      |
| REST and OpenAPI    | `reelforge studio`                   | `http://127.0.0.1:4310/api/v1` | agent frameworks with function calling          |

```bash
./reelforge mcp          # macOS / Linux
reelforge.cmd mcp        # Windows
```

You don't run the stdio server yourself: your client starts it when needed. It runs on your computer and
never sends your files anywhere; the AI service only sees what your client sends it.

The REST API answers `GET /api/v1/tools` (add `?format=openai` for OpenAI function definitions),
`POST /api/v1/tools/<name>` with the arguments as JSON, and `GET /api/v1/openapi.json` for GPT Actions and
other OpenAPI importers. The dashboard also serves `/.well-known/mcp.json` (a server card) and
`/llms.txt` / `/llms-full.txt` (the documentation in one file).

## Client setup

The project folder already contains configuration for Claude Code (`.mcp.json`), Cursor
(`.cursor/mcp.json`), VS Code (`.vscode/mcp.json`) and Gemini CLI (`.gemini/settings.json`). Open the folder
in the client and approve the `reelforge` server. For example, with Claude Code:

```bash
claude mcp add reelforge -- node packages/cli/bin/reelforge.js mcp
```

Try: _"Make a 40-second English episode about database indexes, preview it and fix any issues."_

Every other client (Claude Desktop, Windsurf, Codex CLI, Zed, Continue, LM Studio and any OpenAI-compatible
framework), in stdio and HTTP variants, is in [AI client setup](../reference/ai-clients.md). The dashboard's
**Connect AI** page (`/connect`) shows the same snippets with your real paths and a connection test.

## Toolsets

Small context windows work better with fewer tools. Ask for one or more toolsets:

```bash
reelforge mcp --toolsets basic,design
```

Over HTTP use `/mcp?toolsets=basic` (also on `/api/v1/tools` and `/api/v1/openapi.json`).

| Toolset  | Contains                                                                         |
| -------- | -------------------------------------------------------------------------------- |
| `basic`  | read, create (from a script or a template), add scenes, validate, preview, cues  |
| `design` | structured edits, full YAML, component schemas, blueprints and scene suggestions |
| `render` | render, status, cancel, open the editor, environment check                       |
| `all`    | every tool (the default)                                                         |

## Tool tiers

Pick the tools that match the model's strength. Every write tool returns the validation summary, one fix
hint per problem (`fixes`) and the recommended next step (`next`), so any model can correct itself in a loop.

| Tier | For           | Tools                                                        | The model writes                      |
| ---- | ------------- | ------------------------------------------------------------ | ------------------------------------- |
| 1    | small models  | `list_templates` → `create_from_template`, `suggest_scenes`  | a flat object of slot values; no YAML |
| 2    | medium models | `create_episode`, `list_blueprints` → `add_scene`            | the script and a few fields per scene |
| 3    | strong models | `edit_episode`, `write_episode_yaml`, `get_component_schema` | any element, prop, time and animation |

Shared tools for every tier: `get_episode`, `validate_episode`, `preview_frames` (images for vision models
plus a text layout description for text-only models), `draft_cues`, `align_cues`, `set_cues`,
`render_episode`, `get_render_status`, `cancel_render`, `open_editor`, `doctor` and `get_guide`.

## Skills and instruction files

Task guides live in `skills/` in the Agent Skills format (one folder per skill with `SKILL.md` and
`references/`). Clients that support skills load them directly; others call `get_guide` (`topic`, and
`detail: true` for the full guide). `.claude-plugin/` packages the skills with the MCP server as a Claude
Code plugin.

| Skill                            | Covers                                                     |
| -------------------------------- | ---------------------------------------------------------- |
| `reelforge-make-video`           | the end-to-end workflow and which tool tier to use         |
| `reelforge-script-writing`       | hooks, one idea per line, words per second, Arabic terms   |
| `reelforge-scene-design`         | layout, safe zones, component choice, motion rules         |
| `reelforge-timing`               | cues, word anchors, automatic alignment                    |
| `reelforge-industry-playbooks`   | audience, tone, templates and compliance per industry      |
| `reelforge-brand-and-themes`     | themes from brand colors and fonts, contrast               |
| `reelforge-review-and-render`    | the validation loop, visual QA, render options, publishing |
| `reelforge-contribute-component` | adding a component correctly                               |

| Instruction file                  | Read by                                                             |
| --------------------------------- | ------------------------------------------------------------------- |
| `AGENTS.md`                       | Codex, Cursor, Copilot, Windsurf, Zed, Aider, Jules and most agents |
| `CLAUDE.md`                       | Claude Code (imports AGENTS.md)                                     |
| `GEMINI.md`                       | Gemini CLI (imports AGENTS.md)                                      |
| `.github/copilot-instructions.md` | GitHub Copilot                                                      |
| `.cursor/rules/reelforge.mdc`     | Cursor                                                              |
| `.windsurf/rules/reelforge.md`    | Windsurf                                                            |
| `llms.txt`                        | Assistants that look for an llms.txt index                          |

Edit them to add your house style, for example your series' colors, tone of voice or standard ending.

## Local and cloud models {#models}

ReelForge's own scene suggestions can use a language model. Nothing is configured by default; without a
model, suggestions come from the keyword dictionary. Set environment variables, or write `llm.json` in the
ReelForge config folder (`%APPDATA%\reelforge`, `~/Library/Application Support/reelforge` or
`~/.config/reelforge`) with the same keys (`provider`, `baseUrl`, `model`, `apiKey`).

| Variable                 | Meaning                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| `REELFORGE_LLM_PROVIDER` | `openai` (any OpenAI-compatible server), `anthropic` or `ollama`     |
| `REELFORGE_LLM_BASE_URL` | Server URL; the provider is guessed from it when not set             |
| `REELFORGE_LLM_MODEL`    | Model name                                                           |
| `REELFORGE_LLM_API_KEY`  | API key for cloud services (stored only in your environment or file) |

```bash
# Local model through Ollama (default address 127.0.0.1:11434)
REELFORGE_LLM_PROVIDER=ollama REELFORGE_LLM_MODEL=qwen2.5:1.5b reelforge studio

# LM Studio, llama.cpp server, vLLM or any OpenAI-compatible endpoint
REELFORGE_LLM_BASE_URL=http://127.0.0.1:1234/v1 REELFORGE_LLM_MODEL=my-model reelforge studio

# A cloud API
REELFORGE_LLM_PROVIDER=anthropic REELFORGE_LLM_API_KEY=... reelforge studio
```

On Windows PowerShell set variables with `$env:REELFORGE_LLM_MODEL = "qwen2.5:1.5b"` before the command.
Answers are constrained to the component schemas (JSON Schema output where the server supports it, a
grammar on Ollama, otherwise a validate-and-repair loop). The dashboard shows which model is in use.

## Evaluating models

`scripts/eval-agents.mjs` runs one authoring task per industry against a model through the real tool
registry and scores each produced episode: created, valid, no overlaps, inside the safe zones, right
language, every line covered (and, with `--render`, renders).

```bash
pnpm build
node scripts/eval-agents.mjs --mock                                   # scripted model, offline (CI)
node scripts/eval-agents.mjs --base-url http://127.0.0.1:11434/v1 --model qwen2.5:7b
node scripts/eval-agents.mjs --base-url https://api.example.com/v1 --model my-model --api-key "$KEY" \
  --toolsets basic --tasks healthcare,finance --out results.md
```

The endpoint must speak OpenAI-compatible Chat Completions with tool calling. Publish results with this
table (the script writes it with `--out`):

| Model | Toolsets | Industry | Lang | Score | Calls | Tool errors | Time (s) |
| ----- | -------- | -------- | ---- | ----- | ----- | ----------- | -------- |
|       | basic    | …        | en   | %     |       |             |          |
|       | basic    | **all**  |      | **%** |       |             |          |

## Security {#security}

- The dashboard and editor bind to `127.0.0.1`. Every request must carry a loopback `Host` (or a name in
  `REELFORGE_ALLOWED_HOSTS`), which blocks DNS rebinding; no CORS headers are sent and writes are JSON-only.
- `reelforge studio --host <address>` (or `REELFORGE_HOST`) binds elsewhere. Then `/mcp` and `/api/v1`
  require `Authorization: Bearer <token>`, and other computers can reach only the AI endpoints, never the
  dashboard UI. `REELFORGE_REQUIRE_TOKEN=1` requires the token on loopback too.
- The token is created on first use and stored in the config folder (`token`, readable only by you where
  the system supports it). The Connect AI page shows it only to a browser on the same computer.
- Plain HTTP carries the token in clear text: on an untrusted network, put the dashboard behind a TLS proxy.
- Tools only read and write inside the project folder; renders are served only from `out/`.

ADR-015 records the full design.

## Tips

- **Ask the assistant to look.** Say _"preview the frames and fix anything that looks off"_. The
  assistant receives the frames as images.
- **Keep the voice human.** ReelForge never generates voices. Record yourself, let `align_cues`
  mark the lines and words, then listen through once in the editor's **Cues** mode and fix any line
  by ear.
- **Review in the editor.** Ask for `open_editor` to get a link. Everything the assistant wrote is
  editable visually, and every change can be undone.
- **Large changes:** the assistant can rewrite the whole `episode.yaml`. The file is checked before
  it is saved, and invalid YAML is refused.
