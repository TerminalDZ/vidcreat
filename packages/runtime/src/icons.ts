/** Bundled icon set (24×24, stroke-based, drawn for ReelForge). */
import { s } from './dom.js';

const I: Record<string, string> = {
  lock: 'M6 11h12v9H6z|M8.5 11V8a3.5 3.5 0 0 1 7 0v3|M12 15v2',
  unlock: 'M6 11h12v9H6z|M8.5 11V8a3.5 3.5 0 0 1 6.6-1.6|M12 15v2',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z|M10 20a2 2 0 0 0 4 0',
  clock: 'C12 12 8.5|M12 7.5V12l3 2',
  warn: 'M12 3.5 21.5 20h-19z|M12 10v4.5|M12 17.2v.3',
  bubble: 'M4 5h16v11H9l-5 4z|M8 9.5h8|M8 12.5h5',
  bomb: 'C11 14 6.5|M15.5 9.5 18 7|M18 7l1.5-1.5|M19.5 3.5v1|M21 5h-1|M8 12.5a3 3 0 0 1 3-3',
  check: 'M4.5 12.5 9.5 17.5 19.5 6.5',
  x: 'M6 6l12 12|M18 6 6 18',
  server: 'M4 4h16v6H4z|M4 14h16v6H4z|M7.5 7h.01|M7.5 17h.01|M11 7h6|M11 17h6',
  db: 'E12 5.5 7 2.5|M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13|M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5',
  user: 'C12 8 3.5|M4.5 20.5a7.5 7.5 0 0 1 15 0',
  users: 'C9 8 3|M2.5 19.5a6.5 6.5 0 0 1 13 0|M15.5 5.2a3 3 0 0 1 0 5.6|M17.5 13.5a6.5 6.5 0 0 1 4 6',
  bolt: 'M13 2.5 4.5 13.5h6.5L10 21.5l9-11h-6.5z',
  card: 'M3 6h18v12H3z|M3 10h18|M6.5 14.5h4',
  wifi: 'M2.5 9a14 14 0 0 1 19 0|M5.5 12.5a9.5 9.5 0 0 1 13 0|M8.7 15.8a5 5 0 0 1 6.6 0|M12 19.2h.01',
  'wifi-off':
    'M2.5 9a14 14 0 0 1 5-2.8|M21.5 9a14 14 0 0 0-8.5-3.9|M5.5 12.5a9.5 9.5 0 0 1 4-2.2|M18.5 12.5a9.5 9.5 0 0 0-2.2-1.5|M8.7 15.8a5 5 0 0 1 6.6 0|M12 19.2h.01|M3 3l18 18',
  cloud: 'M7 18.5h10.5a4 4 0 0 0 .6-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18.5z',
  key: 'C8 15 4|M11 12l9-9|M16 7l3 3|M14 9l2 2',
  mail: 'M3 5.5h18v13H3z|M3.5 6l8.5 7 8.5-7',
  cart: 'M2.5 3.5h3l2.5 12h11l2-8H7|C9.5 19.5 1.3|C17.5 19.5 1.3',
  cpu: 'M7 7h10v10H7z|M10 10h4v4h-4z|M9.5 3v4|M14.5 3v4|M9.5 17v4|M14.5 17v4|M3 9.5h4|M3 14.5h4|M17 9.5h4|M17 14.5h4',
  queue: 'M3 7h4v10H3z|M10 7h4v10h-4z|M17 7h4v10h-4z',
  shield: 'M12 2.8 20 6v6c0 4.8-3.4 8.2-8 9.4-4.6-1.2-8-4.6-8-9.4V6z|M8.5 12l2.5 2.5 4.5-5',
  fire: 'M12 21.5c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5 3.6-8 .9 1.9 2 2.6 3 2.8-.4-2.6.6-5.2 2.4-7.1.5 3 4 5.4 4 10.4 0 4.6-2.6 8.1-6.5 8.1z',
  refresh: 'M20 12a8 8 0 0 1-14.3 4.9|M4 12a8 8 0 0 1 14.3-4.9|M18.5 3v4.2h-4.2|M5.5 21v-4.2h4.2',
  hourglass:
    'M6 3h12|M6 21h12|M7.5 3v2.5c0 2.5 4.5 4 4.5 6.5s-4.5 4-4.5 6.5V21|M16.5 3v2.5c0 2.5-4.5 4-4.5 6.5s4.5 4 4.5 6.5V21',
  phone: 'M7.5 2.5h9v19h-9z|M11 18.5h2',
  code: 'M8.5 7 3.5 12l5 5|M15.5 7l5 5-5 5|M13.5 4.5l-3 15',
  globe:
    'C12 12 9|M3 12h18|M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9|M12 3c-2.6 2.6-3.8 5.6-3.8 9s1.2 6.4 3.8 9',
};

export const ICON_NAMES = Object.keys(I);

/** Builds an <svg> for a bundled icon. Circles use "C cx cy r", ellipses "E cx cy rx ry". */
export function icon(name: string, size: number, color: string, stroke = 1.8): SVGSVGElement {
  const svg = s('svg', {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: color,
    'stroke-width': stroke,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    class: 'rf-icon',
  });
  for (const part of (I[name] ?? I.warn).split('|')) {
    if (part.startsWith('C')) {
      const [cx, cy, r] = part.slice(1).trim().split(/\s+/).map(Number);
      svg.append(s('circle', { cx, cy, r }));
    } else if (part.startsWith('E')) {
      const [cx, cy, rx, ry] = part.slice(1).trim().split(/\s+/).map(Number);
      svg.append(s('ellipse', { cx, cy, rx, ry }));
    } else {
      svg.append(s('path', { d: part }));
    }
  }
  return svg;
}
