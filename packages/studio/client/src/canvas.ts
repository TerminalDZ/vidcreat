/**
 * The canvas: the real 1080×1920 frame with Figma-style interaction — zoom/pan, hover and
 * selection outlines, drag to move with smart guides, resize handles, inline text editing and
 * drag-and-drop of components from the Insert panel.
 */
import { app, h, toast, type EditOp } from './app.js';
import { insertElement, placeOps } from './actions.js';
import type { RuntimeApi } from './types.js';

const SVG = 'http://www.w3.org/2000/svg';
type Box = { x: number; y: number; w: number; h: number };
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};
/** Components whose text can be edited in place by double-clicking. */
const TEXT_PROP: Record<string, string> = {
  title: 'text',
  label: 'text',
  chip: 'text',
  stamp: 'text',
  quote: 'text',
  node: 'title',
  cta: 'next',
};

interface Ctx {
  stage: HTMLElement;
  viewport: HTMLElement;
  iframe: HTMLIFrameElement;
  overlay: SVGSVGElement;
  runtime: () => RuntimeApi | null;
  time: () => number;
  redraw: () => void;
}

let ctx!: Ctx;
const view = { zoom: 0.4, x: 0, y: 0, fitted: true };
let hover: string | null = null;
let drag: {
  kind: 'move' | 'resize' | 'pan';
  handle?: Handle;
  id?: string;
  si?: number;
  ej?: number;
  start: { x: number; y: number };
  screen: { x: number; y: number };
  orig: Box;
  box: Box;
  moved: boolean;
  pan?: { x: number; y: number };
} | null = null;
let guides: { x?: number[]; y?: number[] } = {};
let spaceDown = false;

export function initCanvas(c: Ctx): void {
  ctx = c;
  const { stage } = c;
  new ResizeObserver(() => view.fitted && fit()).observe(stage);
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  stage.addEventListener('dblclick', onDouble);
  stage.addEventListener('pointerleave', () => {
    if (hover) {
      hover = null;
      ctx.redraw();
    }
  });
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = stage.getBoundingClientRect();
        zoomAt(view.zoom * Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
      } else {
        view.x -= e.shiftKey ? e.deltaY : e.deltaX;
        view.y -= e.shiftKey ? 0 : e.deltaY;
        view.fitted = false;
        apply();
      }
    },
    { passive: false },
  );
  stage.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('application/x-reelforge-component')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      stage.classList.add('dropping');
    }
  });
  stage.addEventListener('dragleave', () => stage.classList.remove('dropping'));
  stage.addEventListener('drop', (e) => {
    stage.classList.remove('dropping');
    const name = e.dataTransfer?.getData('application/x-reelforge-component');
    if (!name) return;
    e.preventDefault();
    const p = toCanvas(e.clientX, e.clientY);
    void insertElement(name, { time: ctx.time(), x: p.x, y: p.y });
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT') spaceDown = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') spaceDown = false;
  });
  fit();
}

// ------------------------------------------------------------------ viewport
function apply(): void {
  ctx.viewport.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
  const z = document.querySelector('#zoomLabel');
  if (z) z.textContent = `${Math.round(view.zoom * 100)}%`;
  ctx.redraw();
}

export function fit(): void {
  const { stage } = ctx;
  const pad = 24;
  const bottom = 64; // room for the floating canvas toolbar
  view.zoom = Math.max(
    0.05,
    Math.min((stage.clientWidth - pad * 2) / 1080, (stage.clientHeight - pad - bottom) / 1920),
  );
  view.x = (stage.clientWidth - 1080 * view.zoom) / 2;
  view.y = pad + (stage.clientHeight - pad - bottom - 1920 * view.zoom) / 2;
  view.fitted = true;
  apply();
}

export function zoomAt(z: number, sx?: number, sy?: number): void {
  const { stage } = ctx;
  z = Math.max(0.08, Math.min(4, z));
  sx ??= stage.clientWidth / 2;
  sy ??= stage.clientHeight / 2;
  view.x = sx - ((sx - view.x) / view.zoom) * z;
  view.y = sy - ((sy - view.y) / view.zoom) * z;
  view.zoom = z;
  view.fitted = false;
  apply();
}

