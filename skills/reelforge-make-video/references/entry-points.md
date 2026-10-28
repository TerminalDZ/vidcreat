# Entry points

The same tool registry is served three ways. Tool names, arguments and results are identical.

## MCP over stdio

```bash
node packages/cli/bin/reelforge.js mcp                     # all tools
node packages/cli/bin/reelforge.js mcp --toolsets basic    # fewer tools for small models
./reelforge mcp            # macOS / Linux wrapper
reelforge.cmd mcp          # Windows wrapper
```

Toolsets: `basic` (create, validate, preview, cues, guides), `design` (components, edits),
`render` (render, editor, doctor), `all`. Project configs already exist in `.mcp.json`,
`.cursor/mcp.json`, `.vscode/mcp.json` and `.gemini/settings.json`. Outside the project folder, add
`--root <path-to-project>`.

## MCP over HTTP and REST

Start the dashboard with `reelforge studio` (default `http://127.0.0.1:4310`).

- MCP Streamable HTTP: `http://127.0.0.1:4310/mcp` (`/mcp?toolsets=basic` for fewer tools).
- REST: `GET /api/v1/tools` lists tools with JSON Schemas; `POST /api/v1/tools/<name>` with the
  arguments as the JSON body runs one.
- OpenAPI: `GET /api/v1/openapi.json` (function calling, GPT Actions).
- Discovery: `/.well-known/mcp.json`; all docs in one file: `/llms-full.txt`; setup per client:
  `/connect`.

```bash
curl -s -X POST http://127.0.0.1:4310/api/v1/tools/validate_episode \
  -H 'Content-Type: application/json' -d '{"episode":"ep10"}'
```

The servers bind to 127.0.0.1 and accept JSON-only writes. When the person binds the dashboard to
another address, `/mcp` and `/api/v1` require the bearer token they give you.

## Command line

```bash
./reelforge new ep10 --lang en --series "SYSTEM DESIGN"
./reelforge cue ep10 --draft          # estimated cues
./reelforge align ep10                # cues from voice.wav
./reelforge validate ep10 --json      # machine-readable issues
./reelforge snap ep10 l1+1 "l3:'bucket'" --out out/snaps
./reelforge render ep10 --silent --json
./reelforge edit ep10                 # visual editor for the person
```

On Windows use `reelforge.cmd` instead of `./reelforge`. The CLI has no structured-edit command:
edit `episode.yaml` directly and run `validate` after each change.
