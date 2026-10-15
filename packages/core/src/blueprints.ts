/**
 * Scene blueprints: named, parameterized scenes for the Tier 2 authoring tools (`add_scene`) and the
 * industry packs. A blueprint takes a small flat parameter object (texts, numbers, short lists) and
 * returns a complete scene whose elements are placed inside the stage's safe area and enter on the
 * scene's line (or a given word). The output is plain episode YAML data, so it is validated by the
 * same schema as anything written by hand.
 */
import { z } from 'zod';
import type { SceneSpec } from './schema/episode.js';
import { MAP_VIEWS } from './components/general.js';

const text = (max: number) => z.string().trim().min(1).max(max);
const list = (max: number, n: number) => z.array(text(max)).min(1).max(n);
const color = z.string().min(1).max(32);
/** A labelled place for map blueprints (ISO country code optional, highlighted on the map). */
const place = z
  .object({
    label: text(30),
    lon: z.number().min(-180).max(180),
    lat: z.number().min(-90).max(90),
    country: z
      .string()
      .regex(/^[A-Za-z]{2,3}$/)
      .optional(),
  })
  .strict();

/** Common parameters: where the scene starts and its background glow. */
const base = {
  /** Line id the scene starts on (`l3`). */
  line: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  /** Time expression for the first element (default: the line start), e.g. `l3:'bucket'`. */
  at: z.string().min(1).optional(),
  glow: color.optional(),
  id: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
    .optional(),
};

type El = Record<string, unknown>;
interface Ctx {
  at: string;
  /** `at` plus seconds. */
  after: (s: number) => string;
}
interface BlueprintDef<S extends z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  /** Scene transition and default glow. */
  transition: SceneSpec['transition'];
  glow: string;
  params: S;
  build: (p: z.infer<z.ZodObject<S>>, c: Ctx) => El[];
}

export interface Blueprint {
  name: string;
  title: string;
  description: string;
  params: z.ZodObject<z.ZodRawShape>;
  /** Valid example parameters. */
  example?: Record<string, unknown>;
  /** A scene (episode.yaml data) for validated parameters. */
  build: (params: unknown) => SceneSpec & Record<string, unknown>;
}

function define<S extends z.ZodRawShape>(d: BlueprintDef<S>): Blueprint {
  const params = z.object({ ...base, ...d.params }).strict();
  return {
    name: d.name,
    title: d.title,
    description: d.description,
    params: params as unknown as z.ZodObject<z.ZodRawShape>,
    build: (raw) => {
      const p = params.parse(raw) as { line: string; at?: string; glow?: string; id?: string };
      const at: string = p.at ?? p.line;
      const after = (s: number): string => (s ? `${at}+${Math.round(s * 10) / 10}` : at);
      const id = p.id ?? `${d.name.replace(/-/g, '_')}_${p.line}`;
      const elements = d.build(p as never, { at, after }).map((e, i) => ({
        ...e,
        id: `${id}_${(e.use as string).replace(/-/g, '_')}${i + 1}`,
      }));
      return {
        id,
        at: p.line,
        transition: d.transition,
        glow: p.glow ?? d.glow,
        elements,
      } as unknown as SceneSpec & Record<string, unknown>;
    },
  };
}

/** Stage boxes (1080×1000, 60 px margins; below y 600 stay left of the right-rail UI). */
const BOX = {
  label: { x: 60, y: 60, w: 760, h: 60 },
  title: { x: 60, y: 140, w: 960, h: 260 },
  titleLow: { x: 60, y: 300, w: 960, h: 300 },
  body: { x: 60, y: 430, w: 860, h: 520 },
  wide: { x: 60, y: 160, w: 960, h: 440 },
};

