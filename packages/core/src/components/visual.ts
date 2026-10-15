/**
 * Prop schemas of the general-purpose data and structure components (charts, KPIs, comparisons,
 * processes, hierarchies, matrices). Same conventions as schemas.ts; shared pieces live in
 * fragments.ts.
 */
import { z } from 'zod';
import { color, int, time } from '../schema/common.js';
import {
  animDur,
  axisBounds,
  datum,
  focus,
  fontSize,
  numberFormat,
  stagger,
  treeNodes,
  valueKeyframes,
} from './fragments.js';
import { ICONS } from './schemas.js';

const icon = () => z.enum(ICONS);

// ------------------------------------------------------------------ data

export const barChartProps = z
  .object({
    bars: z
      .array(z.object({ ...datum(), keyframes: valueKeyframes().optional() }).strict())
      .min(1)
      .max(12),
    orient: z.enum(['vertical', 'horizontal']).default('vertical'),
    ...axisBounds(),
    title: z.string().optional(),
    values: z.boolean().default(true),
    grid: z.boolean().default(true),
    focus: focus().optional(),
    ...numberFormat(),
    color: color().default('cyan'),
    accent: color().default('lime'),
    stagger: stagger(0.12),
    dur: animDur(0.8),
    fontSize: fontSize(26),
  })
  .strict();

