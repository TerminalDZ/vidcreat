/**
 * Right panel: a property inspector generated from the component JSON schemas, so every prop of
 * every component can be edited — plus layout, timing, effects, states, scene and episode settings,
 * and a YAML view of the selection for anything else.
 */
import { parse as parseYaml, stringify as toYaml } from 'yaml';
import { placeOps, putCues, renameElement } from './actions.js';
import { app, esc, fmt, h, toast, type EditOp, type JsonSchema, type Path } from './app.js';
import { COMPONENT_ICON, icon } from './icons.js';
import { describeExpr, exprFor } from './timeexpr.js';

interface Ctx {
  time: () => number;
  seek: (t: number) => void;
  setMode: (m: 'edit' | 'cue' | 'dev') => void;
}
let ctx!: Ctx;
const open = new Map<string, boolean>();

export function initInspector(c: Ctx): void {
  ctx = c;
  document.addEventListener('rf:focus-inspector', () => {
    document.querySelector<HTMLElement>('#inspector input:not([disabled]), #inspector textarea')?.focus();
  });
}

const COLOR_KEYS = new Set(['color', 'accent', 'danger', 'active', 'english']);
const TIME_KEYS = new Set(['at', 'until']);
const LONG_TEXT = new Set(['text', 'sub', 'caption', 'pinned', 'next', 'title', 'cover']);

const human = (k: string) =>
  k
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());

function set(path: Path, value: unknown, label: string): void {
  void app.edit([value === undefined ? { op: 'delete', path } : { op: 'set', path, value }], label);
}

// ------------------------------------------------------------------ building blocks
function section(key: string, title: string, body: Node[], extra?: Node): HTMLElement {
  const isOpen = open.get(key) ?? true;
  const head = h('button', { class: `sec-head${isOpen ? ' open' : ''}`, 'aria-expanded': String(isOpen) });
  head.innerHTML = `${icon('chevron', 12)}<span>${esc(title)}</span>`;
  const wrap = h('section', { class: 'sec' }, head);
  if (extra) head.append(extra);
  const content = h('div', { class: 'sec-body', hidden: !isOpen }, ...body);
  head.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.sec-extra')) return;
    open.set(key, !isOpen);
    renderInspector();
  });
  wrap.append(content);
  return wrap;
}

function row(label: string, control: Node, hint?: string, cls = ''): HTMLElement {
  const r = h(
    'div',
    { class: `frow ${cls}` },
    h('label', { class: 'flabel', title: hint ?? label }, label),
    control,
  );
  if (hint) r.append(h('div', { class: 'fhint', text: hint }));
  return r;
}

