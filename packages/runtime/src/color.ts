/** Color helpers. Colors arrive resolved from core (hex or CSS); named theme tokens are still accepted. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

let palette: Record<string, string> = {};
export function setPalette(p: Record<string, string>): void {
  palette = p;
}
export const resolve = (c: string | undefined, fallback = '#ffffff'): string => (c ? (palette[c] ?? c) : fallback);

export function parse(c: string): Rgb {
  const v = resolve(c).trim();
  let m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const [r, g, b] = m[1].split('').map((x) => parseInt(x + x, 16));
    return { r, g, b };
  }
  m = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) {
    return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
  }
  m = v.match(/^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  if (v === 'black') return { r: 0, g: 0, b: 0 };
  return { r: 255, g: 255, b: 255 };
}

export function rgba(c: string, a: number): string {
  const { r, g, b } = parse(c);
  return `rgba(${r},${g},${b},${Math.round(Math.max(0, Math.min(1, a)) * 1000) / 1000})`;
}

export function mix(a: string, b: string, k: number): string {
  const x = parse(a);
  const y = parse(b);
  const m = (p: number, q: number) => Math.round(p + (q - p) * Math.max(0, Math.min(1, k)));
  return `rgb(${m(x.r, y.r)},${m(x.g, y.g)},${m(x.b, y.b)})`;
}