export const zoomBy = (k: number) => zoomAt(view.zoom * k);
export const zoom100 = () => zoomAt(1);

/** Zooms so the selected element fills the view. */
export function zoomToSelection(): void {
  const b = selectedBox();
  if (!b) return fit();
  const { stage } = ctx;
  const z = Math.min(2, Math.min(stage.clientWidth / (b.w + 160), stage.clientHeight / (b.h + 160)));
  view.zoom = z;
  view.x = stage.clientWidth / 2 - (b.x + b.w / 2) * z;
  view.y = stage.clientHeight / 2 - (b.y + b.h / 2) * z;
  view.fitted = false;
  apply();
}

function toCanvas(cx: number, cy: number): { x: number; y: number } {
  const r = ctx.stage.getBoundingClientRect();
  return { x: (cx - r.left - view.x) / view.zoom, y: (cy - r.top - view.y) / view.zoom };
}

// ------------------------------------------------------------------ boxes
interface Hit {
  id: string;
  component: string;
  box: Box;
  visible: boolean;
  order: number;
}

function hits(): Hit[] {
  const rt = ctx.runtime();
  const tl = app.timeline;
  if (!rt || !tl) return [];
  const t = ctx.time();
  const z = new Map<string, number>();
  for (const s of tl.scenes)
    for (const e of s.elements) z.set(e.id, (e.layer === 'overlay' ? 100000 : 0) + e.z * 10);
  return rt.boxes(t).map((b, i) => ({
    id: b.id,
    component: b.component,
    box: { x: b.x, y: b.y, w: b.w, h: b.h },
    visible: b.visible,
    order: (z.get(b.id) ?? 0) + i * 0.001,
  }));
}

function hitAt(p: { x: number; y: number }): Hit[] {
  return hits()
    .filter(
      (b) =>
        b.visible && p.x >= b.box.x && p.x <= b.box.x + b.box.w && p.y >= b.box.y && p.y <= b.box.y + b.box.h,
    )
    .sort((a, b) => {
      // Full-scene layers (particles) only win when nothing else is under the cursor.
      const fa = isFill(a.component) ? 1 : 0;
      const fb = isFill(b.component) ? 1 : 0;
      return fa - fb || b.order - a.order;
    });
}

const isFill = (c: string) => Boolean(app.meta?.components.find((m) => m.name === c)?.fill);

function selectedId(): string | null {
  const s = app.selection;
  return s?.kind === 'element' ? app.elementId(s.scene, s.index) : null;
}

function selectedBox(): Box | null {
  const s = app.selection;
  if (s?.kind !== 'element') return null;
  const el = app.compiledElement(s.scene, s.index);
  const sc = app.compiledScene(s.scene);
  if (!el || !sc) return null;
  return { x: el.box.x + sc.origin.x, y: el.box.y + sc.origin.y, w: el.box.w, h: el.box.h };
}

/** How an element can be moved: by place, by moving its point endpoints, or not at all. */
function movability(si: number, ej: number): 'place' | 'points' | 'locked' {
  const e = app.scenes[si]?.elements?.[ej];
  const meta = app.meta?.components.find((c) => c.name === e?.use);
  if (!e || !meta) return 'locked';
  if (meta.endpoints.length && !meta.fill) {
    return meta.endpoints.every((k) => {
      const v = e.props?.[k];
      return v === undefined || (typeof v === 'object' && v !== null);
    })
      ? 'points'
      : 'locked';
  }
  return 'place';
}

function runtimeEl(id: string): HTMLElement | null {
  return (
    ctx.iframe.contentDocument?.querySelector<HTMLElement>(`.rf-el[data-id="${CSS.escape(id)}"]`) ?? null
  );
}