function textInput(
  path: Path,
  value: unknown,
  o: { placeholder?: string; multiline?: boolean; required?: boolean; label: string },
): HTMLElement {
  const multiline = o.multiline;
  const el = (
    multiline ? h('textarea', { rows: 1, dir: 'auto' }) : h('input', { type: 'text', dir: 'auto' })
  ) as HTMLInputElement | HTMLTextAreaElement;
  el.className = 'finput';
  el.value = value === undefined || value === null ? '' : String(value);
  if (o.placeholder) el.placeholder = o.placeholder;
  const grow = () => {
    if (!multiline) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(220, el.scrollHeight + 2)}px`;
  };
  requestAnimationFrame(grow);
  el.addEventListener('input', grow);
  el.addEventListener('keydown', (e) => {
    e.stopPropagation();
    const k = e as KeyboardEvent;
    if (k.key === 'Enter' && (!multiline || !k.shiftKey)) {
      k.preventDefault();
      el.blur();
    }
    if (k.key === 'Escape') {
      el.value = value === undefined || value === null ? '' : String(value);
      el.blur();
    }
  });
  el.addEventListener('change', () => {
    const v = el.value;
    if (v === (value ?? '')) return;
    if (!v && !o.required) set(path, undefined, `Clear ${o.label}`);
    else set(path, v, `Edit ${o.label}`);
  });
  return el;
}

function numberInput(
  path: Path,
  value: unknown,
  o: {
    placeholder?: unknown;
    min?: number;
    max?: number;
    int?: boolean;
    step?: number;
    label: string;
    required?: boolean;
    onCommit?: (v: number | undefined) => void;
    disabled?: boolean;
  },
): HTMLElement {
  const input = h('input', { type: 'number', class: 'finput num', disabled: o.disabled }) as HTMLInputElement;
  input.value = typeof value === 'number' ? String(value) : '';
  if (o.placeholder !== undefined) input.placeholder = String(o.placeholder);
  if (o.min !== undefined) input.min = String(o.min);
  if (o.max !== undefined) input.max = String(o.max);
  input.step = String(o.step ?? (o.int ? 1 : 'any'));
  const commit = (v: number | undefined) => {
    if (o.onCommit) return o.onCommit(v);
    if (v === undefined) {
      if (!o.required) set(path, undefined, `Clear ${o.label}`);
      return;
    }
    if (v !== value) set(path, v, `Edit ${o.label}`);
  };
  const clamp = (v: number) => {
    if (o.int) v = Math.round(v);
    if (o.min !== undefined) v = Math.max(o.min, v);
    if (o.max !== undefined) v = Math.min(o.max, v);
    return Math.round(v * 1000) / 1000;
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') {
      input.value = typeof value === 'number' ? String(value) : '';
      input.blur();
    }
  });
  input.addEventListener('change', () => commit(input.value === '' ? undefined : clamp(Number(input.value))));
  // Figma-style scrubbing: drag the label left/right.
  const scrub = h('span', { class: 'scrub', title: 'Drag to change · Shift ×10 · Alt ×0.1' });
  scrub.innerHTML = icon('dots', 12);
  scrub.addEventListener('pointerdown', (e) => {
    if (o.disabled) return;
    e.preventDefault();
    const x0 = e.clientX;
    const v0 = Number(input.value || o.placeholder || 0);
    scrub.setPointerCapture(e.pointerId);
    document.body.classList.add('scrubbing');
    const mv = (ev: PointerEvent) => {
      const k = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
      input.value = String(clamp(v0 + Math.round((ev.clientX - x0) / 2) * (o.int ? 1 : (o.step ?? 1)) * k));
    };
    const up = () => {
      scrub.removeEventListener('pointermove', mv);
      scrub.removeEventListener('pointerup', up);
      document.body.classList.remove('scrubbing');
      if (input.value !== '' && Number(input.value) !== v0) commit(Number(input.value));
    };
    scrub.addEventListener('pointermove', mv);
    scrub.addEventListener('pointerup', up);
  });
  return h('div', { class: 'numwrap' }, scrub, input);
}

function toggle(path: Path, value: unknown, o: { def?: unknown; label: string }): HTMLElement {
  const on = typeof value === 'boolean' ? value : Boolean(o.def);
  const b = h('button', {
    class: `switch${on ? ' on' : ''}`,
    role: 'switch',
    'aria-checked': String(on),
    'aria-label': o.label,
  });
  b.append(h('i'));
  b.addEventListener('click', () => set(path, !on, `${!on ? 'Enable' : 'Disable'} ${o.label}`));
  return b;
}

function select(
  path: Path,
  value: unknown,
  options: (string | number)[],
  o: { def?: unknown; label: string; required?: boolean; labels?: Record<string, string> },
): HTMLElement {
  const s = h('select', { class: 'finput' }) as HTMLSelectElement;
  if (!o.required || value === undefined)
    s.append(h('option', { value: '' }, o.def !== undefined ? `Default (${o.def})` : '—'));
  for (const opt of options)
    s.append(h('option', { value: String(opt) }, o.labels?.[String(opt)] ?? String(opt)));
  s.value = value === undefined ? '' : String(value);
  s.addEventListener('keydown', (e) => e.stopPropagation());
  s.addEventListener('change', () => {
    if (s.value === '') return set(path, undefined, `Reset ${o.label}`);
    const raw = options.find((x) => String(x) === s.value);
    set(path, raw, `Set ${o.label}`);
  });
  return s;
}

function colorInput(
  path: Path,
  value: unknown,
  o: { def?: unknown; label: string; required?: boolean },
): HTMLElement {
  const theme = app.timeline?.theme.colors ?? {};
  const wrap = h('div', { class: 'color' });
  const cur = typeof value === 'string' ? value : undefined;
  const resolved = (v: string | undefined) => (v ? (theme[v] ?? v) : undefined);
  const swatches = h('div', { class: 'swatches' });
  for (const [name, css] of Object.entries(theme)) {
    if (['bg', 'bg2', 'panel', 'line'].includes(name)) continue;
    const b = h('button', {
      class: `sw${cur === name ? ' on' : ''}`,
      title: name,
      style: `--c:${css}`,
      'aria-label': name,
    });
    b.addEventListener('click', () => set(path, name, `${o.label} → ${name}`));
    swatches.append(b);
  }
  const txt = h('input', {
    type: 'text',
    class: 'finput mono',
    value: cur ?? '',
    placeholder: o.def !== undefined ? String(o.def) : 'theme name or #hex',
    'aria-label': o.label,
  }) as HTMLInputElement;
  txt.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') txt.blur();
  });
  txt.addEventListener('change', () => set(path, txt.value.trim() || undefined, `Set ${o.label}`));
  const pick = h('input', {
    type: 'color',
    class: 'picker',
    value: toHex(resolved(cur) ?? resolved(o.def as string) ?? '#b8ff3c'),
    title: 'Custom color',
  }) as HTMLInputElement;
  pick.addEventListener('change', () => set(path, pick.value, `Set ${o.label}`));
  wrap.append(h('div', { class: 'color-row' }, pick, txt), swatches);
  return wrap;
}

function toHex(c: string): string {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return `#${[...c.slice(1)].map((x) => x + x).join('')}`;
  const m = c.match(/rgba?\((\d+)\D+(\d+)\D+(\d+)/);
  return m
    ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`
    : '#b8ff3c';
}

/** Time expression field: text, “set to playhead”, and a description of what it means. */
function timeInput(
  path: Path,
  value: unknown,
  o: { label: string; required?: boolean; placeholder?: string; resolved?: number },
): HTMLElement {
  const input = h('input', {
    type: 'text',
    class: 'finput mono',
    value: value === undefined ? '' : String(value),
    placeholder: o.placeholder ?? "e.g. l3, l3+0.4, l3:'word'",
    spellcheck: 'false',
    'aria-label': o.label,
  }) as HTMLInputElement;
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') input.blur();
  });
  input.addEventListener('change', () => {
    const v = input.value.trim();
    if (!v) return o.required ? undefined : set(path, undefined, `Clear ${o.label}`);
    set(path, /^\d+(\.\d+)?$/.test(v) ? Number(v) : v, `${o.label} → ${v}`);
  });
  const now = h('button', {
    class: 'tbtn sm',
    title: 'Set to the playhead (snaps to the word being spoken)',
  });
  now.innerHTML = icon('target', 14);
  now.addEventListener('click', () => set(path, exprFor(ctx.time()), `${o.label} → playhead`));
  const go = h('button', {
    class: 'tbtn sm',
    title: 'Move the playhead here',
    disabled: o.resolved === undefined,
  });
  go.innerHTML = icon('play', 12);
  go.addEventListener('click', () => o.resolved !== undefined && ctx.seek(o.resolved));
  const desc = h(
    'div',
    { class: 'fhint' },
    `${describeExpr(value)}${o.resolved !== undefined ? ` · ${fmt(o.resolved)}` : ''}`,
  );
  return h(
    'div',
    { class: 'timef' },
    h('div', { class: 'timerow' }, input, now, go),
    value !== undefined ? desc : '',
  );
}

function yamlInput(
  path: Path,
  value: unknown,
  label: string,
  rows = 6,
  validate?: (v: unknown) => string | null,
): HTMLElement {
  const ta = h('textarea', {
    class: 'finput mono yaml',
    rows,
    spellcheck: 'false',
    dir: 'auto',
    'aria-label': label,
  }) as HTMLTextAreaElement;
  const text = value === undefined ? '' : toYaml(value, { lineWidth: 0 }).trimEnd();
  ta.value = text;
  const err = h('div', { class: 'ferr', hidden: true });
  ta.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ta.blur();
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart;
      ta.setRangeText('  ', s, ta.selectionEnd, 'end');
    }
  });
  ta.addEventListener('change', () => {
    if (ta.value.trim() === text.trim()) return;
    try {
      const v = ta.value.trim() ? parseYaml(ta.value) : undefined;
      const problem = validate?.(v);
      if (problem) throw new Error(problem);
      err.hidden = true;
      set(path, v, `Edit ${label}`);
    } catch (e) {
      err.hidden = false;
      err.textContent = (e as Error).message.split('\n')[0];
    }
  });
  return h('div', {}, ta, err);
}

// ------------------------------------------------------------------ schema-driven fields
const isTime = (s: JsonSchema | undefined) =>
  Boolean(
    s?.anyOf?.length === 2 &&
      s.anyOf.some((x) => x.type === 'string') &&
      s.anyOf.some((x) => x.type === 'number'),
  );

function schemaField(
  path: Path,
  key: string,
  s: JsonSchema,
  value: unknown,
  required: boolean,
  depth: number,
): HTMLElement {
  const label = human(key);
  const def = s.default;
  // unions: time expressions, boolean|time (strike/highlight), endpoint id|point
  if (TIME_KEYS.has(key) || isTime(s)) return row(label, timeInput(path, value, { label, required }));
  if (s.anyOf) {
    const types = s.anyOf.map((x) => x.type);
    if (types.includes('boolean') && s.anyOf.some(isTime)) {
      return row(
        label,
        timeInput(path, value === true ? undefined : value, {
          label,
          placeholder: "true, or a time like l3:'word'",
        }),
      );
    }
    if (typeof value === 'string' || (value === undefined && types.includes('string'))) {
      const str = s.anyOf.find((x) => x.type === 'string')!;
      return row(
        label,
        textInput(path, value, {
          label,
          placeholder: str.pattern ? 'element id, e.g. db.left' : undefined,
          required,
        }),
        s.anyOf.some((x) => x.type === 'object')
          ? 'Element id (optionally .left/.right/.top/.bottom) or a point {x, y} in YAML below'
          : undefined,
      );
    }
    const obj = s.anyOf.find((x) => x.type === 'object');
    if (obj && value && typeof value === 'object' && !Array.isArray(value) && depth < 3)
      return objectFields(path, obj, value as Record<string, unknown>, depth + 1, label);
    return row(label, yamlInput(path, value, label, 3));
  }
  const type = Array.isArray(s.type) ? s.type[0] : s.type;
  if (s.enum) return row(label, select(path, value, s.enum, { def, label, required }));
  if (type === 'boolean') return row(label, toggle(path, value, { def, label }), undefined, 'inline');
  if (type === 'number' || type === 'integer')
    return row(
      label,
      numberInput(path, value, {
        placeholder: def,
        min: s.minimum,
        max: s.maximum,
        int: type === 'integer',
        label,
        required,
      }),
    );
  if (type === 'string') {
    if (COLOR_KEYS.has(key)) return row(label, colorInput(path, value, { def, label, required }));
    if (key === 'name' && path.includes('props') && app.meta)
      return row(label, select(path, value, app.meta.icons, { label, def }));
    return row(
      label,
      textInput(path, value, {
        label,
        multiline: LONG_TEXT.has(key),
        placeholder: def !== undefined ? String(def) : undefined,
        required,
      }),
    );
  }
  if (type === 'array') {
    const it = s.items ?? {};
    const itType = Array.isArray(it.type) ? it.type[0] : it.type;
    if ((itType === 'string' || itType === 'number') && !it.anyOf) {
      if (key === 'colors' || key === 'hashtags' || key === 'columns')
        return row(label, listInput(path, value, label, itType === 'number'));
      return row(label, linesInput(path, value, label));
    }
    if (it.anyOf && Array.isArray(value) && value.every((v) => typeof v === 'string'))
      return row(
        label,
        linesInput(path, value, label),
        'One item per line (switch to YAML for colors/timing per item)',
      );
    if (depth < 3) return arrayField(path, key, it, value, depth);
    return row(label, yamlInput(path, value, label));
  }
  if (type === 'object' && s.properties && depth < 3)
    return objectFields(path, s, (value ?? {}) as Record<string, unknown>, depth + 1, label);
  return row(label, yamlInput(path, value, label, 3));
}

function objectFields(
  path: Path,
  s: JsonSchema,
  value: Record<string, unknown>,
  depth: number,
  title?: string,
): HTMLElement {
  const box = h('div', { class: 'obj' });
  if (title) box.append(h('div', { class: 'obj-title', text: title }));
  for (const [k, sub] of Object.entries(s.properties ?? {}))
    box.append(schemaField([...path, k], k, sub, value?.[k], s.required?.includes(k) ?? false, depth));
  return box;
}

function linesInput(path: Path, value: unknown, label: string): HTMLElement {
  const lines = Array.isArray(value) ? value.map(String) : [];
  const ta = h('textarea', {
    class: 'finput mono',
    rows: Math.min(10, Math.max(2, lines.length)),
    dir: 'auto',
    spellcheck: 'false',
    'aria-label': label,
  }) as HTMLTextAreaElement;
  ta.value = lines.join('\n');
  ta.addEventListener('keydown', (e) => e.stopPropagation());
  ta.addEventListener('change', () => {
    const next = ta.value.split('\n');
    while (next.length && next[next.length - 1] === '') next.pop();
    set(path, next.length ? next : undefined, `Edit ${label}`);
  });
  return ta;
}

function listInput(path: Path, value: unknown, label: string, numeric: boolean): HTMLElement {
  const items = Array.isArray(value) ? value.map(String) : [];
  const input = h('input', {
    type: 'text',
    class: 'finput',
    value: items.join(', '),
    dir: 'auto',
    'aria-label': label,
    placeholder: 'comma-separated',
  }) as HTMLInputElement;
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') input.blur();
  });
  input.addEventListener('change', () => {
    const next = input.value
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    set(path, next.length ? (numeric ? next.map(Number) : next) : undefined, `Edit ${label}`);
  });
  return input;
}

/** Default value for a new list item, built from the item schema's required fields. */
function newItem(s: JsonSchema): unknown {
  if (s.anyOf) return newItem(s.anyOf.find((x) => x.type === 'object') ?? s.anyOf[0]);
  const type = Array.isArray(s.type) ? s.type[0] : s.type;
  if (type === 'string') return 'New item';
  if (type === 'number' || type === 'integer') return 0;
  if (type === 'boolean') return true;
  if (type === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of s.required ?? []) {
      const sub = s.properties?.[k] ?? {};
      if (TIME_KEYS.has(k) || isTime(sub)) o[k] = exprFor(ctx.time());
      else if (k === 'text' || k === 'title' || k === 'label') o[k] = 'New item';
      else o[k] = newItem(sub);
    }
    if (!Object.keys(o).length && s.properties?.text) o.text = 'New item';
    return o;
  }
  if (type === 'array') return [];
  return null;
}

function arrayField(path: Path, key: string, it: JsonSchema, value: unknown, depth: number): HTMLElement {
  const label = human(key);
  const items = Array.isArray(value) ? value : [];
  const box = h('div', { class: 'arr' });
  const head = h('div', { class: 'arr-head' }, h('span', { text: `${label} · ${items.length}` }));
  const add = h('button', { class: 'tbtn sm', title: `Add ${label.toLowerCase()} item` });
  add.innerHTML = icon('plus', 13);
  add.addEventListener(
    'click',
    () => void app.edit([{ op: 'insert', path, value: newItem(it) }], `Add ${label} item`),
  );
  head.append(add);
  box.append(head);
  items.forEach((v, i) => {
    const card = h('div', { class: 'arr-item' });
    const bar = h('div', { class: 'arr-bar' }, h('span', { class: 'mono dim', text: `#${i + 1}` }));
    const mk = (ic: string, title: string, op: EditOp, dis = false) => {
      const b = h('button', { class: 'tbtn sm', title, disabled: dis });
      b.innerHTML = icon(ic, 12);
      b.addEventListener('click', () => void app.edit([op], `${title} (${label})`));
      bar.append(b);
    };
    mk('up', 'Move up', { op: 'move', path, from: i, to: i - 1 }, i === 0);
    mk('down', 'Move down', { op: 'move', path, from: i, to: i + 1 }, i === items.length - 1);
    mk('trash', 'Remove', { op: 'delete', path: [...path, i] });
    card.append(bar);
    const p = [...path, i];
    if (it.anyOf && typeof v === 'string')
      card.append(textInput(p, v, { label: `${label} ${i + 1}`, required: true }));
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const obj = it.anyOf?.find((x) => x.type === 'object') ?? it;
      if (obj.properties) card.append(objectFields(p, obj, v as Record<string, unknown>, depth + 1));
      else card.append(yamlInput(p, v, `${label} ${i + 1}`, 3));
    } else card.append(schemaField(p, `${key} ${i + 1}`, it, v, true, depth + 1));
    box.append(card);
  });
  return box;
}

