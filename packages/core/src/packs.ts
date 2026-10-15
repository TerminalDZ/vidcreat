/**
 * Industry packs (`packs/<id>/pack.yaml`): a theme, templates with slots, recommended blueprints and
 * example episodes for one sector. Templates are episode.yaml files with `{{slot}}` placeholders, one
 * per language. Filling a template only substitutes validated slot values, so the Tier 1 tool
 * (`create_from_template`) lets even a small model make a valid episode by filling a flat object.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { INSTALL_ROOT } from './project.js';

const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const localized = z.union([z.string(), z.object({ en: z.string(), ar: z.string() }).strict()]);
const slot = z
  .object({
    label: z.string().min(1),
    type: z.enum(['text', 'number', 'color']).default('text'),
    /** Text: maximum characters. Number: maximum value. */
    max: z.number().optional(),
    min: z.number().optional(),
    default: z.union([localized, z.number()]),
    help: z.string().optional(),
  })
  .strict();
const template = z
  .object({
    id: z.string().regex(ID),
    title: localized,
    description: localized,
    slots: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,30}$/), slot),
    files: z.object({ en: z.string(), ar: z.string().optional() }).strict(),
  })
  .strict();
export const packSchema = z
  .object({
    id: z.string().regex(ID),
    name: localized,
    description: localized,
    theme: z.string().min(1),
    /** Playbook reference for agents (path relative to the repository). */
    playbook: z.string().optional(),
    blueprints: z.array(z.string()).default([]),
    templates: z.array(template).min(1),
    /** Example episode folders, relative to the pack. */
    examples: z.array(z.string()).default([]),
  })
  .strict();

export type PackSpec = z.infer<typeof packSchema>;
export type TemplateSpec = z.infer<typeof template>;
export type SlotSpec = z.infer<typeof slot>;
export type Lang = 'en' | 'ar';
export interface Pack extends PackSpec {
  dir: string;
}

export const pick = (v: string | { en: string; ar: string }, lang: Lang): string =>
  typeof v === 'string' ? v : v[lang];

/** Packs from the install (`packs/`) and the project (`<root>/packs/`, wins on the same id). */
export function listPacks(root?: string): { packs: Pack[]; errors: string[] } {
  const byId = new Map<string, Pack>();
  const errors: string[] = [];
  for (const base of [path.join(INSTALL_ROOT, 'packs'), ...(root ? [path.join(root, 'packs')] : [])]) {
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base).sort()) {
      const file = path.join(base, name, 'pack.yaml');
      if (!existsSync(file)) continue;
      const r = packSchema.safeParse(parse(readFileSync(file, 'utf8')));
      if (!r.success) {
        errors.push(`${file}: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
        continue;
      }
      byId.set(r.data.id, { ...r.data, dir: path.dirname(file) });
    }
  }
  return { packs: [...byId.values()], errors };
}

export function findTemplate(
  packs: Pack[],
  packId: string,
  templateId: string,
): { pack: Pack; template: TemplateSpec } {
  const pack = packs.find((p) => p.id === packId);
  if (!pack) throw new Error(`Unknown pack "${packId}" (packs: ${packs.map((p) => p.id).join(', ')})`);
  const t = pack.templates.find((x) => x.id === templateId);
  if (!t)
    throw new Error(
      `Pack "${packId}" has no template "${templateId}" (templates: ${pack.templates.map((x) => x.id).join(', ')})`,
    );
  return { pack, template: t };
}

/** Zod validator for a template's slot values; missing slots take their (localized) default. */
export function slotsSchema(t: TemplateSpec, lang: Lang): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {};
  for (const [name, s] of Object.entries(t.slots)) {
    const def = typeof s.default === 'number' ? s.default : pick(s.default, lang);
    if (s.type === 'number') {
      let n = z.number();
      if (s.min !== undefined) n = n.min(s.min);
      if (s.max !== undefined) n = n.max(s.max);
      shape[name] = n.default(Number(def));
    } else if (s.type === 'color') {
      shape[name] = z
        .string()
        .regex(/^(#[0-9a-fA-F]{3,8}|[a-z]{3,16})$/, 'a theme color name (lime, cyan…) or #hex')
        .default(String(def));
    } else {
      shape[name] = z
        .string()
        .trim()
        .min(1)
        .max(s.max ?? 80)
        .refine((v) => !/[\r\n]|\{\{/.test(v), 'one line, no {{')
        .default(String(def));
    }
  }
  return z.object(shape).strict();
}

/**
 * The template file for `lang` with every `{{slot}}` replaced (and `{{id}}` by the episode id).
 * Text values are escaped for single-quoted YAML scalars, which is how templates quote slots.
 */
export function fillTemplate(
  pack: Pack,
  t: TemplateSpec,
  opts: { lang: Lang; id: string; slots?: Record<string, unknown> },
): { yaml: string; slots: Record<string, unknown> } {
  const file = opts.lang === 'ar' ? (t.files.ar ?? t.files.en) : t.files.en;
  const src = readFileSync(path.join(pack.dir, file), 'utf8');
  const values = slotsSchema(t, opts.lang).parse(opts.slots ?? {});
  const all: Record<string, unknown> = { ...values, id: opts.id };
  const yaml = src.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g, (m, name: string) => {
    if (!(name in all)) throw new Error(`${file}: unknown slot {{${name}}}`);
    const v = all[name];
    return typeof v === 'number' ? String(v) : String(v).replace(/'/g, "''");
  });
  return { yaml, slots: values };
}