export const BLUEPRINTS: Blueprint[] = [
  define({
    name: 'hook',
    title: 'Hook',
    description: 'A big headline and a small kicker label: the first seconds of an episode.',
    transition: 'cut',
    glow: 'cyan',
    params: { headline: text(60), kicker: text(40).optional(), accent: text(30).optional() },
    build: (p, c) => [
      ...(p.kicker
        ? [
            {
              use: 'label',
              props: { text: p.kicker, dot: true },
              place: BOX.label,
              enter: { at: c.at, anim: 'wipe' },
            },
          ]
        : []),
      {
        use: 'title',
        props: {
          text:
            p.accent && p.headline.includes(p.accent)
              ? p.headline.replace(p.accent, `**${p.accent}**`)
              : p.headline,
        },
        place: BOX.titleLow,
        enter: { at: c.after(p.kicker ? 0.3 : 0), anim: 'reveal' },
      },
    ],
  }),
  define({
    name: 'problem-solution',
    title: 'Problem → solution',
    description: 'States a problem, stamps it, then reveals the solution.',
    transition: 'push',
    glow: 'red',
    params: { problem: text(60), solution: text(60), solutionAt: z.string().min(1).optional() },
    build: (p, c) => [
      {
        use: 'title',
        props: { text: p.problem, color: 'ink', size: 84 },
        place: BOX.title,
        enter: { at: c.at, anim: 'rise' },
        exit: { at: p.solutionAt ?? c.after(1.6), anim: 'fade' },
      },
      {
        use: 'stamp',
        props: { text: 'PROBLEM', color: 'red' },
        place: { x: 200, y: 430, w: 600, h: 200 },
        layer: 'overlay',
        enter: { at: c.after(0.7), anim: 'stamp' },
        exit: { at: p.solutionAt ?? c.after(1.6), anim: 'fade' },
      },
      {
        use: 'title',
        props: { text: p.solution, accent: 'lime', size: 92 },
        place: BOX.titleLow,
        enter: { at: p.solutionAt ?? c.after(1.8), anim: 'spring' },
      },
    ],
  }),
  define({
    name: 'stat-reveal',
    title: 'Stat reveal',
    description: 'One big number that counts up, with a label and an optional change versus before.',
    transition: 'zoom',
    glow: 'lime',
    params: {
      value: z.number(),
      label: text(40),
      prefix: z.string().max(4).optional(),
      suffix: z.string().max(8).optional(),
      delta: z.number().optional(),
      context: text(60).optional(),
    },
    build: (p, c) => [
      ...(p.context
        ? [{ use: 'label', props: { text: p.context }, place: BOX.label, enter: { at: c.at, anim: 'fade' } }]
        : []),
      {
        use: 'stat-card',
        props: {
          label: p.label,
          value: p.value,
          prefix: p.prefix ?? '',
          suffix: p.suffix ?? '',
          ...(p.delta !== undefined ? { delta: p.delta } : {}),
        },
        place: { x: 90, y: 220, w: 840, h: 460 },
        enter: { at: c.after(p.context ? 0.3 : 0), anim: 'pop' },
      },
    ],
  }),
  define({
    name: 'comparison',
    title: 'Comparison',
    description: 'Option A against option B on a few criteria, with an optional winner.',
    transition: 'slide-up',
    glow: 'violet',
    params: {
      a: text(24),
      b: text(24),
      rows: z
        .array(
          z
            .object({
              label: text(28),
              a: z.union([z.boolean(), text(16)]),
              b: z.union([z.boolean(), text(16)]),
            })
            .strict(),
        )
        .min(1)
        .max(6),
      winner: z.enum(['a', 'b']).optional(),
    },
    build: (p, c) => [
      {
        use: 'comparison',
        props: {
          a: { title: p.a },
          b: { title: p.b },
          rows: p.rows.map((r, i) => ({ ...r, at: c.after(0.4 + i * 0.5) })),
          ...(p.winner ? { winner: { side: p.winner, at: c.after(0.6 + p.rows.length * 0.5) } } : {}),
        },
        place: { x: 60, y: 120, w: 860, h: 760 },
        enter: { at: c.at, anim: 'pop' },
      },
    ],
  }),
  define({
    name: 'process-steps',
    title: 'Process steps',
    description: 'Numbered steps that appear one by one (2–6).',
    transition: 'push',
    glow: 'cyan',
    params: { title: text(40).optional(), steps: list(40, 6) },
    build: (p, c) => [
      ...(p.title
        ? [
            {
              use: 'label',
              props: { text: p.title, dot: true },
              place: BOX.label,
              enter: { at: c.at, anim: 'wipe' },
            },
          ]
        : []),
      {
        use: 'steps',
        props: { items: p.steps.map((t, i) => ({ title: t, at: c.after(0.3 + i * 0.6) })) },
        place: { x: 60, y: 150, w: 860, h: 800 },
        enter: { at: c.at, anim: 'fade' },
      },
    ],
  }),
  define({
    name: 'timeline',
    title: 'Timeline',
    description: 'Dates or phases on a horizontal line, revealed left to right.',
    transition: 'slide-up',
    glow: 'amber',
    params: {
      title: text(40).optional(),
      events: z
        .array(z.object({ label: text(16), sub: text(28).optional() }).strict())
        .min(2)
        .max(6),
    },
    build: (p, c) => {
      const n = p.events.length;
      return [
        ...(p.title
          ? [
              {
                use: 'title',
                props: { text: p.title, size: 80 },
                place: { x: 60, y: 120, w: 960, h: 200 },
                enter: { at: c.at, anim: 'reveal' },
              },
            ]
          : []),
        {
          use: 'timeline',
          props: {
            markers: p.events.map((e, i) => ({
              pos: n === 1 ? 0.5 : 0.06 + (0.88 * i) / (n - 1),
              label: e.label,
              ...(e.sub ? { sub: e.sub } : {}),
              at: c.after(0.4 + i * 0.5),
            })),
          },
          place: { x: 60, y: 420, w: 860, h: 300 },
          enter: { at: c.at, anim: 'wipe' },
        },
      ];
    },
  }),
  define({
    name: 'before-after',
    title: 'Before / after',
    description: 'Two states revealed by a wiping divider.',
    transition: 'zoom',
    glow: 'lime',
    params: {
      before: text(60),
      after: text(60),
      beforeLabel: text(16).optional(),
      afterLabel: text(16).optional(),
    },
    build: (p, c) => [
      {
        use: 'before-after',
        props: {
          before: { text: p.before, ...(p.beforeLabel ? { label: p.beforeLabel } : {}) },
          after: { text: p.after, ...(p.afterLabel ? { label: p.afterLabel } : {}) },
          at: c.after(0.8),
        },
        place: { x: 60, y: 120, w: 860, h: 760 },
        enter: { at: c.at, anim: 'fade' },
      },
    ],
  }),
  define({
    name: 'bar-stats',
    title: 'Bar chart',
    description: 'A few labelled values as bars that grow in (2–8).',
    transition: 'slide-up',
    glow: 'cyan',
    params: {
      title: text(40).optional(),
      bars: z
        .array(z.object({ label: text(16), value: z.number() }).strict())
        .min(2)
        .max(8),
      suffix: z.string().max(8).optional(),
    },
    build: (p, c) => [
      {
        use: 'bar-chart',
        props: {
          bars: p.bars,
          ...(p.title ? { title: p.title } : {}),
          ...(p.suffix ? { suffix: p.suffix } : {}),
        },
        place: { x: 60, y: 140, w: 860, h: 760 },
        enter: { at: c.at, anim: 'fade' },
      },
    ],
  }),
  define({
    name: 'quote',
    title: 'Quote',
    description: 'A short quotation typed out with its author.',
    transition: 'crossfade',
    glow: 'violet',
    params: { quote: text(140), author: text(40).optional() },
    build: (p, c) => [
      {
        use: 'quote',
        props: { text: p.quote, ...(p.author ? { author: p.author } : {}) },
        place: { x: 60, y: 200, w: 860, h: 560 },
        enter: { at: c.at, anim: 'rise' },
      },
    ],
  }),
  define({
    name: 'cta',
    title: 'Call to action',
    description: 'The ending: what to do next or what the next episode is about.',
    transition: 'zoom',
    glow: 'lime',
    params: { next: text(40), label: text(24).optional(), keyword: text(20).optional() },
    build: (p, c) => [
      {
        use: 'cta',
        props: {
          next: p.next,
          ...(p.label ? { label: p.label } : {}),
          ...(p.keyword ? { keyword: p.keyword } : {}),
        },
        place: { x: 60, y: 200, w: 860, h: 560 },
        enter: { at: c.at, anim: 'rise' },
      },
    ],
  }),
  define({
    name: 'map-route',
    title: 'Map route',
    description: 'A route between two places on a world or regional map, drawn with a moving vehicle.',
    transition: 'zoom',
    glow: 'cyan',
    params: {
      title: text(40).optional(),
      from: place,
      to: place,
      vehicle: z.enum(['plane', 'ship', 'truck', 'train', 'none']).default('plane'),
      view: z.enum(MAP_VIEWS).default('world'),
      path: z.enum(['great-circle', 'straight']).default('great-circle'),
    },
    build: (p, c) => [
      ...(p.title
        ? [
            {
              use: 'label',
              props: { text: p.title, dot: true },
              place: BOX.label,
              enter: { at: c.at, anim: 'wipe' },
            },
          ]
        : []),
      {
        use: 'map',
        props: {
          view: p.view,
          countries: [p.from.country, p.to.country].filter((x): x is string => Boolean(x)),
          pins: [
            { id: 'a', label: p.from.label, lon: p.from.lon, lat: p.from.lat, at: c.after(0.3) },
            { id: 'b', label: p.to.label, lon: p.to.lon, lat: p.to.lat, at: c.after(0.6) },
          ],
          routes: [{ from: 'a', to: 'b', vehicle: p.vehicle, path: p.path, at: c.after(0.9), dur: 1.6 }],
        },
        place: { x: 60, y: 160, w: 860, h: 640 },
        enter: { at: c.at, anim: 'fade' },
      },
    ],
  }),
  define({
    name: 'appointment',
    title: 'Appointment',
    description: 'An appointment card (what, when, where, with whom) whose status can turn confirmed.',
    transition: 'slide-up',
    glow: 'cyan',
    params: {
      title: text(40),
      date: text(30),
      time: text(16).optional(),
      place: text(50).optional(),
      person: text(40).optional(),
      kicker: text(40).optional(),
      confirmAt: z.string().min(1).optional(),
    },
    build: (p, c) => [
      ...(p.kicker
        ? [
            {
              use: 'label',
              props: { text: p.kicker, dot: true },
              place: BOX.label,
              enter: { at: c.at, anim: 'wipe' },
            },
          ]
        : []),
      {
        use: 'appointment',
        props: {
          title: p.title,
          date: p.date,
          status: p.confirmAt ? 'pending' : 'confirmed',
          ...(p.time ? { time: p.time } : {}),
          ...(p.place ? { place: p.place } : {}),
          ...(p.person ? { person: p.person } : {}),
        },
        place: { x: 60, y: 260, w: 860, h: 380 },
        enter: { at: c.after(p.kicker ? 0.3 : 0), anim: 'rise' },
        ...(p.confirmAt ? { states: [{ at: p.confirmAt, set: { status: 'confirmed' } }] } : {}),
      },
    ],
  }),
  define({
    name: 'chat',
    title: 'Chat',
    description: 'A short message exchange (2–6 messages) that appears bubble by bubble.',
    transition: 'push',
    glow: 'violet',
    params: {
      title: text(40).optional(),
      messages: z
        .array(z.object({ text: text(90), from: z.enum(['me', 'them']).default('them') }).strict())
        .min(1)
        .max(6),
      gap: z.number().min(0.4).max(4).default(1.2),
    },
    build: (p, c) => [
      {
        use: 'chat',
        props: {
          ...(p.title ? { title: p.title } : {}),
          messages: p.messages.map((m, i) => ({ ...m, at: c.after(0.3 + i * p.gap) })),
        },
        place: { x: 60, y: 120, w: 860, h: 800 },
        enter: { at: c.at, anim: 'fade' },
      },
    ],
  }),
];

