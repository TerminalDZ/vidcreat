<p align="center">
  <img src="docs/public/favicon.svg" alt="" width="64" height="64" />
</p>

<h1 align="center">ReelForge</h1>

<p align="center"><b>Turn a voice recording and one YAML file into a finished vertical explainer video.</b></p>

<p align="center">
  <a href="https://github.com/TerminalDZ/vidcreat/actions/workflows/ci.yml"><img src="https://github.com/TerminalDZ/vidcreat/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License: Apache-2.0" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-339933.svg" alt="Node.js 22 or newer" /></a>
  <a href="https://terminaldz.github.io/vidcreat"><img src="https://img.shields.io/badge/docs-English%20%7C%20%D8%A7%D9%84%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9-b8ff3c.svg" alt="Documentation in English and Arabic" /></a>
</p>

<p align="center">
  <b>English</b> · <a href="README.ar.md">العربية</a> · <a href="https://terminaldz.github.io/vidcreat">Documentation</a> · <a href="AGENTS.md">AGENTS.md</a>
</p>

<p align="center">
  <img src="docs/public/marketing/hero.jpg" alt="ReelForge: the visual editor with a selected element and a word-synced timeline, next to a rendered vertical frame from the healthcare example" width="100%" />
</p>

ReelForge renders 1080×1920 videos for TikTok, Reels and Shorts: animated charts, processes,
comparisons, diagrams, code and word-by-word captions in English and Arabic, all timed to the words
you say. You design in a visual editor, in YAML or through an AI assistant; ReelForge renders on your
computer with Chromium and FFmpeg.

<p align="center">
  <img src="docs/public/preview.gif" alt="A ReelForge video: software, hospital, port and real-estate scenes" width="260" />
</p>

## Why ReelForge

- **Timed to your words.** Every element enters on the word that names it (`enter: { at: "l3:'bucket'" }`).
  Word references survive a re-recording, so you rarely write absolute seconds.
- **Visual editor and dashboard.** A canvas with smart guides, layers, a schema-driven inspector, a
  timeline that snaps to spoken words, undo/redo, and a dashboard for episodes, recordings and renders.
- **62 components.** Titles, diagrams, bar, line and donut charts, KPI cards, steps, flows, org charts,
  funnels, maps, floor plans, schedules, chats, code, phone mock-ups and more, with strict schemas.
- **12 industry packs and 16 themes.** 36 templates with a few slots to fill, and 24 complete example
  episodes, one English and one Arabic for each pack.
- **English and Arabic.** Left-to-right and right-to-left captions, English terms kept in order inside
  Arabic sentences (`الـ client`), and bundled OFL fonts for both scripts.
- **Deterministic and local.** Frames come from a pure `render(t)`: the same inputs always give the
  same frames. No AI in the render engine, no text-to-speech, no generated images, no cloud service.
- **Checks before you render.** Validation covers the schema, cues, layout, platform safe zones, text
  overflow and reading speed, with line numbers and fix hints.
- **Platform-ready outputs.** A master MP4, a size-capped share MP4, captions (`.srt`), a contact sheet
  and `publish.md` with the cover text, caption, hashtags and pinned comment.
- **Optional local helpers.** Speech alignment marks every line and word from your recording, and
  scene suggestions propose components per line. `reelforge align --setup` downloads the speech models
  once; after that everything runs offline.

## Made for every industry

<p align="center">
  <img src="docs/public/marketing/industries.jpg" alt="Eight rendered frames from the healthcare, ports and logistics, finance, education, real estate, tech, food and manufacturing packs, in English and Arabic" width="100%" />
</p>

Each [industry pack](packs/) has its own theme, templates and two complete examples. All organizations
in the examples are fictional. Start from a template in the dashboard or on the command line:

```bash
./reelforge packs                                                    # list packs, templates and slots
./reelforge new clinic --pack healthcare --template patient-journey  # episodes/clinic/episode.yaml
```

## Components

<p align="center">
  <img src="docs/public/marketing/components.jpg" alt="A grid of rendered component frames grouped as text and code, diagrams and data, charts, structure, places, and time, people and media" width="100%" />
</p>

Every component has a strict schema and an animated entrance. See the
[component reference](docs/components.md) for all props, or open the **Gallery** in the dashboard to
browse components, themes and packs.

## How it works

<p align="center">
  <img src="docs/public/marketing/how-it-works.jpg" alt="Diagram: voice.wav and episode.yaml go into the editor or an AI client, then a local deterministic render, then master.mp4, share.mp4, captions, publish.md and a contact sheet" width="100%" />
</p>

An episode is one `episode.yaml`: the script (one spoken sentence per line), scenes, and the elements in
each scene, placed on a 1080 × 1000 stage.

```yaml
meta: { id: ep10, series: 'SYSTEM DESIGN', title: 'Rate Limiting', preset: tiktok, lang: en-US }
audio: { voice: voice.wav }
script:
  - text: 'Your API just got flooded with requests.'
scenes:
  - id: hook
    at: l1
    elements:
      - use: title
        props: { text: 'Flooded **API**' }
        place: { x: 60, y: 160, w: 960, h: 240 }
        enter: { at: "l1:'flooded'", anim: pop }
```

Record `voice.wav`, mark the cues (automatically with `reelforge align`, or by ear in the editor),
validate, and render. The [authoring guide](docs/authoring.md) covers time expressions, layout and
animation.

