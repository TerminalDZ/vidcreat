/** Math of the general-purpose components: QR encoder, map projection, calendar, clock and flip board. */
import { describe, expect, it } from 'vitest';
import { ICONS_LIST } from '@reelforge/core';
import {
  alignmentPositions,
  byteCapacity,
  codewords,
  encodeQr,
  formatBits,
  rsDivisor,
  rsRemainder,
  versionBits,
  type Ecc,
} from '../src/qr.js';
import { decodeRings, greatCircle, project, VIEWS } from '../src/geo.js';
import { WORLD } from '../src/data/world.js';
import { ICON_NAMES } from '../src/icons.js';
import {
  clockSeconds,
  daysInMonth,
  digitsOf,
  FLAP,
  flapChar,
  flapSettle,
  formatClock,
  formatCountdown,
  monthGrid,
  weekday,
} from '../src/components/timeutil.js';
import { ecgWave } from '../src/components/media.js';

/** Reads the codeword bits back out of a symbol (unmasking, zig-zag order): an independent check of placement. */
function readBack(text: string, ecc: Ecc): { cw: number[]; expected: number[]; format: number } {
  const q = encodeQr(text, ecc);
  const ref = encodeQr(text, ecc, q.mask);
  expect(ref.modules).toEqual(q.modules);
  const n = q.size;
  // function-pattern map: rebuild from an empty symbol by marking what encodeQr never writes data into
  const fn = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const mark = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && (fn[y][x] = true);
  for (let i = 0; i < n; i++) {
    mark(6, i);
    mark(i, 6);
  }
  for (const [cx, cy] of [
    [3, 3],
    [n - 4, 3],
    [3, n - 4],
  ])
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) mark(cx + dx, cy + dy);
  const al = alignmentPositions(q.version);
  al.forEach((ax, i) =>
    al.forEach((ay, j) => {
      const last = al.length - 1;
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(ax + dx, ay + dy);
    }),
  );
  for (let i = 0; i < 9; i++) {
    mark(8, i);
    mark(i, 8);
  }
  for (let i = 0; i < 8; i++) {
    mark(n - 1 - i, 8);
    mark(8, n - 1 - i);
  }
  if (q.version >= 7)
    for (let i = 0; i < 18; i++) {
      mark(n - 11 + (i % 3), Math.floor(i / 3));
      mark(Math.floor(i / 3), n - 11 + (i % 3));
    }
  const masks: ((x: number, y: number) => boolean)[] = [
    (x, y) => (x + y) % 2 === 0,
    (_x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const bits: number[] = [];
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < n; v++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? n - 1 - v : v;
        if (fn[y][x]) continue;
        bits.push(Number(q.modules[y][x] !== masks[q.mask](x, y)));
      }
  }
  const expected = codewords(new TextEncoder().encode(text), q.version, ecc);
  const cw: number[] = [];
  for (let i = 0; i < expected.length; i++)
    cw.push(bits.slice(i * 8, i * 8 + 8).reduce((a, b) => (a << 1) | b, 0));
  // first copy of the format bits, as placed around the top-left finder
  let format = 0;
  const fb = [0, 1, 2, 3, 4, 5, 7, 8].map((y) => q.modules[y][8]);
  const fa = [7, 5, 4, 3, 2, 1, 0].map((x) => q.modules[8][x]);
  [...fb, ...fa].forEach((b, i) => (format |= Number(b) << i));
  return { cw, expected, format: format ^ 0 };
}