export const lineChartProps = z
  .object({
    series: z
      .array(
        z
          .object({
            label: z.string().optional(),
            values: z.array(z.number()).min(2).max(24),
            color: color().optional(),
            at: time().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(5),
    labels: z.array(z.string()).default([]),
    ...axisBounds(),
    title: z.string().optional(),
    points: z.boolean().default(true),
    area: z.boolean().default(true),
    grid: z.boolean().default(true),
    legend: z.boolean().default(true),
    ...numberFormat(),
    color: color().default('cyan'),
    stagger: stagger(0.3),
    dur: animDur(1.4),
    fontSize: fontSize(24),
  })
  .strict();

export const donutChartProps = z
  .object({
    segments: z.array(z.object(datum()).strict()).min(1).max(8),
    total: z.number().positive().optional(),
    label: z.string().optional(),
    value: z.string().optional(),
    show: z.enum(['percent', 'value', 'none']).default('percent'),
    legend: z.boolean().default(true),
    thickness: z.number().min(0.08).max(0.6).default(0.3),
    ...numberFormat(),
    color: color().default('cyan'),
    dur: animDur(1.2),
    fontSize: fontSize(28),
  })
  .strict();

export const statCardProps = z
  .object({
    label: z.string(),
    value: z.number(),
    from: z.number().default(0),
    keyframes: valueKeyframes().optional(),
    ...numberFormat(),
    separator: z.boolean().default(true),
    delta: z.union([z.number(), z.string()]).optional(),
    deltaSuffix: z.string().default('%'),
    good: z.enum(['up', 'down']).default('up'),
    sub: z.string().optional(),
    icon: icon().optional(),
    color: color().default('ink'),
    accent: color().default('cyan'),
    dur: animDur(1.2),
    size: fontSize(96),
  })
  .strict();

export const progressRingProps = z
  .object({
    value: z.number(),
    max: z.number().positive().default(100),
    from: z.number().default(0),
    keyframes: valueKeyframes().optional(),
    label: z.string().optional(),
    ...numberFormat('%'),
    color: color().default('lime'),
    thickness: z.number().positive().default(28),
    dur: animDur(1.2),
  })
  .strict();

const side = (c: string) =>
  z.object({ title: z.string(), color: color().default(c), icon: icon().optional() }).strict();
const verdict = () => z.union([z.boolean(), z.string(), z.number()]);

export const comparisonProps = z
  .object({
    a: side('cyan'),
    b: side('violet'),
    rows: z
      .array(z.object({ label: z.string(), a: verdict(), b: verdict(), at: time().optional() }).strict())
      .min(1)
      .max(8),
    winner: z
      .union([z.enum(['a', 'b']), z.object({ side: z.enum(['a', 'b']), at: time().optional() }).strict()])
      .optional(),
    badge: z.string().default('WINNER'),
    accent: color().default('lime'),
    stagger: stagger(0.35),
    fontSize: fontSize(32),
  })
  .strict();

const panel = (label: string, c: string) =>
  z
    .object({
      label: z.string().default(label),
      text: z.string().optional(),
      src: z.string().optional(),
      color: color().default(c),
    })
    .strict()
    .refine((p) => p.text !== undefined || p.src !== undefined, {
      message: 'A before/after panel needs "text" or "src" (assets/…png|jpg|svg)',
    });

export const beforeAfterProps = z
  .object({
    before: panel('BEFORE', 'red'),
    after: panel('AFTER', 'lime'),
    at: time().optional(),
    dur: animDur(1.1),
    split: z.number().min(0.2).max(0.8).default(0.5),
    fontSize: fontSize(44),
  })
  .strict();

export const rankingProps = z
  .object({
    items: z
      .array(z.object({ ...datum(), icon: icon().optional() }).strict())
      .min(1)
      .max(10),
    sort: z.boolean().default(true),
    order: z.enum(['bottom-up', 'top-down']).default('bottom-up'),
    max: z.number().positive().optional(),
    values: z.boolean().default(true),
    ...numberFormat(),
    color: color().default('cyan'),
    accent: color().default('lime'),
    stagger: stagger(0.3),
    dur: animDur(0.7),
    fontSize: fontSize(30),
  })
  .strict();

// ------------------------------------------------------------------ process & structure

export const stepsProps = z
  .object({
    items: z
      .array(
        z
          .object({
            title: z.string(),
            text: z.string().optional(),
            icon: icon().optional(),
            at: time().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    orient: z.enum(['vertical', 'horizontal']).default('vertical'),
    color: color().default('lime'),
    stagger: stagger(0.5),
    fontSize: fontSize(40),
  })
  .strict();

const stage = () => ({
  label: z.string(),
  sub: z.string().optional(),
  icon: icon().optional(),
  color: color().optional(),
});

export const flowProps = z
  .object({
    stages: z
      .array(z.object({ ...stage(), at: time().optional() }).strict())
      .min(2)
      .max(6),
    token: z
      .union([
        z.boolean(),
        z
          .object({
            at: time().optional(),
            dur: z.number().positive().default(0.5),
            color: color().optional(),
            loop: z.boolean().default(false),
          })
          .strict(),
      ])
      .default(true),
    color: color().default('cyan'),
    accent: color().default('lime'),
    stagger: stagger(0.25),
    fontSize: fontSize(28),
  })
  .strict();

export const orgChartProps = z
  .object({
    people: treeNodes({
      name: z.string(),
      role: z.string().optional(),
      color: color().optional(),
      icon: icon().optional(),
    }),
    color: color().default('cyan'),
    accent: color().default('lime'),
    stagger: stagger(0.35),
    fontSize: fontSize(30),
  })
  .strict();

export const treeProps = z
  .object({
    nodes: treeNodes({ label: z.string(), color: color().optional() }),
    orient: z.enum(['down', 'right']).default('down'),
    color: color().default('violet'),
    stagger: stagger(0.3),
    fontSize: fontSize(28),
  })
  .strict();

export const cycleProps = z
  .object({
    stages: z.array(z.object(stage()).strict()).min(2).max(8),
    active: z.array(z.object({ at: time(), index: int().min(0) }).strict()).default([]),
    step: z.number().min(0).default(0.8),
    center: z.string().optional(),
    color: color().default('cyan'),
    accent: color().default('lime'),
    stagger: stagger(0.15),
    fontSize: fontSize(28),
  })
  .strict();

export const funnelProps = z
  .object({
    stages: z
      .array(
        z
          .object({
            label: z.string(),
            value: z.number().nonnegative().optional(),
            color: color().optional(),
            at: time().optional(),
          })
          .strict(),
      )
      .min(2)
      .max(7),
    rate: z.boolean().default(false),
    neck: z.number().min(0.1).max(0.9).default(0.32),
    ...numberFormat(),
    color: color().default('cyan'),
    accent: color().default('violet'),
    stagger: stagger(0.3),
    fontSize: fontSize(32),
  })
  .strict();

export const pyramidProps = z
  .object({
    levels: z
      .array(
        z
          .object({
            label: z.string(),
            sub: z.string().optional(),
            color: color().optional(),
            at: time().optional(),
          })
          .strict(),
      )
      .min(2)
      .max(7),
    order: z.enum(['bottom-up', 'top-down']).default('bottom-up'),
    color: color().default('cyan'),
    accent: color().default('lime'),
    stagger: stagger(0.3),
    fontSize: fontSize(32),
  })
  .strict();

const matrixAxis = () =>
  z
    .object({
      label: z.string().optional(),
      low: z.string().default('Low'),
      high: z.string().default('High'),
    })
    .strict()
    .default({});

export const matrix2x2Props = z
  .object({
    x: matrixAxis(),
    y: matrixAxis(),
    quadrants: z
      .array(z.object({ title: z.string(), color: color().optional() }).strict())
      .max(4)
      .default([]),
    items: z
      .array(
        z
          .object({
            label: z.string(),
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            color: color().optional(),
            at: time().optional(),
          })
          .strict(),
      )
      .max(12)
      .default([]),
    color: color().default('cyan'),
    stagger: stagger(0.3),
    fontSize: fontSize(26),
  })
  .strict();