// ------------------------------------------------------------------ pointer
function handleAt(p: { x: number; y: number }): Handle | null {
  const b = selectedBox();
  if (!b || app.mode !== 'edit') return null;
  const s = app.selection;
  if (s?.kind !== 'element' || movability(s.scene, s.index) !== 'place') return null;
  const r = 7 / view.zoom;
  for (const hd of HANDLES) {
    const [hx, hy] = handlePos(b, hd);
    if (Math.abs(p.x - hx) <= r && Math.abs(p.y - hy) <= r) return hd;
  }
  return null;
}

function handlePos(b: Box, hd: Handle): [number, number] {
  const x = hd.includes('w') ? b.x : hd.includes('e') ? b.x + b.w : b.x + b.w / 2;
  const y = hd.includes('n') ? b.y : hd.includes('s') ? b.y + b.h : b.y + b.h / 2;
  return [x, y];
}

function onDown(e: PointerEvent): void {
  if ((e.target as HTMLElement).closest('.canvas-tools, .inline-edit')) return;
  ctx.stage.focus({ preventScroll: true });
  const p = toCanvas(e.clientX, e.clientY);
  const screen = { x: e.clientX, y: e.clientY };
  if (e.button === 1 || spaceDown || app.tool === 'hand') {
    drag = {
      kind: 'pan',
      start: p,
      screen,
      orig: { x: 0, y: 0, w: 0, h: 0 },
      box: { x: 0, y: 0, w: 0, h: 0 },
      moved: false,
      pan: { x: view.x, y: view.y },
    };
    ctx.stage.setPointerCapture(e.pointerId);
    ctx.stage.classList.add('panning');
    return;
  }
  if ((e.button !== 0 && e.button !== 2) || app.mode !== 'edit') return;
  if (e.button === 2) {
    const top = hitAt(p)[0];
    const pos = top ? app.findElement(top.id) : null;
    const s = app.selection;
    if (pos && !(s?.kind === 'element' && s.scene === pos.scene && s.index === pos.index))
      app.select({ kind: 'element', ...pos });
    if (!pos) app.select(null);
    return;
  }
  const hd = handleAt(p);
  const sel = app.selection;
  if (hd && sel?.kind === 'element') {
    const b = selectedBox()!;
    drag = {
      kind: 'resize',
      handle: hd,
      id: selectedId()!,
      si: sel.scene,
      ej: sel.index,
      start: p,
      screen,
      orig: { ...b },
      box: { ...b },
      moved: false,
    };
    ctx.stage.setPointerCapture(e.pointerId);
    return;
  }
  const under = hitAt(p);
  let target = under[0];
  // Alt-click selects the element underneath the current selection.
  if (e.altKey && under.length > 1) {
    const i = under.findIndex((u) => u.id === selectedId());
    target = under[(i + 1) % under.length];
  }
  // Keep dragging the current selection when clicking inside it (even if something is on top).
  const cur = selectedId();
  const curBox = selectedBox();
  if (cur && curBox && !e.altKey && inside(p, curBox) && under.some((u) => u.id === cur))
    target = under.find((u) => u.id === cur)!;
  if (!target) {
    app.select(null);
    return;
  }
  const pos = app.findElement(target.id);
  if (!pos) return;
  if (sel?.kind !== 'element' || sel.scene !== pos.scene || sel.index !== pos.index)
    app.select({ kind: 'element', scene: pos.scene, index: pos.index });
  drag = {
    kind: 'move',
    id: target.id,
    si: pos.scene,
    ej: pos.index,
    start: p,
    screen,
    orig: { ...target.box },
    box: { ...target.box },
    moved: false,
  };
  ctx.stage.setPointerCapture(e.pointerId);
}

const inside = (p: { x: number; y: number }, b: Box) =>
  p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

