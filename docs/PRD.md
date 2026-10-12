# ReelForge — Product Requirements Document (PRD)

| Field | Value |
|---|---|
| Product | ReelForge |
| Version | 1.0 |
| Status | Draft for implementation |
| Owner | Idriss Boukmouche |
| Date | 2026-10-15 |
| Related docs | `SRS.md` (software requirements), `docs/adr/*` (architecture decision records) |

---

## 1. Summary

ReelForge is an offline, open-source command-line tool and local studio that turns a **voice recording + a declarative episode file (YAML)** into a **finished vertical explainer video** (1080×1920, 30 fps) for TikTok, Instagram Reels and YouTube Shorts.

It produces the same quality as the "System Design بالعربي" Season 1 reels: animated technical diagrams, code that types itself, race-condition lanes, stamps, word-by-word Arabic captions with correct mixing of English terms, procedural sound effects, and platform-ready encoding.

The render engine uses **no AI or ML models**: frames are deterministic. Optional local helpers (speech alignment and scene suggestions, added after v1; see ADR-013) never touch rendering. It costs **nothing** to run: everything is local, free and open source.

## 2. Problem

Making one technical reel by hand takes hours in a video editor (After Effects, CapCut, Premiere):

- Diagrams, arrows and code have to be animated keyframe by keyframe.
- Arabic captions that mix in English terms break: words flip order, "الـ" detaches from its English noun, and punctuation lands on the wrong side.
- Timing animation to the voice is manual and fragile. Re-recording one sentence shifts everything after it.
- Results are inconsistent across episodes, which weakens a series' brand.
- Paid tools and AI generators cost money, need internet, and produce a generic look.

## 3. Goals

| ID | Goal | Measure of success |
|---|---|---|
| G1 | Produce a publish-ready episode from voice + YAML with no manual video editing | Season 1 (9 episodes) fully reproducible from `examples/season1` |
| G2 | Cut production time per episode | Under 60 minutes from finished recording to final MP4, author time (excluding unattended rendering) |
| G3 | Zero cost, no AI in the render engine, offline | No paid service, no network call during cue/dev/render, no ML model in the render path (optional local speech models are downloaded on demand and never used for rendering; ADR-013) |
| G4 | First-class Arabic RTL with mixed English | 100% of the caption fixture suite passes (section 9 of the SRS) |
| G5 | Consistent series identity | All episodes share theme tokens, header, chapter labels and transitions with no per-episode CSS |
| G6 | Deterministic, re-renderable output | Same inputs produce byte-identical frames (excluding encoder metadata) |
| G7 | Platform-ready files | Output passes TikTok, Reels and Shorts upload specs; a "share" file under a configurable size (default 28 MB) |

## 4. Non-goals (v1)

- Generating scripts, voices or visuals with AI.
- Speech recognition in v1. Timing comes from human-marked cues. (Later releases add optional local speech alignment, `reelforge align`; see ADR-013.)
- Uploading or scheduling posts to TikTok or Instagram. Their APIs need app review, so this is out of scope.
- A drag-and-drop timeline editor. YAML is the source of truth; the studio is for preview and cue marking. (Later releases add a visual editor that writes `episode.yaml` through structured edits; YAML stays the source of truth, ADR-002.)
- 3D, video footage compositing, or camera recordings of the author.
- Cloud rendering, user accounts or a hosted service.

## 5. Users

| Persona | Description | Main need |
|---|---|---|
| **Author** (primary) | A senior engineer making a technical series in Arabic (Egyptian or Maghrebi) with English terms. Comfortable with Git, YAML and a terminal. | Turn knowledge into polished reels fast and with consistent quality |
| **Contributor** | A developer who adds a new visual component (for example a "queue" or "load balancer" widget) | A clear component API, a dev preview and golden tests |
| **Educator** | A trainer reusing the tool for course clips (workshops, Algérie Télécom courses) | Templates and a theme they can rebrand |

## 6. User journey (happy path)

