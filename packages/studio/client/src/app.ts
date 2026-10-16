/** Shared editor state, server API and small helpers used by every panel. */
import type { Issue, Timeline, TElement, TScene } from '@reelforge/core';
import type { StudioState } from './types.js';

export type Mode = 'edit' | 'cue' | 'dev';
export type Path = (string | number)[];
export type EditOp =
  | { op: 'set'; path: Path; value: unknown }
  | { op: 'delete'; path: Path }
  | { op: 'insert'; path: Path; index?: number; value: unknown }
  | { op: 'move'; path: Path; from: number; to: number };

export type Selection =
  | { kind: 'element'; scene: number; index: number }
  | { kind: 'scene'; scene: number }
  | { kind: 'line'; index: number }
  | null;

export interface ComponentInfo {
  name: string;
  description: string;
  size: { w: number; h: number };
  layer: 'base' | 'overlay';
  fill: boolean;
  endpoints: string[];
  enter: string;
}

export interface Meta {
  components: ComponentInfo[];
  schemas: Record<string, JsonSchema>;
  enterAnims: string[];
  exitAnims: string[];
  fxKinds: string[];
  icons: string[];
  sounds: string[];
  themes: string[];
  presets: string[];
}

export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  enum?: (string | number)[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minLength?: number;
  pattern?: string;
  additionalProperties?: boolean | JsonSchema;
  description?: string;
}

/** Raw episode.yaml data (only the parts the editor reads). */
export interface SpecElement {
  use: string;
  id?: string;
  props?: Record<string, unknown>;
  place?: Record<string, unknown>;
  size?: Record<string, unknown>;
  layer?: string;
  z?: number;
  enter?: Record<string, unknown>;
  exit?: Record<string, unknown>;
  states?: unknown[];
  fx?: Record<string, unknown>[];
  sfx?: unknown;
  [k: string]: unknown;
}
export interface SpecScene {
  id: string;
  at: string | number;
  end?: string | number;
  elements?: SpecElement[];
  [k: string]: unknown;
}
export interface Spec {
  meta?: Record<string, unknown>;
  audio?: Record<string, unknown>;
  script?: { id?: string; text: string; [k: string]: unknown }[];
  chapters?: { at: string | number; label: string }[];
  scenes?: SpecScene[];
  [k: string]: unknown;
}

type Listener = () => void;

class App {
  state: StudioState | null = null;
  meta: Meta | null = null;
  mode: Mode = 'edit';
  selection: Selection = null;
  /** The timeline currently shown by the runtime (may be mutated live while dragging). */
  timeline: Timeline | null = null;
  snap = true;
  tool: 'move' | 'hand' = 'move';
  overlays = { safe: true, stage: false, boxes: false, time: false, guides: true };
  private listeners = new Map<string, Set<Listener>>();

  on(ev: string, fn: Listener): void {
    if (!this.listeners.has(ev)) this.listeners.set(ev, new Set());
    this.listeners.get(ev)!.add(fn);
  }

  emit(ev: string): void {
    for (const fn of this.listeners.get(ev) ?? []) fn();
  }

  get spec(): Spec {
    return (this.state?.spec ?? {}) as Spec;
  }

  get scenes(): SpecScene[] {
    return this.spec.scenes ?? [];
  }

  select(sel: Selection): void {
    this.selection = sel;
    this.emit('selection');
  }

  /** Effective element id (the compiler's default when the YAML has none). */
  elementId(si: number, ej: number): string {
    const s = this.scenes[si];
    const e = s?.elements?.[ej];
    if (!e) return '';
    return e.id ?? `${s.id}-${e.use}-${ej + 1}`;
  }

  findElement(id: string): { scene: number; index: number } | null {
    for (let si = 0; si < this.scenes.length; si++) {
      const els = this.scenes[si].elements ?? [];
      for (let ej = 0; ej < els.length; ej++)
        if (this.elementId(si, ej) === id) return { scene: si, index: ej };
    }
    return null;
  }

  /** Compiled scene and element for a spec position. */
  compiledScene(si: number): TScene | undefined {
    const id = this.scenes[si]?.id;
    return this.timeline?.scenes.find((s) => s.id === id);
  }

