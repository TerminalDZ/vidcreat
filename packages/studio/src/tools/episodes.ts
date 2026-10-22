/** Episode tools: list, read, create, edit, replace and validate episode.yaml. */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  compileEpisode,
  draftCues,
  episodeJsonSchema,
  episodePaths,
  episodeTemplate,
  readCues,
  writeCues,
} from '@reelforge/core';
import { measureTimeline } from '@reelforge/renderer';
import { z } from 'zod';
import { applyOps, parseOps, type EditOp } from '../server/edit.js';
import {
  atomicWrite,
  checked,
  checkedOutput,
  compile,
  episodeArg,
  episodeOf,
  fatal,
  issueSummary,
  keyOf,
  outline,
  text,
} from './common.js';
import { defineTool, ToolError, type Json } from './types.js';

const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export const listEpisodes = defineTool({
  name: 'list_episodes',
  title: 'List episodes',
  description:
    'List every episode in the project (episodes/ and examples/) with title, language, duration, voice/cue status and error count.',
  input: z.object({}).strict(),
  toolsets: ['basic'],
  annotations: { readOnlyHint: true },
  handler: async (_a, ctx) => {
    const found: Json[] = [];
    const scan = (dir: string, depth: number) => {
      if (!existsSync(dir) || depth > 2) return;
      for (const name of readdirSync(dir).sort()) {
        const full = path.join(dir, name);
        if (name.startsWith('.') || name === 'out' || !statSync(full).isDirectory()) continue;
        if (existsSync(path.join(full, 'episode.yaml'))) {
          const p = episodePaths(full, ctx.root);
          const r = compileEpisode(p, { draftCues: true, voice: null });
          const cues = readCues(p.cues).cues;
          found.push({
            episode: keyOf(ctx, p),
            title: r.spec?.meta.title,
            lang: r.spec?.meta.lang,
            lines: r.script.length,
            scenes: r.spec?.scenes.length ?? 0,
            voice: existsSync(path.join(full, r.spec?.audio.voice ?? 'voice.wav')),
            cues: cues ? (cues.draft ? 'draft' : 'marked') : 'none',
            errors: r.issues.filter((i) => i.level === 'error' && !(i.rule === 'V-4')).length,
          });
        } else scan(full, depth + 1);
      }
    };
    scan(path.join(ctx.root, 'episodes'), 0);
    scan(path.join(ctx.root, 'examples'), 0);
    return text(JSON.stringify(found, null, 2), { episodes: found });
  },
});

export const getEpisode = defineTool({
  name: 'get_episode',
  title: 'Read an episode',
  description:
    'Return the full episode.yaml text plus a compiled outline: script lines with ids, start times and words; scenes and elements with their YAML paths, resolved times and boxes; voice/cue status and lint issues. Read this before editing.',
  input: z.object({ episode: episodeArg }).strict(),
  toolsets: ['basic', 'design'],
  annotations: { readOnlyHint: true },
  handler: async (a, ctx) => {
    const p = episodeOf(ctx, a.episode);
    const o = outline(ctx, p, compile(ctx, p));
    return text(
      `# ${keyOf(ctx, p)}/episode.yaml\n\n${readFileSync(p.yaml, 'utf8')}\n\n# Outline (compiled)\n\n${JSON.stringify(o, null, 2)}`,
      o,
    );
  },
});

export const createEpisode = defineTool({
  name: 'create_episode',
  title: 'Create an episode',
  description:
    'Create episodes/<id>/episode.yaml from the commented template. Optionally give the script (one spoken sentence per entry) to replace the template lines; estimated (draft) cues are written so the episode previews immediately. Then design scenes with edit_episode or write_episode_yaml.',
  input: z
    .object({
      id: z.string().regex(SLUG, 'id must be a slug like "ep10"').describe('Slug, e.g. "ep10"'),
      title: z.string().optional(),
      series: z.string().optional().describe('Series name shown in the header'),
      lang: z.enum(['en', 'ar']).optional().describe('Language of the voice-over (default en)'),
      script: z.array(z.string().min(1)).optional().describe('Spoken sentences, one per line'),
    })
    .strict(),
  output: checkedOutput,
  toolsets: ['basic'],
  handler: async (a, ctx) => {
    const dir = path.join(ctx.root, 'episodes', a.id);
    if (existsSync(path.join(dir, 'episode.yaml'))) throw new ToolError(`episodes/${a.id} already exists`);
    mkdirSync(path.join(dir, 'assets'), { recursive: true });
    let yaml = episodeTemplate(a.id, { series: a.series || undefined, lang: a.lang === 'ar' ? 'ar' : 'en' });
    writeFileSync(path.join(dir, 'episode.yaml'), yaml);
    const p = episodePaths(dir, ctx.root);
    const ops: EditOp[] = [];
    if (a.title) ops.push({ op: 'set', path: ['meta', 'title'], value: a.title });
    if (a.script?.length) {
      ops.push({ op: 'set', path: ['script'], value: a.script.map((t) => ({ text: t })) });
      // keep the template scenes valid: anchor them to line starts
      ops.push({
        op: 'set',
        path: ['scenes'],
        value: [
          {
            id: 'hook',
            at: 'l1',
            elements: [
              {
                use: 'title',
                id: 'hook_title',
                props: { text: a.title ?? 'Your **headline**' },
                enter: { at: 'l1', anim: 'pop' },
              },
            ],
          },
        ],
      });
      ops.push({ op: 'set', path: ['chapters'], value: [] });
    }
    if (ops.length) {
      yaml = applyOps(yaml, ops);
      writeFileSync(p.yaml, yaml);
    }
    const r = compile(ctx, p);
    writeCues(p.cues, draftCues(r.script, r.spec?.audio.voice));
    const schemaFile = path.join(ctx.root, 'schema', 'episode.schema.json');
    if (!existsSync(schemaFile)) {
      mkdirSync(path.dirname(schemaFile), { recursive: true });
      writeFileSync(schemaFile, `${JSON.stringify(episodeJsonSchema(), null, 2)}\n`);
    }
    const after = compile(ctx, p);
    const o = outline(ctx, p, after);
    const res = checked(
      `Created episodes/${a.id}/episode.yaml with draft cues.`,
      after.issues,
      'design scenes with edit_episode (suggest_scene gives a valid element per line), then validate_episode.',
      { episode: keyOf(ctx, p), outline: o },
    );
    res.content.push({ type: 'text', text: `Outline (compiled):\n${JSON.stringify(o, null, 2)}` });
    return res;
  },
});