// ------------------------------------------------------------------ views
export function renderInspector(): void {
  const root = document.querySelector<HTMLElement>('#inspector');
  if (!root || app.mode !== 'edit') return;
  const active = document.activeElement;
  if (active && root.contains(active) && (active as HTMLElement).matches('input, textarea, select')) {
    // Don't rebuild under the user's cursor; refresh once they leave the field.
    active.addEventListener('blur', () => setTimeout(renderInspector), { once: true });
    return;
  }
  const scroll = root.scrollTop;
  const s = app.selection;
  if (s?.kind === 'element' && app.scenes[s.scene]?.elements?.[s.index])
    root.replaceChildren(...elementView(s.scene, s.index));
  else if (s?.kind === 'scene' && app.scenes[s.scene]) root.replaceChildren(...sceneView(s.scene));
  else if (s?.kind === 'line' && app.spec.script?.[s.index]) root.replaceChildren(...lineView(s.index));
  else root.replaceChildren(...episodeView());
  root.scrollTop = scroll;
}

function header(ic: string, title: string, sub: string, control?: Node): HTMLElement {
  const hd = h('div', { class: 'ihead' });
  hd.innerHTML = `<span class="ico">${icon(ic, 18)}</span><div class="t"><b>${esc(title)}</b><small>${esc(sub)}</small></div>`;
  if (control) hd.append(control);
  return hd;
}