describe('QR encoder', () => {
  it('computes Reed–Solomon ECC like the standard example (HELLO WORLD, 1-M)', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rsRemainder(data, rsDivisor(10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('produces the published format and version information words', () => {
    expect(formatBits('M', 0)).toBe(0b101010000010010);
    expect(formatBits('L', 0)).toBe(0b111011111000100);
    expect(formatBits('L', 4)).toBe(0b110011000101111);
    expect(formatBits('M', 5)).toBe(0b100000011001110);
    expect(versionBits(7)).toBe(0b000111110010010100);
    expect(versionBits(10)).toBe(0b001010010011010011);
  });

  it('has the standard byte-mode capacities and alignment positions', () => {
    expect([1, 2, 5, 7, 10].map((v) => byteCapacity(v, 'L'))).toEqual([17, 32, 106, 154, 271]);
    expect([1, 2, 5, 7, 10].map((v) => byteCapacity(v, 'M'))).toEqual([14, 26, 84, 122, 213]);
    expect(alignmentPositions(1)).toEqual([]);
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(10)).toEqual([6, 28, 50]);
  });

  it('picks the smallest version and places every codeword where a reader looks for it', () => {
    for (const [text, ecc, ver] of [
      ['HELLO', 'M', 1],
      ['https://example.com/book?ref=reelforge', 'M', 3],
      ['مرحبا بكم في العيادة', 'L', 3],
      ['x'.repeat(200), 'M', 10],
      ['y'.repeat(150), 'L', 7],
    ] as [string, Ecc, number][]) {
      const q = encodeQr(text, ecc);
      expect(q.version, text.slice(0, 12)).toBe(ver);
      expect(q.size).toBe(ver * 4 + 17);
      const r = readBack(text, ecc);
      expect(r.cw).toEqual(r.expected);
      expect(r.format).toBe(formatBits(ecc, q.mask));
    }
  });

  it('is deterministic and rejects text that does not fit version 10', () => {
    expect(encodeQr('same', 'M').modules).toEqual(encodeQr('same', 'M').modules);
    expect(() => encodeQr('z'.repeat(214), 'M')).toThrow(/too long/);
  });
});

describe('map projection', () => {
  it('fits the world view as plain equirectangular, centred in the box', () => {
    const p = project(VIEWS.world, 720, 400, true);
    const a = p(-180, 84);
    const b = p(180, -58);
    expect(b.x - a.x).toBeCloseTo(p.frame.w, 6);
    expect(b.y - a.y).toBeCloseTo(p.frame.h, 6);
    expect(p.frame.w / p.frame.h).toBeCloseTo(360 / 142, 6);
    expect(a.x).toBeCloseTo((720 - p.frame.w) / 2, 6);
  });

  it('scales longitudes by the cosine of the middle latitude for regions', () => {
    const p = project({ west: 0, south: 50, east: 10, north: 70 }, 1000, 1000);
    const w = p(10, 60).x - p(0, 60).x;
    const h = p(0, 50).y - p(0, 70).y;
    expect(w / h).toBeCloseTo((10 * Math.cos(Math.PI / 3)) / 20, 6);
  });

  it('interpolates great circles', () => {
    const eq = greatCircle({ lon: 0, lat: 0 }, { lon: 90, lat: 0 }, 2);
    expect(eq[1].lon).toBeCloseTo(45, 6);
    expect(eq[1].lat).toBeCloseTo(0, 6);
    const ln = greatCircle({ lon: -0.1, lat: 51.5 }, { lon: -74, lat: 40.7 });
    expect(Math.max(...ln.map((q) => q.lat))).toBeGreaterThan(51.5);
    expect(ln[ln.length - 1].lon).toBeCloseTo(-74, 6);
    // across the antimeridian the longitudes stay continuous
    const pac = greatCircle({ lon: 170, lat: 0 }, { lon: -170, lat: 0 });
    expect(pac[pac.length - 1].lon).toBeCloseTo(190, 6);
  });

  it('ships compact outline data with ISO codes', () => {
    const ids = new Set(WORLD.map((c) => c.id));
    for (const id of ['FRA', 'NOR', 'EGY', 'USA', 'CHN', 'BRA', 'ARE', 'AUS'])
      expect(ids.has(id), id).toBe(true);
    expect(WORLD.find((c) => c.id === 'EGY')!.a2).toBe('EG');
    const rings = decodeRings(WORLD.find((c) => c.id === 'EGY')!.d);
    expect(rings[0].length).toBeGreaterThan(3);
    for (const [lon, lat] of rings[0]) {
      expect(lon).toBeGreaterThan(20);
      expect(lat).toBeGreaterThan(20);
    }
  });
});

describe('calendar layout', () => {
  it('uses the Gregorian calendar, never the machine locale', () => {
    expect(weekday(2024, 2, 29)).toBe(4);
    expect(weekday(2026, 11, 1)).toBe(0);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('places days in a grid for each week start', () => {
    const mon = monthGrid(2026, 11, 'mon');
    expect(mon.offset).toBe(6);
    expect(mon.rows).toBe(6);
    expect(mon.cells[0]).toEqual({ day: 1, row: 0, col: 6 });
    expect(mon.cells[29]).toEqual({ day: 30, row: 5, col: 0 });
    const sat = monthGrid(2026, 11, 'sat');
    expect(sat.order).toEqual([6, 0, 1, 2, 3, 4, 5]);
    expect(sat.offset).toBe(1);
    expect(sat.rows).toBe(5);
    expect(monthGrid(2026, 2, 'sun')).toMatchObject({ offset: 0, rows: 4 });
    expect(digitsOf(2026, 'arab')).toBe('٢٠٢٦');
  });
});

describe('clock and countdown', () => {
  it('sweeps forward to keyframed times, wrapping past midnight', () => {
    const lin = (x: number) => Math.min(1, Math.max(0, x));
    const kf = [{ at: 1, time: '01:00', dur: 2 }];
    expect(clockSeconds('23:00', kf, 0, lin)).toBe(23 * 3600);
    expect(clockSeconds('23:00', kf, 2, lin)).toBe(24 * 3600);
    expect(formatClock(clockSeconds('23:00', kf, 3, lin), '24', false).text).toBe('01:00');
    expect(formatClock(13 * 3600 + 5 * 60 + 9, '12', true)).toEqual({ text: '1:05:09', ampm: 'PM' });
    expect(formatClock(0, '12', false)).toEqual({ text: '12:00', ampm: 'AM' });
  });

  it('formats whole seconds remaining', () => {
    expect(formatCountdown(10)).toBe('00:10');
    expect(formatCountdown(9.2)).toBe('00:10');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(3725)).toBe('1:02:05');
  });
});

describe('split-flap timing', () => {
  it('settles left to right within the flip duration', () => {
    expect(flapSettle(10, 1, 0, 5)).toBeCloseTo(10.35, 9);
    expect(flapSettle(10, 1, 4, 5)).toBeCloseTo(11, 9);
    expect(flapSettle(10, 1, 0, 1)).toBeCloseTo(10.35, 9);
  });

  it('shows the old text before, spinning flaps during and the new text after', () => {
    const from = 'ON TIME';
    const to = 'DELAYED';
    for (let i = 0; i < to.length; i++) {
      expect(flapChar(from, to, i, 9.99, 10, 0.7, 42)).toBe(from[i]);
      expect(flapChar(from, to, i, 10.71, 10, 0.7, 42)).toBe(to[i]);
    }
    const mid = flapChar(from, to, 6, 10.2, 10, 0.7, 42);
    expect(FLAP).toContain(mid);
    expect(flapChar(from, to, 6, 10.2, 10, 0.7, 42)).toBe(mid);
    expect(flapChar('', 'AB', 1, 20, 10, 0.7, 1)).toBe('B');
  });
});

describe('vitals and icons', () => {
  it('draws one PQRST complex per beat with the R peak at 1', () => {
    expect(ecgWave(0.32)).toBeCloseTo(1, 1);
    expect(ecgWave(0.9)).toBeCloseTo(0, 2);
    expect(ecgWave(0.345)).toBeLessThan(0);
  });

  it('has a drawing for every icon name in the schema', () => {
    expect([...ICON_NAMES].sort()).toEqual([...ICONS_LIST].sort());
    expect(ICONS_LIST.length).toBeGreaterThanOrEqual(240);
  });
});
