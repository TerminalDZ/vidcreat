# ADR-015: Local server security for AI endpoints

- Status: accepted · Date: 2026-11-01

## Context

ADR-012 kept the dashboard on 127.0.0.1 with same-origin checks. ADR-014 adds endpoints meant for
programs (`/mcp`, `/api/v1`) that can write episodes and start renders. Any web page the person
visits can send requests to localhost, and DNS rebinding can make such a page look same-origin to a
naive server. Some people also want to reach the dashboard from another machine (a container, WSL,
a second computer on their network).

## Decision

- **Bind address.** `reelforge studio` binds to 127.0.0.1. `--host <address>` (or `REELFORGE_HOST`)
  binds elsewhere; nothing else changes the default. The per-episode editor servers stay on
  127.0.0.1.
- **Host and Origin allow-list (DNS rebinding).** Every request and WebSocket must carry a Host
  header that is a loopback name (`127.0.0.0/8`, `localhost`, `[::1]`) on the server's port, the
  bind address itself when it is a specific address, or a name listed in `REELFORGE_ALLOWED_HOSTS`
  (comma separated, optionally with a port). An Origin header, when present, must name an allowed
  host the same way. Anything else gets 403.
- **No CORS.** No `Access-Control-Allow-Origin` header is ever sent, so other origins cannot read
  responses. Writes are JSON-only (`content-type: application/json`), which HTML forms cannot send.
- **Bearer token.** A token is created on first use: 32 random bytes, base64url, stored in the user
  config folder (`%APPDATA%\reelforge\token` on Windows, `~/Library/Application Support/reelforge/token`
  on macOS, `$XDG_CONFIG_HOME/reelforge/token` or `~/.config/reelforge/token` on Linux; overridable
  with `REELFORGE_CONFIG_DIR`), with mode 0600 in a 0700 folder where the platform supports it. It
  is required as `Authorization: Bearer <token>` on `/mcp` and `/api/v1` when the bind address is
  not loopback or `REELFORGE_REQUIRE_TOKEN=1`. Comparison is constant-time.
- **Remote peers.** When bound to another address, a client on another computer may reach only
  `/mcp`, `/api/v1`, `/llms.txt`, `/llms-full.txt` and `/.well-known/mcp.json`. The dashboard UI,
  its internal API and its WebSocket answer only to the same computer, because a Host header is
  trivial to forge outside a browser and those endpoints carry no token.
- **Token display.** The Connect AI page gets the token from `/api/connect` only when the request
  comes from this computer and the browser marks it same-origin (`Sec-Fetch-Site`).
- Path sandboxing (every path resolved inside the project root, outputs served only from `out/`)
  and upload limits (1 GB, audio types only) stay as in ADR-012.

## Consequences

The default stays local and needs no token, so existing setups keep working. Exposing the dashboard
is explicit, needs the token for every AI endpoint and still keeps the human UI on the local
machine. Plain HTTP carries the token in clear text: on an untrusted network, put the dashboard
behind a TLS proxy and list its host name in `REELFORGE_ALLOWED_HOSTS`.
