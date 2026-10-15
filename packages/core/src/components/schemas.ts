/**
 * Component prop schemas (SRS §6.3). Each component's runtime implementation lives in
 * @reelforge/runtime under the same name; this side owns validation, defaults, sizing and SFX hooks.
 *
 * Convention: any prop key named `at` or `until` (at any depth) is a time expression and is resolved
 * to seconds by the compiler; so are `strike` and `highlight` when they are not booleans. Keys named `color`, `accent`, `danger` (and `colors[]`) accept theme
 * color names and are resolved to CSS colors.
 */
import { z } from 'zod';
import { color, endpoint, int, time } from '../schema/common.js';

export const ICONS = [
  'lock',
  'unlock',
  'bell',
  'clock',
  'warn',
  'bubble',
  'bomb',
  'check',
  'x',
  'server',
  'db',
  'user',
  'users',
  'bolt',
  'card',
  'wifi',
  'wifi-off',
  'cloud',
  'key',
  'mail',
  'cart',
  'cpu',
  'queue',
  'shield',
  'fire',
  'refresh',
  'hourglass',
  'phone',
  'code',
  'globe',
] as const;

export const STATUSES = ['idle', 'ok', 'err', 'warn', 'busy', 'off'] as const;

const text = () => z.string();
const align = () => z.enum(['left', 'center', 'right']);

export const titleProps = z
  .object({
    text: text(),
    size: z.number().positive().optional(),
    align: align().default('center'),
    color: color().default('ink'),
    accent: color().default('lime'),
    font: z.enum(['auto', 'display', 'arabic', 'mono']).default('auto'),
    weight: int().min(100).max(1000).default(800),
    sub: z.string().optional(),
  })
  .strict();

export const labelProps = z
  .object({
    text: text(),
    color: color().default('dim'),
    size: z.number().positive().optional(),
    align: align().default('left'),
    dot: z.boolean().default(false),
  })
  .strict();

const codeLine = z.union([
  z.string(),
  z
    .object({
      text: z.string(),
      color: color().optional(),
      at: time().optional(),
      dim: z.boolean().optional(),
    })
    .strict(),
]);