function onMove(e: PointerEvent): void {
  const p = toCanvas(e.clientX, e.clientY);
  if (!drag) {
    if (app.mode !== 'edit') return;
    const hd = handleAt(p);
    ctx.stage.style.cursor = hd ? CURSOR[hd] : spaceDown || app.tool === 'hand' ? 'grab' : '';
    const top = hitAt(p)[0]?.id ?? null;
    if (top !== hover) {
      hover = top;
      ctx.redraw();
    }
    return;
  }
  if (drag.kind === 'pan') {
    view.x = drag.pan!.x + (e.clientX - drag.screen.x);
    view.y = drag.pan!.y + (e.clientY - drag.screen.y);
    view.fitted = false;
    apply();
    return;
  }
  const dx = p.x - drag.start.x;
  const dy = p.y - drag.start.y;
  if (!drag.moved && Math.hypot(e.clientX - drag.screen.x, e.clientY - drag.screen.y) < 3) return;
  if (!drag.moved) {
    const mv = movability(drag.si!, drag.ej!);
    if (mv === 'locked') {
      toast('This element follows the elements its from/to point at: move those instead');
      drag = null;
      return;
    }
  }
  drag.moved = true;
  const o = drag.orig;
  let b: Box;
  if (drag.kind === 'move') {
    b = { ...o, x: Math.round(o.x + dx), y: Math.round(o.y + dy) };
    if (e.shiftKey) {
      // constrain to the dominant axis
      if (Math.abs(dx) > Math.abs(dy)) b.y = o.y;
      else b.x = o.x;
    }
    b = snapMove(b, drag.id!, e.altKey || !app.snap);
  } else {
    b = resizeBox(o, drag.handle!, dx, dy, e.shiftKey, e.altKey);
  }
  drag.box = b;
  const el = runtimeEl(drag.id!);
  if (el) {
    if (drag.kind === 'move') el.style.translate = `${b.x - o.x}px ${b.y - o.y}px`;
    else {
      el.style.translate = `${b.x - o.x}px ${b.y - o.y}px`;
      el.style.width = `${b.w}px`;
      el.style.height = `${b.h}px`;
    }
  }
  ctx.redraw();
}

