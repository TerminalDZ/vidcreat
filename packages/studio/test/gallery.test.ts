import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { COMPONENTS, compileEpisode, episodePaths } from '@reelforge/core';
import { GROUPS } from '../client/src/component-groups.js';
import { snippetElement } from '../client/src/gallery-snippet.js';
import {
  componentScenes,
  galleryComponent,
  galleryComponents,
  galleryFrame,
  galleryThemes,
} from '../src/server/gallery.js';

const ROOT = path.resolve(__dirname, '../../..');

describe('gallery components', () => {
  it('maps each component to the first gallery scene that uses it', () => {
    const map = componentScenes(`
scenes:
  - id: intro
    elements: [{ use: title }, { use: chip }, { use: chip }]
  - id: later
    elements: [{ use: chip }, { use: counter }]
  - id: empty
  - { elements: [{ use: stamp }] }
`);
    expect(map).toEqual({ title: 'intro', chip: 'intro', counter: 'later' });
    expect(componentScenes('')).toEqual({});
  });

  it('lists every component with a preview scene from the installed gallery', () => {
    const list = galleryComponents(ROOT);
    expect(list).toHaveLength(Object.keys(COMPONENTS).length);
    const byName = Object.fromEntries(list.map((c) => [c.name, c]));
    expect(byName.title).toMatchObject({ scene: 'text', layer: 'base', size: { w: 960, h: 240 } });
    expect(byName['stat-card'].scene).toBe('bars');
    expect(list.every((c) => c.scene && galleryFrame(c.scene, ROOT))).toBe(true);
    // Installs without the fixtures still list components, without images.
    expect(galleryComponents(os.tmpdir()).every((c) => c.scene === null)).toBe(true);
    expect(galleryComponent('counter', ROOT)?.schema).toMatchObject({ type: 'object' });
    expect(galleryComponent('nope', ROOT)).toBeUndefined();
  });

  it('serves frames only for plain scene ids inside the installation', () => {
    expect(galleryFrame('text', ROOT)).toMatch(/text\.png$/);
    expect(galleryFrame('../episode', ROOT)).toBeUndefined();
    expect(galleryFrame('..', ROOT)).toBeUndefined();
    expect(galleryFrame('missing_scene', ROOT)).toBeUndefined();
  });

  it('groups every component exactly once (Insert panel and gallery)', () => {
    const names = GROUPS.flatMap(([, n]) => n);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(Object.keys(COMPONENTS).sort());
  });

  it('builds a valid YAML snippet for every component', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'rf-gallery-'));
    mkdirSync(path.join(dir, 'assets'));
    const comps = galleryComponents(ROOT);
    const spec = {
      meta: {
        id: 'snippets',
        title: 'Snippets',
        episode: 1,
        preset: 'tiktok',
        theme: 'default',
        lang: 'en-US',
      },
      script: comps.map((c, i) => ({ id: `l${i + 1}`, text: `Here is the ${c.name} component` })),
      scenes: comps.map((c, i) => ({
        id: `s${i + 1}`,
        at: `l${i + 1}`,
        // Each snippet enters on l1; move it to its own scene's line.
        elements: [{ ...snippetElement(c), enter: { at: `l${i + 1}` } }],
      })),
    };
    writeFileSync(path.join(dir, 'episode.yaml'), stringify(spec));
    const r = compileEpisode(episodePaths(dir, dir), { draftCues: true, voice: null });
    const errors = r.issues.filter(
      (i) => i.level === 'error' && !(i.rule === 'V-4' && /not found/.test(i.message)),
    );
    expect(errors).toEqual([]);
    expect(r.timeline?.scenes).toHaveLength(comps.length);
  });
});

describe('gallery themes', () => {
  it('lists built-in themes with tokens and a contrast summary', () => {
    const themes = galleryThemes(mkdtempSync(path.join(os.tmpdir(), 'rf-themes-')));
    expect(themes.length).toBeGreaterThanOrEqual(16);
    const clinical = themes.find((t) => t.name === 'clinical')!;
    expect(clinical).toMatchObject({ source: 'builtin', mode: 'light', fonts: { display: 'Inter' } });
    expect(clinical.colors.bg).toBe('#f3f7fa');
    expect(clinical.contrast.checks).toBeGreaterThan(0);
    expect(clinical.contrast.pass).toBe(clinical.contrast.failures.length === 0);
    expect(themes.every((t) => t.errors.length === 0)).toBe(true);
  });

  it('marks project themes', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'rf-themes-'));
    mkdirSync(path.join(root, 'themes'));
    writeFileSync(
      path.join(root, 'themes', 'brand.theme.yaml'),
      "name: brand\nextends: default\ncolors: { lime: '#ff00aa' }\n",
    );
    const brand = galleryThemes(root).find((t) => t.name === 'brand')!;
    expect(brand).toMatchObject({ source: 'project', mode: 'dark', colors: { lime: '#ff00aa' } });
  });
});
