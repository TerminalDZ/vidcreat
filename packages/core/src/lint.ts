/** Static (geometric/timing) lint rules (SRS §10). V-9 and V-10 need a browser and live in the renderer. */
import type { Issue, Rect, TElement, Timeline, TScene } from './types.js';
import { round3 } from './util.js';

/** Overlap area of two boxes (0 when they do not overlap). */
export const intersect = (a: Rect, b: Rect): number => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

const FILL = new Set(['particles', 'trap', 'spotlight']);

/** Visible bounds used for linting: arrows use their path, not their padded box. */
export function lintBox(el: TElement): Rect {
  if (el.component === 'arrow') {
    const pts = (el.props.points as { x: number; y: number }[] | undefined) ?? [];
    if (pts.length) {
      const xs = pts.map((p) => p.x + el.box.x);
      const ys = pts.map((p) => p.y + el.box.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x || 1, h: Math.max(...ys) - y || 1 };
    }
  }
  return el.box;
}

export const visibleUntil = (el: TElement, scene: TScene) => el.exit?.t ?? scene.end;

export function lintTimeline(tl: Timeline, opts: { file?: string } = {}): Issue[] {
  const issues: Issue[] = [];
  const at = (el: TElement) => ({
    file: opts.file,
    line: el.source?.line,
    col: el.source?.col,
    elementId: el.id,
  });
  for (const scene of tl.scenes) {
    const area = scene.origin;
    const els = scene.elements.filter((e) => !FILL.has(e.component));
    for (const el of els) {
      const b = lintBox(el);
      // V-6 outside stage/canvas
      if (b.x < 0 || b.y < 0 || b.x + b.w > area.w || b.y + b.h > area.h) {
        issues.push({
          rule: 'V-6',
          level: 'warn',
          message: `Element "${el.id}" (${b.x},${b.y} ${b.w}×${b.h}) is partly outside the ${scene.layout === 'stage' ? 'stage' : 'canvas'} (${area.w}×${area.h})`,
          hint: 'Adjust place.x/y/w/h so the box fits',
          time: el.enter.t,
          sceneId: scene.id,
          ...at(el),
        });
      }
      // V-7 safe zones (canvas coordinates)
      const canvasBox = { x: b.x + area.x, y: b.y + area.y, w: b.w, h: b.h };
      for (const z of tl.preset.safe) {
        if (intersect(canvasBox, z) > 0) {
          issues.push({
            rule: 'V-7',
            level: 'warn',
            message: `Element "${el.id}" intersects the ${tl.preset.label} "${z.name}" UI zone`,
            hint: `Keep content out of x ${z.x}–${z.x + z.w}, y ${z.y}–${z.y + z.h} (canvas coordinates)`,
            time: el.enter.t,
            sceneId: scene.id,
            ...at(el),
          });
        }
      }
    }
    // V-8 overlap of visible base elements
    const base = els.filter((e) => e.layer !== 'overlay');
    for (let i = 0; i < base.length; i++) {
      for (let j = i + 1; j < base.length; j++) {
        const a = base[i];
        const b = base[j];
        const t0 = Math.max(a.enter.t, b.enter.t);
        const t1 = Math.min(visibleUntil(a, scene), visibleUntil(b, scene));
        if (t1 <= t0) continue;
        const ba = lintBox(a);
        const bb = lintBox(b);
        const inter = intersect(ba, bb);
        const smaller = Math.min(ba.w * ba.h, bb.w * bb.h);
        if (smaller > 0 && inter / smaller > 0.15) {
          issues.push({
            rule: 'V-8',
            level: 'warn',
            message: `Elements "${a.id}" and "${b.id}" overlap by ${Math.round((inter / smaller) * 100)}% at ${round3(t0)}s`,
            hint: 'Move one of them, give them different visible times, or set `layer: overlay` on the one meant to sit on top',
            time: t0,
            sceneId: scene.id,
            ...at(b),
          });
        }
      }
    }
    // V-11 dead air
    const firstEnter = Math.min(...scene.elements.map((e) => e.enter.t), Infinity);
    if (firstEnter - scene.start > 1.5) {
      issues.push({
        rule: 'V-11',
        level: 'info',
        message: `Scene "${scene.id}" has no element entering in its first 1.5 s`,
        hint: 'Bring something in on the first words of the scene',
        time: scene.start,
        sceneId: scene.id,
        file: opts.file,
        line: scene.source?.line,
        col: scene.source?.col,
      });
    }
    // V-12 blink
    for (const el of scene.elements) {
      if (scene.end - el.enter.t < 0.1) {
        issues.push({
          rule: 'V-12',
          level: 'warn',
          message: `Element "${el.id}" enters ${round3(scene.end - el.enter.t)}s before its scene ends (blink)`,
          time: el.enter.t,
          sceneId: scene.id,
          ...at(el),
        });
      }
    }
  }
  return issues;
}
