/** UI icons (24×24, stroke-based, drawn for ReelForge). */
const P: Record<string, string> = {
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  pause:
    '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
  start: '<path d="M6 5v14M18 5 9 12l9 7z"/>',
  end: '<path d="M18 5v14M6 5l9 7-9 7z"/>',
  back: '<path d="M11 6 5 12l6 6M19 6l-6 6 6 6"/>',
  fwd: '<path d="m13 6 6 6-6 6M5 6l6 6-6 6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  shapes:
    '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><circle cx="17" cy="7" r="3.5"/><path d="M7 14l4 7H3z"/><rect x="13.5" y="13.5" width="7" height="7" rx="3.5"/>',
  script: '<path d="M5 6h14M5 10h14M5 14h9M5 18h6"/>',
  image:
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
  film: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M7.5 4.5v15M16.5 4.5v15M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  warn: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17v.2"/>',
  keyboard:
    '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7 14h10"/>',
  magnet: '<path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z"/><path d="M6 8h4M14 8h4"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  grid: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/>',
  safe: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 8h17M15 8v12.5" stroke-dasharray="2 2.5"/>',
  frame: '<path d="M7 3v18M17 3v18M3 7h18M3 17h18"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  zoomin: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M11 8v6M8 11h6"/>',
  zoomout: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M8 11h6"/>',
  render: '<path d="M4 5.5h16v13H4z"/><path d="m10 9 5 3-5 3z" fill="currentColor"/>',
  folder: '<path d="M3.5 6.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  dots: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
  target:
    '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  scene: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 9h17"/>',
  type: '<path d="M5 6V4.5h14V6M12 4.5v15M9 19.5h6"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  box: '<rect x="3.5" y="6" width="17" height="12" rx="3"/><path d="M7 10h6M7 14h3"/>',
  arrow: '<path d="M4 12h15M14 6l6 6-6 6"/>',
  tag: '<path d="M3.5 12V4.5H11l9.5 9.5-7.5 7.5z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
  stamp: '<path d="M8 3h8l-1.5 7h4.5v4H5v-4h4.5z"/><path d="M5 18h14v3H5z"/>',
  table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M10 9.5v10"/>',
  lanes:
    '<rect x="3.5" y="3.5" width="7" height="17" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="17" rx="1.5"/><path d="M6 8h2M16 12h2M6 16h2"/>',
  list: '<path d="m4 6.5 1.5 1.5L8 5.5M4 12.5 5.5 14 8 11.5M4 18.5 5.5 20 8 17.5M11 7h9M11 13h9M11 19h9"/>',
  counter: '<path d="M4 6.5h3v11M4 17.5h6M13 7.5a3 3 0 1 1 5 2.3L13 17.5h6"/>',
  meter:
    '<rect x="3" y="9" width="18" height="6" rx="3"/><path d="M3 12h11"/><path d="M15 6v12" stroke-dasharray="2 2"/>',
  timeline: '<path d="M3 12h18M6 9v6M12 7v10M18 9v6"/>',
  tiles:
    '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  bucket:
    '<path d="M5 6h14l-2 14H7z"/><circle cx="10" cy="14" r="1.2"/><circle cx="14" cy="11" r="1.2"/><circle cx="13" cy="16" r="1.2"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  quote: '<path d="M10 7H6.5A1.5 1.5 0 0 0 5 8.5V12h4v5H5M19 7h-3.5A1.5 1.5 0 0 0 14 8.5V12h4v5h-4"/>',
  sparkles:
    '<path d="M12 3.5 13.6 9l5.4 1.5-5.4 1.6L12 17.5l-1.6-5.4L5 10.5 10.4 9z"/><path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  trap: '<path d="M3 8l18-3M3 19l18-3"/><path d="M12 9.5 8 16h8z"/>',
  megaphone: '<path d="M4 10v4h3l8 4.5v-13L7 10z"/><path d="M18 9.5a3.5 3.5 0 0 1 0 5"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-12.6 4.2L2.8 15.6a1.6 1.6 0 0 1 2.5-2L8 15.5"/>',
  wave: '<path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2"/>',
  cursor: '<path d="M5 3.5 18.5 12l-6 1.5-3 6z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  sound:
    '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  diamond: '<path d="m12 4 8 8-8 8-8-8z" fill="currentColor" stroke="none"/>',
  sliders:
    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
};

/** Component name → icon. */
export const COMPONENT_ICON: Record<string, string> = {
  title: 'type',
  label: 'tag',
  code: 'code',
  node: 'box',
  arrow: 'arrow',
  chip: 'tag',
  stamp: 'stamp',
  table: 'table',
  lanes: 'lanes',
  checklist: 'list',
  counter: 'counter',
  meter: 'meter',
  timeline: 'timeline',
  grid: 'tiles',
  bucket: 'bucket',
  phone: 'phone',
  quote: 'quote',
  particles: 'sparkles',
  trap: 'trap',
  cta: 'megaphone',
  icon: 'star',
};

export function icon(name: string, size = 16): string {
  return `<svg class="i" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? P.box}</svg>`;
}

export function iconEl(name: string, size = 16): Element {
  const t = document.createElement('template');
  t.innerHTML = icon(name, size);
  return t.content.firstElementChild!;
}
