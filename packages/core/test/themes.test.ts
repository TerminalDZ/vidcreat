import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUNDLED_FONTS,
  captionContrastIssues,
  FONT_ROLES,
  generateTheme,
  INSTALL_ROOT,
  loadTheme,
  themeContrast,
  type Theme,
} from '@reelforge/core';

const ROOT = INSTALL_ROOT;
const THEMES = readdirSync(path.join(ROOT, 'themes'))
  .filter((f) => f.endsWith('.theme.yaml'))
  .map((f) => f.replace(/\.theme\.yaml$/, ''))
  .sort();
const TOKENS = ['bg', 'ink', 'dim', 'line', 'card', 'lime', 'cyan', 'red', 'amber', 'violet'];

const failures = (t: Theme) =>
  themeContrast(t)
    .filter((c) => c.ratio < c.min)
    .map((c) => `${c.token} ${c.color} on ${c.against}: ${c.ratio.toFixed(2)}:1 < ${c.min}:1`);

/*
 * WCAG 2.1 AA (1.4.3), checked for every theme in themes/ on both text surfaces (bg and card):
 * - ink, captions.active and captions.english: ≥ 4.5:1 (captions also need 7:1 on the scrim, NFR-14).
 * - dim: ≥ 4.5:1, not the 3:1 large-text allowance. dim sets subtitles, mono labels, table headers
 *   and chart ticks at 20–30 px on a 1080 px canvas, which is normal-size text.
 * - accents (lime, cyan, red, amber, violet): ≥ 4.5:1, because components use them as text color
 *   (chips, labels, highlighted title words, stat values), not only as fills.
 */
describe('theme contrast (WCAG AA)', () => {
  it('finds the bundled themes', () => {
    expect(THEMES).toEqual(
      expect.arrayContaining(['default', 'clinical', 'harbor', 'editorial', 'bold', 'minimal']),
    );
    expect(THEMES.length).toBeGreaterThanOrEqual(16);
  });

  it.each(THEMES)('%s: loads cleanly with a full token set and readable text', (name) => {
    const { theme, issues } = loadTheme(name, ROOT, ROOT);
    expect(issues).toEqual([]);
    for (const k of TOKENS) expect(theme.colors[k], `colors.${k}`).toMatch(/^#[0-9a-f]{6}$/i);
    for (const f of Object.values(theme.fonts)) expect(BUNDLED_FONTS).toContain(f);
    expect(themeContrast(theme)).toHaveLength(2 * 9);
    expect(failures(theme)).toEqual([]);
    expect(captionContrastIssues(theme)).toEqual([]);
  });

  it('light themes are marked light and drop the dark vignette', () => {
    for (const name of THEMES) {
      const { theme } = loadTheme(name, ROOT, ROOT);
      const bgLight = parseInt(theme.colors.bg.slice(1, 3), 16) > 0x80;
      expect(theme.mode, name).toBe(bgLight ? 'light' : 'dark');
      if (theme.mode === 'light') expect(theme.chrome.vignette, name).toBeLessThanOrEqual(0.2);
    }
  });
});

describe('generateTheme (reelforge theme new)', () => {
  const accents = [
    '#3cc8ff',
    '#b8ff3c',
    '#ff2d55',
    '#ffd60a',
    '#5856d6',
    '#00a884',
    '#111111',
    '#ffffff',
    '#8e8e93',
  ];

  it.each(['dark', 'light'] as const)('%s: every accent gives a full theme that passes contrast', (mode) => {
    for (const accent of accents) {
      const { theme, yaml } = generateTheme({ name: 'gen', accent, mode });
      expect(theme.mode).toBe(mode);
      for (const k of TOKENS) expect(theme.colors[k], `${accent} ${k}`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(failures(theme), accent).toEqual([]);
      expect(captionContrastIssues(theme), accent).toEqual([]);
      expect(yaml).toContain(`mode: ${mode}`);
    }
  });

  it('keeps a readable accent as is and puts a font in its slot', () => {
    expect(generateTheme({ name: 'ocean', accent: '3CC8FF' }).yaml).toMatch(/lime: '#3cc8ff'/);
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'rf-themegen-'));
    mkdirSync(path.join(tmp, 'themes'));
    for (const font of BUNDLED_FONTS) {
      for (const mode of ['dark', 'light'] as const) {
        const { theme, yaml } = generateTheme({ name: 'gen', accent: '#00a884', mode, font });
        expect(theme.fonts[FONT_ROLES[font]]).toBe(font);
        // The written YAML loads back to the same theme, without issues.
        writeFileSync(path.join(tmp, 'themes/gen.theme.yaml'), yaml);
        const loaded = loadTheme('gen', tmp, tmp);
        expect(loaded.issues, `${font} ${mode}`).toEqual([]);
        expect(loaded.theme).toEqual(theme);
      }
    }
    expect(() => generateTheme({ name: 'x', accent: 'blue' })).toThrow(/hex/);
    expect(() => generateTheme({ name: 'x', accent: '#00a884', font: 'Comic Sans' })).toThrow(/not bundled/);
  });
});
