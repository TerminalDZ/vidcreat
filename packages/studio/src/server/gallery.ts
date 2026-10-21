/**
 * Dashboard gallery data: components with the gallery scene that shows each one, and every theme with
 * its tokens and WCAG contrast summary. Preview frames are the golden frames of the component gallery
 * (fixtures/golden/components), which published installs may not ship.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BUILTIN_THEMES,
  COMPONENTS,
  episodeJsonSchema,
  INSTALL_ROOT,
  listResources,
  loadTheme,
  resolveColor,
  themeContrast,
} from '@reelforge/core';
import { parse } from 'yaml';
import { safeJoin } from './http.js';

const GALLERY_DIR = (installRoot: string) => path.join(installRoot, 'fixtures', 'golden', 'components');
const SCENE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** Component name → id of the first scene of the gallery episode that uses it. */
export function componentScenes(galleryYaml: string): Record<string, string> {
  const doc = parse(galleryYaml) as { scenes?: { id?: unknown; elements?: { use?: unknown }[] }[] } | null;
  const out: Record<string, string> = {};
  for (const s of doc?.scenes ?? []) {
    if (typeof s?.id !== 'string') continue;
    for (const e of s.elements ?? []) {
      if (typeof e?.use === 'string' && !(e.use in out)) out[e.use] = s.id;
    }
  }
  return out;
}

export interface GalleryComponent {
  name: string;
  description: string;
  size: { w: number; h: number };
  enter: string;
  layer: 'base' | 'overlay';
  fill: boolean;
  endpoints: string[];
  /** Gallery scene showing the component; null when the gallery or its frame is not installed. */
  scene: string | null;
}

export function galleryComponents(installRoot = INSTALL_ROOT): GalleryComponent[] {
  const file = path.join(GALLERY_DIR(installRoot), 'episode.yaml');
  let scenes: Record<string, string> = {};
  try {
    if (existsSync(file)) scenes = componentScenes(readFileSync(file, 'utf8'));
  } catch {
    scenes = {};
  }
  return Object.values(COMPONENTS).map((c) => {
    const scene = scenes[c.name];
    return {
      name: c.name,
      description: c.description,
      size: c.size,
      enter: c.enter ?? 'pop',
      layer: c.layer ?? 'base',
      fill: Boolean(c.fill),
      endpoints: c.endpoints ?? [],
      scene: scene && galleryFrame(scene, installRoot) ? scene : null,
    };
  });
}

/** One component with its props JSON Schema, or undefined for an unknown name. */
export function galleryComponent(name: string, installRoot = INSTALL_ROOT) {
  const c = galleryComponents(installRoot).find((x) => x.name === name);
  if (!c) return undefined;
  const schemas = (episodeJsonSchema() as { 'x-components': Record<string, unknown> })['x-components'];
  return { ...c, schema: schemas[name] };
}

/** Path of a gallery scene's golden frame (PNG inside the installation), if it exists. */
export function galleryFrame(scene: string, installRoot = INSTALL_ROOT): string | undefined {
  if (!SCENE_ID.test(scene)) return undefined;
  const f = safeJoin(path.join(GALLERY_DIR(installRoot), 'frames'), `${scene}.png`);
  return f && existsSync(f) ? f : undefined;
}

export interface GalleryTheme {
  name: string;
  source: 'project' | 'builtin';
  mode: 'dark' | 'light';
  colors: Record<string, string>;
  fonts: { display: string; mono: string; arabic: string };
  captions: { active: string; english: string };
  contrast: {
    min: number;
    pass: boolean;
    checks: number;
    failures: { token: string; against: string; ratio: number }[];
  };
  errors: string[];
}

/** Built-in and project themes, resolved through `extends`, with the WCAG AA contrast summary. */
export function galleryThemes(root: string): GalleryTheme[] {
  // Inside the ReelForge checkout the project themes folder is the built-in one.
  const dir = path.resolve(root, 'themes');
  const projectThemes = dir === path.resolve(BUILTIN_THEMES) ? undefined : dir;
  return listResources('theme', root).map((name) => {
    const { theme, issues } = loadTheme(name, root, root);
    const checks = themeContrast(theme);
    const failures = checks
      .filter((c) => c.ratio < c.min)
      .map((c) => ({ token: c.token, against: c.against, ratio: Math.round(c.ratio * 100) / 100 }));
    const min = checks.length ? Math.min(...checks.map((c) => c.ratio)) : 0;
    return {
      name,
      source:
        projectThemes && existsSync(path.join(projectThemes, `${name}.theme.yaml`)) ? 'project' : 'builtin',
      mode: theme.mode,
      colors: theme.colors,
      fonts: theme.fonts,
      captions: {
        active: resolveColor(theme, theme.captions.active),
        english: resolveColor(theme, theme.captions.english),
      },
      contrast: { min: Math.round(min * 100) / 100, pass: !failures.length, checks: checks.length, failures },
      errors: issues.filter((i) => i.level === 'error').map((i) => i.message),
    };
  });
}