function elementView(si: number, ej: number): Node[] {
  const e = app.scenes[si].elements![ej];
  const base: Path = ['scenes', si, 'elements', ej];
  const meta = app.meta?.components.find((c) => c.name === e.use);
  const schema = app.meta?.schemas[e.use];
  const ce = app.compiledElement(si, ej);
  const sc = app.compiledScene(si);
  const id = app.elementId(si, ej);
  const out: Node[] = [];

  const idInput = h('input', {
    class: 'finput mono',
    value: id,
    'aria-label': 'Element id',
    spellcheck: 'false',
  }) as HTMLInputElement;
  idInput.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') idInput.blur();
  });
  idInput.addEventListener('change', () => void renameElement(si, ej, idInput.value.trim()));
  out.push(
    header(COMPONENT_ICON[e.use] ?? 'box', e.use, (meta?.description ?? '').replace(/\*\*/g, '')),
    row('Id', idInput),
  );

  // layout
  const locked = Boolean(meta?.endpoints.length && !meta.fill);
  const box = ce?.box;
  const layout: Node[] = [];
  if (locked)
    layout.push(
      h(
        'p',
        { class: 'note' },
        'Positioned by its “from” and “to” endpoints (element ids or points). Drag it on the canvas when both are points.',
      ),
    );
  else if (box) {
    const commit = (k: 'x' | 'y' | 'w' | 'h') => (v: number | undefined) => {
      if (v === undefined) return;
      void app.edit(placeOps(si, ej, { ...box, [k]: v }), `Set ${k.toUpperCase()}`);
    };
    const grid = h('div', { class: 'grid4' });
    for (const k of ['x', 'y', 'w', 'h'] as const)
      grid.append(
        h(
          'label',
          { class: 'mini' },
          h('span', { text: k.toUpperCase() }),
          numberInput([...base, 'place', k], box[k], { int: true, label: k, onCommit: commit(k) }),
        ),
      );
    layout.push(grid);
    const align = h('div', { class: 'align' });
    const area = sc?.origin ?? { x: 0, y: 0, w: 1080, h: 1920 };
    const btn = (ic: string, title: string, nb: Partial<typeof box>) => {
      const b = h('button', { class: 'tbtn sm', title });
      b.innerHTML = icon(ic, 14);
      b.addEventListener('click', () => void app.edit(placeOps(si, ej, { ...box, ...nb }), title));
      align.append(b);
    };
    btn('back', 'Align left', { x: 0 });
    btn('frame', 'Center horizontally', { x: Math.round((area.w - box.w) / 2) });
    btn('fwd', 'Align right', { x: area.w - box.w });
    btn('up', 'Align top', { y: 0 });
    btn('grid', 'Center vertically', { y: Math.round((area.h - box.h) / 2) });
    btn('down', 'Align bottom', { y: area.h - box.h });
    const reset = h(
      'button',
      { class: 'btn ghost sm', title: 'Remove the custom position (use the scene layout)' },
      'Auto',
    );
    reset.addEventListener(
      'click',
      () =>
        void app.edit(
          [
            { op: 'delete', path: [...base, 'place'] },
            { op: 'delete', path: [...base, 'size'] },
          ],
          'Reset position',
        ),
    );
    align.append(reset);
    layout.push(align);
  }
  layout.push(
    row(
      'Layer',
      select([...base, 'layer'], e.layer, ['base', 'overlay'], {
        def: meta?.layer ?? 'base',
        label: 'layer',
      }),
    ),
  );
  layout.push(row('Order (z)', numberInput([...base, 'z'], e.z, { int: true, placeholder: ej, label: 'z' })));
  out.push(section('layout', 'Position & size', layout));

  // timing
  const timing: Node[] = [
    row(
      'Enter at',
      timeInput([...base, 'enter', 'at'], e.enter?.at, {
        label: 'enter time',
        placeholder: 'scene start',
        resolved: ce?.enter.t,
      }),
    ),
    row(
      'Animation',
      select([...base, 'enter', 'anim'], e.enter?.anim, app.meta?.enterAnims ?? [], {
        def: meta?.enter,
        label: 'enter animation',
      }),
    ),
    row(
      'Duration',
      numberInput([...base, 'enter', 'dur'], e.enter?.dur, {
        placeholder: ce?.enter.dur,
        min: 0.01,
        step: 0.05,
        label: 'enter duration',
      }),
    ),
  ];
  if (e.exit) {
    const rm = h(
      'button',
      { class: 'btn ghost sm', title: 'Stay until the end of the scene' },
      'Remove exit',
    );
    rm.addEventListener(
      'click',
      () => void app.edit([{ op: 'delete', path: [...base, 'exit'] }], 'Remove exit'),
    );
    timing.push(
      h('div', { class: 'subhead' }, h('span', { text: 'Exit' }), rm),
      row(
        'Exit at',
        timeInput([...base, 'exit', 'at'], e.exit.at, {
          label: 'exit time',
          required: true,
          resolved: ce?.exit?.t,
        }),
      ),
      row(
        'Animation',
        select([...base, 'exit', 'anim'], e.exit.anim, app.meta?.exitAnims ?? [], {
          def: 'fade',
          label: 'exit animation',
        }),
      ),
      row(
        'Duration',
        numberInput([...base, 'exit', 'dur'], e.exit.dur, {
          placeholder: 0.3,
          min: 0.01,
          step: 0.05,
          label: 'exit duration',
        }),
      ),
    );
  } else {
    const add = h('button', { class: 'btn ghost sm block' }, 'Add an exit at the playhead (O)');
    add.addEventListener(
      'click',
      () =>
        void app.edit(
          [{ op: 'set', path: [...base, 'exit'], value: { at: exprFor(ctx.time()) } }],
          'Add exit',
        ),
    );
    timing.push(add);
  }
  out.push(section('timing', 'Animation & timing', timing));

  // props
  if (schema?.properties) {
    const props = e.props ?? {};
    const fields = Object.entries(schema.properties).map(([k, sub]) =>
      schemaField([...base, 'props', k], k, sub, props[k], schema.required?.includes(k) ?? false, 0),
    );
    out.push(section(`props-${e.use}`, 'Properties', fields));
  }

  // effects
  const fx = e.fx ?? [];
  const fxBody: Node[] = [];
  fx.forEach((f, i) => {
    const p: Path = [...base, 'fx', i];
    const rm = h('button', { class: 'tbtn sm', title: 'Remove effect' });
    rm.innerHTML = icon('trash', 13);
    rm.addEventListener('click', () => void app.edit([{ op: 'delete', path: p }], 'Remove effect'));
    fxBody.push(
      h(
        'div',
        { class: 'arr-item' },
        h('div', { class: 'arr-bar' }, h('span', { class: 'mono dim', text: String(f.do) }), rm),
        row('At', timeInput([...p, 'at'], f.at, { label: 'effect time', required: true })),
        row(
          'Effect',
          select([...p, 'do'], f.do, app.meta?.fxKinds ?? [], { label: 'effect', required: true }),
        ),
        row('Amount', numberInput([...p, 'amp'], f.amp, { step: 0.1, label: 'amount' })),
        row('Duration', numberInput([...p, 'dur'], f.dur, { min: 0.01, step: 0.05, label: 'duration' })),
        row('Color', colorInput([...p, 'color'], f.color, { label: 'effect color' })),
        row(
          'Target',
          select([...p, 'target'], f.target, ['self', 'camera'], { def: 'self', label: 'target' }),
        ),
        row(
          'Sound',
          select([...p, 'sound'], f.sound, ['none', ...(app.meta?.sounds ?? [])], {
            def: 'auto',
            label: 'sound',
          }),
        ),
      ),
    );
  });
  const addFx = h('button', { class: 'btn ghost sm block' }, '+ Add effect at the playhead');
  addFx.addEventListener(
    'click',
    () =>
      void app.edit(
        [{ op: 'insert', path: [...base, 'fx'], value: { at: exprFor(ctx.time()), do: 'pulse' } }],
        'Add effect',
      ),
  );
  fxBody.push(addFx);
  out.push(section('fx', `Effects${fx.length ? ` · ${fx.length}` : ''}`, fxBody));

  // states
  const states = (e.states ?? []) as { at: unknown; set: unknown }[];
  const stBody: Node[] = [
    h(
      'p',
      { class: 'note' },
      'States change props over time, e.g. a node turning red at a word: set: { status: err }.',
    ),
  ];
  states.forEach((st, i) => {
    const p: Path = [...base, 'states', i];
    const rm = h('button', { class: 'tbtn sm', title: 'Remove state' });
    rm.innerHTML = icon('trash', 13);
    rm.addEventListener('click', () => void app.edit([{ op: 'delete', path: p }], 'Remove state'));
    stBody.push(
      h(
        'div',
        { class: 'arr-item' },
        h('div', { class: 'arr-bar' }, h('span', { class: 'mono dim', text: `#${i + 1}` }), rm),
        row('At', timeInput([...p, 'at'], st.at, { label: 'state time', required: true })),
        row('Set', yamlInput([...p, 'set'], st.set, 'state', 3)),
      ),
    );
  });
  const addSt = h('button', { class: 'btn ghost sm block' }, '+ Add state at the playhead');
  addSt.addEventListener(
    'click',
    () =>
      void app.edit(
        [{ op: 'insert', path: [...base, 'states'], value: { at: exprFor(ctx.time()), set: {} } }],
        'Add state',
      ),
  );
  stBody.push(addSt);
  out.push(section('states', `States${states.length ? ` · ${states.length}` : ''}`, stBody));

  // sound
  const sfxMode = Array.isArray(e.sfx) ? 'custom' : ((e.sfx as string | undefined) ?? 'auto');
  const sfxBody: Node[] = [
    row(
      'Sound effects',
      select([...base, 'sfx'], Array.isArray(e.sfx) ? undefined : e.sfx, ['auto', 'none'], {
        def: 'auto',
        label: 'sound effects',
      }),
    ),
  ];
  if (sfxMode === 'custom')
    sfxBody.push(row('Custom', yamlInput([...base, 'sfx'], e.sfx, 'custom sounds', 4)));
  out.push(section('sound', 'Sound', sfxBody));

  out.push(
    section('yaml', 'YAML (advanced)', [
      h(
        'p',
        { class: 'note' },
        'The exact YAML of this element. Edit anything here; ⌘/Ctrl+Enter or click outside to apply.',
      ),
      yamlInput(base, e, `${id} YAML`, 12, (v) =>
        v && typeof v === 'object' && !Array.isArray(v) && typeof (v as { use?: unknown }).use === 'string'
          ? null
          : 'An element must be a mapping with “use: <component>” (use Delete to remove it)',
      ),
    ]),
  );
  return out;
}

