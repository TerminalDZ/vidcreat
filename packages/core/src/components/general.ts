/**
 * Prop schemas of the general-purpose components for places, time, people, media and domain
 * visuals (maps, routes, calendars, clocks, chats, images, QR codes, …). Same conventions as
 * schemas.ts; shared pieces live in fragments.ts.
 */
import { z } from 'zod';
import { color, endpoint, int, time } from '../schema/common.js';
import { animDur, clockTime, focus, fontSize, half, lonLat, stagger, valueKeyframes } from './fragments.js';
import { ICONS, STATUSES } from './schemas.js';

const icon = () => z.enum(ICONS);
const isoCode = () => z.string().regex(/^[A-Za-z]{2,3}$/, 'Expected an ISO 3166-1 alpha-2 or alpha-3 code');
const ref = () => z.string().min(1);

// ------------------------------------------------------------------ place & movement

export const MAP_VIEWS = [
  'world',
  'africa',
  'europe',
  'asia',
  'middle-east',
  'north-america',
  'south-america',
  'oceania',
] as const;

export const mapProps = z
  .object({
    view: z
      .union([
        z.enum(MAP_VIEWS),
        z
          .object({
            west: z.number().min(-180).max(180),
            south: z.number().min(-90).max(90),
            east: z.number().min(-180).max(180),
            north: z.number().min(-90).max(90),
          })
          .strict()
          .refine((b) => b.east > b.west && b.north > b.south, {
            message: 'view bounds need east > west and north > south',
          }),
      ])
      .default('world'),
    countries: z
      .array(
        z.union([
          isoCode(),
          z.object({ code: isoCode(), color: color().optional(), at: time().optional() }).strict(),
        ]),
      )
      .max(60)
      .default([]),
    pins: z
      .array(
        z
          .object({
            id: z.string().optional(),
            label: z.string().optional(),
            ...lonLat(),
            color: color().optional(),
            at: time().optional(),
          })
          .strict(),
      )
      .max(16)
      .default([]),
    routes: z
      .array(
        z
          .object({
            from: z.union([ref(), z.object(lonLat()).strict()]),
            to: z.union([ref(), z.object(lonLat()).strict()]),
            at: time().optional(),
            dur: animDur(1.4),
            path: z.enum(['great-circle', 'straight']).default('great-circle'),
            vehicle: z.enum(['none', 'plane', 'ship', 'truck', 'train']).default('none'),
            dashed: z.boolean().default(false),
            color: color().optional(),
          })
          .strict(),
      )
      .max(10)
      .default([]),
    graticule: z.boolean().default(true),
    color: color().default('cyan'),
    accent: color().default('lime'),
    stagger: stagger(0.3),
    fontSize: fontSize(26),
  })
  .strict();

export const VEHICLES = ['truck', 'ship', 'plane', 'ambulance', 'train', 'car', 'bus', 'bike'] as const;

export const routeProps = z
  .object({
    stops: z
      .array(
        z
          .object({
            label: z.string(),
            sub: z.string().optional(),
            x: z.number().min(0).max(1).optional(),
            y: z.number().min(0).max(1).optional(),
          })
          .strict(),
      )
      .min(2)
      .max(8),
    vehicle: z.enum(VEHICLES).default('truck'),
    progress: valueKeyframes().optional(),
    dur: animDur(2.4),
    curve: z.boolean().default(true),
    color: color().default('cyan'),
    accent: color().default('lime'),
    fontSize: fontSize(28),
  })
  .strict()
  .refine((p) => p.stops.every((s) => (s.x === undefined) === (s.y === undefined)), {
    message: 'A route stop needs both "x" and "y" (0–1 inside the box) or neither',
  });

