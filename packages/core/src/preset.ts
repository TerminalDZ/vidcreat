/** Platform presets (SRS §7.1), loaded from editable presets/*.preset.yaml files. */
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { findResource, listResources } from './project.js';
import type { Issue, Preset } from './types.js';
import { didYouMean } from './util.js';
import { parseYaml } from './yamlsrc.js';

const rect = z.object({ name: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number() }).strict();

const presetFile = z
  .object({
    name: z.string(),
    label: z.string().optional(),
    canvas: z.object({ width: z.number().int(), height: z.number().int(), fps: z.number().int().positive() }).strict(),
    header_top: z.number(),
    stage: z.object({ y: z.number(), h: z.number().positive() }).strict(),
    captions_y: z.number(),
    safe: z.array(rect).default([]),
    share_mb: z.number().positive().default(28),
    max_duration: z.number().positive().default(600),
  })
  .strict();

export const FALLBACK_PRESET: Preset = {
  name: 'tiktok',
  label: 'TikTok',
  width: 1080,
  height: 1920,
  fps: 30,
  headerTop: 150,
  stage: { y: 270, h: 1000 },
  captionsY: 1300,
  safe: [
    { name: 'right-rail', x: 940, y: 900, w: 140, h: 1020 },
    { name: 'bottom', x: 0, y: 1540, w: 1080, h: 380 },
  ],
  shareMb: 28,
  maxDuration: 600,
};

export function loadPreset(name: string, root: string, episodeDir: string): { preset: Preset; file?: string; issues: Issue[] } {
  const file = findResource('preset', name, root, episodeDir);
  if (!file) {
    const alt = didYouMean(name, listResources('preset', root), 3);
    return {
      preset: FALLBACK_PRESET,
      issues: [
        {
          rule: 'V-1',
          level: 'error',
          message: `Preset "${name}" not found`,
          hint: alt ? `Did you mean "${alt}"?` : `Available: ${listResources('preset', root).join(', ')}`,
          path: 'meta.preset',
        },
      ],
    };
  }
  const src = parseYaml(readFileSync(file, 'utf8'), file);
  if (src.errors.length) return { preset: FALLBACK_PRESET, file, issues: src.errors };
  const parsed = presetFile.safeParse(src.data);
  if (!parsed.success) {
    return {
      preset: FALLBACK_PRESET,
      file,
      issues: parsed.error.issues.map((i) => ({ rule: 'V-1', level: 'error' as const, message: `Preset: ${i.path.join('.')}: ${i.message}`, file })),
    };
  }
  const d = parsed.data;
  return {
    file,
    issues: [],
    preset: {
      name: d.name,
      label: d.label ?? d.name,
      width: d.canvas.width,
      height: d.canvas.height,
      fps: d.canvas.fps,
      headerTop: d.header_top,
      stage: d.stage,
      captionsY: d.captions_y,
      safe: d.safe,
      shareMb: d.share_mb,
      maxDuration: d.max_duration,
    },
  };
}
