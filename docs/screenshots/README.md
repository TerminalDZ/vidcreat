# Screenshots

To regenerate these, run `node scripts/screenshots.mjs`. Everything is captured from this repository with ReelForge itself:

- the dashboard and editor through Playwright;
- video frames through `reelforge snap`.

The examples ship with draft cues. The editor shots use a synthetic test voice so the waveform is visible.

| File                                    | What it shows                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `00-dashboard.jpg`                      | Project dashboard: episodes with thumbnails, status chips, outputs             |
| `01-editor-overview.jpg`                | Editor: canvas with a selection, layers, inspector, multi-track timeline       |
| `02-editor-drag-guides.jpg`             | Moving an element with smart guides                                            |
| `03-editor-timeline.jpg`                | Retiming a clip: it snaps to a spoken word, and the badge shows the expression |
| `04-editor-insert.jpg`                  | Component library (Insert)                                                     |
| `05-editor-palette.jpg`                 | ⌘K command palette                                                             |
| `06-editor-shortcuts.jpg`               | Keyboard shortcut sheet (`?`)                                                  |
| `07-editor-cues.jpg`                    | Cues mode: script list, waveform, playhead                                     |
| `08-editor-cues-word-mode.jpg`          | Word mode: marking individual word starts                                      |
| `09-editor-review.jpg`                  | Review mode on a seeded overlap bug (V-8) with element outlines                |
| `10-editor-yaml-error.jpg`              | A YAML syntax error: banner with the line; the last good frame is kept         |
| `11-editor-script.jpg`                  | Script tab and a line in the inspector, with clickable words                   |
| `12-editor-render.jpg`                  | Render options                                                                 |
| `13-component-gallery.jpg`              | Every component (fixtures/golden/components)                                   |
| `episode-ep01…09.jpg`                   | One frame every 6 s of each English Season 1 episode                           |
| `episode-arabic-ep01…02.jpg`            | The Arabic series                                                              |
| `19-cli-help.png` … `22-cli-render.png` | CLI: help, doctor, validate, render                                            |
| `23…26-dashboard-*.jpg`                 | Dashboard: validation, render options, live render progress, built-in player   |
| `27-cli-mcp.png`                        | The MCP server's tools for AI agents                                           |
