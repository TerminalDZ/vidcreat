/** `episode.yaml` schema (SRS DR-2). Strict: unknown keys are rejected (DR-2.5). */
import { z } from 'zod';
import { color, elementId, int, lineId, sound, time } from './common.js';

export const ENTER_ANIMS = [
  'pop',
  'rise',
  'slide-l',
  'slide-r',
  'fade',
  'draw',
  'type',
  'count',
  'flip',
  'glitch',
  'stamp',
  'zoom',
  'none',
] as const;
export const EXIT_ANIMS = ['fade', 'pop', 'rise', 'sink', 'slide-l', 'slide-r', 'zoom', 'none'] as const;
export const FX_KINDS = ['shake', 'flash', 'glitch', 'pulse', 'bump'] as const;
export const PRESETS = ['tiktok', 'reels', 'shorts'] as const;

const publish = z
  .object({
    cover: z.string().optional(),
    caption: z.string().optional(),
    hashtags: z.array(z.string()).default([]),
    pinned: z.string().optional(),
  })
  .strict();

const meta = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/i, 'meta.id must be a slug (letters, digits, "-" and "_")'),
    series: z.string().default(''),
    title: z.string().default(''),
    episode: int().min(1).default(1),
    preset: z.string().default('tiktok'),
    theme: z.string().default('default'),
    lang: z.string().default('ar-EG'),
    publish: publish.optional(),
  })
  .strict();

const audio = z
  .object({
    voice: z.string().default('voice.wav'),
    sfx: z.enum(['auto', 'none', 'manual']).default('auto'),
    sfx_gain_db: z.number().min(-60).max(12).default(-16),
    duck: z.boolean().default(true),
    extra: z
      .array(z.object({ at: time(), sound: sound(), gain_db: z.number().optional() }).strict())
      .default([]),
  })
  .strict();

const scriptLine = z
  .object({
    id: lineId().optional(),
    text: z.string().min(1, 'Script lines need text'),
    caption: z.string().default('auto'),
    break: z.array(z.string()).default([]),
  })
  .strict();

const chapter = z.object({ at: time(), label: z.string() }).strict();

export const place = z
  .object({
    x: int().optional(),
    y: int().optional(),
    w: int().positive().optional(),
    h: int().positive().optional(),
    center: z.boolean().optional(),
    anchor: z.enum(['top', 'bottom', 'center', 'left', 'right']).optional(),
    margin: int().optional(),
  })
  .strict();

const enter = z
  .object({
    at: time().optional(),
    anim: z.enum(ENTER_ANIMS).optional(),
    dur: z.number().positive().optional(),
    // animation parameters (SRS §6.2)
    s0: z.number().optional(),
    dy: z.number().optional(),
    dist: z.number().optional(),
    cps: z.number().positive().optional(),
    caret: z.boolean().optional(),
    rot: z.number().optional(),
    amp: z.number().optional(),
  })
  .strict();

const exit = z
  .object({
    at: time(),
    anim: z.enum(EXIT_ANIMS).optional(),
    dur: z.number().positive().optional(),
  })
  .strict();

const fx = z
  .object({
    at: time(),
    do: z.enum(FX_KINDS),
    amp: z.number().optional(),
    dur: z.number().positive().optional(),
    color: color().optional(),
    rate: z.number().positive().optional(),
    target: z.enum(['self', 'camera']).optional(),
    sound: z.union([sound(), z.literal('none')]).optional(),
  })
  .strict();

const elementSfx = z.union([
  z.enum(['auto', 'none']),
  z.array(z.object({ at: time(), sound: sound(), gain_db: z.number().optional() }).strict()),
]);

export const element = z
  .object({
    use: z.string(),
    id: elementId().optional(),
    props: z.record(z.unknown()).default({}),
    place: place.optional(),
    size: z.object({ w: int().positive().optional(), h: int().positive().optional() }).strict().optional(),
    col: int().min(0).optional(),
    layer: z.enum(['base', 'overlay']).optional(),
    z: int().optional(),
    enter: enter.optional(),
    exit: exit.optional(),
    states: z.array(z.object({ at: time(), set: z.record(z.unknown()) }).strict()).default([]),
    fx: z.array(fx).default([]),
    sfx: elementSfx.default('auto'),
  })
  .strict();

const glow = z.union([color(), z.array(z.object({ at: time(), color: color() }).strict()).min(1)]);

const flow = z
  .object({
    gap: int().min(0).optional(),
    align: z.enum(['start', 'center', 'end']).optional(),
    x: int().optional(),
    y: int().optional(),
    w: int().positive().optional(),
    h: int().positive().optional(),
  })
  .strict();

export const scene = z
  .object({
    id: lineId(),
    at: time(),
    end: time().optional(),
    glow: glow.optional(),
    transition: z.enum(['crossfade', 'cut', 'slide-up']).default('crossfade'),
    layout: z.enum(['stage', 'full']).default('stage'),
    row: flow.optional(),
    column: flow.optional(),
    columns: int().min(1).max(6).optional(),
    gutter: int().min(0).optional(),
    elements: z.array(element).default([]),
  })
  .strict();

export const episodeSchema = z
  .object({
    $schema: z.string().optional(),
    meta,
    audio: audio.default({}),
    script: z.array(scriptLine).min(1, 'The script needs at least one line'),
    chapters: z.array(chapter).default([]),
    scenes: z.array(scene).min(1, 'An episode needs at least one scene'),
  })
  .strict();

export type EpisodeSpec = z.infer<typeof episodeSchema>;
export type SceneSpec = z.infer<typeof scene>;
export type ElementSpec = z.infer<typeof element>;
export type PlaceSpec = z.infer<typeof place>;