const opSchema = z
  .object({
    op: z.enum(['set', 'delete', 'insert', 'move']),
    path: z.array(z.union([z.string(), z.number().int()])),
    value: z.unknown().optional(),
    index: z.number().int().min(0).optional(),
    from: z.number().int().min(0).optional(),
    to: z.number().int().min(0).optional(),
  })
  .passthrough();

export const editEpisode = defineTool({
  name: 'edit_episode',
  title: 'Edit an episode (structured)',
  description: [
    'Apply structured edits to episode.yaml. Comments and formatting of untouched parts are kept. Operations (applied in order):',
    '- {"op":"set","path":[...],"value":...} sets a value (missing parents are created);',
    '- {"op":"delete","path":[...]} removes a key or list item;',
    '- {"op":"insert","path":[...list],"index":n?,"value":...} inserts into a list (appends without index);',
    '- {"op":"move","path":[...list],"from":i,"to":j} reorders a list.',
    'Paths are arrays of keys and 0-based indexes, e.g. ["scenes",0,"elements",2,"props","text"] or ["scenes",1,"elements"] to add an element. Get paths from get_episode. Returns the compile result (errors/warnings) with fix hints and the next step.',
  ].join('\n'),
  input: z.object({ episode: episodeArg, ops: z.array(opSchema).min(1) }).strict(),
  output: checkedOutput,
  toolsets: ['design'],
  handler: async (a, ctx) => {
    const p = episodeOf(ctx, a.episode);
    const before = readFileSync(p.yaml, 'utf8');
    let after: string;
    try {
      after = applyOps(before, parseOps({ ops: a.ops }));
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
    atomicWrite(p.yaml, after);
    return checked(
      `Applied ${a.ops.length} edit(s).`,
      compile(ctx, p).issues,
      `preview_frames shortly after the changed elements enter (e.g. "l3:'word'+0.8") and check the layout.`,
    );
  },
});

export const writeEpisodeYaml = defineTool({
  name: 'write_episode_yaml',
  title: 'Replace episode.yaml',
  description:
    'Replace the whole episode.yaml with new YAML text (use for large rewrites; prefer edit_episode for small changes). The file is only written when it parses and has no schema errors, unless force is true.',
  input: z
    .object({ episode: episodeArg, yaml: z.string().min(10), force: z.boolean().default(false) })
    .strict(),
  output: checkedOutput,
  toolsets: ['design'],
  annotations: { destructiveHint: true },
  handler: async (a, ctx) => {
    const p = episodeOf(ctx, a.episode);
    const r = compile(ctx, p, a.yaml);
    if (fatal(r) && !a.force)
      return checked(
        'Not written: the YAML has errors.',
        r.issues,
        'call write_episode_yaml again.',
        {},
        true,
      );
    atomicWrite(p.yaml, a.yaml.endsWith('\n') ? a.yaml : `${a.yaml}\n`);
    return checked(
      `Wrote ${keyOf(ctx, p)}/episode.yaml.`,
      r.issues,
      'validate_episode, then preview_frames at key moments.',
    );
  },
});

export const validateEpisode = defineTool({
  name: 'validate_episode',
  title: 'Validate an episode',
  description:
    'Run every check (V-1…V-14: schema, cues, timing, pacing, overlaps, off-screen elements, platform safe zones, text overflow measured in the real browser, caption length). Each issue has a line, time and fix hint.',
  input: z
    .object({
      episode: episodeArg,
      measure: z.boolean().default(true).describe('Measure text overflow headless (slower)'),
    })
    .strict(),
  output: checkedOutput,
  toolsets: ['basic'],
  annotations: { readOnlyHint: true },
  handler: async (a, ctx) => {
    const p = episodeOf(ctx, a.episode);
    const r = compile(ctx, p);
    const issues = [...r.issues];
    if (a.measure && r.timeline && !fatal(r))
      issues.push(
        ...(await measureTimeline(r.timeline, {
          cacheDir: path.join(p.out, '.cache'),
          assetsDir: p.assets,
          file: p.yaml,
        })),
      );
    const s = issueSummary(issues);
    return checked(
      s.list.length ? 'Checked.' : 'No issues. Ready to render.',
      issues,
      'preview_frames at key moments; when it looks clean, render_episode (or hand over to the person to record the voice).',
    );
  },
});

export const tools = [
  listEpisodes,
  getEpisode,
  createEpisode,
  editEpisode,
  writeEpisodeYaml,
  validateEpisode,
];
