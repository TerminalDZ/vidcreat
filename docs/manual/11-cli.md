# Command-line reference

On Windows use `reelforge.cmd`; on macOS/Linux `./reelforge` (or add the folder to your PATH).

![CLI help](assets/19-cli-help.png)

| Command                                                                | Description                                                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `reelforge studio`                                                     | Open the project dashboard                                                   |
| `reelforge new <id> [--series <name>] [--episode <n>] [--lang en\|ar]` | Create `episodes/<id>/episode.yaml`                                          |
| `reelforge edit <id>`                                                  | Open the visual editor                                                       |
| `reelforge cue <id> [--draft]`                                         | Open the editor in Cues mode (`--draft` writes estimated cues instead)       |
| `reelforge align <id> [--engine dsp\|whisper] [--force] [--dry-run]`   | Cues for every line and word from the recording (see below)                  |
| `reelforge align --setup [--model tiny\|base\|small]` / `--status`     | Install / show the optional speech models (one time, ~180 MB)                |
| `reelforge dev <id>`                                                   | Open the editor in Review mode                                               |
| `reelforge mcp`                                                        | Run the MCP server for AI assistants (see [AI agents & MCP](#ai-agents-mcp)) |
| `reelforge validate <id> [--strict] [--no-measure]`                    | Check everything; exit code 1 on errors (or warnings with `--strict`)        |
| `reelforge render <id> [options]` / `--all`                            | Render (see [Rendering](#rendering-and-outputs))                             |
| `reelforge snap <id> <times…> [--every 5] [--cover]`                   | PNG frames + contact sheet; times may be `12.5`, `l7`, `"l7:'word'"`         |
| `reelforge doctor [--fix]`                                             | Check the environment; `--fix` downloads Chromium                            |
| `reelforge theme new <name> --accent <#hex>`                           | Generate a theme                                                             |
| `reelforge schema [--out <file>]`                                      | Write the JSON Schema for editor autocompletion                              |

Global options: `--json` (machine-readable output, progress events while rendering), `--verbose`,
`--root <folder>` (project folder; default: the current folder).

![validate](assets/21-cli-validate.png)

`reelforge align` options: `--engine auto|dsp|whisper` (auto: Whisper when installed, else pause
detection), `--model tiny|base|small`, `--no-vad`, `--no-words` (line cues only), `--force` (replace cues
you marked by hand), `--dry-run` (print, don't write). `reelforge render --denoise` / `--no-denoise`
overrides `audio.denoise`.

## Environment variables

| Variable                                | Meaning                               |
| --------------------------------------- | ------------------------------------- |
| `REELFORGE_ROOT`                        | Project folder                        |
| `REELFORGE_PRESET`                      | Default preset                        |
| `REELFORGE_WORKERS`                     | Render processes                      |
| `REELFORGE_SHARE_SIZE`                  | Share size in MB                      |
| `REELFORGE_JPEG_QUALITY`                | Frame capture quality (default 95)    |
| `REELFORGE_PORT`                        | Dashboard / studio port               |
| `REELFORGE_NO_OPEN`                     | Do not open the browser automatically |
| `REELFORGE_FFMPEG`, `REELFORGE_FFPROBE` | Paths to ffmpeg / ffprobe             |
| `REELFORGE_CHROMIUM`                    | Path to a Chromium executable         |
| `REELFORGE_CACHE`                       | Folder for the optional speech models |
| `REELFORGE_OLLAMA`                      | Ollama URL (default 127.0.0.1:11434)  |
| `REELFORGE_LLM_MODEL`                   | Local LLM (default `qwen2.5:1.5b`)    |
| `NO_COLOR`                              | Disable colors                        |
