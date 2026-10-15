/** Theme generator behind `reelforge theme new`: a full palette from one accent color. */
import {
  BUNDLED_FONTS,
  captionContrastIssues,
  contrastRatio,
  FALLBACK_THEME,
  FONT_ROLES,
  themeContrast,
} from './theme.js';
import type { BundledFont } from './theme.js';
import type { Theme } from './types.js';
import { deepMerge } from './util.js';

export interface ThemeGenOptions {
  name: string;
  /** #rrggbb (the leading # is optional). */
  accent: string;
  mode?: 'dark' | 'light';
  /** One bundled family; it fills the slot it is made for (display, mono or arabic). */
  font?: string;
}

export interface GeneratedTheme {
  theme: Theme;
  yaml: string;
}

const hexToHsl = (hex: string): [number, number, number] => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return [(h * 60 + 360) % 360, s, l];
};

const hsl = (h: number, s: number, l: number): string => {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return `#${[f(0), f(8), f(4)]
    .map((x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
};

/** The color unchanged if it reaches `min` against every surface, else moved in lightness until it does. */
function fit(color: string, surfaces: string[], min: number, mode: 'dark' | 'light'): string {
  const ok = (c: string) => surfaces.every((s) => (contrastRatio(c, s) ?? 0) >= min);
  if (ok(color)) return color;
  const [h, s, l0] = hexToHsl(color);
  for (let i = 1; i <= 100; i++) {
    const l = mode === 'dark' ? l0 + ((1 - l0) * i) / 100 : l0 * (1 - i / 100);
    const c = hsl(h, s, l);
    if (ok(c)) return c;
  }
  return mode === 'dark' ? '#ffffff' : '#000000';
}

export function isBundledFont(f: string): f is BundledFont {
  return (BUNDLED_FONTS as readonly string[]).includes(f);
}

/**
 * Builds a complete theme (every color token, fonts, chrome, captions) that passes the WCAG AA
 * text checks (`themeContrast`) and the 7:1 caption check (NFR-14). The accent becomes `lime`
 * (the primary accent) when it already reads well; otherwise its lightness is adjusted.
 */
export function generateTheme(o: ThemeGenOptions): GeneratedTheme {
  const m = o.accent.match(/^#?([0-9a-f]{6})$/i);
  if (!m) throw new Error('--accent must be a hex color like #b8ff3c');
  if (o.font && !isBundledFont(o.font))
    throw new Error(`Font "${o.font}" is not bundled (${BUNDLED_FONTS.join(', ')})`);
  const mode = o.mode ?? 'dark';
  const accent = `#${m[1].toLowerCase()}`;
  const [h] = hexToHsl(accent);
  const dark = mode === 'dark';
  const bg = dark ? hsl(h, 0.35, 0.04) : hsl(h, 0.3, 0.97);
  const card = dark ? hsl(h, 0.3, 0.08) : '#ffffff';
  const line = dark ? hsl(h, 0.2, 0.17) : hsl(h, 0.2, 0.86);
  const surfaces = [bg, card];
  // Keep the secondary accents in their color families (cyan = info blue, violet = purple),
  // nudged away when the accent already sits on that hue.
  const away = (hue: number) => {
    const d = ((hue - h + 540) % 360) - 180;
    return Math.abs(d) < 35 ? (hue + (d < 0 ? -40 : 40) + 360) % 360 : hue;
  };
  const text = (c: string, min = 4.5) => fit(c, surfaces, min, mode);
  const colors = {
    bg,
    ink: text(dark ? hsl(h, 0.25, 0.95) : hsl(h, 0.4, 0.1), 7),
    dim: text(dark ? hsl(h, 0.12, 0.58) : hsl(h, 0.12, 0.4)),
    line,
    card,
    lime: text(accent),
    cyan: text(hsl(away(195), 0.9, dark ? 0.67 : 0.35)),
    red: text(dark ? '#ff4a5c' : '#c0283a'),
    amber: text(dark ? '#ffb238' : '#9a5b00'),
    violet: text(hsl(away(272), dark ? 0.9 : 0.6, dark ? 0.78 : 0.45)),
  };
  // Captions sit on the background scrim and must reach 7:1 (NFR-14).
  const capColor = (token: 'lime' | 'cyan') => {
    const c = text(colors[token], 7);
    return c === colors[token] ? token : c;
  };
  const captions = { active: capColor('lime'), english: capColor('cyan'), ...(dark ? {} : { scrim: 0.86 }) };
  const fonts = o.font ? { [FONT_ROLES[o.font as BundledFont]]: o.font } : undefined;
  const chrome = dark ? undefined : { grain: 0, vignette: 0, glow: 0.5 };
  const theme = deepMerge(FALLBACK_THEME, { name: o.name, mode, colors, fonts, chrome, captions }) as Theme;
  const bad = [...themeContrast(theme).filter((c) => c.ratio < c.min), ...captionContrastIssues(theme)];
  if (bad.length) throw new Error(`Generated theme fails contrast checks (${bad.length})`);

  const flow = (obj: Record<string, unknown>) =>
    `{ ${Object.entries(obj)
      .map(
        ([k, v]) =>
          `${k}: ${typeof v === 'string' && v.startsWith('#') ? `'${v}'` : typeof v === 'string' && v.includes(' ') ? `'${v}'` : v}`,
      )
      .join(', ')} }`;
  const flags = [`--accent ${accent}`, o.mode ? `--mode ${o.mode}` : '', o.font ? `--font "${o.font}"` : '']
    .filter(Boolean)
    .join(' ');
  const yaml = [
    `# Generated by \`reelforge theme new ${o.name} ${flags}\`. Edit freely.`,
    `name: ${o.name}`,
    'extends: default',
    `mode: ${mode}`,
    'colors:',
    ...Object.entries(colors).map(([k, v]) => `  ${k}: '${v}'`),
    ...(fonts ? [`fonts: ${flow({ ...FALLBACK_THEME.fonts, ...fonts })}`] : []),
    ...(chrome ? [`chrome: ${flow(chrome)}`] : []),
    `captions: ${flow(captions)}`,
    '',
  ].join('\n');
  return { theme, yaml };
}
