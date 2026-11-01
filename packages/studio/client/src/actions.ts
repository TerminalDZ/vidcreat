/** Editing actions shared by the canvas, layers, timeline, inspector and command palette. */
import { app, clone, toast, uniqueId, uniqueSceneId, type EditOp, type SpecElement } from './app.js';
import { exprFor } from './timeexpr.js';

/** Starter props for new elements: valid and good-looking out of the box. */
export function starterProps(component: string, at: string): Record<string, unknown> {
  switch (component) {
    case 'title':
      return { text: 'Your **headline** here' };
    case 'label':
      return { text: 'LABEL', dot: true, color: 'cyan' };
    case 'code':
      return { title: 'example.ts', lines: ['const total = items.length;', 'console.log(total);'] };
    case 'node':
      return { title: 'Server', sub: 'ready', icon: 'server', status: 'ok' };
    case 'arrow':
      return { from: { x: 240, y: 300 }, to: { x: 840, y: 300 }, label: 'request' };
    case 'chip':
      return { text: 'New chip', icon: 'bolt' };
    case 'stamp':
      return { text: 'DONE', color: 'lime' };
    case 'table':
      return {
        columns: ['id', 'name', 'status'],
        rows: [{ cells: ['1', 'Alice', 'active'] }, { cells: ['2', 'Bob', 'idle'] }],
      };
    case 'lanes':
      return {
        lanes: [
          { title: 'Request A', color: 'cyan', steps: [{ text: 'read → 100', at }] },
          { title: 'Request B', color: 'violet', steps: [{ text: 'read → 100', at }] },
        ],
      };
    case 'checklist':
      return {
        title: 'Checklist',
        items: [{ text: 'First point' }, { text: 'Second point' }, { text: 'Third point' }],
      };
    case 'counter':
      return { from: 0, keyframes: [{ at, value: 100, dur: 1 }], label: 'requests / s' };
    case 'meter':
      return { keyframes: [{ at, value: 72, dur: 1 }], label: 'CPU', unit: '%', threshold: 80 };
    case 'grid':
      return { cols: 3, rows: 3 };
    case 'bucket':
      return { capacity: 10, label: 'tokens' };
    case 'quote':
      return { text: 'Simplicity is a prerequisite for reliability.', author: 'Edsger W. Dijkstra' };
    case 'particles':
      return { kind: 'confetti', count: 60 };
    case 'cta':
      return { next: 'Next episode', keyword: 'next' };
    case 'icon':
      return { name: 'bolt', size: 120, color: 'lime' };
    default:
      return {};
  }
}

const elPath = (si: number, ej: number) => ['scenes', si, 'elements', ej];

/**
 * Elements without an id are named by position (`scene-use-3`); before reordering, inserting or
 * deleting, write those ids out so arrows and states that refer to them keep pointing at the same element.
 */
function freezeElementIds(si: number): EditOp[] {
  return (app.scenes[si]?.elements ?? []).flatMap((e, ej) =>
    e.id ? [] : [{ op: 'set' as const, path: [...elPath(si, ej), 'id'], value: app.elementId(si, ej) }],
  );
}

/** Inserts a component into a scene at the playhead (or a canvas point). */
export async function insertElement(
  component: string,
  o: { time: number; x?: number; y?: number; scene?: number },
): Promise<void> {
  const meta = app.meta?.components.find((c) => c.name === component);
  if (!meta) return;
  if (!app.scenes.length) {
    toast('Add a scene first', 'err');
    return;
  }
  const si = o.scene ?? app.sceneIndexAt(o.time);
  const scene = app.compiledScene(si);
  const at = exprFor(Math.max(o.time, scene?.start ?? 0));
  const el: SpecElement = { use: component, id: uniqueId(component) };
  el.props = starterProps(component, at);
  if (!meta.fill && !meta.endpoints.length) {
    const area = scene?.origin ?? { x: 0, y: 0, w: 1080, h: 1920 };
    const w = Math.min(meta.size.w, area.w);
    const h = Math.min(meta.size.h, area.h);
    const cx = o.x !== undefined ? o.x - area.x : area.w / 2;
    const cy = o.y !== undefined ? o.y - area.y : area.h / 2;
    el.place = {
      x: Math.round(Math.max(0, Math.min(area.w - w, cx - w / 2))),
      y: Math.round(Math.max(0, Math.min(area.h - h, cy - h / 2))),
      w,
      h,
    };
  }
  el.enter = { at };
  await editAndSelect([{ op: 'insert', path: ['scenes', si, 'elements'], value: el }], `Add ${component}`, {
    id: el.id!,
  });
}

