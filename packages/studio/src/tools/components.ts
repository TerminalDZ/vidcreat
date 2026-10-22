/** Component tools: the catalogue, one component's props schema and element suggestions per line. */
import { COMPONENTS, episodeJsonSchema, suggestForLine } from '@reelforge/core';
import { llmStatus, llmUnavailableReason, suggestWithLlm } from '@reelforge/assist';
import { z } from 'zod';
import { compile, episodeArg, episodeOf, text } from './common.js';
import { defineTool, ToolError, type Json } from './types.js';

export const listComponents = defineTool({
  name: 'list_components',
  title: 'List components',
  description:
    'Every animated component (name, description, default size). Use get_component_schema for the props of one component.',
  input: z.object({}).strict(),
  toolsets: ['design'],
  annotations: { readOnlyHint: true },
  handler: async () => {
    const list = Object.values(COMPONENTS).map((c) => ({
      name: c.name,
      description: c.description,
      defaultSize: c.size,
      layer: c.layer ?? 'base',
      fillsScene: Boolean(c.fill),
      positionedByEndpoints: Boolean(c.endpoints?.length && !c.fill),
    }));
    return text(JSON.stringify(list, null, 2), { components: list });
  },
});

export const getComponentSchema = defineTool({
  name: 'get_component_schema',
  title: 'Component props schema',
  description: "JSON Schema of a component's props (types, enums, defaults, required fields).",
  input: z.object({ name: z.enum(Object.keys(COMPONENTS) as [string, ...string[]]) }).strict(),
  toolsets: ['design'],
  annotations: { readOnlyHint: true },
  handler: async (a) => {
    const schemas = (episodeJsonSchema() as { 'x-components': Json })['x-components'];
    const s = schemas[a.name];
    if (!s) throw new ToolError(`Unknown component "${a.name}"`);
    return text(JSON.stringify(s, null, 2), s as Json);
  },
});

export const suggestScene = defineTool({
  name: 'suggest_scene',
  title: 'Suggest elements for a line',
  description:
    'Suggest on-screen elements for one script line: component, valid props and an enter time on the word that names it (e.g. "race" → lanes, "token bucket" → bucket, numbers → counter). Instant keyword dictionary by default; llm: true asks the configured language model (local or cloud, REELFORGE_LLM_*; optional). Insert a suggestion with edit_episode (op insert into ["scenes", i, "elements"]).',
  input: z
    .object({
      episode: episodeArg,
      line: z.string().describe('Script line id, e.g. "l3"'),
      llm: z.boolean().default(false),
    })
    .strict(),
  toolsets: ['basic', 'design'],
  annotations: { readOnlyHint: true },
  handler: async (a, ctx) => {
    const p = episodeOf(ctx, a.episode);
    const r = compile(ctx, p);
    const i = r.script.findIndex((l) => l.id === a.line);
    if (i < 0)
      throw new ToolError(`Unknown line "${a.line}" (lines: ${r.script.map((l) => l.id).join(', ')})`);
    const dict = suggestForLine(r.script[i], { first: i === 0 });
    let ai: { suggestions: unknown[]; ms: number; model: string } | undefined;
    let note = '';
    if (a.llm) {
      const st = await llmStatus();
      if (st.available) {
        const cue = r.timeline?.cues[a.line] ?? 0;
        const scene = r.timeline?.scenes.find((s) => s.start <= cue + 1e-3 && s.end > cue);
        ai = await suggestWithLlm(r.script[i], {
          lang: r.spec?.meta.lang,
          context: [r.script[i - 1]?.text, r.script[i + 1]?.text].filter((x): x is string => Boolean(x)),
          elementIds: scene?.elements.map((e) => e.id) ?? [],
        });
      } else note = ` (dictionary only: ${llmUnavailableReason(st)})`;
    }
    const all = [...(ai?.suggestions ?? []), ...dict];
    return text(`${all.length} suggestion(s) for ${a.line}${note}:\n${JSON.stringify(all, null, 2)}`, {
      suggestions: all,
      llm: ai ? { model: ai.model, ms: ai.ms } : null,
    });
  },
});

export const tools = [listComponents, getComponentSchema, suggestScene];
