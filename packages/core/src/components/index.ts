/**
 * Component registry (core side). See schemas.ts for the prop conventions.
 */
import type { ZodType } from 'zod';
import type { SoundName } from '@reelforge/audio';
import type { EnterAnim, TElement } from '../types.js';
import * as S from './schemas.js';
import * as V from './visual.js';
import * as G from './general.js';

export interface ComponentEvent {
  t: number;
  sound: SoundName;
  gain_db?: number;
}

export interface ComponentDef {
  name: string;
  schema: ZodType;
  description: string;
  size: { w: number; h: number };
  layer?: 'base' | 'overlay';
  enter?: EnterAnim;
  /** Prop keys holding endpoints (element ids or points) that the compiler resolves to stage points. */
  endpoints?: string[];
  /**
   * Keeps its own box (place/size) although it has endpoints; the endpoints are then resolved
   * relative to that box (callout). Without it, an endpoint component is placed by its endpoints (arrow).
   */
  boxed?: boolean;
  /** Prop keys holding an element id (or a box) that the compiler resolves to a box relative to this element. */
  targets?: string[];
  /** Fills the whole scene area by default (particles, trap). */
  fill?: boolean;
  /** Default SFX hooks (SRS §6.3), from resolved props. */
  events?: (props: any, el: TElement) => ComponentEvent[];
}

const SUCCESS = new Set(['lime', 'cyan', '#b8ff3c', '#55dcff']);

/** Typing schedule shared with the runtime `code` component: [start, end) per line. */
export function codeSchedule(
  props: { lines: (string | { text: string; at?: number })[]; cps: number },
  enterEnd: number,
) {
  const out: { start: number; end: number; text: string }[] = [];
  let cursor = enterEnd;
  for (const raw of props.lines) {
    const line = typeof raw === 'string' ? { text: raw } : raw;
    const start = typeof line.at === 'number' ? line.at : cursor;
    const end = start + [...line.text].length / props.cps;
    out.push({ start, end, text: line.text });
    cursor = end;
  }
  return out;
}

function typingEvents(start: number, end: number, gain = -6): ComponentEvent[] {
  const out: ComponentEvent[] = [];
  for (let t = start; t < end - 0.05; t += 0.36) out.push({ t, sound: 'typing', gain_db: gain });
  return out;
}

const enterEnd = (el: TElement) => el.enter.t + el.enter.dur;

/** When the i-th item of a sequenced component appears (shared rule with the runtime: `at`, else staggered from the enter). */
export const itemTime = (el: TElement, i: number, stagger: number, at?: unknown): number =>
  typeof at === 'number' ? at : el.enter.t + i * stagger;

/** One sound per sequenced item (bars, rows, steps, stages). */
function itemEvents(
  items: { at?: unknown }[],
  el: TElement,
  stagger: number,
  sound: SoundName = 'tick',
  gain = -10,
): ComponentEvent[] {
  return items.map((it, i) => ({ t: itemTime(el, i, stagger, it.at), sound, gain_db: gain }));
}