export interface SuggestedElement {
  use: string;
  props: Record<string, unknown>;
  enter: { at: string; anim: string };
}

/**
 * Inserts a smart-insert suggestion into the scene playing at `time` (the start of its line),
 * below the elements already there so it rarely overlaps them.
 */
export async function insertSuggestion(s: SuggestedElement, time: number): Promise<void> {
  const meta = app.meta?.components.find((c) => c.name === s.use);
  if (!meta) return;
  if (!app.scenes.length) return toast('Add a scene first', 'err');
  const si = app.sceneIndexAt(time);
  const scene = app.compiledScene(si);
  const el: SpecElement = { use: s.use, id: uniqueId(s.use), props: clone(s.props) };
  if (!meta.fill && !meta.endpoints.length) {
    const area = scene?.origin ?? { x: 0, y: 0, w: 1080, h: 1920 };
    const w = Math.min(meta.size.w, area.w - 120);
    const h = Math.min(meta.size.h, area.h);
    const below = (scene?.elements ?? [])
      .filter((e) => e.layer !== 'overlay' && e.component !== 'particles' && e.component !== 'trap')
      .reduce((m, e) => Math.max(m, e.box.y + e.box.h), 40);
    const y = below + 30 + h <= area.h ? below + 30 : Math.max(0, Math.round((area.h - h) / 2));
    el.place = { x: Math.round((area.w - w) / 2), y, w, h };
  }
  el.enter = { at: s.enter.at, anim: s.enter.anim } as SpecElement['enter'];
  await editAndSelect([{ op: 'insert', path: ['scenes', si, 'elements'], value: el }], `Add ${s.use}`, {
    id: el.id!,
  });
}

/** The new selection must be queued before the edit: the recompiled state can arrive first. */
async function editAndSelect(ops: EditOp[], label: string, sel: { id: string }): Promise<boolean> {
  pendingSelect = { id: sel.id, until: Date.now() + 5000 };
  const ok = await app.edit(ops, label);
  if (!ok) pendingSelect = null;
  return ok;
}

/** Element (by id) to select once a state that contains it arrives. */
let pendingSelect: { id: string; until: number } | null = null;
export function takePendingSelect(): { scene: number; index: number } | null {
  if (!pendingSelect) return null;
  const pos = app.findElement(pendingSelect.id);
  if (pos || Date.now() > pendingSelect.until) pendingSelect = null;
  return pos;
}

export async function deleteSelection(): Promise<void> {
  const s = app.selection;
  if (!s) return;
  if (s.kind === 'element') {
    const id = app.elementId(s.scene, s.index);
    app.select(null);
    await app.edit(
      [...freezeElementIds(s.scene), { op: 'delete', path: elPath(s.scene, s.index) }],
      `Delete ${id}`,
    );
  } else if (s.kind === 'scene') {
    if (app.scenes.length <= 1) return toast('An episode needs at least one scene', 'err');
    const sc = app.scenes[s.scene];
    if (
      (sc.elements?.length ?? 0) > 0 &&
      !confirm(`Delete scene “${sc.id}” and its ${sc.elements!.length} element(s)?`)
    )
      return;
    app.select(null);
    await app.edit([{ op: 'delete', path: ['scenes', s.scene] }], `Delete scene ${sc.id}`);
  } else if (s.kind === 'line') {
    await deleteLine(s.index);
  }
}

let clipboard: SpecElement | null = null;
try {
  clipboard = JSON.parse(sessionStorage.getItem('rf-clipboard') ?? 'null') as SpecElement | null;
} catch {
  clipboard = null;
}

export function copySelection(): void {
  const s = app.selection;
  if (s?.kind !== 'element') return;
  clipboard = clone(app.scenes[s.scene].elements![s.index]);
  try {
    sessionStorage.setItem('rf-clipboard', JSON.stringify(clipboard));
  } catch {
    /* private mode */
  }
  toast(`Copied ${app.elementId(s.scene, s.index)}`);
}