function sceneView(si: number): Node[] {
  const s = app.scenes[si];
  const base: Path = ['scenes', si];
  const c = app.compiledScene(si);
  const out: Node[] = [
    header(
      'scene',
      `Scene ${s.id}`,
      c ? `${fmt(c.start)} – ${fmt(c.end)} · ${s.elements?.length ?? 0} elements` : '',
    ),
  ];
  out.push(
    section('scene', 'Scene', [
      row('Id', textInput([...base, 'id'], s.id, { label: 'scene id', required: true })),
      row(
        'Starts at',
        timeInput([...base, 'at'], s.at, { label: 'scene start', required: true, resolved: c?.start }),
      ),
      row(
        'Ends at',
        timeInput([...base, 'end'], s.end, {
          label: 'scene end',
          placeholder: 'next scene',
          resolved: s.end !== undefined ? c?.end : undefined,
        }),
      ),
      row(
        'Transition',
        select([...base, 'transition'], s.transition, ['crossfade', 'cut', 'slide-up'], {
          def: 'crossfade',
          label: 'transition',
        }),
      ),
      row(
        'Area',
        select([...base, 'layout'], s.layout, ['stage', 'full'], {
          def: 'stage',
          label: 'area',
          labels: { stage: 'Stage (between header and captions)', full: 'Full frame' },
        }),
      ),
      row(
        'Glow',
        typeof s.glow === 'string' || s.glow === undefined
          ? colorInput([...base, 'glow'], s.glow, { label: 'glow' })
          : yamlInput([...base, 'glow'], s.glow, 'glow', 3),
        'Background glow color (or a list of { at, color } in YAML)',
      ),
    ]),
    section('flow', 'Auto layout', [
      h(
        'p',
        { class: 'note' },
        'Elements without a position are laid out automatically: in a row, a column or a grid.',
      ),
      row(
        'Columns',
        numberInput([...base, 'columns'], s.columns, { int: true, min: 1, max: 6, label: 'columns' }),
      ),
      row('Gutter', numberInput([...base, 'gutter'], s.gutter, { int: true, min: 0, label: 'gutter' })),
      row('Row', yamlInput([...base, 'row'], s.row, 'row layout', 2)),
      row('Column', yamlInput([...base, 'column'], s.column, 'column layout', 2)),
    ]),
    section('scene-yaml', 'YAML (advanced)', [
      yamlInput(base, s, `scene ${s.id}`, 14, (v) =>
        v && typeof v === 'object' && !Array.isArray(v) && (v as { id?: unknown }).id
          ? null
          : 'A scene must be a mapping with an id and at',
      ),
    ]),
  );
  return out;
}

