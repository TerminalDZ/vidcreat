# Themes and branding

A series looks consistent when its colors, fonts and motion live in one theme instead of in every
element. This page covers themes, fonts, contrast rules for a brand and the platform presets.

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

| Group      | Tokens                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `mode`     | `dark` (default) or `light`. Light themes get dark hairlines, soft shadows and light component surfaces (phone, trap, labels) |
| `colors`   | `bg ink dim line card lime cyan red amber violet` (add your own names freely)                                                 |
| `fonts`    | `display` (Space Grotesk), `mono` (JetBrains Mono), `arabic` (Cairo); any bundled font, see below                             |
| `type`     | font sizes: `caption title h2 body label`                                                                                     |
| `chrome`   | `header progress waveform grid` (on/off), `grain` (0–1), `grain_fps` (0 = static), `vignette` (0–1), `glow` (0–1, default 1)  |
| `motion`   | `pop_overshoot default_dur crossfade`                                                                                         |
| `captions` | `active english` colors, `future_opacity`, `max_lines`, `max_chars`, `scrim`                                                  |

The color tokens carry meaning: `lime` is the primary accent and "ok", `red` is errors, `amber` is
warnings, `cyan` is info. Keep each one in its family when you rebrand.

### Bundled themes

| Theme        | Mode  | For                        | Fonts (display · arabic)             |
| ------------ | ----- | -------------------------- | ------------------------------------ |
| `default`    | dark  | tech explainers (Season 1) | Space Grotesk · Cairo                |
| `season1`    | dark  | same as default            | Space Grotesk · Cairo                |
| `workshop`   | dark  | courses                    | Space Grotesk · Cairo                |
| `clinical`   | light | healthcare                 | Inter · Readex Pro                   |
| `estate`     | light | real estate                | Playfair Display · Noto Naskh Arabic |
| `campus`     | light | education                  | Manrope · Readex Pro                 |
| `civic`      | light | public services            | Inter · Noto Kufi Arabic             |
| `minimal`    | light | anything, quiet            | Inter · Readex Pro                   |
| `harbor`     | dark  | ports and logistics        | Manrope · Noto Kufi Arabic           |
| `ledger`     | dark  | finance                    | Inter · Noto Kufi Arabic             |
| `bistro`     | dark  | food and restaurants       | Playfair Display · Noto Naskh Arabic |
| `retail`     | dark  | shops and offers           | Manrope · Cairo                      |
| `industrial` | dark  | manufacturing, engineering | Space Grotesk · Noto Kufi Arabic     |
| `voyage`     | dark  | travel and tourism         | Manrope · Readex Pro                 |
| `editorial`  | dark  | news                       | Playfair Display · Noto Naskh Arabic |
| `bold`       | dark  | social promos              | Manrope · Cairo                      |

Every bundled theme passes WCAG AA: `ink`, `dim`, the five accents and both caption colors reach
at least 4.5:1 on `bg` and on `card`, and caption colors reach 7:1 on the background
(`packages/core/test/themes.test.ts`).

### Fonts

All fonts are bundled with the runtime (SIL Open Font License 1.1, no network at render time).
`fonts` must name one of them (V-13):

| Slot      | Families                                                                        |
| --------- | ------------------------------------------------------------------------------- |
| `display` | Space Grotesk, Inter, Manrope, Playfair Display (serif)                         |
| `mono`    | JetBrains Mono                                                                  |
| `arabic`  | Cairo, Noto Kufi Arabic, Noto Naskh Arabic (naskh), Readex Pro (Latin + Arabic) |

Captions use the `arabic` font first, so pick one whose Latin letters also suit English captions.

### Generate a theme

```bash
reelforge theme new myseries --accent "#3cc8ff"
reelforge theme new clinic --accent "#00a884" --mode light --font "Noto Kufi Arabic"
```

| Option           | Meaning                                                                                |
| ---------------- | -------------------------------------------------------------------------------------- |
| `--accent <hex>` | primary accent (`lime`); kept as is when readable, otherwise its lightness is adjusted |
| `--mode <mode>`  | `dark` (default) or `light`                                                            |
| `--font <name>`  | a bundled family; it goes into its own slot (display, mono or arabic)                  |
| `--out <file>`   | write somewhere other than `themes/<name>.theme.yaml`                                  |

The generator writes every color token and checks the same WCAG AA rules as the bundled themes.

ReelForge warns when a caption color has less than 7:1 contrast against the background.

## Brand a series

1. Generate a theme from the brand's primary color: `reelforge theme new acme --accent "#2f7dff"`.
2. Map the brand onto the tokens: `lime` is the accent (accent words in titles, the active caption word),
   `cyan` the secondary accent; `bg`, `card`, `line`, `ink` and `dim` are the neutrals.
3. If the brand font is not bundled, pick the closest bundled family. System and web fonts are not
   allowed, because renders must not depend on the machine.
4. Set `meta.theme: acme` in every episode of the series, then validate and preview frames in each scene's
   glow color.

| Text                                                            | Minimum contrast against its background |
| --------------------------------------------------------------- | --------------------------------------- |
| Body text, labels, chips                                        | 4.5:1                                   |
| Large text: titles, counters (≥ 24 px, or ≥ 18.66 px bold)      | 3:1                                     |
| Captions (`ink`, `captions.active`, `captions.english` vs `bg`) | 7:1 (ReelForge warns below)             |

Check accent text on `bg` **and** on `card`, since chips and nodes sit on cards. Never carry meaning in
color alone: pair red and green with an icon, a label or a strike. Industry packs ship a matching theme
for each sector (see [Templates and packs](templates-and-packs.md)).

## Platform presets

`presets/tiktok.preset.yaml`, `reels.preset.yaml` and `shorts.preset.yaml` define the header, stage and
caption positions, the safe-zone rectangles, the default share size and the maximum duration. Edit them
freely or add your own (`presets/<name>.preset.yaml`), then select it with `meta.preset` or
`--preset` when rendering.
