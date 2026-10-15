/**
 * Component registry (core side). See schemas.ts for the prop conventions.
 */
import type { ZodType } from 'zod';
import type { SoundName } from '@reelforge/audio';
import type { EnterAnim, TElement } from '../types.js';
import * as S from './schemas.js';

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
  /** Fills the whole scene area by default (particles, trap). */
  fill?: boolean;
  /** Default SFX hooks (SRS §6.3), from resolved props. */
  events?: (props: any, el: TElement) => ComponentEvent[];
}

const SUCCESS = new Set(['lime', 'cyan', '#b8ff3c', '#55dcff']);

/** Typing schedule shared with the runtime `code` component: [start, end) per line. */
export function codeSchedule(props: { lines: (string | { text: string; at?: number })[]; cps: number }, enterEnd: number) {
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
        l.steps.map((s) => ({ t: s.at, sound: (s.mark === 'err' ? 'err' : 'tick') as SoundName, gain_db: s.mark === 'err' ? -4 : 0 })),
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
    description: 'Horizontal bar with an optional threshold marker.',
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
    events: (p) => (p.keyframes as { at: number }[]).map((k) => ({ t: k.at, sound: 'tick' as const, gain_db: -2 })),
  },
  phone: {
    name: 'phone',
    schema: S.phoneProps,
    description: 'Phone mock with a checkout screen, button taps and notifications.',
    size: { w: 440, h: 880 },
    events: (p, el) => {
      const out: ComponentEvent[] = (p.taps as { at: number }[]).map((tp) => ({ t: tp.at, sound: 'tap' as const }));
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
};

export const COMPONENT_NAMES = Object.keys(COMPONENTS);
export { S as componentSchemas };