/** Pastes into the scene at the playhead; the copy starts at the playhead. */
export async function paste(time: number): Promise<void> {
  if (!clipboard) return toast('Nothing to paste');
  const si = app.sceneIndexAt(time);
  const el = clone(clipboard);
  el.id = uniqueId(el.id ?? el.use);
  const scene = app.compiledScene(si);
  el.enter = { ...(el.enter ?? {}), at: exprFor(Math.max(time, scene?.start ?? 0)) };
  delete el.exit;
  await editAndSelect([{ op: 'insert', path: ['scenes', si, 'elements'], value: el }], `Paste ${el.id}`, {
    id: el.id,
  });
}

export async function duplicateSelection(): Promise<void> {
  const s = app.selection;
  if (s?.kind !== 'element') return;
  const el = clone(app.scenes[s.scene].elements![s.index]);
  el.id = uniqueId(el.id ?? el.use);
  if (el.place && typeof el.place.x === 'number' && typeof el.place.y === 'number') {
    el.place = { ...el.place, x: (el.place.x as number) + 40, y: (el.place.y as number) + 40 };
  }
  await editAndSelect(
    [
      ...freezeElementIds(s.scene),
      { op: 'insert', path: ['scenes', s.scene, 'elements'], index: s.index + 1, value: el },
    ],
    `Duplicate ${el.id}`,
    { id: el.id },
  );
}

/** Moves the selected element up/down the layer order (later = on top). */
export async function reorder(delta: number | 'top' | 'bottom'): Promise<void> {
  const s = app.selection;
  if (s?.kind !== 'element') return;
  const n = app.scenes[s.scene].elements?.length ?? 0;
  const to = delta === 'top' ? n - 1 : delta === 'bottom' ? 0 : Math.max(0, Math.min(n - 1, s.index + delta));
  if (to === s.index) return;
  await editAndSelect(
    [...freezeElementIds(s.scene), { op: 'move', path: ['scenes', s.scene, 'elements'], from: s.index, to }],
    'Reorder layers',
    { id: app.elementId(s.scene, s.index) },
  );
}

export async function moveElementTo(si: number, from: number, to: number): Promise<void> {
  if (from === to) return;
  await editAndSelect(
    [...freezeElementIds(si), { op: 'move', path: ['scenes', si, 'elements'], from, to }],
    'Reorder layers',
    {
      id: app.elementId(si, from),
    },
  );
}

/** Sets the element's position/size (scene coordinates); drops anchors that would override it. */
export function placeOps(
  si: number,
  ej: number,
  box: { x: number; y: number; w: number; h: number },
): EditOp[] {
  const el = app.scenes[si].elements![ej];
  const place = { ...(el.place ?? {}) };
  delete place.anchor;
  delete place.center;
  delete place.margin;
  Object.assign(place, {
    x: Math.round(box.x),
    y: Math.round(box.y),
    w: Math.max(1, Math.round(box.w)),
    h: Math.max(1, Math.round(box.h)),
  });
  const ops: EditOp[] = [{ op: 'set', path: [...elPath(si, ej), 'place'], value: place }];
  if (el.size) ops.push({ op: 'delete', path: [...elPath(si, ej), 'size'] });
  return ops;
}

/** I / O: element enters / exits at the playhead. */
export async function setInOut(which: 'in' | 'out', time: number): Promise<void> {
  const s = app.selection;
  if (s?.kind === 'scene' && which === 'in') {
    await app.edit([{ op: 'set', path: ['scenes', s.scene, 'at'], value: exprFor(time) }], 'Scene start');
    return;
  }
  if (s?.kind !== 'element') return toast('Select an element first');
  const at = exprFor(time);
  const path = [...elPath(s.scene, s.index), which === 'in' ? 'enter' : 'exit', 'at'];
  await app.edit([{ op: 'set', path, value: at }], which === 'in' ? `Enter at ${at}` : `Exit at ${at}`);
}

export async function addScene(time: number): Promise<void> {
  const at = exprFor(time);
  const tl = app.timeline;
  // Insert after the scene that is visible at the playhead.
  const cur = app.sceneIndexAt(time);
  const index = app.scenes.length ? cur + 1 : 0;
  const id = uniqueSceneId(`scene${index + 1}`);
  const value = { id, at, elements: [] as unknown[] };
  if (tl && tl.scenes.length && at === app.scenes[cur]?.at) value.at = exprFor(time + 0.5);
  if (await app.edit([{ op: 'insert', path: ['scenes'], index, value }], `Add scene ${id}`)) {
    app.select({ kind: 'scene', scene: index });
  }
}

