/**
 * The one tool registry. MCP over stdio, MCP over HTTP and the REST API all serve these definitions;
 * no transport declares a tool of its own.
 *
 * Adding a tool: write it in a group file (or a new one exporting `tools`) and list the group below.
 */
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { tools as authoring } from './authoring.js';
import { tools as components } from './components.js';
import { tools as cues } from './cues.js';
import { tools as episodes } from './episodes.js';
import { tools as guide } from './guide.js';
import { tools as preview } from './preview.js';
import { tools as render } from './render.js';
import {
  ToolError,
  TOOLSETS,
  type AnyTool,
  type Json,
  type ToolContext,
  type ToolResult,
  type Toolset,
} from './types.js';

export const TOOLS: readonly AnyTool[] = [
  ...episodes,
  ...preview,
  ...components,
  ...cues,
  ...render,
  ...guide,
  ...authoring,
];

{
  const seen = new Set<string>();
  for (const t of TOOLS) {
    if (seen.has(t.name)) throw new Error(`Duplicate tool name: ${t.name}`);
    seen.add(t.name);
  }
}

/** Parses "basic,design" (or "all", or nothing) into toolsets; throws on unknown names. */
export function parseToolsets(spec: string | readonly string[] | undefined | null): Toolset[] | 'all' {
  const names = (typeof spec === 'string' ? spec.split(',') : (spec ?? []))
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!names.length || names.includes('all')) return 'all';
  const bad = names.filter((n) => !(TOOLSETS as readonly string[]).includes(n));
  if (bad.length)
    throw new ToolError(`Unknown toolset(s): ${bad.join(', ')}. Use ${[...TOOLSETS, 'all'].join(', ')}.`);
  return names as Toolset[];
}

/** The tools in any of the given toolsets (every tool for "all"). */
export function selectTools(toolsets: Toolset[] | 'all' = 'all'): AnyTool[] {
  return toolsets === 'all' ? [...TOOLS] : TOOLS.filter((t) => t.toolsets.some((s) => toolsets.includes(s)));
}

export function toolsetMembers(): Record<Toolset | 'all', string[]> {
  const out = { all: TOOLS.map((t) => t.name) } as Record<Toolset | 'all', string[]>;
  for (const s of TOOLSETS) out[s] = selectTools([s]).map((t) => t.name);
  return out;
}

const schemaCache = new WeakMap<z.ZodTypeAny, Json>();

/** JSON Schema (draft 7, inlined) generated from a Zod schema. */
export function jsonSchemaOf(schema: z.ZodTypeAny): Json {
  let s = schemaCache.get(schema);
  if (!s) {
    s = zodToJsonSchema(schema, { $refStrategy: 'none' }) as Json;
    delete s.$schema;
    schemaCache.set(schema, s);
  }
  return s;
}

export interface ToolDescription {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  outputSchema?: Json;
  annotations?: Json;
  toolsets: Toolset[];
}

export function describeTool(t: AnyTool): ToolDescription {
  return {
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: jsonSchemaOf(t.input),
    ...(t.output ? { outputSchema: jsonSchemaOf(t.output) } : {}),
    ...(t.annotations ? { annotations: { title: t.title, ...t.annotations } } : {}),
    toolsets: [...t.toolsets],
  };
}

const zodMessage = (e: z.ZodError) =>
  e.issues.map((i) => `${i.path.length ? `${i.path.join('.')}: ` : ''}${i.message}`).join('; ');

/**
 * Validates the arguments and runs a tool. Expected failures (bad arguments, a missing episode, a
 * refused write) come back as an `isError` result that the model can read and act on.
 */
export async function callTool(tool: AnyTool, args: unknown, ctx: ToolContext): Promise<ToolResult> {
  try {
    const parsed = tool.input.safeParse(args ?? {});
    if (!parsed.success)
      throw new ToolError(`Invalid arguments for ${tool.name}: ${zodMessage(parsed.error)}`);
    return await tool.handler(parsed.data, ctx);
  } catch (e) {
    if (!(e instanceof ToolError)) ctx.log(`tool ${tool.name} failed: ${(e as Error).stack ?? e}`);
    return { content: [{ type: 'text', text: (e as Error).message }], isError: true };
  }
}
