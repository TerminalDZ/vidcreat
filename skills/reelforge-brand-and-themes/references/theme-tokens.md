# Theme tokens

Themes are strict: unknown keys are errors. Every group is optional when the theme `extends`
another; values deep-merge over the parent.

```yaml
name: myseries # required, matches the file name themes/myseries.theme.yaml
extends: default # optional parent theme
colors: # any names; these ten are used by components and captions
  bg: '#07080c' # background
  ink: '#eef1f7' # main text
  dim: '#7d8496' # secondary text, idle lines
  line: '#222735' # borders, grid
  card: '#10131b' # card and node fill
  lime: '#b8ff3c' # accent: **accent** words, active caption word
  cyan: '#55dcff' # secondary accent, English terms in Arabic captions
  red: '#ff4a5c' # errors, problems
  amber: '#ffb238' # warnings
  violet: '#c792ff' # extra accent
fonts: { display: 'Space Grotesk', mono: 'JetBrains Mono', arabic: 'Cairo' }
type: { caption: 66, title: 120, h2: 84, body: 32, label: 24 } # px
chrome:
  { header: true, progress: true, waveform: true, grain: 0.07, grain_fps: 0, vignette: 0.75, grid: true }
motion: { pop_overshoot: 1.9, default_dur: 0.45, crossfade: 0.3 }
captions: { active: lime, english: cyan, future_opacity: 0.32, max_lines: 2, max_chars: 34, scrim: 0.78 }
```

## Notes

- Color values are `#rgb`/`#rrggbb`/`#rrggbbaa`, `rgb()`, `hsl()`, or a theme color name.
- You can add brand names (`brand: '#…'`) and use them in props (`color: brand`) and `glow`.
  Keep the ten standard names defined; components default to them.
- `grain_fps` above 0 animates the grain and multiplies the file size; keep it 0.
- `chrome.grid: false` and `grain: 0` give a cleaner, corporate look.
- `captions.max_chars` and `max_lines` drive V-10; changing them changes how scripts must be
  written. Keep 34 and 2 unless the person asks.
- Light mode: set `bg`, `card`, `line` light and `ink`, `dim` dark, then re-check every accent
  for contrast; the default accents are tuned for dark backgrounds.

## Light theme example

```yaml
name: paper
extends: default
colors:
  bg: '#f6f7f9'
  card: '#ffffff'
  line: '#d9dde5'
  ink: '#1a1d24'
  dim: '#5b6170'
  lime: '#0842a0' # 8.5:1 on bg
  cyan: '#00574b' # 8.0:1 on bg
chrome: { grain: 0, grid: false, vignette: 0 }
captions: { active: lime, english: cyan }
```

A brighter brand blue such as `#0b57d0` reaches only 6.0:1 on this background: fine for titles and
body text, but below the 7:1 caption target, so ReelForge warns. Darken caption colors, or set
`captions.active: ink`, rather than ignoring the warning.