export const codeProps = z
  .object({
    title: z.string().optional(),
    lang: z.string().default('ts'),
    lines: z.array(codeLine).min(1),
    fontSize: z.number().positive().default(30),
    cps: z.number().positive().default(28),
    caret: z.boolean().default(true),
    numbers: z.boolean().default(true),
    typing: z.boolean().default(true),
    highlight: z
      .array(
        z
          .object({
            line: int().min(1),
            at: time().optional(),
            until: time().optional(),
            color: color().default('lime'),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

export const nodeProps = z
  .object({
    title: z.string(),
    sub: z.string().optional(),
    color: color().default('cyan'),
    status: z.enum(STATUSES).default('idle'),
    icon: z.enum(ICONS).optional(),
    badge: z.string().optional(),
  })
  .strict();

const packet = z
  .object({
    at: time().optional(),
    dur: z.number().positive().default(0.8),
    color: color().optional(),
    reverse: z.boolean().default(false),
    label: z.string().optional(),
  })
  .strict();

export const arrowProps = z
  .object({
    from: endpoint(),
    to: endpoint(),
    label: z.string().optional(),
    color: color().default('dim'),
    dashed: z.boolean().default(false),
    route: z.enum(['straight', 'elbow', 'curve']).default('straight'),
    width: z.number().positive().default(5),
    head: z.enum(['end', 'start', 'both', 'none']).default('end'),
    packet: z.union([z.boolean(), packet]).default(false),
    packets: z.array(packet).default([]),
    gap: z.number().min(0).default(14),
  })
  .strict();

export const chipProps = z
  .object({
    text: z.string(),
    color: color().default('lime'),
    strike: z.union([z.boolean(), time()]).default(false),
    icon: z.enum(ICONS).optional(),
    variant: z.enum(['solid', 'outline', 'soft']).default('soft'),
    size: z.number().positive().default(34),
  })
  .strict();

export const stampProps = z
  .object({
    text: z.string(),
    color: color().default('red'),
    size: z.number().positive().default(120),
    rot: z.number().default(-5),
  })
  .strict();

const cell = z.union([
  z.string(),
  z.number(),
  z.object({ text: z.union([z.string(), z.number()]), color: color() }).strict(),
]);

export const tableProps = z
  .object({
    columns: z.array(z.string()).min(1),
    rows: z
      .array(
        z
          .object({
            cells: z.array(cell),
            at: time().optional(),
            highlight: z.union([z.boolean(), time()]).optional(),
            color: color().optional(),
            strike: z.union([z.boolean(), time()]).optional(),
          })
          .strict(),
      )
      .default([]),
    widths: z.array(z.number().positive()).optional(),
    fontSize: z.number().positive().default(28),
    accent: color().default('lime'),
  })
  .strict();

export const lanesProps = z
  .object({
    lanes: z
      .array(
        z
          .object({
            title: z.string(),
            color: color().default('cyan'),
            steps: z
              .array(
                z
                  .object({
                    text: z.string(),
                    at: time(),
                    color: color().optional(),
                    mark: z.enum(['ok', 'err', 'warn']).optional(),
                  })
                  .strict(),
              )
              .default([]),
          })
          .strict(),
      )
      .min(1),
    interleave: z.boolean().default(true),
    fontSize: z.number().positive().default(26),
  })
  .strict();

export const checklistProps = z
  .object({
    title: z.string().optional(),
    items: z
      .array(z.object({ text: z.string(), at: time().optional(), ok: z.boolean().default(true) }).strict())
      .min(1),
    fontSize: z.number().positive().default(36),
    color: color().default('lime'),
  })
  .strict();

const valueKeyframes = () =>
  z.array(z.object({ at: time(), value: z.number(), dur: z.number().min(0).optional() }).strict()).min(1);

export const counterProps = z
  .object({
    keyframes: valueKeyframes(),
    from: z.number().default(0),
    prefix: z.string().default(''),
    suffix: z.string().default(''),
    decimals: int().min(0).max(6).default(0),
    separator: z.boolean().default(true),
    label: z.string().optional(),
    color: color().default('ink'),
    size: z.number().positive().default(180),
  })
  .strict();

export const meterProps = z
  .object({
    keyframes: valueKeyframes(),
    from: z.number().default(0),
    max: z.number().positive().default(100),
    threshold: z.number().optional(),
    label: z.string().optional(),
    unit: z.string().default(''),
    color: color().default('lime'),
    danger: color().default('red'),
  })
  .strict();

export const timelineProps = z
  .object({
    markers: z
      .array(
        z
          .object({
            pos: z.number().min(0).max(1),
            label: z.string(),
            sub: z.string().optional(),
            at: time().optional(),
            color: color().optional(),
          })
          .strict(),
      )
      .default([]),
    start: z.string().optional(),
    end: z.string().optional(),
    color: color().default('cyan'),
    cursor: z
      .array(
        z.object({ at: time(), pos: z.number().min(0).max(1), dur: z.number().min(0).optional() }).strict(),
      )
      .default([]),
  })
  .strict();

const tileState = z.enum(STATUSES);

export const gridProps = z
  .object({
    cols: int().min(1).max(12),
    rows: int().min(1).max(12),
    tiles: z
      .array(
        z.union([
          z.string(),
          z.object({ label: z.string().optional(), state: tileState.optional() }).strict(),
        ]),
      )
      .default([]),
    steps: z.array(z.object({ at: time(), set: z.record(tileState) }).strict()).default([]),
    gap: z.number().min(0).default(14),
    label: z.string().optional(),
  })
  .strict();

export const bucketProps = z
  .object({
    capacity: int().min(1).max(40),
    keyframes: z.array(z.object({ at: time(), tokens: int().min(0) }).strict()).default([]),
    label: z.string().optional(),
    rate: z.string().optional(),
    color: color().default('lime'),
  })
  .strict();

export const phoneProps = z
  .object({
    title: z.string().default('Checkout'),
    amount: z.string().optional(),
    item: z.string().optional(),
    button: z.string().default('Pay now'),
    notifications: z
      .array(
        z
          .object({
            title: z.string().default('Bank'),
            text: z.string(),
            at: time().optional(),
            color: color().default('red'),
            icon: z.enum(ICONS).default('bell'),
          })
          .strict(),
      )
      .default([]),
    taps: z.array(z.object({ at: time() }).strict()).default([]),
    offline: z.boolean().default(false),
    loading: z.boolean().default(false),
    success: z.union([z.boolean(), z.string()]).default(false),
  })
  .strict();

export const quoteProps = z
  .object({
    text: z.string(),
    author: z.string().optional(),
    highlight: z.array(z.string()).default([]),
    cps: z.number().positive().default(32),
    color: color().default('lime'),
    size: z.number().positive().default(56),
  })
  .strict();

export const particlesProps = z
  .object({
    kind: z.enum(['burst', 'herd', 'stream', 'dust', 'confetti']).default('burst'),
    from: endpoint().optional(),
    to: endpoint().optional(),
    count: int().min(1).max(400).default(40),
    at: time().optional(),
    dur: z.number().positive().default(1.2),
    color: color().default('lime'),
    colors: z.array(color()).optional(),
    size: z.number().positive().default(10),
    spread: z.number().min(0).default(140),
    seed: int().default(1),
  })
  .strict();

export const trapProps = z
  .object({
    title: z.string().default('THE TRAP'),
    sub: z.string().optional(),
    at: time().optional(),
    until: time().optional(),
    color: color().default('amber'),
  })
  .strict();

export const ctaProps = z
  .object({
    label: z.string().default('NEXT EPISODE'),
    next: z.string(),
    keyword: z.string().optional(),
    prompt: z.string().default('Comment'),
    at: time().optional(),
    color: color().default('lime'),
  })
  .strict();

export const iconProps = z
  .object({
    name: z.enum(ICONS).optional(),
    src: z.string().optional(),
    size: z.number().positive().default(140),
    color: color().default('ink'),
    pulse: z.boolean().default(false),
    ring: z.boolean().default(false),
  })
  .strict()
  .refine((p) => p.name || p.src, {
    message: 'icon needs either "name" (bundled icon) or "src" (assets/…svg)',
  });
