# ReelForge — Software Requirements Specification (SRS)

| Field | Value |
|---|---|
| Product | ReelForge |
| Version | 1.0 |
| Status | Draft for implementation |
| Derived from | `PRD.md` v1.0 |
| Date | 2026-10-15 |

Requirement keywords **MUST**, **SHOULD** and **MAY** follow RFC 2119. Every requirement has an ID (`FR-*`, `NFR-*`, `IR-*`, `DR-*`) for traceability to PRD features (`F*`) and goals (`G*`).

---

## 1. Introduction

### 1.1 Purpose
This document specifies the behavior, interfaces, data formats, algorithms and quality attributes of ReelForge v1. It is precise enough for an implementer to build the system and for a tester to verify it without further clarification.

### 1.2 Scope
ReelForge consists of:
- **Core:** spec schema, time resolver, scene compiler, caption engine, theme system.
- **Component library:** visual building blocks rendered as DOM/SVG in a 1080×1920 page.
- **Runtime:** a single-page renderer exposing a pure `render(t)` function.
- **Studio:** a local web app for cue marking and live preview.
- **Renderer:** headless Chromium frame capture plus ffmpeg encoding.
- **Audio:** procedural SFX synthesis plus mastering.
- **CLI:** the entry point for every workflow.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| Episode | One video: a folder with `episode.yaml`, `voice.wav` and `cues.json` |
| Script line | One spoken sentence or phrase in `script`, with a stable id (`l1`, `l2`, … or custom) |
| Cue | The start time in seconds of a script line, marked by the author |
| Scene | A time range that owns a set of elements and a glow color |
| Element | An instance of a component with props and timed states |
| Time expression | A string that resolves to seconds (§5) |
| Stage | The content area of the canvas between the header and the captions |
| Safe zone | A canvas area not covered by platform UI |
| Master / Share | High-quality output / size-capped output for upload |

