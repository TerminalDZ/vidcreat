# Support

ReelForge is an open-source project maintained in the open. Help is provided by the maintainer and the
community on a best-effort basis.

## Help yourself first

1. Run `reelforge doctor` (or open the dashboard and click the status pill at the top). It checks
   Node.js, FFmpeg, Chromium and the fonts, and prints the exact fix for each problem.
2. Run `reelforge validate <episode>`: every problem in an episode is listed with its file, line and a
   fix hint.
3. Read **Troubleshooting & FAQ** in the documentation: <https://terminaldz.github.io/vidcreat>
   (`pnpm docs` builds an offline copy in `documentation/index.html`).

## Where to ask

| You want to…                                  | Go to                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| Ask a question or share an episode            | [GitHub Discussions](https://github.com/TerminalDZ/vidcreat/discussions)                |
| Report a bug                                  | [Bug report](https://github.com/TerminalDZ/vidcreat/issues/new?template=bug_report.yml) |
| Request a feature, component or industry pack | [New issue](https://github.com/TerminalDZ/vidcreat/issues/new/choose)                   |
| Report a security vulnerability               | **Not** a public issue: follow [SECURITY.md](SECURITY.md)                               |

When you report a problem, include:

- your operating system and version,
- the output of `reelforge doctor --json`,
- the command you ran and its full output (add `--verbose`),
- the `episode.yaml` involved, if the problem is specific to an episode (remove anything private).

## What to expect

- Bugs with a clear reproduction are prioritized, especially rendering differences across platforms.
- Feature requests are discussed in the open; larger changes are recorded as architecture decisions in
  [docs/adr](docs/adr).
- There is no paid support and no response-time guarantee. Pull requests are the fastest way to get a
  fix in; see [CONTRIBUTING.md](CONTRIBUTING.md).

## About the optional helpers

The render engine contains no AI. Speech alignment and scene suggestions are optional helpers that run
locally. `reelforge align --setup` downloads the optional speech models once; after that, everything runs
offline. If alignment misbehaves, include the output of `reelforge align --status` and of
`reelforge align <episode> --verbose`.