function lineView(i: number): Node[] {
  const l = app.spec.script![i];
  const id = app.state?.script[i]?.id ?? `l${i + 1}`;
  const info = app.timeline?.script.find((x) => x.id === id);
  const cue = app.state?.cues?.cues[id];
  const out: Node[] = [
    header(
      'script',
      `Line ${id}`,
      info ? `${fmt(info.start)} · ${info.words.length} words` : 'not timed yet',
    ),
  ];
  const cueInput = numberInput(['cue'], cue, {
    min: 0,
    step: 0.01,
    label: 'cue',
    onCommit: (v) => {
      if (v === undefined || !app.state) return;
      void putCues({ ...(app.state.cues?.cues ?? {}), [id]: v });
    },
  });
  const mark = h('button', { class: 'btn sm' }, 'Mark in Cues mode');
  mark.addEventListener('click', () => {
    ctx.setMode('cue');
    document.dispatchEvent(new CustomEvent('rf:select-line', { detail: id }));
  });
  out.push(
    section('line', 'Line', [
      row(
        'Text',
        textInput(['script', i, 'text'], l.text, { label: 'line text', multiline: true, required: true }),
        'What you say. Arabic, English or both.',
      ),
      row(
        'Caption',
        textInput(['script', i, 'caption'], l.caption, {
          label: 'caption',
          multiline: true,
          placeholder: 'auto (same as the text)',
        }),
        'Optional different on-screen caption',
      ),
      row(
        'Line breaks',
        listInput(['script', i, 'break'], l.break, 'caption breaks', false),
        'Words after which the caption breaks',
      ),
      row('Starts at (s)', cueInput, 'The cue: when you start saying this line'),
      mark,
    ]),
  );
  if (info?.words.length) {
    const words = h('div', { class: 'words' });
    info.words.forEach((w, k) => {
      const b = h(
        'button',
        { class: 'word', dir: 'auto', title: `${fmt(w.start)} · ${id}${k ? `.${k}` : ''}` },
        w.text,
      );
      b.addEventListener('click', () => ctx.seek(w.start));
      words.append(b);
    });
    out.push(section('words', 'Words (click to jump)', [words]));
  }
  return out;
}

