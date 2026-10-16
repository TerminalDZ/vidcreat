# AGENTS.md — ReelForge for AI agents

This file is for AI coding agents and assistants (Claude Code, Codex, Cursor, GitHub Copilot, Gemini
CLI, Windsurf, Aider, Zed, Jules, …). It has two parts. **Part 1** covers making videos with
ReelForge, which is what most people ask for. **Part 2** covers changing the ReelForge source code.

ReelForge turns **a voice recording + one `episode.yaml`** into a finished **1080×1920 vertical
explainer video** for TikTok, Reels and Shorts. Everything runs locally, and the rendering itself
uses no AI. The same inputs always produce the same frames.

---

## Part 1 · Making videos

### Prefer the MCP server

If your client supports the Model Context Protocol, use the `reelforge` MCP server. It is already
configured for this project in `.mcp.json` (Claude Code), `.cursor/mcp.json`, `.vscode/mcp.json` and
`.gemini/settings.json`. Start it with:

```bash
node packages/cli/bin/reelforge.js mcp      # or: ./reelforge mcp · reelforge.cmd mcp
```

| Tool                                       | Use it to                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `list_episodes`                            | see what exists                                                              |
| `get_episode`                              | read episode.yaml plus a compiled outline (line times, element paths, boxes) |
| `create_episode`                           | start a new episode from a script (draft cues are written for you)           |
| `edit_episode`                             | structured edits (`set` / `delete` / `insert` / `move` by YAML path)         |
| `write_episode_yaml`                       | replace the whole file (validated before writing)                            |
| `validate_episode`                         | run all checks (V-1…V-13) with line numbers and fix hints                    |
| `preview_frames`                           | **look** at frames (returned as images); always check your work              |
| `list_components` / `get_component_schema` | the 21 components and their exact props                                      |
| `draft_cues` / `set_cues`                  | estimated or known line timings                                              |
| `render_episode` / `get_render_status`     | render in the background and poll                                            |
| `open_editor`                              | give the person a URL to the visual editor to fine-tune and mark cues        |
| `doctor`                                   | check Node.js, FFmpeg, Chromium and fonts                                    |

Without MCP, use the command line (`./reelforge` on macOS/Linux, `reelforge.cmd` on Windows):

```bash
./reelforge new ep10 --lang en --series "SYSTEM DESIGN"   # episodes/ep10/episode.yaml
./reelforge cue ep10 --draft                              # estimated cues (no recording yet)
./reelforge validate ep10 --json                          # machine-readable issues
./reelforge snap ep10 l1+1 "l3:'bucket'" --out /tmp/f     # PNG frames to look at
./reelforge render ep10 --silent --json                   # render without a voice
./reelforge edit ep10                                     # visual editor for the human
```

### Workflow that works

1. **Script first.** Write one short spoken sentence per line, about 2.3 words per second. Line 1
   is the hook (a question or a surprising fact). Introduce one idea per line. The last line is a
   call to action. 45 seconds is about 100–110 words.
2. **Create** the episode, using `create_episode` with the script or `reelforge new`.
3. **Design scenes.** Put one idea in each scene, usually 4–7 scenes in an episode. Each scene
   starts on a line (`at: l3`). Make each element enter **on the word that names it**, for example
   `enter: { at: "l3:'bucket'" }`. This word-sync is what makes ReelForge videos feel alive.
4. **Validate** and fix every error and warning.
5. **Preview** frames shortly after things enter (`l3:'bucket'+0.8`). Check overlap, text overflow
   and that the platform UI is clear. Iterate until it looks clean.
6. **Hand over.** The person records `voice.wav`, marks cues by ear in the editor (Cues mode,
   Space key) and renders. Until then the draft cues give realistic timing.

### episode.yaml essentials

```yaml
meta:
  id: ep10
  series: 'SYSTEM DESIGN'
  title: 'Rate Limiting'
  episode: 10
  preset: tiktok # tiktok | reels | shorts
  theme: default # default | season1 | workshop (or your own)
  lang: en-US # en-US → left-to-right captions; ar-EG → right-to-left
  publish: { cover: 'Flooded API?', caption: '…', hashtags: ['#systemdesign'], pinned: '…' }

audio: { voice: voice.wav, sfx: auto, sfx_gain_db: -16 }

script: # ids default to l1, l2, … by position
  - text: 'Your API just got flooded with requests.'
  - text: 'A rate limiter decides who gets through.'

chapters:
  - { at: l1, label: '01 · THE PROBLEM' }

scenes:
  - id: hook
    at: l1 # starts with line 1; ends where the next scene starts
    glow: red # background glow: lime cyan red amber violet ink …
    elements:
      - use: title
        id: hook_title
        props: { text: 'Flooded **API**' } # **word** = accent color
        place: { x: 60, y: 160, w: 960, h: 240 }
        enter: { at: "l1:'flooded'", anim: pop }
      - use: counter
        id: rps
        props: { from: 0, keyframes: [{ at: "l1:'requests'", value: 12000, dur: 1.2 }], suffix: ' req/s' }
        place: { x: 140, y: 460, w: 800, h: 300 }
        enter: { at: "l1:'requests'", anim: rise }
```

