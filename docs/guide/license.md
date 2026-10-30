# License and credits

ReelForge is open source. The source code is licensed under the **Apache License 2.0**: you may use,
modify and redistribute it, including commercially, as long as you keep the license and the notices in
[`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE). The license also grants a patent license from every
contributor.

The documentation, the example scripts and episodes, and the sample text in the bundled themes and packs
are licensed under **Creative Commons Attribution 4.0 (CC BY 4.0)**; see the
[content license](../LICENSE-CONTENT.md) for the attribution line.

**The videos you create are yours**, for any use. Neither license places conditions on your recordings,
your scripts or your rendered output.

## Third-party components

ReelForge is built on open-source software and data, used under their own licenses (full texts in
[`THIRD-PARTY-NOTICES.md`](../../THIRD-PARTY-NOTICES.md)):

| Component                                   | License                                    |
| ------------------------------------------- | ------------------------------------------ |
| Bundled fonts (Cairo, Inter, Readex Pro, …) | SIL Open Font License 1.1                  |
| Playwright                                  | Apache-2.0                                 |
| zod, commander, ws                          | MIT                                        |
| yaml, zod-to-json-schema                    | ISC                                        |
| Icons (Lucide)                              | ISC                                        |
| RNNoise voice-cleanup model (`sh.rnnn`)     | Not subject to copyright (author's notice) |
| This site: VitePress                        | MIT                                        |

FFmpeg and Chromium are installed separately and are not distributed with ReelForge.

The optional speech models and their runtime (Whisper weights and Silero VAD, both MIT; the model
runtime packages under Apache-2.0, MIT and, for the libvips image library, LGPL-3.0-or-later) are
downloaded once by `reelforge align --setup` into your user cache folder. They are not part of the
ReelForge download.

## Contributing and support

Contributions are welcome under the Apache License 2.0; see [Contributing](contributing.md). For questions,
bug reports and feature requests, see [`SUPPORT.md`](../../SUPPORT.md). Please include your operating
system, the output of `reelforge doctor --json` and the command you ran with `--verbose`.