export const COMPONENTS: Record<string, ComponentDef> = {
  title: {
    name: 'title',
    schema: S.titleProps,
    description: 'Big display text; **accent** markup colors words with the accent color.',
    size: { w: 960, h: 240 },
    enter: 'rise',
    events: (_p, el) => [{ t: el.enter.t, sound: 'whoosh', gain_db: -4 }],
  },
  label: {
    name: 'label',
    schema: S.labelProps,
    description: 'Small uppercase monospace label.',
    size: { w: 640, h: 60 },
    enter: 'fade',
  },
  code: {
    name: 'code',
    schema: S.codeProps,
    description: 'Code card with token colors that types itself.',
    size: { w: 960, h: 520 },
    enter: 'rise',
    events: (p, el) => {
      if (p.typing === false) return [];
      const start = el.enter.t + (el.enter.anim === 'type' ? 0 : el.enter.dur);
      return codeSchedule(p, start).flatMap((l) => typingEvents(l.start, l.end));
    },
  },
  node: {
    name: 'node',
    schema: S.nodeProps,
    description: 'Box with a title and a sub-status; status changes its color.',
    size: { w: 300, h: 170 },
    events: (_p, el) =>
      el.states.flatMap((s): ComponentEvent[] =>
        s.set.status === 'err'
          ? [{ t: s.t, sound: 'err', gain_db: -3 }]
          : s.set.status === 'ok'
            ? [{ t: s.t, sound: 'ding', gain_db: -6 }]
            : [],
      ),
  },
  arrow: {
    name: 'arrow',
    schema: S.arrowProps,
    description: 'Straight, elbow or curved arrow with an optional label and moving packets.',
    size: { w: 200, h: 40 },
    layer: 'overlay',
    enter: 'draw',
    endpoints: ['from', 'to'],
    events: (_p, el) => [{ t: el.enter.t, sound: 'whoosh', gain_db: -9 }],
  },
  chip: {
    name: 'chip',
    schema: S.chipProps,
    description: 'Pill/tag, optionally struck through.',
    size: { w: 340, h: 84 },
    events: (p, el) => {
      const out: ComponentEvent[] = [];
      if (SUCCESS.has(String(p.color))) out.push({ t: el.enter.t, sound: 'ding', gain_db: -8 });
      if (typeof p.strike === 'number') out.push({ t: p.strike, sound: 'err', gain_db: -6 });
      return out;
    },
  },
  stamp: {
    name: 'stamp',
    schema: S.stampProps,
    description: 'Rotated bordered word that slams in (×2, DEADLOCK).',
    size: { w: 680, h: 260 },
    layer: 'overlay',
    enter: 'stamp',
    events: (_p, el) => [{ t: el.enter.t + el.enter.dur * 0.6, sound: 'hit' }],
  },
  table: {
    name: 'table',
    schema: S.tableProps,
    description: 'Header + rows with animated row inserts and highlights.',
    size: { w: 960, h: 440 },
    events: (p) =>
      (p.rows as { at?: number }[])
        .filter((r) => typeof r.at === 'number')
        .map((r) => ({ t: r.at as number, sound: 'ding' as const, gain_db: -8 })),
  },
  lanes: {
    name: 'lanes',
    schema: S.lanesProps,
    description: 'Parallel columns of timed steps (race conditions).',
    size: { w: 960, h: 760 },
    events: (p) =>
      (p.lanes as { steps: { at: number; mark?: string }[] }[]).flatMap((l) =>
        l.steps.map((s) => ({
          t: s.at,
          sound: (s.mark === 'err' ? 'err' : 'tick') as SoundName,
          gain_db: s.mark === 'err' ? -4 : 0,
        })),
      ),
  },
  checklist: {
    name: 'checklist',
    schema: S.checklistProps,
    description: 'Items with check boxes appearing in sequence.',
    size: { w: 880, h: 460 },
    events: (p, el) =>
      (p.items as { at?: number; ok: boolean }[]).map((it, i) => ({
        t: (it.at ?? enterEnd(el) + i * 0.5) + 0.2,
        sound: (it.ok ? 'ding' : 'err') as SoundName,
        gain_db: -8,
      })),
  },
  counter: {
    name: 'counter',
    schema: S.counterProps,
    description: 'Big number counting between keyframe values.',
    size: { w: 820, h: 320 },
  },
  meter: {
    name: 'meter',
    schema: S.meterProps,
    description:
      'Horizontal bar (or a half-circle gauge with `style: gauge`) with an optional threshold marker.',
    size: { w: 880, h: 180 },
  },
  timeline: {
    name: 'timeline',
    schema: S.timelineProps,
    description: 'Axis with markers at relative positions (backoff, TTL).',
    size: { w: 960, h: 260 },
    events: (p) =>
      (p.markers as { at?: number }[])
        .filter((m) => typeof m.at === 'number')
        .map((m) => ({ t: m.at as number, sound: 'ding' as const, gain_db: -10 })),
  },
  grid: {
    name: 'grid',
    schema: S.gridProps,
    description: 'N×M tiles with per-tile states (thread pool, shards, services).',
    size: { w: 640, h: 640 },
  },
  bucket: {
    name: 'bucket',
    schema: S.bucketProps,
    description: 'Token bucket whose tokens are consumed and refilled over time.',
    size: { w: 440, h: 560 },
    events: (p) =>
      (p.keyframes as { at: number }[]).map((k) => ({ t: k.at, sound: 'tick' as const, gain_db: -2 })),
  },
  phone: {
    name: 'phone',
    schema: S.phoneProps,
    description: 'Phone mock with a checkout screen, button taps and notifications.',
    size: { w: 440, h: 880 },
    events: (p, el) => {
      const out: ComponentEvent[] = (p.taps as { at: number }[]).map((tp) => ({
        t: tp.at,
        sound: 'tap' as const,
      }));
      for (const n of p.notifications as { at?: number }[]) {
        if (typeof n.at === 'number') out.push({ t: n.at, sound: 'ding', gain_db: -6 });
      }
      let count = 0;
      for (const s of el.states) {
        const c = Number(s.set.notifications);
        if (Number.isFinite(c) && c > count) out.push({ t: s.t, sound: 'ding', gain_db: -6 });
        if (Number.isFinite(c)) count = c;
      }
      return out;
    },
  },
  quote: {
    name: 'quote',
    schema: S.quoteProps,
    description: 'Quote card with author; the quote types itself.',
    size: { w: 940, h: 460 },
    enter: 'rise',
    events: (p, el) => {
      const end = enterEnd(el) + [...String(p.text)].length / Number(p.cps);
      return typingEvents(enterEnd(el), end, -8);
    },
  },
  particles: {
    name: 'particles',
    schema: S.particlesProps,
    description: 'Seeded particle bursts, herds, streams, dust or confetti.',
    size: { w: 1080, h: 1000 },
    layer: 'overlay',
    enter: 'none',
    endpoints: ['from', 'to'],
    fill: true,
  },
  trap: {
    name: 'trap',
    schema: S.trapProps,
    description: 'The series "THE TRAP" interstitial with warning tapes.',
    size: { w: 1080, h: 1000 },
    layer: 'overlay',
    enter: 'glitch',
    fill: true,
    events: (p, el) => {
      const t = typeof p.at === 'number' ? p.at : el.enter.t;
      return [
        { t, sound: 'hit' },
        { t: t + 0.05, sound: 'glitch', gain_db: -4 },
      ];
    },
  },
  cta: {
    name: 'cta',
    schema: S.ctaProps,
    description: '"Next episode" title plus a comment box typing a keyword.',
    size: { w: 960, h: 560 },
    enter: 'rise',
    events: (p, el) => {
      if (!p.keyword) return [];
      const start = typeof p.at === 'number' ? p.at : enterEnd(el) + 0.4;
      return typingEvents(start, start + [...String(p.keyword)].length / 12, -6);
    },
  },
  icon: {
    name: 'icon',
    schema: S.iconProps,
    description: 'Inline SVG icon from the bundled set, or an SVG from assets/.',
    size: { w: 160, h: 160 },
  },

  // ---- data
  'bar-chart': {
    name: 'bar-chart',
    schema: V.barChartProps,
    description: 'Vertical or horizontal bars that grow in on enter; keyframable values and a focus bar.',
    size: { w: 960, h: 560 },
    enter: 'fade',
    events: (p, el) => {
      const out: ComponentEvent[] = [{ t: el.enter.t, sound: 'whoosh', gain_db: -9 }];
      if (typeof p.focus === 'object' && typeof p.focus.at === 'number')
        out.push({ t: p.focus.at, sound: 'ding', gain_db: -8 });
      return out;
    },
  },
  'line-chart': {
    name: 'line-chart',
    schema: V.lineChartProps,
    description: 'One or more series that draw themselves, with points, axis labels and a legend.',
    size: { w: 960, h: 560 },
    enter: 'fade',
    events: (p, el) => itemEvents(p.series, el, p.stagger, 'whoosh', -10),
  },
  'donut-chart': {
    name: 'donut-chart',
    schema: V.donutChartProps,
    description: 'Donut whose segments sweep in, with a center value and a legend.',
    size: { w: 960, h: 520 },
    enter: 'fade',
    events: (_p, el) => [{ t: el.enter.t, sound: 'whoosh', gain_db: -8 }],
  },
  'stat-card': {
    name: 'stat-card',
    schema: V.statCardProps,
    description: 'KPI card: a value counting up, a label and an up/down delta.',
    size: { w: 420, h: 260 },
    enter: 'rise',
    events: (p, el) => (p.keyframes ? [] : [{ t: el.enter.t + p.dur, sound: 'ding', gain_db: -10 }]),
  },
  'progress-ring': {
    name: 'progress-ring',
    schema: V.progressRingProps,
    description: 'Circular percentage that fills to its value (keyframable).',
    size: { w: 360, h: 360 },
    events: (p, el) => (p.keyframes ? [] : [{ t: el.enter.t + p.dur, sound: 'ding', gain_db: -10 }]),
  },
  comparison: {
    name: 'comparison',
    schema: V.comparisonProps,
    description: 'A vs B columns with rows of attributes (check/cross or values) and a winner.',
    size: { w: 960, h: 560 },
    enter: 'rise',
    events: (p, el) => {
      const out = itemEvents(p.rows, el, p.stagger);
      if (p.winner) {
        const last = itemTime(el, p.rows.length - 1, p.stagger, p.rows[p.rows.length - 1].at);
        const at = typeof p.winner === 'object' && typeof p.winner.at === 'number' ? p.winner.at : last + 0.5;
        out.push({ t: at, sound: 'ding', gain_db: -6 });
      }
      return out;
    },
  },
  'before-after': {
    name: 'before-after',
    schema: V.beforeAfterProps,
    description: 'Two panels (text or an assets/ image) revealed by an animated wipe divider.',
    size: { w: 960, h: 520 },
    enter: 'rise',
    events: (p, el) => [
      { t: typeof p.at === 'number' ? p.at : enterEnd(el) + 0.3, sound: 'whoosh', gain_db: -6 },
    ],
  },
  ranking: {
    name: 'ranking',
    schema: V.rankingProps,
    description: 'Ordered horizontal bars with rank numbers that grow in sequence.',
    size: { w: 960, h: 560 },
    enter: 'fade',
    events: (p, el) => itemEvents(p.items, el, p.stagger),
  },

  // ---- process & structure
  steps: {
    name: 'steps',
    schema: V.stepsProps,
    description: 'Numbered steps appearing one by one, vertical or horizontal.',
    size: { w: 760, h: 620 },
    enter: 'fade',
    events: (p, el) => itemEvents(p.items, el, p.stagger),
  },
  flow: {
    name: 'flow',
    schema: V.flowProps,
    description: 'Horizontal pipeline of stages with connectors and a moving token.',
    size: { w: 960, h: 300 },
    enter: 'fade',
    events: (p, el) => itemEvents(p.stages, el, p.stagger),
  },
  'org-chart': {
    name: 'org-chart',
    schema: V.orgChartProps,
    description: 'Tree of person/role boxes (nested or parent ids) with automatic layout.',
    size: { w: 960, h: 560 },
    enter: 'fade',
  },
  tree: {
    name: 'tree',
    schema: V.treeProps,
    description: 'Generic hierarchy with automatic layout; branches draw in level by level.',
    size: { w: 960, h: 560 },
    enter: 'fade',
  },
  cycle: {
    name: 'cycle',
    schema: V.cycleProps,
    description: 'Stages around a circle with arrows; the active stage is highlighted over time.',
    size: { w: 760, h: 760 },
    enter: 'fade',
    events: (p) =>
      (p.active as { at: number }[]).map((a) => ({ t: a.at, sound: 'tick' as const, gain_db: -8 })),
  },
  funnel: {
    name: 'funnel',
    schema: V.funnelProps,
    description: 'Stages narrowing from top to bottom, with values and optional conversion rates.',
    size: { w: 760, h: 620 },
    enter: 'fade',
    events: (p, el) => itemEvents(p.stages, el, p.stagger),
  },
  pyramid: {
    name: 'pyramid',
    schema: V.pyramidProps,
    description: 'Stacked levels from a narrow top to a wide base, labelled at the side.',
    size: { w: 760, h: 620 },
    enter: 'fade',
    events: (p, el) => itemEvents(p.levels, el, p.stagger),
  },
  'matrix-2x2': {
    name: 'matrix-2x2',
    schema: V.matrix2x2Props,
    description:
      '2×2 quadrants (top-left, top-right, bottom-left, bottom-right) with axis labels and placed items.',
    size: { w: 760, h: 760 },
    enter: 'fade',
    events: (p, el) => itemEvents(p.items, el, p.stagger),
  },

  // ---- place & movement
  map: {
    name: 'map',
    schema: G.mapProps,
    description:
      'World or regional outline map (Natural Earth, public domain): highlighted countries, labelled pins and routes that draw between them.',
    size: { w: 960, h: 600 },
    enter: 'fade',
    events: (p, el) => [
      ...itemEvents(p.pins, el, p.stagger, 'tick', -12),
      ...(p.routes as { at?: number }[]).map((r, i) => ({
        t: itemTime(el, p.pins.length + i, p.stagger, r.at),
        sound: 'whoosh' as const,
        gain_db: -12,
      })),
    ],
  },
  route: {
    name: 'route',
    schema: G.routeProps,
    description:
      'A→B path through waypoints with a moving vehicle (truck, ship, plane, ambulance, train, …).',
    size: { w: 960, h: 420 },
    enter: 'fade',
    events: (_p, el) => [{ t: enterEnd(el), sound: 'whoosh', gain_db: -10 }],
  },
  'floor-plan': {
    name: 'floor-plan',
    schema: G.floorPlanProps,
    description: 'Rooms drawn from rectangles on a grid, with labels and rooms highlighted over time.',
    size: { w: 860, h: 600 },
    enter: 'fade',
    events: (p) =>
      (p.highlights as { at: number }[]).map((h) => ({ t: h.at, sound: 'tick' as const, gain_db: -8 })),
  },
  building: {
    name: 'building',
    schema: G.buildingProps,
    description: 'Stacked floors (listed from the ground up) with labels; floors are highlighted over time.',
    size: { w: 600, h: 760 },
    enter: 'fade',
    events: (p) =>
      (p.highlights as { at: number }[]).map((h) => ({ t: h.at, sound: 'tick' as const, gain_db: -8 })),
  },
  'container-stack': {
    name: 'container-stack',
    schema: G.containerStackProps,
    description: 'Shipping containers with their codes, stacked bottom-up like a crane loads them.',
    size: { w: 860, h: 560 },
    enter: 'fade',
    events: (p, el) => itemEvents(p.containers, el, p.stagger, 'hit', -16),
  },

  // ---- time
  calendar: {
    name: 'calendar',
    schema: G.calendarProps,
    description: 'Month view (English or Arabic names) whose highlighted days appear over time.',
    size: { w: 760, h: 700 },
    enter: 'fade',
    events: (p, el) =>
      itemEvents(
        (p.days as (number | { at?: number })[]).map((d) => (typeof d === 'number' ? {} : d)),
        el,
        p.stagger,
      ),
  },
  clock: {
    name: 'clock',
    schema: G.clockProps,
    description:
      'Analog or digital clock that ticks between keyframed times, or a countdown (`mode: countdown`).',
    size: { w: 420, h: 420 },
    events: (p, el) => {
      if (p.mode !== 'countdown') return [];
      const start = typeof p.at === 'number' ? p.at : enterEnd(el);
      const out: ComponentEvent[] = [];
      for (let s = 1; s < Math.min(p.from, 30); s++) out.push({ t: start + s, sound: 'tick', gain_db: -12 });
      out.push({ t: start + p.from, sound: 'ding', gain_db: -4 });
      return out;
    },
  },
  'schedule-board': {
    name: 'schedule-board',
    schema: G.scheduleBoardProps,
    description: 'Departures/arrivals split-flap board whose rows and later updates flip into place.',
    size: { w: 960, h: 520 },
    enter: 'fade',
    events: (p, el) => [
      ...itemEvents(p.rows, el, p.stagger, 'typing', -10),
      ...(p.updates as { at: number }[]).map((u) => ({ t: u.at, sound: 'typing' as const, gain_db: -10 })),
    ],
  },
  appointment: {
    name: 'appointment',
    schema: G.appointmentProps,
    description: 'Appointment card: title, date and time, place and a status chip (`states` can change it).',
    size: { w: 760, h: 340 },
    enter: 'rise',
  },

  // ---- people & messaging
  'person-card': {
    name: 'person-card',
    schema: G.personCardProps,
    description: 'Person with an avatar (initials, an icon or an assets/ image), name and role.',
    size: { w: 640, h: 220 },
    enter: 'rise',
  },
  chat: {
    name: 'chat',
    schema: G.chatProps,
    description: 'Message bubbles (left/right, LTR or RTL) that appear in order, with a typing indicator.',
    size: { w: 760, h: 760 },
    enter: 'fade',
    events: (p, el) =>
      (p.messages as { from: string; at?: number }[]).map((m, i) => ({
        t: itemTime(el, i, p.stagger, m.at) + (m.from === 'them' ? p.typing : 0),
        sound: 'tap' as const,
        gain_db: -8,
      })),
  },
  notification: {
    name: 'notification',
    schema: G.notificationProps,
    description: 'Stack of notification toasts sliding in one after another (newest on top).',
    size: { w: 760, h: 520 },
    enter: 'fade',
    events: (p, el) => itemEvents(p.items, el, p.stagger, 'ding', -10),
  },
  'speech-bubble': {
    name: 'speech-bubble',
    schema: G.speechBubbleProps,
    description: 'Speech or thought bubble with a tail; optionally types itself.',
    size: { w: 640, h: 300 },
  },
  'lower-third': {
    name: 'lower-third',
    schema: G.lowerThirdProps,
    description: 'Name and title bar that wipes in over the scene (overlay layer).',
    size: { w: 860, h: 170 },
    layer: 'overlay',
    enter: 'wipe',
    events: (_p, el) => [{ t: el.enter.t, sound: 'whoosh', gain_db: -10 }],
  },

  // ---- media & text
  image: {
    name: 'image',
    schema: G.imageProps,
    description:
      'Image from assets/ (cover or contain) with a slow Ken Burns pan and zoom over its lifetime.',
    size: { w: 860, h: 600 },
    enter: 'fade',
  },
  logo: {
    name: 'logo',
    schema: G.logoProps,
    description: 'Logo slot: an assets/ image, or a text wordmark with an optional icon mark and tagline.',
    size: { w: 600, h: 240 },
  },
  'kinetic-text': {
    name: 'kinetic-text',
    schema: G.kineticTextProps,
    description: 'Headline revealed word by word (pop, slide or highlight), staggered or on word beats.',
    size: { w: 960, h: 400 },
    enter: 'fade',
  },
  'bullet-list': {
    name: 'bullet-list',
    schema: G.bulletListProps,
    description: 'Bulleted or numbered points appearing one by one.',
    size: { w: 860, h: 520 },
    enter: 'fade',
    events: (p, el) =>
      itemEvents(
        (p.items as (string | { at?: number })[]).map((x) => (typeof x === 'string' ? {} : x)),
        el,
        p.stagger,
      ),
  },
  callout: {
    name: 'callout',
    schema: G.calloutProps,
    description:
      'Annotation label with a curved arrow pointing at an element (`to: id` or `id.side`) or a point.',
    size: { w: 360, h: 110 },
    layer: 'overlay',
    enter: 'draw',
    endpoints: ['to'],
    boxed: true,
    events: (_p, el) => [{ t: el.enter.t, sound: 'whoosh', gain_db: -12 }],
  },
  spotlight: {
    name: 'spotlight',
    schema: G.spotlightProps,
    description: 'Dims the whole scene except one element (`target: id`) or box, with an optional label.',
    size: { w: 1080, h: 1000 },
    layer: 'overlay',
    enter: 'fade',
    fill: true,
    targets: ['target'],
  },
  'split-screen': {
    name: 'split-screen',
    schema: G.splitScreenProps,
    description: 'Two halves side by side (or stacked), each with a title, text, icon or assets/ image.',
    size: { w: 960, h: 600 },
    enter: 'rise',
  },
  'pricing-table': {
    name: 'pricing-table',
    schema: G.pricingTableProps,
    description:
      'Plans with prices and feature lists and a featured plan; `variant: tag` draws one price tag.',
    size: { w: 960, h: 620 },
    enter: 'fade',
    events: (p, el) => itemEvents(p.plans, el, p.stagger, 'tick', -10),
  },
  'qr-code': {
    name: 'qr-code',
    schema: G.qrCodeProps,
    description: 'Scannable QR code (byte mode, ECC L or M, versions 1–10) encoded in the runtime.',
    size: { w: 420, h: 500 },
    enter: 'fade',
  },
  rating: {
    name: 'rating',
    schema: G.ratingProps,
    description:
      'Stars from 0 to max with halves, filling in turn. For illustrative scores only, never as real customer reviews.',
    size: { w: 640, h: 200 },
    events: (p, el) => [{ t: el.enter.t + p.dur, sound: 'ding', gain_db: -10 }],
  },
  vitals: {
    name: 'vitals',
    schema: G.vitalsProps,
    description: 'Heart-rate monitor: an ECG trace sweeping across with a live BPM counter (keyframable).',
    size: { w: 860, h: 360 },
    enter: 'fade',
  },
};

export const COMPONENT_NAMES = Object.keys(COMPONENTS);
export const componentSchemas = { ...S, ...V, ...G };
