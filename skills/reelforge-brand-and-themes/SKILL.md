---
name: reelforge-brand-and-themes
description: >-
  Use when a ReelForge video must match a brand or a series look: creating or editing themes/<name>.theme.yaml from brand colors and fonts, light or dark mode, extends, and checking WCAG AA contrast before rendering.
---

# Brand and themes

A theme (`themes/<name>.theme.yaml`) holds every color, font, size and motion token. Episodes pick
one with `meta.theme`. Never hard-code brand colors into every element; put them in the theme.

## Create a theme from brand colors

1. Generate a starting point:

   ```bash
   ./reelforge theme new acme --accent "#2f7dff" --font "Space Grotesk" --mode dark
   ```

   `--accent` is the brand's primary color; `--mode light|dark` chooses the background family;
   `--font` must be a bundled font. Older builds accept only `--accent`; then set the rest by hand.

2. Map the brand onto tokens: `lime` is the **accent** token (titles' `**accent**` words, the active
   caption word), `cyan` the secondary accent and English terms in Arabic captions; `bg`, `card`,
   `line`, `ink`, `dim` are the neutrals.
3. Check contrast (below), set `meta.theme: acme`, `validate_episode`, `preview_frames`.

Ready-made themes may exist for common industries (`clinical`, `estate`, `harbor`, `campus`,
`ledger`, `bistro`, `civic`, `retail`, `industrial`, `voyage`, `editorial`, `minimal`, `bold`,
`default`). If `validate_episode` reports "Theme not found" (V-1), use `default` or create it.

## Fonts

Only fonts bundled with ReelForge (OFL-licensed, embedded for deterministic rendering) are
allowed. An unknown font is error V-13, whose hint lists the bundled families. The base set is
`Space Grotesk` (display), `JetBrains Mono` (mono) and `Cairo` (Arabic). If the brand font is not
bundled, pick the closest bundled family and tell the person; do not reference system or web fonts.

## Contrast rules (WCAG AA)

| Text                                                            | Minimum ratio against its background |
| --------------------------------------------------------------- | ------------------------------------ |
| Body text, labels, chips (< 24 px bold / < 18.66 px)            | 4.5:1                                |
| Large text: titles, counters (≥ 24 px, or ≥ 18.66 px bold)      | 3:1                                  |
| Captions (`ink`, `captions.active`, `captions.english` vs `bg`) | 7:1 (ReelForge warns below)          |

- Check accent text on `bg` **and** on `card` (chips and nodes sit on cards).
- Light mode: dark `ink` on a light `bg`; brand colors usually need a darker shade to reach 4.5:1.
- Never put meaning in color alone: pair red/green with an icon, a label or a strike.

## Good and bad

Good: extends the default, overrides only what the brand changes, keeps caption contrast.

```yaml
name: acme
extends: default
colors:
  bg: '#0a0f1c'
  card: '#121a2e'
  line: '#24304d'
  lime: '#66adff' # brand accent, lightened: 8.2:1 on bg, 7.4:1 on card
  cyan: '#7ee0c3'
fonts: { display: 'Space Grotesk' }
chrome: { grain: 0.04 }
captions: { active: lime, english: cyan }
```

Bad: a font that is not bundled, low-contrast accent, unknown keys.

```yaml
name: acme
colors:
  bg: '#ffffff'
  lime: '#ffd400' # 1.4:1 on white
fonts: { display: 'Helvetica Neue' }
logo: brand.png
```

## Checklist

- [ ] Theme `extends: default` (or another theme) and overrides only brand tokens.
- [ ] Fonts are bundled families only (no V-13).
- [ ] Text contrast ≥ 4.5:1, large text ≥ 3:1, captions ≥ 7:1 (no contrast warning).
- [ ] Accent tested on both `bg` and `card`.
- [ ] `meta.theme` set; preview frames checked in every scene's glow color.

References: [theme-tokens](references/theme-tokens.md), [contrast](references/contrast.md).
