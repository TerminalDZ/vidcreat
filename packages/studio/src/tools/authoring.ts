/**
 * Guided authoring tools for models of every size:
 * - Tier 1 (small models): list_templates → create_from_template (fill a flat slot object) and
 *   suggest_scenes (a deterministic plan for every line).
 * - Tier 2 (medium models): list_blueprints → add_scene (a named scene from a few parameters).
 * Everything is validated with the same schemas as hand-written YAML, and every write returns the
 * validation summary with fix hints and the next step.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  BLUEPRINTS,
  blueprint,
  draftCues,
  episodePaths,
  fillTemplate,
  findTemplate,
  listPacks,
  pick,
  slotsSchema,
  splitWords,
  suggestForLine,
  writeCues,
  type Lang,
} from '@reelforge/core';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { applyOps } from '../server/edit.js';
import {
  atomicWrite,
  checked,
  checkedOutput,
  compile,
  episodeArg,
  episodeOf,
  keyOf,
  text,
} from './common.js';
import { defineTool, ToolError } from './types.js';

const SLUG = /^[a-z0-9][a-z0-9-]{0,40}$/;
const langArg = z.enum(['en', 'ar']).default('en').describe('Language of the episode (en or ar)');
const schemaOf = (s: z.ZodTypeAny) => {
  const j = zodToJsonSchema(s, { target: 'jsonSchema7', $refStrategy: 'none' }) as Record<string, unknown>;
  delete j.$schema;
  return j;
};

const packsOf = (root: string) => {
  const { packs, errors } = listPacks(root);
  if (!packs.length) throw new ToolError(`No industry packs found${errors.length ? `: ${errors[0]}` : ''}`);
  return packs;
};

export const listTemplates = defineTool({
  name: 'list_templates',
  title: 'List episode templates',
  description:
    'Ready-made episodes by industry (healthcare, real estate, ports, education, finance…). Each template has a few slots (short texts and numbers). Pick one, then call create_from_template with the slot values: the easiest way to make a good video.',
  input: z
    .object({
      pack: z.string().optional().describe('Only this pack (industry id)'),
      lang: langArg,
    })
    .strict(),
  toolsets: ['basic'],
  annotations: { readOnlyHint: true },
  handler: async (a, ctx) => {
    const lang = a.lang as Lang;
    const packs = packsOf(ctx.root).filter((p) => !a.pack || p.id === a.pack);
    if (!packs.length) throw new ToolError(`Unknown pack "${a.pack}"`);
    const out = packs.map((p) => ({
      pack: p.id,
      name: pick(p.name, lang),
      theme: p.theme,
      templates: p.templates.map((t) => ({
        template: t.id,
        title: pick(t.title, lang),
        description: pick(t.description, lang),
        slots: Object.fromEntries(
          Object.entries(t.slots).map(([k, s]) => [
            k,
            {
              label: s.label,
              type: s.type,
              ...(s.max !== undefined ? { max: s.max } : {}),
              ...(s.min !== undefined ? { min: s.min } : {}),
              default: typeof s.default === 'number' ? s.default : pick(s.default, lang),
              ...(s.help ? { help: s.help } : {}),
            },
          ]),
        ),
      })),
    }));
    const lines = out.flatMap((p) => [
      `${p.pack} — ${p.name} (theme ${p.theme})`,
      ...p.templates.map((t) => `  ${t.template}: ${t.title}. Slots: ${Object.keys(t.slots).join(', ')}`),
    ]);
    return text(
      `${lines.join('\n')}\n\nNext: create_from_template with {"id","pack","template","lang","slots":{…}} (omit a slot to keep its default).`,
      { packs: out },
    );
  },
});

export const createFromTemplate = defineTool({
  name: 'create_from_template',
  title: 'Create an episode from a template',
  description:
    'Create episodes/<id>/ from an industry template by filling its slots (a flat object of short texts, numbers or colors; see list_templates). Missing slots keep their defaults. Draft cues are written so it previews immediately.',
  input: z
    .object({
      id: z.string().regex(SLUG, 'id must be a slug like "clinic-intro"'),
      pack: z.string().min(1),
      template: z.string().min(1),
      lang: langArg,
      slots: z
        .record(z.union([z.string(), z.number()]))
        .default({})
        .describe('Slot values by name, e.g. {"hospital":"Northwind Hospital","beds":240}'),
    })
    .strict(),
  output: checkedOutput,
  toolsets: ['basic'],
  handler: async (a, ctx) => {
    const lang = a.lang as Lang;
    let found;
    try {
      found = findTemplate(packsOf(ctx.root), a.pack, a.template);
    } catch (e) {
      throw new ToolError(`${(e as Error).message}. Use list_templates.`);
    }
    const parsed = slotsSchema(found.template, lang).safeParse(a.slots);
    if (!parsed.success)
      throw new ToolError(
        `Invalid slots: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(slots)'}: ${i.message}`).join('; ')}. Use list_templates to see each slot's type and limit.`,
      );
    const dir = path.join(ctx.root, 'episodes', a.id);
    if (existsSync(path.join(dir, 'episode.yaml'))) throw new ToolError(`episodes/${a.id} already exists`);
    const { yaml } = fillTemplate(found.pack, found.template, { lang, id: a.id, slots: parsed.data });
    mkdirSync(path.join(dir, 'assets'), { recursive: true });
    writeFileSync(path.join(dir, 'episode.yaml'), yaml);
    const p = episodePaths(dir, ctx.root);
    const r = compile(ctx, p);
    writeCues(p.cues, draftCues(r.script, r.spec?.audio.voice));
    return checked(
      `Created episodes/${a.id} from ${a.pack}/${a.template} (${lang}).`,
      compile(ctx, p).issues,
      'preview_frames at a few times (e.g. ["l1+1","l3+1"]) to check the result, then render_episode or adjust texts with edit_episode.',
      { episode: keyOf(ctx, p) },
    );
  },
});

export const listBlueprints = defineTool({
  name: 'list_blueprints',
  title: 'List scene blueprints',
  description:
    'Named scene designs (hook, problem-solution, stat-reveal, comparison, process-steps, timeline, before-after, quote, cta…) with their parameters and an example. Use one with add_scene.',
  input: z
    .object({ name: z.string().optional().describe('Only this blueprint, with its full schema') })
    .strict(),
  toolsets: ['basic', 'design'],
  annotations: { readOnlyHint: true },
  handler: async (a) => {
    const list = a.name ? BLUEPRINTS.filter((b) => b.name === a.name) : BLUEPRINTS;
    if (!list.length)
      throw new ToolError(`Unknown blueprint "${a.name}" (${BLUEPRINTS.map((b) => b.name).join(', ')})`);
    const out = list.map((b) => ({
      name: b.name,
      title: b.title,
      description: b.description,
      params: schemaOf(b.params),
      example: b.example,
    }));
    return text(
      `${out.map((b) => `${b.name}: ${b.description}\n  example: ${JSON.stringify(b.example)}`).join('\n')}\n\nNext: add_scene with {"episode","blueprint","params"}.`,
      { blueprints: out },
    );
  },
});

export const addScene = defineTool({
  name: 'add_scene',
  title: 'Add a scene from a blueprint',
  description:
    'Add a complete scene to an episode from a named blueprint (see list_blueprints) and a few parameters. params.line is the script line the scene starts on; the scene is placed in time order and replaces an existing scene on the same line when replace is true.',
  input: z
    .object({
      episode: episodeArg,
      blueprint: z.string().min(1),
      params: z.record(z.unknown()).describe('Blueprint parameters, including "line" (e.g. "l3")'),
      replace: z.boolean().default(false).describe('Replace a scene that starts on the same line'),
    })
    .strict(),
  output: checkedOutput,
  toolsets: ['basic', 'design'],
  handler: async (a, ctx) => {
    const b = blueprint(a.blueprint);
    if (!b)
      throw new ToolError(`Unknown blueprint "${a.blueprint}" (${BLUEPRINTS.map((x) => x.name).join(', ')})`);
    const p = episodeOf(ctx, a.episode);
    const r = compile(ctx, p);
    if (!r.spec) throw new ToolError('Fix the errors in episode.yaml first (validate_episode).');
    const order = r.script.map((l) => l.id);
    const line = String(a.params.line ?? '');
    if (!order.includes(line))
      throw new ToolError(`params.line must be a script line id (${order.join(', ')})`);
    const ok = b.params.safeParse(a.params);
    if (!ok.success)
      throw new ToolError(
        `Invalid params for ${b.name}: ${ok.error.issues.map((i) => `${i.path.join('.') || '(params)'}: ${i.message}`).join('; ')}. Example: ${JSON.stringify(b.example)}`,
      );
    const scene = b.build(ok.data);
    const scenes = r.spec.scenes;
    const lineOf = (at: unknown) => order.indexOf(String(at).split(/[.:+\-@ ]/)[0]);
    const same = scenes.findIndex((s) => String(s.at) === line);
    const taken = new Set(scenes.map((s) => s.id));
    const ops = [];
    if (same >= 0 && a.replace) {
      ops.push({ op: 'set' as const, path: ['scenes', same], value: { ...scene, id: scenes[same].id } });
    } else {
      if (same >= 0)
        throw new ToolError(
          `Scene "${scenes[same].id}" already starts on ${line}: pass replace: true or pick another line.`,
        );
      let id = scene.id;
      for (let n = 2; taken.has(id); n++) id = `${scene.id}_${n}`;
      const index = scenes.findIndex((s) => lineOf(s.at) > order.indexOf(line));
      ops.push({
        op: 'insert' as const,
        path: ['scenes'],
        ...(index >= 0 ? { index } : {}),
        value: { ...scene, id },
      });
    }
    atomicWrite(p.yaml, applyOps(readFileSync(p.yaml, 'utf8'), ops));
    return checked(
      `Added a ${b.name} scene on ${line}.`,
      compile(ctx, p).issues,
      `preview_frames at "${line}+1.5" to look at it.`,
      { scene: scene.id },
    );
  },
});

/** Keyword cues for a blueprint (English and Arabic). */
const BLUEPRINT_HINTS: [string, RegExp][] = [
  ['comparison', /\b(vs\.?|versus|compared?|better than|instead of)\b|مقارنة|مقابل|بدل/i],
  ['process-steps', /\b(steps?|first|then|finally|process|how to)\b|خطوات|أولا|ثم|بعدين/i],
  ['timeline', /\b(19|20)\d\d\b|\b(year|month|since|until|history)\b|سنة|تاريخ|منذ/i],
  ['before-after', /\b(before|after|used to|now)\b|قبل|بعد|زمان|دلوقتي/i],
  ['stat-reveal', /\d|\b(percent|thousand|million|hundred)\b|مليون|ألف|الف|مية|%/i],
  ['quote', /["“«]/],
];

export const suggestScenes = defineTool({
  name: 'suggest_scenes',
  title: 'Suggest a plan for every line',
  description:
    'A deterministic scene plan for the whole script (no model needed): for each line, a fitting blueprint for add_scene and the best single element for edit_episode. Good first step after create_episode.',
  input: z.object({ episode: episodeArg }).strict(),
  toolsets: ['basic', 'design'],
  annotations: { readOnlyHint: true },
  handler: async (a, ctx) => {
    const p = episodeOf(ctx, a.episode);
    const r = compile(ctx, p);
    const n = r.script.length;
    const plan = r.script.map((l, i) => {
      const bp =
        i === 0
          ? 'hook'
          : i === n - 1
            ? 'cta'
            : (BLUEPRINT_HINTS.find(([, re]) => re.test(l.text))?.[0] ?? null);
      const el = suggestForLine(l, { first: i === 0, limit: 1 })[0] ?? null;
      return {
        line: l.id,
        text: l.text,
        words: splitWords(l.text).length,
        blueprint: bp,
        element: el ? { use: el.use, word: el.word, props: el.props, enter: el.enter } : null,
      };
    });
    const body = plan
      .map(
        (x) =>
          `${x.line}: ${x.blueprint ? `blueprint ${x.blueprint}` : '(add to the previous scene)'}; element ${x.element?.use ?? '-'} on "${x.element?.word ?? ''}" — ${x.text}`,
      )
      .join('\n');
    return text(
      `${body}\n\nNext: for lines with a blueprint, add_scene (list_blueprints shows the parameters); add single elements with edit_episode (insert into ["scenes", i, "elements"]).`,
      { plan },
    );
  },
});

export const tools = [listTemplates, createFromTemplate, listBlueprints, addScene, suggestScenes];