1. **Write the script.** `reelforge new ep10` creates `episodes/ep10/episode.yaml` with a script section, one line per spoken sentence.
2. **Record the voice.** The author records `voice.wav` with any recorder.
3. **Mark cues.** `reelforge cue ep10` opens the local studio. The audio plays, each script line is shown, and the author presses **Space** at the start of each line. Cues are saved to `cues.json`. The author can nudge cues by ±50 ms and re-mark any single line.
4. **Describe scenes.** The author writes scenes in YAML from the component library, referencing lines and words ("at: `l12:'Idempotency'`").
5. **Preview live.** `reelforge dev ep10` shows the video synced to the audio, with a scrubber, a safe-zone overlay, cue markers and lint warnings. It hot-reloads on save.
6. **Validate.** `reelforge validate ep10` checks the schema, cues, timing overlaps, safe zones and text overflow.
7. **Render.** `reelforge render ep10` produces `out/ep10.master.mp4` (high quality) and `out/ep10.share.mp4` (size-capped), plus `out/ep10.sheet.jpg` (contact sheet) and `out/ep10.srt`.
8. **Publish.** The author uploads the share file with a caption from `publish.md`, which ReelForge fills in from metadata.

## 7. Features and scope

### 7.1 Must have (v1)

| ID | Feature | Notes |
|---|---|---|
| F1 | **Episode spec (YAML)**: metadata, script lines, chapters, scenes, elements, timing expressions | Validated by schema with precise, line-numbered errors |
| F2 | **Cue marker** in the local studio | Space to mark, Backspace to undo, arrow keys to nudge, click a line to re-mark it, waveform view |
| F3 | **Timing expressions**: absolute seconds, line references, word references within a line, offsets | Example: `l7`, `l7+0.4`, `l7:'timeout'`, `l7.3`, `12.5s` |
| F4 | **Component library** (at least 20 components, SRS §6) | Node, Arrow, Code, Table, Chip, Stamp, Title, Lanes, Checklist, Phone, Trap, CTA, Counter, Meter, Timeline, Grid, Packet, Bucket, Quote, Particles |
| F5 | **Animation primitives**: pop, slide, fade, draw, type, count, shake, glitch, pulse, flip | Pure functions of time |
| F6 | **Caption engine**: chunking, karaoke word highlight, correct RTL/LTR mixing | Rules in SRS §9 |
| F7 | **Series chrome**: header, chapter label, progress bar, waveform, background glow, grain, vignette, flash on hits | Driven by theme tokens |
| F8 | **Themes**: color, type and motion tokens in one file; per-series override | Default theme = the Season 1 look |
| F9 | **Procedural SFX**: whoosh, hit, ding, error, glitch, tick, typing. Auto-attached to component events, overridable | No sample files needed |
| F10 | **Audio mastering**: voice loudness to −14 LUFS, SFX ducked under voice, limiter | ffmpeg filters |
| F11 | **Renderer**: deterministic frame capture with parallel workers and segment concatenation | Headless Chromium + ffmpeg |
| F12 | **Encoding presets**: master and share outputs, size-targeted bitrate, platform presets (tiktok, reels, shorts) | H.264 High, yuv420p, AAC 48 kHz, faststart |
| F13 | **Dev studio**: live preview synced to audio, scrubber, safe-zone overlay, hot reload, lint panel | Local web app |
| F14 | **Validator / linter**: schema, cue coverage, element overlap, off-canvas, safe-zone and text-overflow checks | Also runs before render |
| F15 | **Outputs**: master MP4, share MP4, SRT captions, contact sheet, `publish.md` | |
| F16 | **CLI**: `new`, `cue`, `dev`, `validate`, `render`, `snap`, `doctor` | Cross-platform: Linux, macOS, Windows |
| F17 | **Examples**: Season 1 episodes 01–09 as YAML specs | Serve as documentation and regression tests |

### 7.2 Should have (v1.1)

