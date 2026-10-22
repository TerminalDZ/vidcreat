/**
 * Text description of a frame's layout for models that cannot (or should not have to) read pixels:
 * visible elements with canvas boxes, overlaps between visible base elements (the V-8 geometry) and
 * platform safe-zone intersections (the V-7 geometry).
 */
import { COMPONENTS, intersect, lintBox, visibleUntil, type Rect, type Timeline } from '@reelforge/core';

export interface LayoutElement {
  id: string;
  component: string;
  layer: 'base' | 'overlay';
  /** Canvas coordinates (1080×1920 for the vertical presets). */
  box: Rect;
  enter: number;
  exit: number | null;
  /** Still running its enter animation at this time. */
  entering: boolean;
}

export interface LayoutOverlap {
  a: string;
  b: string;
  /** Intersection as a share of the smaller box (V-8 flags more than 15 %). */
  ratio: number;
  v8: boolean;
}

export interface LayoutSafeHit {
  element: string;
  zone: string;
  zoneBox: Rect;
}

export interface FrameLayout {
  time: number;
  label?: string;
  scene: { id: string; start: number; end: number } | null;
  canvas: { width: number; height: number };
  elements: LayoutElement[];
  overlaps: LayoutOverlap[];
  safeZones: LayoutSafeHit[];
  caption: string | null;
}

const area = (r: Rect) => r.w * r.h;
const r0 = (n: number) => Math.round(n);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function describeLayout(tl: Timeline, t: number, label?: string): FrameLayout {
  const scene =
    tl.scenes.find((s) => s.start <= t && t < s.end) ?? (t >= tl.duration ? tl.scenes.at(-1) : undefined);
  const elements: LayoutElement[] = [];
  const overlaps: LayoutOverlap[] = [];
  const safeZones: LayoutSafeHit[] = [];
  if (scene) {
    const o = scene.origin;
    const visible = scene.elements.filter((e) => e.enter.t <= t && t < visibleUntil(e, scene));
    const boxes = new Map<string, Rect>();
    for (const e of visible) {
      const b = lintBox(e);
      const box = { x: r0(b.x + o.x), y: r0(b.y + o.y), w: r0(b.w), h: r0(b.h) };
      boxes.set(e.id, box);
      elements.push({
        id: e.id,
        component: e.component,
        layer: e.layer,
        box,
        enter: e.enter.t,
        exit: e.exit?.t ?? null,
        entering: t < e.enter.t + e.enter.dur,
      });
    }
    // Scene-filling components (particles, the trap interstitial) are backgrounds, not layout.
    const laid = visible.filter((e) => !COMPONENTS[e.component]?.fill);
    for (const e of laid)
      for (const z of tl.preset.safe)
        if (intersect(boxes.get(e.id)!, z) > 0)
          safeZones.push({ element: e.id, zone: z.name, zoneBox: { x: z.x, y: z.y, w: z.w, h: z.h } });
    const base = laid.filter((e) => e.layer !== 'overlay');
    for (let i = 0; i < base.length; i++)
      for (let j = i + 1; j < base.length; j++) {
        const a = boxes.get(base[i].id)!;
        const b = boxes.get(base[j].id)!;
        const smaller = Math.min(area(a), area(b));
        const inter = intersect(a, b);
        if (smaller > 0 && inter > 0) {
          const ratio = Math.round((inter / smaller) * 100) / 100;
          overlaps.push({ a: base[i].id, b: base[j].id, ratio, v8: inter / smaller > 0.15 });
        }
      }
  }
  const cap = tl.captions.find((c) => c.start <= t && t < c.end);
  return {
    time: r3(t),
    ...(label !== undefined ? { label } : {}),
    scene: scene ? { id: scene.id, start: scene.start, end: scene.end } : null,
    canvas: { width: tl.width, height: tl.height },
    elements,
    overlaps,
    safeZones,
    caption: cap ? cap.text : null,
  };
}

const fmtBox = (b: Rect) => `x ${b.x} y ${b.y} w ${b.w} h ${b.h}`;

export function layoutText(l: FrameLayout): string {
  const head = `Frame at ${l.time}s${l.label !== undefined && l.label !== String(l.time) ? ` (${l.label})` : ''}${
    l.scene ? ` · scene "${l.scene.id}" ${l.scene.start}–${l.scene.end}s` : ' · no scene'
  } · canvas ${l.canvas.width}×${l.canvas.height}`;
  const els = l.elements.length
    ? l.elements.map(
        (e) =>
          `- ${e.id} (${e.component}, ${e.layer}) box ${fmtBox(e.box)}${e.entering ? ' · entering' : ''}${
            e.exit !== null ? ` · exits ${e.exit}s` : ''
          }`,
      )
    : ['- (nothing visible)'];
  const ov = l.overlaps.length
    ? l.overlaps.map((o) => `${o.a} × ${o.b} ${Math.round(o.ratio * 100)}%${o.v8 ? ' (V-8)' : ''}`).join('; ')
    : 'none';
  const safe = l.safeZones.length
    ? l.safeZones.map((s) => `${s.element} ∩ "${s.zone}" (${fmtBox(s.zoneBox)})`).join('; ')
    : 'none';
  return [
    head,
    'Visible elements (canvas coordinates):',
    ...els,
    `Overlaps between base elements: ${ov}`,
    `Platform UI zones: ${safe}`,
    ...(l.caption ? [`Caption: ${l.caption}`] : []),
  ].join('\n');
}
