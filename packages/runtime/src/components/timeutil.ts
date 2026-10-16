/**
 * Pure helpers for the time components (calendar, clock, schedule-board): month layout from fixed
 * tables (never the machine locale), wall-clock parsing and formatting, and the deterministic
 * split-flap schedule.
 */
import { rnd } from '@reelforge/audio';
import { keyframeValue } from './util.js';

export const WEEKDAYS: Record<'en' | 'ar', string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
};
export const MONTHS: Record<'en' | 'ar', string[]> = {
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  ar: [
    'يناير',
    'فبراير',
    'مارس',
    'أبريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
  ],
};
const START = { sun: 0, mon: 1, sat: 6 } as const;

export const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Day of the week (0 = Sunday) of a date, from the proleptic Gregorian calendar. */
export const weekday = (year: number, month: number, day: number): number =>
  new Date(Date.UTC(year, month - 1, day)).getUTCDay();

/**
 * Month grid: weekday order starting at `weekStart`, the number of blank cells before day 1 and the
 * cell (row, col) of each day.
 */
export function monthGrid(year: number, month: number, weekStart: keyof typeof START = 'mon') {
  const s = START[weekStart];
  const order = Array.from({ length: 7 }, (_, i) => (s + i) % 7);
  const offset = (weekday(year, month, 1) - s + 7) % 7;
  const days = daysInMonth(year, month);
  const cells = Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    row: Math.floor((offset + i) / 7),
    col: (offset + i) % 7,
  }));
  return { order, offset, days, rows: Math.ceil((offset + days) / 7), cells };
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const digitsOf = (s: string | number, system: 'latn' | 'arab'): string =>
  system === 'arab' ? String(s).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)]) : String(s);

// ------------------------------------------------------------------ clock

/** "HH:MM[:SS]" → seconds since midnight. */
export function parseClock(s: string): number {
  const [h, m, sec] = s.split(':').map(Number);
  return h * 3600 + m * 60 + (sec || 0);
}

/**
 * Clock seconds at `t`: starts at `base`, then sweeps forward to each keyframe's time. A keyframe
 * earlier than the previous one means the next day, so hands never run backwards.
 */
export function clockSeconds(
  base: string,
  keyframes: { at: number; time: string; dur?: number }[] | undefined,
  t: number,
  ease: (x: number) => number,
): number {
  let prev = parseClock(base);
  const start = prev;
  const kfs = (keyframes ?? []).map((k) => {
    let v = parseClock(k.time);
    while (v < prev) v += 86400;
    prev = v;
    return { at: k.at, value: v, dur: k.dur };
  });
  return keyframeValue(kfs, t, start, ease, 1);
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** Wall-clock text for seconds since midnight (wraps every 24 h). */
export function formatClock(
  sec: number,
  hours: '24' | '12',
  seconds: boolean,
): { text: string; ampm: string } {
  const s = ((Math.floor(sec) % 86400) + 86400) % 86400;
  let h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  let ampm = '';
  if (hours === '12') {
    ampm = h < 12 ? 'AM' : 'PM';
    h = h % 12 || 12;
  }
  return { text: `${hours === '12' ? h : p2(h)}:${p2(m)}${seconds ? `:${p2(ss)}` : ''}`, ampm };
}

/** Countdown text: "M:SS" under an hour, else "H:MM:SS". Shows whole seconds remaining (ceil). */
export function formatCountdown(remaining: number): string {
  const s = Math.max(0, Math.ceil(remaining - 1e-6));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${p2(m)}:${p2(s % 60)}` : `${p2(m)}:${p2(s % 60)}`;
}

// ------------------------------------------------------------------ split-flap board

export const FLAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-/ ';
/** Flaps per second while a character spins. */
export const FLAP_RATE = 18;

/** When character `i` of an `n`-character cell stops spinning (left to right over `dur`). */
export const flapSettle = (start: number, dur: number, i: number, n: number): number =>
  start + dur * (0.35 + (0.65 * i) / Math.max(1, n - 1));

/**
 * The character shown at `t` in position `i` of a flipping cell: the old character before
 * `start`, a seeded spinning flap until it settles, then the target. Pure in its arguments.
 */
export function flapChar(
  from: string,
  to: string,
  i: number,
  t: number,
  start: number,
  dur: number,
  seed: number,
): string {
  const n = Math.max(from.length, to.length);
  if (t < start) return from[i] ?? ' ';
  if (t >= flapSettle(start, dur, i, n)) return to[i] ?? ' ';
  const k = Math.floor((t - start) * FLAP_RATE);
  return FLAP[Math.floor(rnd(seed * 131 + i * 977 + k * 7919) * FLAP.length)];
}
