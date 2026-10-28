# Checking contrast

## The formula

WCAG contrast ratio = (L1 + 0.05) / (L2 + 0.05), where L1 is the relative luminance of the lighter
color and L2 of the darker. Relative luminance of `#rrggbb`: convert each channel to 0–1, linearize
(`c ≤ 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ^ 2.4`), then
`L = 0.2126 R + 0.7152 G + 0.0722 B`.

```js
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
```

## Targets

| Pair                                               | Target                                      |
| -------------------------------------------------- | ------------------------------------------- |
| `ink` on `bg`, `ink` on `card`                     | ≥ 7:1 (captions use `ink`)                  |
| `captions.active`, `captions.english` on `bg`      | ≥ 7:1 (ReelForge warns below)               |
| Accent text (`lime`, `cyan`, …) on `bg` and `card` | ≥ 4.5:1; ≥ 3:1 only for titles and counters |
| `dim` on `bg`                                      | ≥ 4.5:1 (labels, sub-text)                  |
| Status colors (`red`, `amber`) used as text        | ≥ 4.5:1                                     |

Reference values from the default theme: `ink` on `bg` 16.9:1, `lime` on `card` 15.4:1, `dim` on
`bg` 5.4:1.

## Fixing a failing brand color

1. Keep the hue, change the lightness: lighter on dark themes, darker on light themes.
2. Use the brand color for large shapes (glow, node borders, chart bars) and a lighter or darker
   variant for text.
3. Keep the exact brand color for the cover and the `publish` assets, where the person controls the
   background.
4. Re-run `validate_episode`: the theme contrast warning disappears when captions reach 7:1.