## Quick start

Requirements: Node.js 22 or newer and FFmpeg 6 or newer (the installers offer to install FFmpeg).

```bash
git clone https://github.com/TerminalDZ/vidcreat.git && cd vidcreat
./install.sh            # Windows: install.bat
./start.sh              # Windows: start.bat · macOS: ReelForge.command → http://127.0.0.1:4310
```

The dashboard creates episodes (blank or from a template), takes your recording, marks the cues,
validates and renders. The same steps on the command line (`reelforge.cmd` on Windows):

```bash
./reelforge new clinic --pack healthcare --template patient-journey   # or: ./reelforge new ep10 --lang en
./reelforge edit clinic                  # visual editor
./reelforge align clinic                 # cues for every line and word from voice.wav
./reelforge validate clinic              # checks with fix hints
./reelforge render clinic --silent       # render without a voice to preview
```

<p align="center">
  <img src="docs/public/marketing/dashboard.jpg" alt="The ReelForge dashboard with the New episode dialog: healthcare pack, patient journey template and its slots" width="100%" />
</p>

<p align="center">
  <img src="docs/public/marketing/editor.jpg" alt="The ReelForge editor: layers, canvas with safe zones, inspector and a timeline with scenes, script lines and element clips" width="100%" />
</p>

## AI integration

<p align="center">
  <img src="docs/public/marketing/ai-integration.jpg" alt="The Connect AI page of the dashboard, next to the three transports: MCP over stdio, MCP over HTTP, and REST with OpenAPI" width="100%" />
</p>

One tool registry, three ways in. Assistants create episodes from templates, edit scenes, validate,
look at preview frames and render.

```bash
./reelforge mcp                                  # MCP over stdio (the client starts ReelForge)
./reelforge studio                               # MCP over HTTP at http://127.0.0.1:4310/mcp
curl http://127.0.0.1:4310/api/v1/openapi.json   # REST + OpenAPI for any function-calling model
./reelforge mcp --toolsets basic                 # fewer tools for small models (basic, design, render, all)
open http://127.0.0.1:4310/connect               # copy-paste setup for each client
```

The project already includes MCP settings for several clients (`.mcp.json`, `.cursor/mcp.json`,
`.vscode/mcp.json`, `.gemini/settings.json`). Agents start with [AGENTS.md](AGENTS.md) and the task
guides in [skills/](skills/). The dashboard binds to `127.0.0.1`; see [SECURITY.md](SECURITY.md) for the
token used when it listens elsewhere.

## Arabic and right-to-left

<p align="center">
  <img src="docs/public/marketing/arabic.jpg" alt="Two pairs of frames, English and Arabic: the healthcare template in both languages, and a software example with English terms inside Arabic captions" width="100%" />
</p>

Set `lang: ar-EG` and captions run right to left with the same word-by-word highlight. English
technical terms stay in order inside Arabic sentences, and every pack template and example ships in
both languages. The documentation is available in [Arabic](https://terminaldz.github.io/vidcreat/ar/)
too.

## Documentation

- [Guide](https://terminaldz.github.io/vidcreat) (English) · [الدليل](https://terminaldz.github.io/vidcreat/ar/) (Arabic)
- Offline copy: `pnpm docs:build` builds `documentation/index.html`
- [Authoring reference](docs/authoring.md) · [Component reference](docs/components.md)
- Architecture: [English](docs/architecture.md) · [Arabic](docs/architecture-ar.md) ·
  [Architecture decisions (ADRs)](docs/adr/)
- For AI agents: [AGENTS.md](AGENTS.md) · [skills/](skills/)

## Project status and roadmap

ReelForge 1.0 is the first public release; see the [changelog](CHANGELOG.md). Tool names and
arguments follow semantic versioning ([ADR-014](docs/adr/014-one-tool-registry-three-transports.md)).
Planned next:

- **More formats.** 1.0 renders 9:16 only. Square, 4:5 and 16:9 come after a relative layout model
  ([ADR-016](docs/adr/016-vertical-only-formats.md)).
- **Arabic alignment fixture.** A recording of real Arabic speech with hand-checked word timings, to
  measure automatic cues on Arabic ([fixtures/align/ar-real](fixtures/align/ar-real/README.md)).
  Contributions welcome.

## Contributing

Components, themes, industry packs and skills are all welcome. [CONTRIBUTING.md](CONTRIBUTING.md)
covers the setup on Windows, macOS and Linux, the architecture and the quality gate
(`pnpm build && pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:browser`).
Questions: [Discussions](https://github.com/TerminalDZ/vidcreat/discussions) · Bugs:
[Issues](https://github.com/TerminalDZ/vidcreat/issues) · [Code of conduct](CODE_OF_CONDUCT.md) ·
[Support](SUPPORT.md).

## Security

Local servers bind to `127.0.0.1`, check Host and Origin, and accept JSON-only writes. Please report
vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

Code: [Apache License 2.0](LICENSE) ([NOTICE](NOTICE)). Documentation, example scripts and theme sample
text: [CC BY 4.0](docs/LICENSE-CONTENT.md). The videos you make are yours. Third-party components keep
their licenses ([THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)); FFmpeg, Chromium and the optional
speech models are installed separately and are not distributed with ReelForge.