function episodeView(): Node[] {
  const m = (app.spec.meta ?? {}) as Record<string, unknown>;
  const a = (app.spec.audio ?? {}) as Record<string, unknown>;
  const pub = (m.publish ?? {}) as Record<string, unknown>;
  const tl = app.timeline;
  const out: Node[] = [
    header(
      'film',
      String(m.title || app.state?.id || 'Episode'),
      `${tl ? `${fmt(tl.duration)} · ${tl.preset.label} · ${tl.width}×${tl.height}` : ''}`,
    ),
  ];
  out.push(
    h(
      'p',
      { class: 'note' },
      'Nothing selected: these are the episode settings. Click an element on the canvas, a layer or a clip to edit it.',
    ),
  );
  out.push(
    section('meta', 'Episode', [
      row('Title', textInput(['meta', 'title'], m.title, { label: 'title' })),
      row('Series', textInput(['meta', 'series'], m.series, { label: 'series' }), 'Shown in the header'),
      row(
        'Episode #',
        numberInput(['meta', 'episode'], m.episode, { int: true, min: 1, label: 'episode number' }),
      ),
      row(
        'Platform',
        select(['meta', 'preset'], m.preset, app.meta?.presets ?? [], {
          def: 'tiktok',
          label: 'platform preset',
        }),
      ),
      row(
        'Theme',
        select(['meta', 'theme'], m.theme, app.meta?.themes ?? [], { def: 'default', label: 'theme' }),
      ),
      row(
        'Language',
        textInput(['meta', 'lang'], m.lang, { label: 'language', placeholder: 'ar-EG' }),
        'e.g. en-US, ar-EG: sets the caption direction',
      ),
    ]),
    section('publish', 'Publishing (publish.md)', [
      row('Cover text', textInput(['meta', 'publish', 'cover'], pub.cover, { label: 'cover text' })),
      row(
        'Caption',
        textInput(['meta', 'publish', 'caption'], pub.caption, { label: 'caption', multiline: true }),
      ),
      row('Hashtags', listInput(['meta', 'publish', 'hashtags'], pub.hashtags, 'hashtags', false)),
      row(
        'Pinned comment',
        textInput(['meta', 'publish', 'pinned'], pub.pinned, { label: 'pinned comment', multiline: true }),
      ),
    ]),
    section('audio', 'Audio', [
      row(
        'Voice file',
        textInput(['audio', 'voice'], a.voice, { label: 'voice file', placeholder: 'voice.wav' }),
      ),
      row(
        'Sound effects',
        select(['audio', 'sfx'], a.sfx, ['auto', 'manual', 'none'], { def: 'auto', label: 'sound effects' }),
      ),
      row(
        'SFX volume (dB)',
        numberInput(['audio', 'sfx_gain_db'], a.sfx_gain_db, {
          min: -60,
          max: 12,
          step: 1,
          placeholder: -16,
          label: 'SFX volume',
        }),
      ),
      row(
        'Duck under voice',
        toggle(['audio', 'duck'], a.duck, { def: true, label: 'ducking' }),
        undefined,
        'inline',
      ),
    ]),
    section('chapters', `Chapters · ${(app.spec.chapters ?? []).length}`, [chaptersEditor()]),
  );
  return out;
}

