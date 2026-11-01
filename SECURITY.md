# Security policy

## Supported versions

| Version | Supported         |
| ------- | ----------------- |
| 1.0.x   | Yes               |
| < 1.0   | No (never public) |

Security fixes are released as patch versions of the latest minor release.

## Reporting a vulnerability

Please report vulnerabilities **privately**. Do not open a public issue, discussion or pull request.

1. Preferred: open a private report through
   [GitHub Security Advisories](https://github.com/TerminalDZ/vidcreat/security/advisories/new).
2. Or email **boukemoucheidriss@gmail.com** with the subject `ReelForge security`.

Include the affected version, your operating system, the steps to reproduce, and the impact you expect.
A proof of concept helps.

What to expect:

- an acknowledgement within 5 working days;
- an assessment and, if confirmed, a fix plan within 30 days;
- credit in the advisory and the changelog, unless you prefer to stay anonymous.

Please give us a reasonable time to release a fix before you disclose the issue publicly.

## Threat model

ReelForge is a local tool. It renders from files on your disk and runs two kinds of local HTTP servers
for its browser interfaces:

- the **dashboard** (`reelforge studio`), on `127.0.0.1:4310` by default;
- the **editor** (`reelforge edit`, `cue`, `dev`), on a local port per session.

The `reelforge mcp` server speaks over standard input and output by default; the HTTP endpoints `/mcp`
and `/api/v1` are served by the local servers.

The main threat is a malicious web page open in the same browser, or another device on the network,
trying to read or change your project through these servers. The protections:

- **Loopback by default.** Servers bind to `127.0.0.1` unless you explicitly choose another address.
- **DNS-rebinding protection.** Every request and WebSocket upgrade must carry a `Host` header that names
  the loopback address and port, and an `Origin` (when present) that matches it. Anything else is
  rejected.
- **No form-encodable writes.** State-changing requests are `POST` with
  `Content-Type: application/json` (other content types get 415), or `PUT` uploads (voice recording,
  assets, cues) and `DELETE /mcp`. Plain HTML forms cannot send any of them, and the browser preflights
  `PUT`/`DELETE`, which the servers refuse (no CORS), so cross-site request forgery is blocked; the
  Host/Origin check runs first on every request in any case.
- **Path sandboxing.** Every path is resolved inside the project root; episode ids and file names are
  validated, and output files are served only from `out/`.
- **Upload limits.** Voice uploads are size-capped and limited to audio file extensions, and request
  bodies have size limits.
- **Bearer token.** `/mcp` and `/api/v1` require `Authorization: Bearer <token>` when the server is bound
  to a non-loopback address, or always when `REELFORGE_REQUIRE_TOKEN=1`. The token is generated randomly
  on first run and stored in your user configuration folder.

Out of scope: an attacker who can already run code as your user, or read and write your project files;
vulnerabilities in FFmpeg, Chromium or Node.js themselves (report those upstream); and the content of
episodes you choose to render.

The optional speech models are downloaded once by `reelforge align --setup` and checked before use;
at run time, model files are only loaded from the local cache.

Design details: [ADR-012](docs/adr/012-project-dashboard.md) and
[ADR-015: Local server security](docs/adr/015-local-server-security.md).