- Partial re-render: only re-render scenes whose spec or cues changed (frame cache keyed by scene hash).
- Cover image export: a 1080×1920 PNG thumbnail of a chosen time or scene.
- Batch render: `reelforge render --all`.
- Theme generator: `reelforge theme new` from a base accent color.

### 7.3 Could have (later)

- 16:9 layout preset for YouTube long-form chapters.
- Custom component plugins loaded from the project folder.
- Optional classical forced alignment (non-ML) to suggest cues.

## 8. Quality bar

The output must look like a motion designer made it, not a slideshow:

- Every element enters with intent (pop, slide, draw, type), on the word that names it.
- Nothing appears without a voice reason. Nothing important sits in the platform UI zones.
- Captions are always readable: high contrast, maximum 2 lines, the active word highlighted, English terms in a distinct color.
- Transitions between scenes are smooth (blur and scale crossfade). Hits (crash, trap, stamp) get a flash, a shake and a sound.
- Typography: a display face for titles, a monospace face for code and labels, an Arabic face for captions. All fonts bundled, with no fallback glyphs.

## 9. Constraints

| Constraint | Detail |
|---|---|
| Cost | Only free, open-source dependencies with permissive or OFL licenses. ffmpeg is used as an external system binary. |
| No AI in the render engine | No TTS, no generative models, no ML inference in the render path. Optional speech alignment models are downloaded on demand by `reelforge align --setup`, never bundled |
| Offline | No network access needed after install (and after `reelforge align --setup`, if the optional speech models are used). Fonts and libraries are vendored. |
| Hardware | Must run on a 4-core laptop with 8 GB RAM. Faster machines scale with more workers. |
| OS | Linux, macOS, Windows 10+ (ffmpeg and Chromium installed by `reelforge doctor --fix` or documented steps) |
| Engineering principles | SOLID, DRY, KISS, YAGNI, 12-Factor (config by environment and flags), ADRs for every significant decision |

## 10. Success metrics

| Metric | Target |
|---|---|
| Author time per episode, after recording | ≤ 60 min |
| Render time for a 120 s episode on an 8-thread CPU | ≤ 15 min (master + share) |
| Season 1 reproduction | 9/9 episodes render from YAML with no code changes |
| Caption fixture pass rate | 100% |
| Validation catch rate | Every overlap, off-canvas or safe-zone issue in the seeded-bug fixtures is reported |
| Determinism | Two renders of the same inputs give identical frame hashes |

## 11. Release plan

| Milestone | Content | Exit criteria |
|---|---|---|
| M1 — Core | Spec schema, time expressions, caption engine, theme, 8 base components, render pipeline, CLI `render` | EP01 renders from YAML |
| M2 — Studio | Cue marker, dev preview with hot reload, validator and lint panel | Author can make EP02 without touching code |
| M3 — Library | All 20 components, SFX auto-attach, outputs (SRT, sheet, publish.md), presets | All 9 Season 1 episodes reproduced |
| M4 — Hardening | Golden-frame tests, determinism test, Windows and macOS CI, docs, `doctor` | All metrics in §10 met |

## 12. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Arabic shaping or bidi differs across Chromium versions | Broken captions | Pin the Playwright and Chromium version; caption fixtures with golden frames |
| Slow rendering on weak machines | Poor experience | Parallel workers, JPEG capture, pre-baked grain textures, partial re-render (v1.1) |
| YAML becomes verbose for complex scenes | Author friction | Sensible defaults, layout helpers (rows, columns, lanes), scene templates |
| ffmpeg missing or an incompatible build | Render fails | `reelforge doctor` checks version and codecs, with install hints per OS |
| Platform UI covers content | Lower watch time | Safe-zone presets per platform and a validator rule |

## 13. Open questions

1. Repository license: MIT (recommended, maximizes adoption) or Apache-2.0?
2. Should the default theme ship as the "System Design بالعربي" look, or as a neutral theme with Season 1 as an example theme?
3. Should 60 fps output be supported in v1? Proposed: no (YAGNI); 30 fps matches the platforms.
