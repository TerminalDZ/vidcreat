/** Theme loading (SRS DR-4): one file of color, type and motion tokens, with `extends`. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { findResource, listResources } from './project.js';
import type { Issue, Theme } from './types.js';
import { deepMerge, didYouMean } from './util.js';
import { parseYaml } from './yamlsrc.js';

export const BUNDLED_FONTS = ['Space Grotesk', 'JetBrains Mono', 'Cairo'] as const;

const partialTheme = z
  .object({
    name: z.string(),
    extends: z.string().optional(),
    colors: z.record(z.string()).optional(),
    fonts: z
      .object({ display: z.string(), mono: z.string(), arabic: z.string() })
      .partial()
      .strict()
      .optional(),
    type: z
      .object({ caption: z.number(), title: z.number(), h2: z.number(), body: z.number(), label: z.number() })
      .partial()
      .strict()
      .optional(),
    chrome: z
      .object({
        header: z.boolean(),
        progress: z.boolean(),
        waveform: z.boolean(),
        grain: z.number().min(0).max(1),
        grain_fps: z.number().min(0).max(30),
        vignette: z.number().min(0).max(1),
        grid: z.boolean(),
      })
      .partial()
      .strict()
      .optional(),
    motion: z
      .object({ pop_overshoot: z.number(), default_dur: z.number().positive(), crossfade: z.number().min(0) })
      .partial()
      .strict()
      .optional(),
    captions: z
      .object({
        active: z.string(),
        english: z.string(),
        future_opacity: z.number().min(0).max(1),
        max_lines: z.number().int().min(1),
        max_chars: z.number().int().min(8),
        scrim: z.number().min(0).max(1),
      })
      .partial()
      .strict()
      .optional(),
  })
  .strict();

/** Hard fallback, identical to themes/default.theme.yaml. */
export const FALLBACK_THEME: Theme = {
  name: 'default',
  colors: {
    bg: '#07080c',
    ink: '#eef1f7',
    dim: '#7d8496',
    line: '#222735',
    card: '#10131b',
    lime: '#b8ff3c',
    cyan: '#55dcff',
    red: '#ff4a5c',
    amber: '#ffb238',
    violet: '#c792ff',
  },
  fonts: { display: 'Space Grotesk', mono: 'JetBrains Mono', arabic: 'Cairo' },
  type: { caption: 66, title: 120, h2: 84, body: 32, label: 24 },
  chrome: {
    header: true,
    progress: true,
    waveform: true,
    grain: 0.07,
    grain_fps: 0,
    vignette: 0.75,
    grid: true,
  },
  motion: { pop_overshoot: 1.9, default_dur: 0.45, crossfade: 0.3 },
  captions: {
    active: 'lime',
    english: 'cyan',
    future_opacity: 0.32,
    max_lines: 2,
    max_chars: 34,
    scrim: 0.78,
  },
};

export interface LoadedTheme {
  theme: Theme;
  files: string[];
  issues: Issue[];
}

const CSS_COLOR = /^(#[0-9a-f]{3,8}|rgba?\(.+\)|hsla?\(.+\)|transparent|white|black)$/i;

/** Resolves a theme color name to its value; CSS colors pass through. */
export function resolveColor(theme: Theme, c: string): string {
  return theme.colors[c] ?? c;
}

export function isColor(theme: Theme, c: string): boolean {
  return c in theme.colors || CSS_COLOR.test(c);
}

export function loadTheme(name: string, root: string, episodeDir: string, seen: string[] = []): LoadedTheme {
  const file = findResource('theme', name, root, episodeDir);
  if (!file) {
    const alt = didYouMean(name, listResources('theme', root), 3);
    return {
      theme: FALLBACK_THEME,
      files: [],
      issues: [
        {
          rule: 'V-1',
          level: 'error',
          message: `Theme "${name}" not found`,
          hint: alt ? `Did you mean "${alt}"?` : `Add themes/${name}.theme.yaml or use "default"`,
          path: 'meta.theme',
        },
      ],
    };
  }
  if (seen.includes(file)) {
    return {
      theme: FALLBACK_THEME,
      files: seen,
      issues: [
        { rule: 'V-1', level: 'error', message: `Theme "extends" cycle: ${[...seen, file].join(' → ')}` },
      ],
    };
  }
  const src = parseYaml(readFileSync(file, 'utf8'), file);
  if (src.errors.length) return { theme: FALLBACK_THEME, files: [...seen, file], issues: src.errors };
  const parsed = partialTheme.safeParse(src.data);
  if (!parsed.success) {
    return {
      theme: FALLBACK_THEME,
      files: [...seen, file],
      issues: parsed.error.issues.map((i) => ({
        rule: 'V-1',
        level: 'error' as const,
        message: `Theme ${path.basename(file)}: ${i.path.join('.')}: ${i.message}`,
        file,
      })),
    };
  }
  const data = parsed.data;
  let base: LoadedTheme = { theme: FALLBACK_THEME, files: [], issues: [] };
  if (data.extends) base = loadTheme(data.extends, root, path.dirname(file), [...seen, file]);
  const { extends: _e, ...over } = data;
  const theme = deepMerge(base.theme, over) as Theme;
  const issues = [...base.issues];
  for (const [k, v] of Object.entries(theme.fonts)) {
    if (!(BUNDLED_FONTS as readonly string[]).includes(v)) {
      issues.push({
        rule: 'V-13',
        level: 'error',
        message: `Font "${v}" (fonts.${k}) is not bundled`,
        hint: `Bundled fonts: ${BUNDLED_FONTS.join(', ')}`,
        file,
      });
    }
  }
  for (const k of ['active', 'english'] as const) {
    if (!isColor(theme, theme.captions[k])) {
      issues.push({
        rule: 'V-1',
        level: 'error',
        message: `captions.${k}: "${theme.captions[k]}" is not a theme color or CSS color`,
        file,
      });
    }
  }
  if (!seen.length) issues.push(...captionContrastIssues(theme).map((i) => ({ ...i, file })));
  return { theme, files: [...base.files, file], issues };
}

function luminance(hex: string): number | undefined {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return undefined;
  const ch = [0, 2, 4]
    .map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG contrast ratio between two #rrggbb colors (undefined for other formats). */
export function contrastRatio(a: string, b: string): number | undefined {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === undefined || lb === undefined) return undefined;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * NFR-14: caption text (ink, active and english colors) must reach 7:1 against the scrim.
 * The scrim is the background color at `captions.scrim` opacity over the background, i.e. ≈ bg.
 */
export function captionContrastIssues(theme: Theme): Issue[] {
  const bg = theme.colors.bg;
  const out: Issue[] = [];
  for (const [name, c] of [
    ['colors.ink', theme.colors.ink],
    ['captions.active', resolveColor(theme, theme.captions.active)],
    ['captions.english', resolveColor(theme, theme.captions.english)],
  ] as const) {
    const r = contrastRatio(c, bg);
    if (r !== undefined && r < 7) {
      out.push({
        rule: 'V-1',
        level: 'warn',
        message: `Theme "${theme.name}": caption color ${name} (${c}) has contrast ${r.toFixed(1)}:1 against the background (needs ≥ 7:1)`,
        hint: 'Use a lighter caption color or a darker bg',
      });
    }
  }
  return out;
}

/** Theme with caption color tokens resolved to CSS values (DR-5). */
export function resolvedTheme(theme: Theme): Theme {
  return {
    ...theme,
    captions: {
      ...theme.captions,
      active: resolveColor(theme, theme.captions.active),
      english: resolveColor(theme, theme.captions.english),
    },
  };
}