  compiledElement(si: number, ej: number): TElement | undefined {
    const id = this.elementId(si, ej);
    return this.compiledScene(si)?.elements.find((e) => e.id === id);
  }

  sceneIndexAt(t: number): number {
    const tl = this.timeline;
    if (!tl) return 0;
    let best = 0;
    tl.scenes.forEach((s) => {
      if (s.start <= t + 1e-6) {
        const i = this.scenes.findIndex((x) => x.id === s.id);
        if (i >= 0) best = i;
      }
    });
    return best;
  }

  get issues(): Issue[] {
    return this.state?.issues ?? [];
  }

  get fps(): number {
    return this.timeline?.fps ?? 30;
  }

  get duration(): number {
    return this.state?.voice?.duration ?? this.timeline?.duration ?? this.state?.timeline?.duration ?? 1;
  }

  // ------------------------------------------------------------------ server
  private async post<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(j.error ?? res.statusText);
    return j;
  }

  /** Applies YAML edits on the server; the recompiled state arrives over the WebSocket. */
  async edit(ops: EditOp[], label: string): Promise<boolean> {
    if (!ops.length) return true;
    try {
      this.status(`${label}…`);
      await this.post('/api/edit', { ops, label });
      this.status(`${label} · saved`, 'ok');
      return true;
    } catch (e) {
      toast(`Could not apply “${label}”: ${(e as Error).message}`, 'err');
      this.status('edit failed', 'err');
      return false;
    }
  }

  async undo(redo = false): Promise<void> {
    try {
      const r = await this.post<{ label?: string }>(redo ? '/api/redo' : '/api/undo', {});
      if (r.label) toast(`${redo ? 'Redo' : 'Undo'}: ${r.label}`);
      else toast(`Nothing to ${redo ? 'redo' : 'undo'}`);
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  }

  async render(options: Record<string, unknown>): Promise<void> {
    await this.post('/api/render', { options });
  }

  async cancelRender(): Promise<void> {
    await this.post('/api/render/cancel', {});
  }

  status(text: string, cls = ''): void {
    const el = document.querySelector('#status');
    if (el) {
      el.textContent = text;
      el.className = `status ${cls}`;
    }
  }
}

export const app = new App();

// ------------------------------------------------------------------ helpers
export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | undefined> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function fmt(t: number, frames = false): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  if (frames) {
    const f = Math.round((t - Math.floor(t)) * app.fps) % app.fps;
    return `${m}:${String(Math.floor(s)).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  }
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';

/** Human-readable shortcut ("Mod+D" → "⌘D" / "Ctrl+D"). */
const KEY_NAMES: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  Backspace: '⌫',
  Delete: 'Del',
  Enter: '↵',
};
export function keyLabel(k: string): string {
  return k
    .replace(/Arrow(Left|Right|Up|Down)|Escape|Backspace|Delete|Enter/g, (m) => KEY_NAMES[m] ?? m)
    .split(' ')
    .map((combo) =>
      combo
        .replace('Mod', MOD)
        .replace('Shift', isMac ? '⇧' : 'Shift')
        .replace('Alt', isMac ? '⌥' : 'Alt')
        .replace(isMac ? /\+/g : /(?!)/, ''),
    )
    .join(' / ');
}

let toastHost: HTMLElement | null = null;
export function toast(text: string, kind: '' | 'ok' | 'err' = '', ms = 3200): void {
  toastHost ??= document.querySelector('#toasts');
  if (!toastHost) return;
  const el = h('div', { class: `toast ${kind}`, role: 'status' }, text);
  toastHost.append(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
  }, ms);
}

/** Unique element id for a component (title → title, title2, title3…). */
export function uniqueId(base: string): string {
  const taken = new Set<string>();
  app.scenes.forEach((s, si) => (s.elements ?? []).forEach((_, ej) => taken.add(app.elementId(si, ej))));
  const b = base.replace(/[^A-Za-z0-9_-]/g, '_').replace(/^[^A-Za-z_]/, '_$&') || 'el';
  if (!taken.has(b)) return b;
  for (let i = 2; ; i++) if (!taken.has(`${b}${i}`)) return `${b}${i}`;
}

export function uniqueSceneId(base = 'scene'): string {
  const taken = new Set(app.scenes.map((s) => s.id));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}_${i}`)) return `${base}_${i}`;
}