### 1.4 References
- PRD.md v1.0
- TikTok, Reels and Shorts upload specs (9:16, H.264, AAC)
- EBU R128 / ITU-R BS.1770 loudness (via ffmpeg `loudnorm`)
- Unicode Bidirectional Algorithm (UAX #9)

---

## 2. Overall description

### 2.1 Architecture

```
               ┌────────────── CLI (reelforge) ──────────────┐
               │ new · cue · dev · validate · render · snap  │
               └───────┬───────────────┬───────────────┬─────┘
                       │               │               │
              ┌────────▼──────┐  ┌─────▼──────┐  ┌─────▼────────┐
              │  Core         │  │  Studio    │  │  Renderer    │
              │  schema       │  │  (Vite)    │  │  Playwright  │
              │  time resolver│  │  cue marker│  │  workers     │
              │  compiler     │  │  preview   │  │  ffmpeg      │
              │  captions     │  │  lint UI   │  │  encoder     │
              └──────┬────────┘  └─────┬──────┘  └─────┬────────┘
                     │   compiled timeline (JSON)      │
                     └──────────────┬──────────────────┘
                              ┌─────▼──────┐        ┌────────────┐
                              │  Runtime   │        │  Audio     │
                              │  render(t) │        │  SFX synth │
                              │  components│        │  mastering │
                              └────────────┘        └────────────┘
```

**Data flow:** `episode.yaml` + `cues.json` → **Core** validates and compiles them into a `Timeline` (all times resolved to seconds, all defaults applied) → **Runtime** loads the `Timeline` and exposes `render(t)` → **Renderer** calls `render(t)` for every frame and pipes the frames to ffmpeg → **Audio** builds `sfx.wav` from timeline events → ffmpeg muxes and encodes.

### 2.2 Design principles (binding)
- **Pure time function.** The visual state at time `t` MUST depend only on `(Timeline, t)`. No accumulated state, no wall clock, no `Math.random`. This makes parallel and partial rendering correct.
- **One source of truth.** YAML is the only authoring surface. The studio never writes scene data; it writes only `cues.json`.
- **Composition over configuration.** Components are small and composable. Layout helpers place them; components do not know about scenes.
- **KISS / YAGNI.** No plugin system, no timeline GUI and no 60 fps in v1.

### 2.3 Technology stack

| Concern | Choice | Reason |
|---|---|---|
| Language | TypeScript 5 (strict) on Node.js 22 LTS | One language for CLI, studio and runtime |
| Package manager | pnpm workspaces | Monorepo with fast installs |
| Schema | zod, plus JSON Schema export for editor autocompletion | Typed validation with good error messages |
| YAML | `yaml` package (keeps source positions) | Line-numbered errors |
| Browser | Playwright with its pinned Chromium | Deterministic text shaping and rendering |
| Studio | Vite + vanilla TS (no framework) | KISS; the runtime is framework-free DOM |
| Video/audio | System ffmpeg ≥ 6.0 (libx264, aac) | Standard, free |
| Testing | Vitest (unit), pixelmatch (golden frames) | Fast, no browser needed for unit tests |
| Fonts | Cairo (Arabic, OFL), JetBrains Mono (OFL), Space Grotesk (OFL) via @fontsource, vendored | Offline and license-clean |

### 2.4 Repository layout

```
reelforge/
  packages/
    core/        schema, time resolver, compiler, captions, theme
    runtime/     render(t), chrome, components, animation primitives
    audio/       sfx synthesis, mixing plan
    renderer/    playwright workers, ffmpeg pipeline, presets
    studio/      cue marker + preview (Vite app)
    cli/         command entry points
  themes/        default.theme.yaml, season1.theme.yaml
  examples/
    season1/ep01 … ep09   episode.yaml, cues.json (voice.wav not committed)
  fixtures/      caption cases, golden frames, seeded-bug specs
  docs/          PRD.md, SRS.md, adr/, components.md
```

### 2.5 Operating environment
Linux, macOS 13+, Windows 10+. CPU with 4 or more cores, 8 GB RAM, 2 GB free disk per render (temporary segments).

---

## 3. Data requirements

### 3.1 Episode folder (DR-1)

```
episodes/<id>/
  episode.yaml     required
  voice.wav        required (any sample rate; mono or stereo)
  cues.json        required for render; created by `reelforge cue`
  assets/          optional (svg icons, images)
  out/             generated
```

### 3.2 `episode.yaml` schema (DR-2)

```yaml
meta:
  id: ep01                          # string, slug, unique
  series: "SYSTEM DESIGN"           # header left text
  title: "Idempotency"
  episode: 1                        # integer ≥ 1
  preset: tiktok                    # tiktok | reels | shorts
  theme: season1                    # file in themes/ or a relative path
  lang: ar-EG                       # caption language tag; sets direction
  publish:                          # used to generate publish.md
    cover: "اتخصم منك مرتين؟"
    caption: |
      ...
    hashtags: ["#systemdesign", "#برمجة"]
    pinned: "..."

audio:
  voice: voice.wav
  sfx: auto                         # auto | none | manual
  sfx_gain_db: -16                  # SFX level relative to voice
  extra: []                         # manual events: {at: <time>, sound: hit|whoosh|ding|err|glitch|tick, gain_db?}

script:                             # ordered; the caption source; the cue targets
  - id: l1                          # optional; defaults to l<index>
    text: "عمرك دفعت حاجة أونلاين، والنت فصل؟"
    caption: auto                   # auto | none | "custom text shown instead"
    break: ["والنت"]                # optional: force a new caption chunk before these words

chapters:
  - { at: l1,  label: "01 · THE PROBLEM" }
  - { at: l18, label: "02 · THE FIX" }

scenes:
  - id: hook
    at: l1                          # start; the end defaults to the next scene's start
    end: l5+0.2                     # optional
    glow: red                       # theme color name, or a list of {at, color}
    transition: crossfade           # crossfade | cut | slide-up
    layout: stage                   # stage | full
    elements:
      - use: phone                  # component name (§6)
        id: phone
        props: { title: "Checkout", amount: "$49.00" }
        place: { x: 320, y: 30, w: 440, h: 880 }   # stage coordinates, px
        enter: { at: l1, anim: rise, dur: 0.6 }
        exit:  { at: l5, anim: fade }
        states:
          - { at: "l2:'فصل'", set: { offline: true } }
          - { at: "l4", set: { notifications: 2 } }
        fx:
          - { at: "l4:'مرتين'", do: shake, amp: 22 }
          - { at: "l4:'مرتين'", do: flash, color: red }
```

Schema rules:
- **DR-2.1** `meta.id`, `script` (≥ 1 line) and `scenes` (≥ 1) MUST exist.
- **DR-2.2** Script ids MUST be unique. Scene ids and element ids MUST be unique within the episode.
- **DR-2.3** Every time expression MUST resolve (§5), or validation fails with the YAML line and column.
- **DR-2.4** `place` values are integers in stage coordinates. The stage is 1080 wide and 1000 high by default, offset per preset (§8).
- **DR-2.5** Unknown keys MUST be rejected (strict schema) with a "did you mean" suggestion when the edit distance is ≤ 2.

### 3.3 `cues.json` (DR-3)

```json
{
  "version": 1,
  "audio": { "file": "voice.wav", "duration": 90.2, "sha1": "…" },
  "cues": { "l1": 0.00, "l2": 1.44, "l3": 2.50 },
  "words": { "l2": [1.44, 1.80] },
  "updated": "2026-10-18T14:03:00Z"
}
```
- **DR-3.1** `cues` MUST contain every script id. Values MUST be non-decreasing in script order.
- **DR-3.2** `words` is optional manual word-level overrides (§5.3).
- **DR-3.3** If `audio.sha1` does not match the current `voice.wav`, validation MUST warn: "voice changed since cues were marked".

### 3.4 Theme file (DR-4)

```yaml
name: season1
colors:   { bg: "#07080c", ink: "#eef1f7", dim: "#7d8496", line: "#222735", card: "#10131b",
            lime: "#b8ff3c", cyan: "#55dcff", red: "#ff4a5c", amber: "#ffb238", violet: "#c792ff" }
fonts:    { display: "Space Grotesk", mono: "JetBrains Mono", arabic: "Cairo" }
type:     { caption: 66, title: 120, h2: 84, body: 32, label: 24 }
chrome:   { header: true, progress: true, waveform: true, grain: 0.07, vignette: 0.75, grid: true }
motion:   { pop_overshoot: 1.9, default_dur: 0.45, crossfade: 0.3 }
captions: { active: lime, english: cyan, future_opacity: 0.32, max_lines: 2, max_chars: 34 }
```

### 3.5 Compiled timeline (DR-5)
The Core MUST output a `timeline.json` with all times in seconds, all defaults applied and all theme tokens resolved. The Runtime MUST accept only this format and never the raw YAML. This is the contract between Core and Runtime.

---

## 4. Functional requirements

### 4.1 CLI (F16)

| ID | Command | Behavior |
|---|---|---|
| FR-CLI-1 | `reelforge new <id> [--series <name>]` | Creates the episode folder with a commented `episode.yaml` template |
| FR-CLI-2 | `reelforge cue <id>` | Starts the studio in cue mode; writes `cues.json` on save |
| FR-CLI-3 | `reelforge dev <id>` | Starts the studio in preview mode with hot reload |
| FR-CLI-4 | `reelforge validate <id> [--strict]` | Runs the schema check and all lint rules (§10); exit code 1 on errors, or on warnings with `--strict` |
| FR-CLI-5 | `reelforge render <id> [--preset] [--workers N] [--from t --to t] [--share-size MB] [--no-sfx]` | Full pipeline (§7); prints progress with frames/s and ETA |
| FR-CLI-6 | `reelforge snap <id> <t...> \| --every 5` | Writes PNG frames and a contact-sheet JPEG |
| FR-CLI-7 | `reelforge doctor [--fix]` | Checks Node, ffmpeg (version, libx264, aac), Playwright Chromium and fonts; prints install steps per OS |
| FR-CLI-8 | Global | `--verbose`, `--json` (machine-readable output), `NO_COLOR` support; config through flags and `REELFORGE_*` environment variables (12-Factor) |

### 4.2 Cue marker (F2)

| ID | Requirement |
|---|---|
| FR-CUE-1 | Shows a waveform of `voice.wav`, the script lines as a list, the current line highlighted, and a playhead |
| FR-CUE-2 | **Space** marks the next unmarked line at the current playhead time. Visual and audible feedback: a click sound and a flash on the line. |
| FR-CUE-3 | **Backspace** removes the last mark. Clicking a line selects it for re-marking. **←/→** nudge the selected cue by 50 ms (**Shift**: 10 ms). |
| FR-CUE-4 | Playback speed 0.5×, 0.75× and 1× (marking at slower speed improves accuracy) |
| FR-CUE-5 | Auto-save to `cues.json` on every change (atomic write: temporary file, then rename) |
| FR-CUE-6 | "Snap to onset": optionally moves a cue to the nearest energy rise within ±120 ms (RMS-envelope based, deterministic, no ML) |
| FR-CUE-7 | Word mode (optional): for the selected line, mark individual word starts the same way; saved to `words` |

### 4.3 Dev studio (F13)

| ID | Requirement |
|---|---|
| FR-DEV-1 | Renders the runtime at true 1080×1920, scaled to fit the window, synced to audio playback (`audio.currentTime` drives `render(t)`) |
| FR-DEV-2 | Scrubber with chapter and scene markers and cue ticks; **J/K/L** playback keys; **,/.** frame step |
| FR-DEV-3 | Hot reload: saving `episode.yaml`, the theme or `cues.json` recompiles and re-renders within 300 ms, keeping the playhead position |
| FR-DEV-4 | Overlays (toggle): safe zones for the active preset, stage bounds, element boxes with ids, and a time readout |
| FR-DEV-5 | Lint panel listing validation issues with click-to-jump to the time and to the YAML line |
| FR-DEV-6 | Errors in YAML show an overlay with the message and source position; the last good timeline stays visible |

### 4.4 Core compiler (F1, F3)

| ID | Requirement |
|---|---|
| FR-CORE-1 | Parse YAML with source positions, validate with zod, and report all errors (not only the first) |
| FR-CORE-2 | Resolve every time expression (§5) to seconds with 3-decimal precision |
| FR-CORE-3 | Compute scene ends (the next scene's start when omitted) and clamp element enter/exit times to their scene |
| FR-CORE-4 | Build caption chunks from script lines (§9) with word start times |
| FR-CORE-5 | Collect SFX events: component events (§6) plus `audio.extra`, deduplicating events closer than 80 ms |
| FR-CORE-6 | Output `timeline.json` (DR-5) and a hash per scene (for partial re-render in v1.1) |

### 4.5 Runtime (F4, F5, F7)

| ID | Requirement |
|---|---|
| FR-RT-1 | Exposes `window.reelforge = { ready: Promise<void>, render(t: number): void, duration: number }` |
| FR-RT-2 | `ready` resolves only after all fonts are loaded (`document.fonts.ready`) and the timeline is mounted |
| FR-RT-3 | `render(t)` MUST be idempotent: calling it with the same `t` in any order produces identical pixels |
| FR-RT-4 | Scene visibility: the opacity crossfade, scale (0.97→1) and blur (8→0 px) transition, using `motion.crossfade` |
| FR-RT-5 | Chrome: header (series, chapter label), progress bar, background glow that interpolates scene glow colors over 0.8 s, animated grid, grain (from 8 pre-generated tiles chosen by frame index), vignette, flash layer, audio-reactive waveform from a precomputed RMS envelope |
| FR-RT-6 | Animation primitives (§6.2) are shared, pure, and parameterized by easing |
| FR-RT-7 | Random-looking effects (glitch, particles, shake) use a seeded hash `rnd(seed)`; never `Math.random` |
| FR-RT-8 | Performance: `render(t)` MUST finish in ≤ 12 ms at the 95th percentile on the reference machine (NFR-1) |

### 4.6 Renderer (F11, F12, F15)

| ID | Requirement |
|---|---|
| FR-REN-1 | Launch N Chromium workers (default: CPU cores − 1, minimum 1). Each renders a contiguous frame range `[a, b)`. |
| FR-REN-2 | Per frame: `render(f/fps)`, then a viewport screenshot (JPEG quality 95 by default; `--lossless` uses PNG), streamed into an ffmpeg process per worker (`image2pipe`, mjpeg) encoding an intermediate segment (x264, CRF 14, `-preset veryfast`) |
| FR-REN-3 | Concatenate segments with the concat demuxer (stream copy). Verify that the total frame count equals `ceil(duration × fps)`. |
| FR-REN-4 | Audio: build `sfx.wav` (§7.3), master the voice and mix (§7.4) |
| FR-REN-5 | **Master output:** H.264 High, CRF 18, `-preset slow` (or `medium` with `--fast`), yuv420p, 30 fps CFR, AAC 192 kb/s 48 kHz, `+faststart` |
| FR-REN-6 | **Share output:** two-pass, size-targeted: `video_kbps = floor((share_MB × 8192 × 0.97) / duration) − audio_kbps`, AAC 128 kb/s, maxrate 1.5×, bufsize 3×. Default `share_MB` = 28. |
| FR-REN-7 | Also write `<id>.srt` (from caption chunks), `<id>.sheet.jpg` (12 evenly spaced frames) and `publish.md` (from `meta.publish`) |
| FR-REN-8 | Progress: frames done / total, frames per second, ETA. Cleanly abort on SIGINT and remove partial files. |
| FR-REN-9 | Partial render: `--from/--to` renders only that time range to `<id>.part.mp4` (for quick checks) |
| FR-REN-10 | Temporary files go in `out/.tmp/<run-id>/` and are deleted on success; kept on failure with `--keep-tmp` |

### 4.7 Validation and lint (F14)
See §10 for the rule list.

---

## 5. Time expressions (F3)

### 5.1 Grammar

```
expr      := base offset?
base      := seconds | lineRef | wordRef | sceneRef
seconds   := NUMBER "s"                       e.g. 12.5s
lineRef   := LINE_ID                          e.g. l7      (cue start of line l7)
           | LINE_ID ".end"                   e.g. l7.end  (start of the next line, minus 0.15 s)
wordRef   := LINE_ID ":" QUOTED_WORD          e.g. l7:'timeout'  (first match)
           | LINE_ID ":" QUOTED_WORD "#" INT  e.g. l7:'الاتنين'#2 (second match)
           | LINE_ID "." INT                  e.g. l7.3    (4th word, 0-based)
sceneRef  := "@" SCENE_ID ("." ("start"|"end"))?
offset    := ("+"|"-") NUMBER                 seconds, e.g. +0.4
```

### 5.2 Word timing estimation (deterministic, no ML)
When no manual `words` exist for a line, the word start times inside the line are estimated:
1. `span = next_cue − cue − tail`, with `tail = 0.18 s` (end-of-line pause).
2. Weight per word `w_i = max(2, letters(word_i))`, ignoring punctuation `، ؟ . , ? !`.
3. `start_i = cue + span × Σ_{j<i} w_j / Σ w`.

### 5.3 Overrides
If `cues.words[lineId]` exists, it MUST be used instead of the estimate for that line.

### 5.4 Errors
Unknown line id, word not found, an index out of range, or a result below 0 or above the duration → a validation error that names the expression, the YAML position and the closest valid alternative.

---

## 6. Component library (F4)

### 6.1 Contract
Each component is a module with:
```ts
interface Component<P> {
  name: string;
  schema: ZodType<P>;                  // props validation
  mount(root: HTMLElement, props: P, theme: Theme): Instance;
  events?: (props: P) => SfxEvent[];   // default SFX hooks (e.g. stamp → hit)
}
interface Instance {
  update(t: number, local: LocalTime, state: ResolvedState): void; // pure w.r.t. inputs
}
```
`LocalTime` gives `enterP` (0..1 eased progress), `exitP`, and seconds since enter. `ResolvedState` is the merge of all `states[].set` whose `at ≤ t`.

### 6.2 Animation primitives

| Name | Effect | Parameters |
|---|---|---|
| `pop` | Fade + scale from `s0` with back-overshoot + rise from `dy` | `s0=0.8, dy=40, dur=0.45` |
| `rise` / `slide-l` / `slide-r` | Fade + translate | `dist=40` |
| `fade` | Opacity | `dur` |
| `draw` | SVG stroke-dashoffset from length to 0 | `dur` |
| `type` | Reveal text by characters at `cps`, blinking caret | `cps=28, caret=true` |
| `count` | Number interpolation with locale formatting | `from, to, ease` |
| `shake` | Seeded jitter decaying over `dur` | `amp=18, dur=0.45` |
| `glitch` | RGB-split text shadow, seeded, for `dur` | `amp=30` |
| `pulse` | Glow or scale breathing | `rate, amp` |
| `stamp` | Scale from 2.2→1 with tilt, then hit flash | `rot=-5` |

Easings: `easeOutCubic`, `easeInOutCubic`, `easeOutBack(c1=1.9)`, `linear`.

### 6.3 Catalog (v1, minimum 20)

| Component | Purpose | Key props | Default SFX |
|---|---|---|---|
| `title` | Big display text, mixed colors via `**accent**` markup | `text, size, align, color` | whoosh |
| `label` | Small uppercase mono label | `text, color` | — |
| `code` | Code card with token colors and typing | `lines[{text, color?, at?}], fontSize, highlight[]` | tick per char |
| `node` | Box with title and sub-status; status changes with color | `title, sub, color, status` | — |
| `arrow` | Straight or elbow arrow with optional label and a moving packet | `from, to, label, color, dashed, packet` | whoosh |
| `chip` | Pill or tag; strike-through variant | `text, color, strike` | ding (success colors) |
| `stamp` | Rotated bordered word (×2, DEADLOCK) | `text, color, size` | hit |
| `table` | Header + rows; animated row insert; highlight | `columns, rows[{cells, at?, highlight?}]` | ding on insert |
| `lanes` | Two or more parallel columns of steps (race conditions) | `lanes[{title, color, steps[{text, at}]}]` | tick |
| `checklist` | Items with check boxes appearing in sequence | `items[{text, at}]` | ding |
| `counter` | Big number counting to targets over time | `keyframes[{at, value}], format` | — |
| `meter` | Horizontal bar with threshold marker | `keyframes, max, threshold` | — |
| `timeline` | Axis with markers at relative positions (backoff, TTL) | `markers[{pos, label, at}]` | ding |
| `grid` | N×M tiles with per-tile states (thread pool, services) | `cols, rows, tiles[]` | — |
| `bucket` | Token bucket with tokens consumed and refilled | `capacity, keyframes` | tick |
| `phone` | Phone mock with checkout, button, notifications | `screen props, notifications[]` | tap |
| `quote` | Quote card with author, typed | `text, author, highlight[]` | tick |
| `particles` | Seeded particle bursts or streams (herd, confetti, dust) | `kind, from, to, count, at` | — |
| `trap` | The series "THE TRAP" interstitial (warning icon, tapes) | `at, until` | hit + glitch |
| `cta` | "Next episode" title + comment box typing a keyword | `next, keyword, at` | tick |
| `icon` | Inline SVG icon from the bundled set (lock, bell, clock, warn, bubble, bomb) | `name, size, color` | — |

### 6.4 Layout helpers
- `row: { gap, align }` and `column` place child elements without manual coordinates.
- `columns: 2` splits the stage into lanes with a gutter.
- `place` accepts `x, y, w, h` or `center: true` or `anchor: top|bottom`.

---

## 7. Media pipeline

### 7.1 Canvas and presets (F12)

| Preset | Canvas | Header top | Stage (y, h) | Captions y | Safe-zone exclusions |
|---|---|---|---|---|---|
| `tiktok` | 1080×1920 | 150 | 270, 1000 | 1300 | right 140 px from y=900; bottom 380 px |
| `reels` | 1080×1920 | 150 | 270, 1000 | 1290 | right 120 px from y=1000; bottom 420 px |
| `shorts` | 1080×1920 | 130 | 250, 1000 | 1280 | right 120 px from y=1000; bottom 360 px |

These values are defaults in the preset files and MUST be editable without code changes.

### 7.2 Frame capture
- **NFR-linked:** the viewport is exactly the canvas, `deviceScaleFactor = 1`, animations disabled (`prefers-reduced-motion` is not used for this; the runtime ignores real time entirely).
- Fonts are vendored and loaded with `@font-face` from local files; `ready` waits for them.

### 7.3 SFX synthesis (F9)
- Implemented in TypeScript (Float32Array, 48 kHz), no samples.
- Sounds: `whoosh` (filtered noise, sine² envelope), `hit` (pitched-down sine 55→38 Hz + transient), `ding` (two partials 1320 + 1980 Hz, exponential decay), `err` (gated square 190 Hz, two pulses), `glitch` (sample-and-hold noise, chopped), `tick` (15 ms noise click), `tap`.
- Seeded PRNG per episode → deterministic output.
- The output is normalized to −0.9 dBFS peak, then scaled by `sfx_gain_db` at mix time.

### 7.4 Mastering and mix (F10)
ffmpeg filter graph:
```
[voice] aresample=48000, loudnorm=I=-14:TP=-1.5:LRA=9 [v];
[sfx]   volume=<sfx_gain> [s];
[v][s]  amix=inputs=2:duration=longest:normalize=0, alimiter=limit=0.95 [a]
```
The output duration MUST equal the voice duration (±1 frame).

---

## 8. Studio interface requirements (IR)

| ID | Requirement |
|---|---|
| IR-1 | The studio is served on `127.0.0.1` only (never on 0.0.0.0) on a free port. The CLI prints the URL and opens the browser. |
| IR-2 | The studio talks to the CLI through a local WebSocket for file-change events, and a single `PUT /cues` endpoint. No other write access. |
| IR-3 | Keyboard-first: every action has a shortcut, listed in a `?` overlay |
| IR-4 | UI language: English labels; content (script, captions) is rendered in its own direction |
| IR-5 | Works in current Chrome, Edge and Firefox |

---

## 9. Caption engine (F6, G4)

### 9.1 Chunking
- A caption chunk is one or more consecutive words of a script line, shown together.
- Default: a line becomes one chunk if `chars ≤ max_chars` (34). Otherwise it is split at the punctuation `، , ؟ ? .` closest to the middle, then by word count, so no chunk exceeds `max_chars` and it renders in ≤ `max_lines` lines.
- `break: [...]` forces a split before the listed words.
- A chunk is visible from its first word's start to the next chunk's start (or the line end + 0.3 s at the episode end).

### 9.2 Tokenization rules for mixed Arabic/English (normative)
Given a chunk containing Arabic script (`[؀-ۿ]`):
1. **Latin run merge:** consecutive tokens matching `^[A-Za-z][A-Za-z'\-]*[؟،.]?$` merge into one token ("Duplicate Charge", "Double-entry ledger").
2. **Tatweel joiner:** a token ending with `ـ` ("الـ", "للـ", "بـ") merges with the following token, joined by NO-BREAK SPACE U+00A0, so "الـ key" never wraps apart.
3. **Isolation:** every Latin run inside a token is wrapped in `<bdi>` so its internal order is LTR, while the token keeps its RTL position.
4. **Trailing Arabic punctuation** (`؟ ،`) attached to a Latin word stays outside the `<bdi>`, so it appears on the correct (left) side.
5. **Base direction:** the caption container uses `direction: rtl` if the chunk contains Arabic script, otherwise `ltr` (English-only lines such as quotes read correctly).
6. Tokens containing Latin get the `english` color. The active token gets the `active` color and a 1.08→1 scale pulse over 0.25 s. Future tokens use `future_opacity`.

### 9.3 Fixture suite (normative test cases)

| Input | Expected visual order (right → left) |
|---|---|
| `المشكلة دي اسمها Duplicate Charge` | المشكلة · دي · اسمها · [Duplicate Charge] |
| `الـ client بعت الـ request` | [الـ client] · بعت · [الـ request] |
| `عايز الجزء الجاي عن الـ Double-entry ledger؟` | … · [الـ Double-entry ledger] with ؟ at the far left |
| `There are only two hard things` | LTR line, left → right |
| `وافتكر Conway's law` | وافتكر · [Conway's law] |
| `بـ SELECT FOR UPDATE` | [بـ SELECT FOR UPDATE] as one unbreakable token |

Each case MUST have a golden-frame test (§11).

---

## 10. Validation and lint rules (F14)

| ID | Level | Rule |
|---|---|---|
| V-1 | error | Schema violation (with path, line and column) |
| V-2 | error | Unresolvable time expression |
| V-3 | error | Missing cue for a script line, or non-monotonic cues |
| V-4 | warn | `voice.wav` hash differs from `cues.audio.sha1` |
| V-5 | error | Element `exit` before `enter`, or enter outside its scene |
| V-6 | warn | Element box partly outside the stage or canvas |
| V-7 | warn | Element box intersects a safe-zone exclusion for the preset |
| V-8 | warn | Two visible elements overlap by > 15% of the smaller box at the same time (unless one is `layer: overlay`) |
| V-9 | warn | Text overflow: rendered text width exceeds its box (measured in a headless pass) |
| V-10 | warn | A caption chunk renders in more than `max_lines` lines |
| V-11 | info | A scene with no element entering in its first 1.5 s (dead air) |
| V-12 | warn | An element enters < 0.1 s before its scene ends (blink) |
| V-13 | error | Unknown component name or font not found |

V-6 to V-10 run in a headless measuring pass at each element's fully-entered time. The results are cached by scene hash.

---

## 11. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Performance | On the reference machine (8 threads, 16 GB, SSD), rendering a 120 s episode (master + share) completes in ≤ 15 min with default settings |
| NFR-2 | Performance | Throughput scales near-linearly up to 6 workers (≥ 4.5× of 1 worker) |
| NFR-3 | Performance | Dev studio preview runs at ≥ 30 fps for typical scenes on the same machine |
| NFR-4 | Determinism | Rendering the same inputs twice yields identical frame SHA-1s for 100% of frames. A test renders frames {0, 450, 1800} in different worker splits and compares. |
| NFR-5 | Reliability | A crashed worker is retried once on its frame range; the render fails cleanly with a clear message if it crashes again |
| NFR-6 | Resource use | Peak RAM ≤ 600 MB per worker; temporary disk ≤ 2 GB for a 150 s episode |
| NFR-7 | Portability | All features work on Linux, macOS and Windows; path handling uses `node:path`; no shell-specific commands |
| NFR-8 | Offline | No network requests at runtime. A CI test runs `render` with networking disabled. |
| NFR-9 | Security | The studio binds to localhost only, serves only the project folder, and writes only `cues.json` |
| NFR-10 | Usability | Every error message states what went wrong, where (file:line:col or time), and how to fix it |
| NFR-11 | Maintainability | Core and runtime have ≥ 85% line coverage; each component has a schema, docs and a golden frame |
| NFR-12 | Licensing | All dependencies MIT, Apache-2.0, BSD, ISC or OFL (fonts); a license check runs in CI |
| NFR-13 | Output compliance | Share files pass `ffprobe` checks: h264 High, yuv420p, 30/1 fps, AAC 48 kHz, `moov` at start, size ≤ target |
| NFR-14 | Accessibility of output | An SRT file is always produced; caption contrast ≥ 7:1 against the scrim |

---

## 12. Testing and acceptance

### 12.1 Test levels
- **Unit (Vitest):** time-expression parser and resolver, word estimation, caption tokenizer (all §9.3 cases plus edge cases), chunking, bitrate formula, SFX determinism (hash of buffers).
- **Golden frames:** for each component and each caption fixture, render fixed `t` values and compare with stored PNGs (pixelmatch, threshold 0.1, max 0.2% differing pixels).
- **Integration:** compile and render `fixtures/mini` (a 6 s episode) end-to-end; assert duration, frame count, codecs and size.
- **Regression:** Season 1 examples compile and validate with zero errors; contact sheets are compared visually in PR review.
- **Seeded bugs:** `fixtures/lint/*` specs, each with one known issue that MUST be reported by the matching rule.

### 12.2 Acceptance criteria (release v1.0)
1. All 9 Season 1 episodes render from `examples/season1` with no code changes (G1).
2. NFR-1, NFR-4 and NFR-13 pass on the reference machine and in CI (Linux).
3. The caption fixture suite passes 100% (G4).
4. `reelforge doctor` passes on fresh Linux, macOS and Windows installs following the README.
5. A new user follows the README tutorial and produces a 30 s episode in under 30 minutes (usability test with 2 people).

---

## 13. Traceability

| PRD feature | Requirements |
|---|---|
| F1 Episode spec | DR-1…DR-5, FR-CORE-1…6 |
| F2 Cue marker | FR-CUE-1…7, DR-3 |
| F3 Time expressions | §5, FR-CORE-2 |
| F4/F5 Components, animation | §6, FR-RT-1…7 |
| F6 Captions | §9, NFR-14 |
| F7/F8 Chrome, themes | FR-RT-5, DR-4 |
| F9/F10 Audio | §7.3, §7.4, FR-REN-4 |
| F11/F12 Render, encode | FR-REN-1…10, §7.1, NFR-1…6, NFR-13 |
| F13 Dev studio | FR-DEV-1…6, IR-1…5 |
| F14 Validation | §10 |
| F15 Outputs | FR-REN-5…7 |
| F16 CLI | FR-CLI-1…8 |
| F17 Examples | §12.2 item 1 |

---

## 14. ADRs to write before implementation

1. ADR-001: DOM/SVG in headless Chromium as the rendering surface (vs Canvas, Motion Canvas, Remotion)
2. ADR-002: YAML as the only authoring format; the studio writes cues only
3. ADR-003: Pure `render(t)` and determinism rules (seeded randomness, no wall clock)
4. ADR-004: Human-marked cues instead of speech recognition (no-AI constraint)
5. ADR-005: Parallel frame-range workers + segment concat (vs a single process)
6. ADR-006: Two outputs (master + size-targeted share) and the bitrate formula
7. ADR-007: The caption bidi strategy (`<bdi>` isolation + tatweel joiner)
8. ADR-008: Procedural SFX instead of sample libraries
9. ADR-009: System ffmpeg instead of a bundled binary (license and size)
10. ADR-010: Monorepo with pnpm workspaces and package boundaries
