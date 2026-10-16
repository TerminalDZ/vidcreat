# Themes and platform presets

## Themes

A theme (`themes/<name>.theme.yaml`) holds every color, font size and motion token. Episodes choose one
with `meta.theme`. A theme can `extends:` another and override only what changes:

```yaml
name: myseries
extends: default
colors:
  lime: '#3cc8ff' # the accent color (titles, active caption word)
  bg: '#070c0e'
chrome: { grain: 0.05, waveform: true }
captions: { active: lime, english: cyan, max_chars: 34 }
```

| Group      | Tokens                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------- |
| `colors`   | `bg ink dim line card lime cyan red amber violet` (add your own names freely)                       |
| `fonts`    | `display` (Space Grotesk), `mono` (JetBrains Mono), `arabic` (Cairo)                                |
| `type`     | font sizes: `caption title h2 body label`                                                           |
| `chrome`   | `header progress waveform grid` (on/off), `grain` (0–1), `grain_fps` (0 = static), `vignette` (0–1) |
| `motion`   | `pop_overshoot default_dur crossfade`                                                               |
| `captions` | `active english` colors, `future_opacity`, `max_lines`, `max_chars`, `scrim`                        |

Generate a complete palette from one color:

```bash
reelforge theme new myseries --accent "#3cc8ff"
```

ReelForge warns when a caption color has less than 7:1 contrast against the background.

## Platform presets

`presets/tiktok.preset.yaml`, `reels.preset.yaml` and `shorts.preset.yaml` define the header, stage and
caption positions, the safe-zone rectangles, the default share size and the maximum duration. Edit them
freely or add your own (`presets/<name>.preset.yaml`), then select it with `meta.preset` or
`--preset` when rendering.
