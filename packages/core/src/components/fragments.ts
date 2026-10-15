/**
 * Schema fragments shared by component prop schemas (charts, diagrams, hierarchies). Reuse these
 * instead of redefining number formats, keyframes, timing or tree nodes in each component.
 */
import { z } from 'zod';
import { color, int, time } from '../schema/common.js';

/** Keyframed numeric value: counts from the previous value to each `value` from `at` over `dur` s. */
export const valueKeyframes = () =>
  z.array(z.object({ at: time(), value: z.number(), dur: z.number().min(0).optional() }).strict()).min(1);

/** Number label formatting (spread into an object schema). */
export const numberFormat = (suffix = '') => ({
  prefix: z.string().default(''),
  suffix: z.string().default(suffix),
  decimals: int().min(0).max(6).default(0),
});

/** Seconds between consecutive items appearing. */
export const stagger = (d: number) => z.number().min(0).max(5).default(d);

/** Duration in seconds of a built-in animation (bars growing, lines drawing, …). */
export const animDur = (d: number) => z.number().min(0).max(10).default(d);

export const fontSize = (d: number) => z.number().positive().default(d);

/** A labelled number (bar, slice, ranking entry). */
export const datum = () => ({
  label: z.string(),
  value: z.number(),
  color: color().optional(),
});

/** Index of a highlighted item, optionally from a time on (`{ index, at }`). */
export const focus = () =>
  z.union([int().min(0), z.object({ index: int().min(0), at: time().optional() }).strict()]);

/** Axis bounds; omitted bounds are derived from the data and rounded to "nice" ticks. */
export const axisBounds = () => ({
  min: z.number().optional(),
  max: z.number().optional(),
});

/** A geographic position in degrees (spread into an object schema). */
export const lonLat = () => ({
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});

/** A short wall-clock time, `HH:MM` or `HH:MM:SS` (24 h). */
export const clockTime = () =>
  z
    .string()
    .regex(/^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Expected a time of day such as "09:30" or "17:45:10"');

/** A side panel of a two-part component: a title with optional text, image or icon. */
export const half = (c: string, icons: readonly [string, ...string[]]) =>
  z
    .object({
      title: z.string(),
      text: z.string().optional(),
      src: z.string().optional(),
      icon: z.enum(icons).optional(),
      color: color().default(c),
    })
    .strict();

interface TreeNodeIn {
  id?: string;
  parent?: string;
  children?: TreeNodeIn[];
}

/**
 * Hierarchy nodes given either nested (`children`) or flat (`id` + `parent`), or a mix of both.
 * `fields` are the per-node display props. Validates ids, parent references and cycles.
 * Nesting is bounded (JSON Schema export cannot express recursion); deeper trees use `parent` ids.
 */
export function treeNodes(fields: z.ZodRawShape, depth = 6) {
  const level = (children?: z.ZodTypeAny) =>
    z
      .object({
        id: z.string().optional(),
        parent: z.string().optional(),
        ...fields,
        ...(children ? { children: z.array(children).optional() } : {}),
      })
      .strict();
  let node: z.ZodTypeAny = level();
  for (let i = 1; i < depth; i++) node = level(node);
  return z
    .array(node)
    .min(1)
    .superRefine((nodes: TreeNodeIn[], ctx) => {
      const ids = new Map<string, TreeNodeIn>();
      const all: TreeNodeIn[] = [];
      const walk = (n: TreeNodeIn) => {
        all.push(n);
        if (n.id !== undefined) {
          if (ids.has(n.id)) ctx.addIssue({ code: 'custom', message: `Duplicate node id "${n.id}"` });
          ids.set(n.id, n);
        }
        n.children?.forEach(walk);
      };
      nodes.forEach(walk);
      for (const n of all) {
        if (n.parent === undefined) continue;
        if (!ids.has(n.parent)) {
          ctx.addIssue({
            code: 'custom',
            message: `Unknown parent "${n.parent}"${n.id ? ` for node "${n.id}"` : ''}`,
          });
          continue;
        }
        const seen = new Set<string>();
        let cur: TreeNodeIn | undefined = n;
        while (cur?.parent !== undefined) {
          if (seen.has(cur.parent)) {
            ctx.addIssue({ code: 'custom', message: `Parent cycle through "${cur.parent}"` });
            break;
          }
          seen.add(cur.parent);
          cur = ids.get(cur.parent);
        }
      }
      if (all.length > 40) ctx.addIssue({ code: 'custom', message: 'At most 40 nodes fit on screen' });
    });
}