function resizeBox(o: Box, hd: Handle, dx: number, dy: number, keepRatio: boolean, fromCenter: boolean): Box {
  let { x, y, w, h } = o;
  const k = fromCenter ? 2 : 1;
  if (hd.includes('e')) w = o.w + dx * k;
  if (hd.includes('w')) {
    w = o.w - dx * k;
    x = o.x + dx;
  }
  if (hd.includes('s')) h = o.h + dy * k;
  if (hd.includes('n')) {
    h = o.h - dy * k;
    y = o.y + dy;
  }
  if (keepRatio && hd.length === 2) {
    const r = o.w / o.h;
    if (Math.abs(w / o.w) > Math.abs(h / o.h)) h = w / r;
    else w = h * r;
    if (hd.includes('n')) y = o.y + o.h - h;
    if (hd.includes('w')) x = o.x + o.w - w;
  }
  if (fromCenter) {
    x = o.x + (o.w - w) / 2;
    y = o.y + (o.h - h) / 2;
  }
  w = Math.max(20, w);
  h = Math.max(20, h);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** Smart guides: snaps the moving box's edges/centre to the frame, the scene area and other elements. */
function snapMove(b: Box, id: string, off: boolean): Box {
  guides = {};
  if (off) return b;
  const tol = 6 / view.zoom;
  const xs = [0, 540, 1080];
  const ys = [0, 960, 1920];
  const s = app.selection?.kind === 'element' ? app.compiledScene(app.selection.scene) : undefined;
  if (s) {
    xs.push(s.origin.x, s.origin.x + s.origin.w / 2, s.origin.x + s.origin.w);
    ys.push(s.origin.y, s.origin.y + s.origin.h / 2, s.origin.y + s.origin.h);
  }
  for (const o of hits()) {
    if (!o.visible || o.id === id || isFill(o.component)) continue;
    xs.push(o.box.x, o.box.x + o.box.w / 2, o.box.x + o.box.w);
    ys.push(o.box.y, o.box.y + o.box.h / 2, o.box.y + o.box.h);
  }
  const best = (vals: number[], cands: number[]) => {
    let r: { d: number; at: number } | null = null;
    for (const v of vals)
      for (const c of cands) {
        const d = c - v;
        if (Math.abs(d) <= tol && (!r || Math.abs(d) < Math.abs(r.d))) r = { d, at: c };
      }
    return r;
  };
  const bx = best([b.x, b.x + b.w / 2, b.x + b.w], xs);
  const by = best([b.y, b.y + b.h / 2, b.y + b.h], ys);
  const out = { ...b };
  if (bx) {
    out.x = Math.round(b.x + bx.d);
    guides.x = [bx.at];
  }
  if (by) {
    out.y = Math.round(b.y + by.d);
    guides.y = [by.at];
  }
  return out;
}

async function onUp(e: PointerEvent): Promise<void> {
  const d = drag;
  drag = null;
  guides = {};
  ctx.stage.classList.remove('panning');
  if (ctx.stage.hasPointerCapture(e.pointerId)) ctx.stage.releasePointerCapture(e.pointerId);
  if (!d || d.kind === 'pan' || !d.moved) return ctx.redraw();
  await commitBox(d.si!, d.ej!, d.id!, d.orig, d.box, d.kind === 'move' ? 'Move' : 'Resize');
}

/** Writes a new box for an element (move, resize or keyboard nudge). */
export async function commitBox(
  si: number,
  ej: number,
  id: string,
  orig: Box,
  box: Box,
  verb: string,
): Promise<void> {
  const sc = app.compiledScene(si);
  const el = runtimeEl(id);
  const mv = movability(si, ej);
  let ops: EditOp[];
  if (mv === 'points') {
    const spec = app.scenes[si].elements![ej];
    ops = [];
    for (const k of app.meta!.components.find((c) => c.name === spec.use)!.endpoints) {
      const v = spec.props?.[k] as { x: number; y: number } | undefined;
      if (v && typeof v === 'object')
        ops.push({
          op: 'set',
          path: ['scenes', si, 'elements', ej, 'props', k],
          value: { x: Math.round(v.x + box.x - orig.x), y: Math.round(v.y + box.y - orig.y) },
        });
    }
  } else if (mv === 'place') {
    const ox = sc?.origin.x ?? 0;
    const oy = sc?.origin.y ?? 0;
    ops = placeOps(si, ej, { x: box.x - ox, y: box.y - oy, w: box.w, h: box.h });
  } else return;
  const ok = await app.edit(ops, `${verb} ${id}`);
  if (!ok && el) {
    el.style.translate = '';
    el.style.width = `${orig.w}px`;
    el.style.height = `${orig.h}px`;
  }
}

/** Arrow-key nudge of the selection. */
let nudgeTimer: number | undefined;
let nudgeState: { si: number; ej: number; id: string; orig: Box; box: Box } | null = null;
export function nudge(dx: number, dy: number): boolean {
  const s = app.selection;
  if (s?.kind !== 'element') return false;
  if (movability(s.scene, s.index) === 'locked') return false;
  const id = app.elementId(s.scene, s.index);
  if (!nudgeState || nudgeState.id !== id) {
    const b = selectedBox();
    if (!b) return false;
    nudgeState = { si: s.scene, ej: s.index, id, orig: { ...b }, box: { ...b } };
  }
  nudgeState.box.x += dx;
  nudgeState.box.y += dy;
  const el = runtimeEl(id);
  if (el)
    el.style.translate = `${nudgeState.box.x - nudgeState.orig.x}px ${nudgeState.box.y - nudgeState.orig.y}px`;
  ctx.redraw();
  clearTimeout(nudgeTimer);
  nudgeTimer = window.setTimeout(() => {
    const n = nudgeState!;
    nudgeState = null;
    void commitBox(n.si, n.ej, n.id, n.orig, n.box, 'Nudge');
  }, 450);
  return true;
}

// ------------------------------------------------------------------ inline text editing
function onDouble(e: MouseEvent): void {
  if (app.mode !== 'edit') return;
  const s = app.selection;
  if (s?.kind !== 'element') return;
  const spec = app.scenes[s.scene].elements![s.index];
  const key = TEXT_PROP[spec.use];
  const b = selectedBox();
  if (!key || !b || !inside(toCanvas(e.clientX, e.clientY), b)) {
    document.dispatchEvent(new CustomEvent('rf:focus-inspector'));
    return;
  }
  const value = String(spec.props?.[key] ?? '');
  const ed = h('textarea', { class: 'inline-edit', dir: 'auto', spellcheck: 'true' }) as HTMLTextAreaElement;
  ed.value = value;
  Object.assign(ed.style, {
    left: `${b.x * view.zoom + view.x}px`,
    top: `${b.y * view.zoom + view.y}px`,
    width: `${Math.max(180, b.w * view.zoom)}px`,
    minHeight: `${Math.max(44, b.h * view.zoom)}px`,
  });
  ctx.stage.append(ed);
  ed.focus();
  ed.select();
  let done = false;
  const finish = (save: boolean) => {
    if (done) return;
    done = true;
    ed.remove();
    if (save && ed.value !== value)
      void app.edit(
        [{ op: 'set', path: ['scenes', s.scene, 'elements', s.index, 'props', key], value: ed.value }],
        `Edit ${key}`,
      );
  };
  ed.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Escape') finish(false);
    else if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey || (!ev.shiftKey && spec.use !== 'quote'))) {
      ev.preventDefault();
      finish(true);
    }
  });
  ed.addEventListener('blur', () => finish(true));
}