/** A valid parameter set per built-in blueprint: shown to models and used in docs and tests. */
const EXAMPLES: Record<string, Record<string, unknown>> = {
  hook: { line: 'l1', kicker: 'Did you know?', headline: 'Most delays start at the gate', accent: 'gate' },
  'problem-solution': { line: 'l2', problem: 'Paper forms get lost', solution: 'One digital check-in' },
  'stat-reveal': { line: 'l3', value: 12400, label: 'containers a day', delta: 8, context: 'Terminal 2' },
  comparison: {
    line: 'l4',
    a: 'Walk-in',
    b: 'Booked',
    rows: [
      { label: 'Wait time', a: '45 min', b: '5 min' },
      { label: 'Reminder', a: false, b: true },
    ],
    winner: 'b',
  },
  'process-steps': { line: 'l5', title: 'How it works', steps: ['Book online', 'Get a code', 'Walk in'] },
  timeline: {
    line: 'l6',
    title: 'Our first year',
    events: [
      { label: 'Jan', sub: 'Opened' },
      { label: 'Jun', sub: 'New wing' },
      { label: 'Dec', sub: '10k visits' },
    ],
  },
  'before-after': { line: 'l7', before: 'Queues out the door', after: 'Seated in minutes' },
  'bar-stats': {
    line: 'l8',
    title: 'Visits per day',
    bars: [
      { label: 'Mon', value: 120 },
      { label: 'Tue', value: 180 },
      { label: 'Wed', value: 150 },
    ],
  },
  quote: { line: 'l9', quote: 'Good care starts with a clear plan.', author: 'Head nurse' },
  cta: { line: 'l10', next: 'Book your visit', label: 'NEXT STEP' },
  'map-route': {
    line: 'l11',
    title: 'Shanghai to Rotterdam',
    from: { label: 'Shanghai', lon: 121.5, lat: 31.2, country: 'CN' },
    to: { label: 'Rotterdam', lon: 4.5, lat: 51.9, country: 'NL' },
    vehicle: 'ship',
  },
  appointment: {
    line: 'l12',
    kicker: 'Your next visit',
    title: 'Heart check-up',
    date: 'Tue 17 Nov',
    time: '10:30',
    place: 'City Clinic, room 4',
    confirmAt: 'l12+1.5',
  },
  chat: {
    line: 'l13',
    title: 'City Clinic',
    messages: [
      { text: 'Can I book a check-up tomorrow?', from: 'me' },
      { text: 'Sure, is 10:30 good for you?' },
      { text: 'Perfect, thanks!', from: 'me' },
    ],
  },
};
for (const b of BLUEPRINTS) b.example = EXAMPLES[b.name];

/** Registers a blueprint (packs and components add theirs, e.g. a map route). Names are unique. */
export function registerBlueprint(b: Blueprint): void {
  if (BLUEPRINTS.some((x) => x.name === b.name)) throw new Error(`Blueprint "${b.name}" already exists`);
  BLUEPRINTS.push(b);
}

export const blueprint = (name: string): Blueprint | undefined => BLUEPRINTS.find((b) => b.name === name);
export { define as defineBlueprint };