export const floorPlanProps = z
  .object({
    cols: int().min(1).max(40).default(12),
    rows: int().min(1).max(40).default(8),
    rooms: z
      .array(
        z
          .object({
            id: z.string().optional(),
            label: z.string(),
            x: z.number().min(0),
            y: z.number().min(0),
            w: z.number().positive(),
            h: z.number().positive(),
            icon: icon().optional(),
            color: color().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(24),
    highlights: z
      .array(
        z.object({ at: time(), room: ref(), until: time().optional(), color: color().optional() }).strict(),
      )
      .default([]),
    color: color().default('cyan'),
    accent: color().default('lime'),
    stagger: stagger(0.08),
    fontSize: fontSize(26),
  })
  .strict();

export const buildingProps = z
  .object({
    floors: z
      .array(
        z
          .object({
            label: z.string(),
            sub: z.string().optional(),
            icon: icon().optional(),
            color: color().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    highlights: z
      .array(z.object({ at: time(), floor: int().min(0), until: time().optional() }).strict())
      .default([]),
    numbers: z.boolean().default(true),
    ground: z.string().default('G'),
    color: color().default('cyan'),
    accent: color().default('lime'),
    stagger: stagger(0.12),
    fontSize: fontSize(30),
  })
  .strict();

export const containerStackProps = z
  .object({
    containers: z
      .array(
        z
          .object({
            code: z.string().max(16),
            label: z.string().optional(),
            color: color().optional(),
            at: time().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(24),
    cols: int().min(1).max(8).default(4),
    focus: focus().optional(),
    color: color().default('cyan'),
    accent: color().default('lime'),
    stagger: stagger(0.12),
    fontSize: fontSize(22),
  })
  .strict();

// ------------------------------------------------------------------ time

export const calendarProps = z
  .object({
    year: int().min(1900).max(2200),
    month: int().min(1).max(12),
    lang: z.enum(['en', 'ar']).default('en'),
    weekStart: z.enum(['mon', 'sun', 'sat']).default('mon'),
    weekdays: z.array(z.string()).length(7).optional(),
    monthName: z.string().optional(),
    digits: z.enum(['latn', 'arab']).default('latn'),
    days: z
      .array(
        z.union([
          int().min(1).max(31),
          z
            .object({
              day: int().min(1).max(31),
              at: time().optional(),
              color: color().optional(),
              label: z.string().optional(),
            })
            .strict(),
        ]),
      )
      .max(31)
      .default([]),
    color: color().default('cyan'),
    accent: color().default('lime'),
    stagger: stagger(0.2),
    fontSize: fontSize(30),
  })
  .strict();

export const clockProps = z
  .object({
    mode: z.enum(['clock', 'countdown']).default('clock'),
    face: z.enum(['analog', 'digital']).default('analog'),
    time: clockTime().default('09:00'),
    keyframes: z
      .array(z.object({ at: time(), time: clockTime(), dur: z.number().min(0).optional() }).strict())
      .optional(),
    hours: z.enum(['24', '12']).default('24'),
    seconds: z.boolean().default(false),
    from: z.number().positive().max(86400).default(10),
    at: time().optional(),
    label: z.string().optional(),
    color: color().default('ink'),
    accent: color().default('lime'),
  })
  .strict();

export const scheduleBoardProps = z
  .object({
    title: z.string().default('DEPARTURES'),
    icon: icon().default('plane-takeoff'),
    columns: z.array(z.string()).min(1).max(6).default(['TIME', 'DESTINATION', 'GATE', 'STATUS']),
    widths: z.array(z.number().positive()).optional(),
    rows: z
      .array(
        z
          .object({
            cells: z.array(z.string().max(24)).min(1).max(6),
            at: time().optional(),
            status: z.enum(STATUSES).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    updates: z
      .array(
        z
          .object({
            at: time(),
            row: int().min(0),
            col: int().min(0),
            text: z.string().max(24),
            status: z.enum(STATUSES).optional(),
          })
          .strict(),
      )
      .default([]),
    flip: animDur(0.7),
    color: color().default('amber'),
    stagger: stagger(0.25),
    fontSize: fontSize(30),
  })
  .strict();

export const appointmentProps = z
  .object({
    title: z.string(),
    date: z.string(),
    time: z.string().optional(),
    place: z.string().optional(),
    person: z.string().optional(),
    status: z.enum(['confirmed', 'pending', 'cancelled', 'done']).default('confirmed'),
    statusText: z.string().optional(),
    icon: icon().default('calendar-check'),
    color: color().default('cyan'),
  })
  .strict();

// ------------------------------------------------------------------ people & messaging

export const personCardProps = z
  .object({
    name: z.string(),
    role: z.string().optional(),
    sub: z.string().optional(),
    src: z.string().optional(),
    initials: z.string().max(3).optional(),
    icon: icon().optional(),
    badge: z.string().optional(),
    layout: z.enum(['horizontal', 'vertical']).default('horizontal'),
    color: color().default('cyan'),
  })
  .strict();

export const chatProps = z
  .object({
    title: z.string().optional(),
    messages: z
      .array(
        z
          .object({
            text: z.string(),
            from: z.enum(['me', 'them']).default('them'),
            name: z.string().optional(),
            time: z.string().optional(),
            at: time().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    typing: z.number().min(0).max(5).default(0.7),
    dir: z.enum(['auto', 'ltr', 'rtl']).default('auto'),
    color: color().default('cyan'),
    stagger: stagger(1.1),
    fontSize: fontSize(36),
  })
  .strict();

export const notificationProps = z
  .object({
    items: z
      .array(
        z
          .object({
            title: z.string(),
            text: z.string().optional(),
            icon: icon().default('bell'),
            color: color().optional(),
            time: z.string().optional(),
            at: time().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    color: color().default('cyan'),
    stagger: stagger(0.6),
    fontSize: fontSize(28),
  })
  .strict();

export const speechBubbleProps = z
  .object({
    text: z.string(),
    tail: z.enum(['bottom-left', 'bottom-right', 'top-left', 'top-right', 'none']).default('bottom-left'),
    style: z.enum(['speech', 'thought']).default('speech'),
    cps: z.number().min(0).default(0),
    color: color().default('cyan'),
    fontSize: fontSize(40),
  })
  .strict();

export const lowerThirdProps = z
  .object({
    name: z.string(),
    title: z.string().optional(),
    icon: icon().optional(),
    color: color().default('lime'),
    fontSize: fontSize(52),
  })
  .strict();

// ------------------------------------------------------------------ media & text

export const imageProps = z
  .object({
    src: z.string().min(1),
    fit: z.enum(['cover', 'contain']).default('cover'),
    kenburns: z.boolean().default(true),
    zoom: z.number().min(1).max(2).default(1.12),
    pan: z.enum(['center', 'left', 'right', 'up', 'down']).default('right'),
    caption: z.string().optional(),
    radius: z.number().min(0).default(26),
    color: color().default('ink'),
  })
  .strict();

export const logoProps = z
  .object({
    src: z.string().optional(),
    text: z.string().optional(),
    tagline: z.string().optional(),
    icon: icon().optional(),
    color: color().default('ink'),
    accent: color().default('lime'),
    size: fontSize(96),
  })
  .strict()
  .refine((p) => p.src || p.text, { message: 'logo needs "src" (assets/…svg|png) or "text" (a wordmark)' });

export const kineticTextProps = z
  .object({
    text: z.string().min(1),
    style: z.enum(['pop', 'slide', 'highlight']).default('pop'),
    beats: z
      .array(z.object({ at: time() }).strict())
      .max(40)
      .default([]),
    size: z.number().positive().optional(),
    align: z.enum(['left', 'center', 'right']).default('center'),
    color: color().default('ink'),
    accent: color().default('lime'),
    stagger: stagger(0.18),
    weight: int().min(100).max(1000).default(800),
  })
  .strict();

export const bulletListProps = z
  .object({
    title: z.string().optional(),
    items: z
      .array(
        z.union([
          z.string(),
          z
            .object({
              text: z.string(),
              sub: z.string().optional(),
              icon: icon().optional(),
              at: time().optional(),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(8),
    marker: z.enum(['dot', 'number', 'check', 'dash', 'icon']).default('dot'),
    color: color().default('lime'),
    stagger: stagger(0.45),
    fontSize: fontSize(40),
  })
  .strict();

export const calloutProps = z
  .object({
    to: endpoint(),
    text: z.string(),
    color: color().default('amber'),
    curve: z.boolean().default(true),
    ring: z.boolean().default(true),
    fontSize: fontSize(30),
  })
  .strict();

const rect = () =>
  z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() }).strict();

export const spotlightProps = z
  .object({
    target: z.union([
      z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]*$/, 'Expected an element id or a box {x, y, w, h}'),
      rect(),
    ]),
    shape: z.enum(['rect', 'circle']).default('rect'),
    padding: z.number().min(0).default(24),
    dim: z.number().min(0).max(1).default(0.72),
    label: z.string().optional(),
    at: time().optional(),
    until: time().optional(),
    color: color().default('ink'),
  })
  .strict();

export const splitScreenProps = z
  .object({
    a: half('cyan', ICONS),
    b: half('violet', ICONS),
    split: z.enum(['columns', 'rows']).default('columns'),
    badge: z.string().optional(),
    stagger: stagger(0.35),
    fontSize: fontSize(40),
  })
  .strict();

export const pricingTableProps = z
  .object({
    variant: z.enum(['table', 'tag']).default('table'),
    plans: z
      .array(
        z
          .object({
            name: z.string(),
            price: z.union([z.number(), z.string()]),
            was: z.union([z.number(), z.string()]).optional(),
            period: z.string().optional(),
            features: z.array(z.string()).max(8).default([]),
            featured: z.boolean().default(false),
            badge: z.string().optional(),
            color: color().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    currency: z.string().max(4).default('$'),
    color: color().default('cyan'),
    accent: color().default('lime'),
    stagger: stagger(0.25),
    fontSize: fontSize(30),
  })
  .strict();

/** Byte-mode capacity of QR version 10 (the largest the runtime encoder produces). */
export const QR_CAPACITY = { L: 271, M: 213 } as const;

export const qrCodeProps = z
  .object({
    text: z.string().min(1),
    ecc: z.enum(['L', 'M']).default('M'),
    label: z.string().optional(),
    draw: z.boolean().default(true),
    color: color().default('#0b0d14'),
    background: z.string().default('#ffffff'),
  })
  .strict()
  .refine((p) => new TextEncoder().encode(p.text).length <= QR_CAPACITY[p.ecc], {
    message: `QR text is too long (at most ${QR_CAPACITY.M} bytes with ecc M, ${QR_CAPACITY.L} with ecc L)`,
  });

export const ratingProps = z
  .object({
    value: z.number().min(0),
    max: int().min(3).max(10).default(5),
    label: z.string().optional(),
    note: z.string().optional(),
    numbers: z.boolean().default(true),
    color: color().default('amber'),
    dur: animDur(1),
    size: fontSize(76),
  })
  .strict()
  .refine((p) => p.value <= p.max, { message: 'rating "value" cannot exceed "max"' });

export const vitalsProps = z
  .object({
    bpm: z.number().min(20).max(240).default(72),
    keyframes: valueKeyframes().optional(),
    label: z.string().default('HEART RATE'),
    unit: z.string().default('BPM'),
    threshold: z.number().optional(),
    window: z.number().min(1).max(10).default(3),
    grid: z.boolean().default(true),
    color: color().default('lime'),
    danger: color().default('red'),
  })
  .strict();