function chaptersEditor(): HTMLElement {
  const list = app.spec.chapters ?? [];
  const box = h('div', {});
  list.forEach((c, i) => {
    const rm = h('button', { class: 'tbtn sm', title: 'Remove chapter' });
    rm.innerHTML = icon('trash', 13);
    rm.addEventListener(
      'click',
      () => void app.edit([{ op: 'delete', path: ['chapters', i] }], 'Remove chapter'),
    );
    box.append(
      h(
        'div',
        { class: 'arr-item' },
        h('div', { class: 'arr-bar' }, h('span', { class: 'mono dim', text: `#${i + 1}` }), rm),
        row(
          'Label',
          textInput(['chapters', i, 'label'], c.label, { label: 'chapter label', required: true }),
        ),
        row('At', timeInput(['chapters', i, 'at'], c.at, { label: 'chapter time', required: true })),
      ),
    );
  });
  const add = h('button', { class: 'btn ghost sm block' }, '+ Add chapter at the playhead');
  add.addEventListener(
    'click',
    () =>
      void app.edit(
        [
          {
            op: 'insert',
            path: ['chapters'],
            value: {
              at: exprFor(ctx.time()),
              label: `${String(list.length + 1).padStart(2, '0')} · CHAPTER`,
            },
          },
        ],
        'Add chapter',
      ),
  );
  box.append(add);
  return box;
}

export { toast };