// ------------------------------------------------------------------ overlay
function svg(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text) el.textContent = text;
  return el;
}

export function drawOverlay(t: number): void {
  const tl = app.timeline;
  const nodes: SVGElement[] = [];
  const px = 1 / view.zoom;
  const font = 12 * px;
  const ov = app.overlays;
  if (tl && ov.safe) {
    for (const z of tl.preset.safe) {
      nodes.push(
        svg('rect', {
          x: z.x,
          y: z.y,
          width: z.w,
          height: z.h,
          fill: 'rgba(255,74,92,0.10)',
          stroke: '#ff4a5c',
          'stroke-dasharray': `${6 * px} ${5 * px}`,
          'stroke-width': 1.2 * px,
        }),
      );
      nodes.push(
        svg(
          'text',
          {
            x: z.x + 8 * px,
            y: z.y + 18 * px,
            fill: '#ff6b7a',
            'font-size': font,
            'font-family': 'Inter, system-ui, sans-serif',
            'font-weight': 600,
          },
          `${tl.preset.label} UI · ${z.name}`,
        ),
      );
    }
  }
  if (tl && ov.stage) {
    nodes.push(
      svg('rect', {
        x: 0,
        y: tl.preset.stage.y,
        width: tl.width,
        height: tl.preset.stage.h,
        fill: 'none',
        stroke: '#55dcff',
        'stroke-width': 1.2 * px,
        'stroke-dasharray': `${4 * px} ${5 * px}`,
      }),
    );
    nodes.push(
      svg('line', {
        x1: 0,
        x2: tl.width,
        y1: tl.preset.captionsY,
        y2: tl.preset.captionsY,
        stroke: '#b8ff3c',
        'stroke-width': px,
        'stroke-dasharray': `${3 * px} ${5 * px}`,
      }),
    );
  }
  const all = hits();
  if (ov.boxes || app.mode === 'dev') {
    if (ov.boxes)
      for (const b of all) {
        if (!b.visible) continue;
        nodes.push(
          svg('rect', {
            x: b.box.x,
            y: b.box.y,
            width: b.box.w,
            height: b.box.h,
            fill: 'none',
            stroke: '#c792ff',
            'stroke-width': px,
          }),
        );
        nodes.push(
          svg(
            'text',
            {
              x: b.box.x + 4 * px,
              y: b.box.y - 5 * px,
              fill: '#c792ff',
              'font-size': font,
              'font-family': 'ui-monospace, monospace',
            },
            b.id,
          ),
        );
      }
  }
  const sid = selectedId();
  if (app.mode === 'edit' && hover && hover !== sid && !drag) {
    const b = all.find((x) => x.id === hover);
    if (b)
      nodes.push(
        svg('rect', {
          x: b.box.x,
          y: b.box.y,
          width: b.box.w,
          height: b.box.h,
          fill: 'none',
          stroke: '#55dcff',
          'stroke-width': 1.5 * px,
        }),
      );
  }
  if (sid && app.mode !== 'cue') {
    const vis = all.find((x) => x.id === sid);
    const b = drag?.box ?? nudgeState?.box ?? selectedBox();
    if (b) {
      const visible = Boolean(vis?.visible) || Boolean(drag);
      nodes.push(
        svg('rect', {
          x: b.x,
          y: b.y,
          width: b.w,
          height: b.h,
          fill: visible ? 'rgba(85,220,255,0.04)' : 'none',
          stroke: '#55dcff',
          'stroke-width': 1.6 * px,
          'stroke-dasharray': visible ? 'none' : `${5 * px} ${4 * px}`,
        }),
      );
      const s = app.selection;
      const mv = s?.kind === 'element' ? movability(s.scene, s.index) : 'locked';
      if (mv === 'place' && app.mode === 'edit')
        for (const hd of HANDLES) {
          const [hx, hy] = handlePos(b, hd);
          nodes.push(
            svg('rect', {
              x: hx - 4.5 * px,
              y: hy - 4.5 * px,
              width: 9 * px,
              height: 9 * px,
              fill: '#fff',
              stroke: '#55dcff',
              'stroke-width': 1.4 * px,
              rx: 1.5 * px,
            }),
          );
        }
      const label = `${sid}${visible ? '' : ' · not on screen now'}`;
      const tw = (label.length * 6.6 + 14) * px;
      nodes.push(
        svg('rect', { x: b.x, y: b.y - 22 * px, width: tw, height: 18 * px, rx: 4 * px, fill: '#55dcff' }),
      );
      nodes.push(
        svg(
          'text',
          {
            x: b.x + 7 * px,
            y: b.y - 9 * px,
            fill: '#06121a',
            'font-size': font,
            'font-family': 'Inter, system-ui, sans-serif',
            'font-weight': 700,
          },
          label,
        ),
      );
      const dims = `${Math.round(b.w)} × ${Math.round(b.h)}`;
      const dw = (dims.length * 6.6 + 14) * px;
      nodes.push(
        svg('rect', {
          x: b.x + b.w / 2 - dw / 2,
          y: b.y + b.h + 6 * px,
          width: dw,
          height: 18 * px,
          rx: 4 * px,
          fill: '#55dcff',
        }),
      );
      nodes.push(
        svg(
          'text',
          {
            x: b.x + b.w / 2,
            y: b.y + b.h + 19 * px,
            fill: '#06121a',
            'font-size': font,
            'text-anchor': 'middle',
            'font-family': 'Inter, system-ui, sans-serif',
            'font-weight': 700,
          },
          dims,
        ),
      );
      if (drag?.kind === 'move' || nudgeState) {
        const pos = `X ${Math.round(b.x)}  Y ${Math.round(b.y)}`;
        nodes.push(
          svg(
            'text',
            {
              x: b.x + b.w + 8 * px,
              y: b.y + 12 * px,
              fill: '#55dcff',
              'font-size': font,
              'font-family': 'ui-monospace, monospace',
            },
            pos,
          ),
        );
      }
    }
  }
  for (const x of guides.x ?? [])
    nodes.push(svg('line', { x1: x, x2: x, y1: 0, y2: 1920, stroke: '#ff3dcf', 'stroke-width': px }));
  for (const y of guides.y ?? [])
    nodes.push(svg('line', { x1: 0, x2: 1080, y1: y, y2: y, stroke: '#ff3dcf', 'stroke-width': px }));
  if (ov.time) {
    nodes.push(svg('rect', { x: 20, y: 1830, width: 330, height: 66, rx: 14, fill: 'rgba(0,0,0,0.7)' }));
    nodes.push(
      svg(
        'text',
        { x: 40, y: 1876, fill: '#eef1f7', 'font-size': 34, 'font-family': 'monospace' },
        `${t.toFixed(2)}s  f${Math.round(t * (tl?.fps ?? 30))}`,
      ),
    );
  }
  ctx.overlay.replaceChildren(...nodes);
}

export function canvasZoom(): number {
  return view.zoom;
}