// ------------------------------------------------------------------ script lines
/** Writes explicit ids for lines that use the positional default, so inserts don't renumber them. */
function freezeLineIds(): EditOp[] {
  return (app.spec.script ?? []).flatMap((l, i) =>
    l.id ? [] : [{ op: 'set' as const, path: ['script', i, 'id'], value: `l${i + 1}` }],
  );
}

function nextLineId(): string {
  const ids = new Set((app.state?.script ?? []).map((l) => l.id));
  for (let i = ids.size + 1; ; i++) if (!ids.has(`l${i}`)) return `l${i}`;
}

/** Line start times as the episode currently plays them (marked, draft or estimated). */
export function effectiveCues(): Record<string, number> {
  const est = Object.fromEntries((app.timeline?.script ?? []).map((l) => [l.id, l.start]));
  return { ...est, ...(app.state?.cues?.cues ?? {}) };
}

export async function insertLine(after: number, text = 'New line'): Promise<void> {
  const id = nextLineId();
  // Snapshot before the edit: the recompiled state may or may not have arrived when it returns.
  const cues = effectiveCues();
  const ids = (app.state?.script ?? []).map((l) => l.id);
  const prev = ids[after] !== undefined ? cues[ids[after]] : 0;
  const next = ids[after + 1] !== undefined ? cues[ids[after + 1]] : undefined;
  const ok = await app.edit(
    [...freezeLineIds(), { op: 'insert', path: ['script'], index: after + 1, value: { id, text } }],
    'Add script line',
  );
  if (!ok) return;
  // Give the new line an estimated cue between its neighbours so the episode keeps compiling.
  const t =
    next !== undefined ? (prev ?? 0) + (next - (prev ?? 0)) / 2 : Math.min((prev ?? 0) + 2, app.duration);
  cues[id] = Math.round(t * 1000) / 1000;
  ids.splice(after + 1, 0, id);
  await putCues(cues, undefined, ids);
  app.select({ kind: 'line', index: after + 1 });
  toast('Line added with an estimated cue: mark it in Cues mode after recording');
}

export async function deleteLine(index: number): Promise<void> {
  const line = app.state?.script[index];
  if (!line) return;
  if ((app.state?.script.length ?? 0) <= 1) return toast('The script needs at least one line', 'err');
  if (!confirm(`Delete line ${line.id}? Elements timed on ${line.id} will need a new time.`)) return;
  app.select(null);
  await app.edit([...freezeLineIds(), { op: 'delete', path: ['script', index] }], `Delete line ${line.id}`);
}

export async function moveLine(from: number, to: number): Promise<void> {
  await app.edit([...freezeLineIds(), { op: 'move', path: ['script'], from, to }], 'Reorder lines');
}

export async function putCues(
  cues: Record<string, number>,
  words?: Record<string, number[]>,
  order?: string[],
): Promise<boolean> {
  const st = app.state;
  if (!st) return false;
  const ids = order ?? st.script.map((l) => l.id);
  const res = await fetch('/cues', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      version: 1,
      audio: { file: 'voice.wav', duration: Math.round(app.duration * 1000) / 1000 },
      cues: Object.fromEntries(ids.filter((id) => cues[id] !== undefined).map((id) => [id, cues[id]])),
      words: words ?? st.cues?.words ?? {},
    }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    toast(`Could not save cues: ${j.error ?? res.statusText}`, 'err');
    return false;
  }
  return true;
}

/** Renames an element and updates arrows/particles that point at it. */
export async function renameElement(si: number, ej: number, next: string): Promise<void> {
  const old = app.elementId(si, ej);
  if (!next || next === old) return;
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(next))
    return toast('Ids start with a letter or “_” and use letters, digits, “_” and “-”', 'err');
  if (app.findElement(next)) return toast(`“${next}” is already used`, 'err');
  const ops: EditOp[] = [{ op: 'set', path: [...elPath(si, ej), 'id'], value: next }];
  app.scenes.forEach((s, i) =>
    (s.elements ?? []).forEach((e, j) => {
      for (const key of ['from', 'to']) {
        const v = e.props?.[key];
        if (typeof v === 'string' && (v === old || v.startsWith(`${old}.`)))
          ops.push({ op: 'set', path: [...elPath(i, j), 'props', key], value: next + v.slice(old.length) });
      }
    }),
  );
  await app.edit(ops, `Rename ${old} → ${next}`);
}