**Time expressions:** `12.5s`, `l7` (line start), `l7.end`, `l7:'word'`, `l7:'word'#2` (second
match), `l7.3` (4th word, 0-based), `@scene`, `@scene.end`, plus offsets such as `+0.4` or `-0.2`.
Quote YAML strings that contain `:` or `'`, e.g. `at: "l3:'bucket'"`.

**Layout:** all coordinates are **stage coordinates**: 1080 wide × 1000 high, with the origin at
the top-left of the stage. The stage spans canvas y 270–1270 and the captions sit below it. Rules:

- Keep a 60 px side margin: `x ≥ 60` and `x + w ≤ 1020`.
- In the lower part of the stage (y > 600), keep `x + w ≤ 920`. The TikTok right rail (likes,
  comments) covers the canvas from x 940 down.
- Don't let two visible base elements overlap (V-8). Use `exit` to clear space, or `layer: overlay`
  for stamps and badges that should sit on top.
- Big readable text: titles 80–130 px, body 36–56 px. Don't put more than about 7 words in a
  title.

**Animation:** `enter.anim`: pop (default), rise, slide-l, slide-r, fade, draw, type, count, flip,
zoom, glitch, stamp, none. `exit: { at, anim }`: fade, pop, rise, sink, slide-l, slide-r, zoom.
`fx: [{ at, do: shake|flash|glitch|pulse|bump }]` (`target: camera` shakes the whole frame).
`states: [{ at, set: { status: err } }]` changes props over time.

**Components (21):**

- Text: title, label, chip, stamp, quote.
- Diagrams: node, arrow (`from`/`to` = element ids such as `api.left`, or points), lanes, grid,
  timeline, bucket.
- Data: counter, meter, table, checklist.
- Other: code (types itself), phone, icon (30 bundled icons), particles, trap ("THE TRAP"
  interstitial), cta (next-episode ending).

Ask `get_component_schema` (or read `docs/components.md`) before using a component's props; props
are strict.

### Quality checklist (do all of these before you say "done")

- [ ] `validate_episode` shows **0 errors**. Warnings are fixed or explained to the person.
- [ ] Every scene has something entering within its first 1.5 s.
- [ ] Each element enters on a word it relates to. Nothing appears "randomly".
- [ ] Preview frames are clean: no overflow, no overlap, nothing under the platform UI.
- [ ] Arabic episodes keep technical terms in English inside the Arabic sentence (`الـ client`).
      Captions handle the direction automatically.
- [ ] `publish` (cover, caption, hashtags, pinned comment) is filled in.

### Don'ts

- Don't invent component names or props. Use the schemas.
- Don't write absolute seconds when a word expression exists. Words survive re-recording.
- Don't edit `cues.json` by hand unless asked. Cues are marked by ear in the editor.
- Don't delete the person's files under `out/`. Re-rendering overwrites them.
- Rendering takes minutes. Start it and poll; don't block on it.

---

## Part 2 · Working on the ReelForge code

**Stack:** TypeScript 5.9 strict, Node 22, a pnpm 10 workspace, Playwright Chromium for rendering,
FFmpeg as an external binary, Vite for the browser clients and Vitest for tests.

```
packages/
  audio/     WAV I/O, envelopes, onset detection, procedural SFX
  core/      schema (zod), time expressions, captions, themes, presets, compiler → Timeline, lint
  runtime/   browser page: pure render(t) for every component (DOM/SVG)
  renderer/  Chromium workers → x264 segments → concat, loudness, ffprobe checks, doctor
  studio/    local servers: dashboard (hub), editor/cue/review studio; Vite clients in client/
  cli/       the `reelforge` command and the MCP server (src/mcp.ts)
```

- The compiled **Timeline** (`packages/core/src/types.ts`) is the only contract between the
  compiler and the runtime.
- `render(t)` must stay **pure and deterministic**: no `Date.now()`, no unseeded randomness and no
  timers in the runtime.
- Local servers bind to **127.0.0.1**, check same-origin and accept JSON-only writes. Keep it that
  way.
- The editor writes `episode.yaml` through structured operations
  (`packages/studio/src/server/edit.ts`), which keeps comments.

**Commands:**

```bash
pnpm install && pnpm build
pnpm typecheck && pnpm lint
pnpm test:unit          # fast
pnpm test               # + browser/integration (needs FFmpeg and Chromium)
pnpm format             # prettier
UPDATE_GOLDEN=1 pnpm test:browser   # refresh golden frames after an intended visual change
```

**Adding a component:**

1. Add its schema and defaults in `packages/core/src/components/`.
2. Add its runtime in `packages/runtime/src/components/`.
3. Add it to the gallery in `fixtures/golden/components/episode.yaml`.
4. Regenerate `docs/components.md` with `node scripts/gen-components-doc.mjs`.
5. Refresh the golden frames.

**Conventions:**

- Match the surrounding style.
- Write comments only where the code can't say it.
- Keep user-facing text in clear English.
- Never weaken a test to make it pass.
