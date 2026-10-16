/**
 * Map math for the `map` component: named views, a fitted equirectangular projection (longitudes
 * scaled by the cosine of the view's middle latitude, so regional maps keep their proportions),
 * great-circle interpolation and the decoder of the vendored outline data. Pure functions only.
 */
export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export const VIEWS: Record<string, Bounds> = {
  world: { west: -180, south: -58, east: 180, north: 84 },
  africa: { west: -20, south: -36, east: 55, north: 38 },
  europe: { west: -25, south: 34, east: 45, north: 71 },
  asia: { west: 25, south: -12, east: 150, north: 62 },
  'middle-east': { west: 24, south: 10, east: 64, north: 43 },
  'north-america': { west: -170, south: 5, east: -50, north: 75 },
  'south-america': { west: -85, south: -57, east: -32, north: 14 },
  oceania: { west: 110, south: -50, east: 180, north: 0 },
};

export interface Projection {
  /** Stage-local x/y of a lon/lat. */
  (lon: number, lat: number): { x: number; y: number };
  /** Drawn area of the view inside the box. */
  frame: { x: number; y: number; w: number; h: number };
}

/** Fits `b` into a w×h box (centred, aspect preserved). The world view is plain equirectangular. */
export function project(b: Bounds, w: number, h: number, world = false): Projection {
  const k = world ? 1 : Math.cos((((b.north + b.south) / 2) * Math.PI) / 180);
  const bw = (b.east - b.west) * k;
  const bh = b.north - b.south;
  const s = Math.min(w / bw, h / bh);
  const ox = (w - bw * s) / 2;
  const oy = (h - bh * s) / 2;
  const f = ((lon: number, lat: number) => ({
    x: ox + (lon - b.west) * k * s,
    y: oy + (b.north - lat) * s,
  })) as Projection;
  f.frame = { x: ox, y: oy, w: bw * s, h: bh * s };
  return f;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * `n + 1` points along the great circle from a to b (lon/lat in degrees). Longitudes are kept
 * continuous (they may leave −180…180) so a route crossing the antimeridian draws as one line.
 */
export function greatCircle(
  a: { lon: number; lat: number },
  b: { lon: number; lat: number },
  n = 48,
): { lon: number; lat: number }[] {
  const v = (p: { lon: number; lat: number }) => [
    Math.cos(rad(p.lat)) * Math.cos(rad(p.lon)),
    Math.cos(rad(p.lat)) * Math.sin(rad(p.lon)),
    Math.sin(rad(p.lat)),
  ];
  const A = v(a);
  const B = v(b);
  const dot = Math.min(1, Math.max(-1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
  const om = Math.acos(dot);
  const out: { lon: number; lat: number }[] = [];
  let prev = a.lon;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    let p: number[];
    if (om < 1e-9) p = A;
    else {
      const s1 = Math.sin((1 - f) * om) / Math.sin(om);
      const s2 = Math.sin(f * om) / Math.sin(om);
      p = [s1 * A[0] + s2 * B[0], s1 * A[1] + s2 * B[1], s1 * A[2] + s2 * B[2]];
    }
    let lon = deg(Math.atan2(p[1], p[0]));
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    prev = lon;
    out.push({ lon, lat: deg(Math.atan2(p[2], Math.hypot(p[0], p[1]))) });
  }
  return out;
}

/** Straight (rhumb-like, in projected space) path from a to b with continuous longitudes. */
export function straightPath(a: { lon: number; lat: number }, b: { lon: number; lat: number }, n = 24) {
  let bl = b.lon;
  while (bl - a.lon > 180) bl -= 360;
  while (bl - a.lon < -180) bl += 360;
  return Array.from({ length: n + 1 }, (_, i) => ({
    lon: a.lon + ((bl - a.lon) * i) / n,
    lat: a.lat + ((b.lat - a.lat) * i) / n,
  }));
}

/** Decodes one country's rings ("lon lat …" in tenths of a degree, rings split by "|"). */
export const decodeRings = (d: string): [number, number][][] =>
  d.split('|').map((ring) => {
    const v = ring.split(' ').map(Number);
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i] / 10, v[i + 1] / 10]);
    return pts;
  });
