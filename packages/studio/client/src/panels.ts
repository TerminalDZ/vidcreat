/** Left panel: Layers (scenes → elements), Insert (component library) and Script (lines). */
import {
  addScene,
  deleteLine,
  insertElement,
  insertLine,
  moveElementTo,
  moveLine,
  renameElement,
} from './actions.js';
import { app, esc, fmt, h } from './app.js';
import { COMPONENT_ICON, icon } from './icons.js';

interface Ctx {
  time: () => number;
  seek: (t: number) => void;
}
let ctx!: Ctx;
let tab: 'layers' | 'insert' | 'script' = 'layers';
const collapsed = new Set<string>();
let query = '';

export function initPanels(c: Ctx): void {
  ctx = c;
  const root = document.querySelector<HTMLElement>('#left')!;
  root.innerHTML = `
    <div class="ptabs" role="tablist">
      <button role="tab" data-tab="layers" title="Layers (Alt+L)">${icon('layers', 15)}Layers</button>
      <button role="tab" data-tab="insert" title="Insert a component (Alt+I)">${icon('shapes', 15)}Insert</button>
      <button role="tab" data-tab="script" title="Script lines (Alt+S)">${icon('script', 15)}Script</button>
    </div>
    <div class="pbody" id="leftBody"></div>`;
  root
    .querySelectorAll<HTMLButtonElement>('.ptabs button')
    .forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab as typeof tab)));
  try {
    tab = (localStorage.getItem('rf-left-tab') as typeof tab) || 'layers';
  } catch {
    /* storage unavailable */
  }
  setTab(tab);
}

export function setTab(t: typeof tab): void {
  tab = t;
  try {
    localStorage.setItem('rf-left-tab', t);
  } catch {
    /* storage unavailable */
  }
  document.querySelectorAll<HTMLButtonElement>('#left .ptabs button').forEach((b) => {
    b.classList.toggle('on', b.dataset.tab === t);
    b.setAttribute('aria-selected', String(b.dataset.tab === t));
  });
  renderPanels();
  if (t === 'insert') (document.querySelector('#insertSearch') as HTMLInputElement | null)?.focus();
}

export function renderPanels(): void {
  const body = document.querySelector<HTMLElement>('#leftBody');
  if (!body) return;
  if (tab === 'layers') renderLayers(body);
  else if (tab === 'insert') renderInsert(body);
  else renderScript(body);
}

// ------------------------------------------------------------------ layers
function renderLayers(body: HTMLElement): void {
  const tl = app.timeline;
  const sel = app.selection;
  const list = h('div', { class: 'tree', role: 'tree' });
  const t = ctx.time();
  app.scenes.forEach((s, si) => {
    const c = tl?.scenes.find((x) => x.id === s.id);
    const active = c ? t >= c.start && t < c.end : false;
    const open = !collapsed.has(s.id);
    const row = h('div', {
      class: `trow scene${sel?.kind === 'scene' && sel.scene === si ? ' sel' : ''}${active ? ' live' : ''}`,
      role: 'treeitem',
      'aria-expanded': String(open),
    });
    row.innerHTML = `<button class="twist${open ? ' open' : ''}" aria-label="Expand">${icon('chevron', 12)}</button>${icon('scene', 14)}<b>${esc(s.id)}</b><span class="tm mono">${c ? fmt(c.start) : ''}</span>`;
    row.querySelector('.twist')!.addEventListener('click', (e) => {
      e.stopPropagation();
      if (open) collapsed.add(s.id);
      else collapsed.delete(s.id);
      renderPanels();
    });
    row.addEventListener('click', () => {
      app.select({ kind: 'scene', scene: si });
      if (c && !(t >= c.start && t < c.end)) ctx.seek(c.start + 0.01);
    });
    list.append(row);
    if (!open) return;
    const els = s.elements ?? [];
    // Top of the list = drawn last (on top), like Figma.
    for (let ej = els.length - 1; ej >= 0; ej--) {
      const e = els[ej];
      const id = app.elementId(si, ej);
      const ce = c?.elements.find((x) => x.id === id);
      const visible = ce ? t >= ce.enter.t && (!ce.exit || t < ce.exit.t + ce.exit.dur) && active : false;
      const isSel = sel?.kind === 'element' && sel.scene === si && sel.index === ej;
      const item = h('div', {
        class: `trow el${isSel ? ' sel' : ''}${visible ? ' live' : ''}`,
        role: 'treeitem',
        draggable: 'true',
        title: `${id} · ${e.use}${ce ? ` · enters ${fmt(ce.enter.t)}` : ''}`,
      });
      item.innerHTML = `${icon(COMPONENT_ICON[e.use] ?? 'box', 14)}<span class="nm">${esc(id)}</span><span class="kind">${esc(e.use)}</span>${visible ? '<i class="dot" title="On screen now"></i>' : ''}`;
      item.addEventListener('click', () => {
        app.select({ kind: 'element', scene: si, index: ej });
        // jump to a time where the element is on screen
        if (ce && !visible) ctx.seek(Math.min((c?.end ?? ce.enter.t) - 0.01, ce.enter.t + ce.enter.dur));
      });
      item.addEventListener('dblclick', () => startRename(item, si, ej));
      item.addEventListener('dragstart', (ev) => {
        ev.dataTransfer!.setData('application/x-reelforge-layer', `${si}:${ej}`);
        ev.dataTransfer!.effectAllowed = 'move';
      });
      item.addEventListener('dragover', (ev) => {
        if (!ev.dataTransfer?.types.includes('application/x-reelforge-layer')) return;
        ev.preventDefault();
        item.classList.add('drop');
      });
      item.addEventListener('dragleave', () => item.classList.remove('drop'));
      item.addEventListener('drop', (ev) => {
        item.classList.remove('drop');
        const [fs, fe] = (ev.dataTransfer?.getData('application/x-reelforge-layer') ?? '')
          .split(':')
          .map(Number);
        if (fs === si && Number.isFinite(fe)) void moveElementTo(si, fe, ej);
      });
      list.append(item);
    }
    if (!els.length)
      list.append(h('div', { class: 'trow hint' }, 'Empty scene · drag a component here from Insert'));
  });
  const add = h('button', { class: 'btn ghost block', title: 'Add a scene at the playhead' });
  add.innerHTML = `${icon('plus', 14)} Add scene at playhead`;
  add.addEventListener('click', () => void addScene(ctx.time()));
  body.replaceChildren(list, add);
  body.querySelector('.trow.sel')?.scrollIntoView({ block: 'nearest' });
}

function startRename(item: HTMLElement, si: number, ej: number): void {
  const nm = item.querySelector('.nm') as HTMLElement;
  const input = h('input', {
    class: 'rename',
    value: app.elementId(si, ej),
    'aria-label': 'Element id',
  }) as HTMLInputElement;
  nm.replaceWith(input);
  input.focus();
  input.select();
  const done = (save: boolean) => {
    if (save) void renameElement(si, ej, input.value.trim());
    else renderPanels();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') done(true);
    if (e.key === 'Escape') done(false);
  });
  input.addEventListener('blur', () => done(true), { once: true });
}

// ------------------------------------------------------------------ insert
const GROUPS: [string, string[]][] = [
  ['Text', ['title', 'label', 'chip', 'stamp', 'quote']],
  ['Diagrams', ['node', 'arrow', 'lanes', 'grid', 'timeline', 'bucket']],
  ['Data', ['counter', 'meter', 'table', 'checklist']],
  ['Code & devices', ['code', 'phone', 'icon']],
  ['Effects & endings', ['particles', 'trap', 'cta']],
];

function renderInsert(body: HTMLElement): void {
  const comps = app.meta?.components ?? [];
  const search = h('input', {
    id: 'insertSearch',
    class: 'search',
    type: 'search',
    placeholder: 'Search components…',
    value: query,
    'aria-label': 'Search components',
  }) as HTMLInputElement;
  search.addEventListener('input', () => {
    query = search.value;
    const pos = search.selectionStart;
    renderPanels();
    const s = document.querySelector<HTMLInputElement>('#insertSearch');
    s?.focus();
    s?.setSelectionRange(pos, pos);
  });
  search.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') body.querySelector<HTMLElement>('.comp')?.click();
    if (e.key === 'Escape') (e.target as HTMLElement).blur();
  });
  const q = query.trim().toLowerCase();
  const wrap = h('div', { class: 'lib' });
  for (const [group, names] of GROUPS) {
    const items = names
      .map((n) => comps.find((c) => c.name === n))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .filter(
        (c) =>
          !q ||
          c.name.includes(q) ||
          c.description.toLowerCase().includes(q) ||
          group.toLowerCase().includes(q),
      );
    if (!items.length) continue;
    wrap.append(h('div', { class: 'lib-group', text: group }));
    const grid = h('div', { class: 'lib-grid' });
    for (const c of items) {
      const card = h('button', {
        class: 'comp',
        draggable: 'true',
        title: `${c.description}\nClick to add at the playhead, or drag onto the canvas`,
      });
      card.innerHTML = `<span class="ci">${icon(COMPONENT_ICON[c.name] ?? 'box', 22)}</span><b>${esc(c.name)}</b><small>${esc(c.description.replace(/\*\*/g, ''))}</small>`;
      card.addEventListener('click', () => void insertElement(c.name, { time: ctx.time() }));
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer!.setData('application/x-reelforge-component', c.name);
        e.dataTransfer!.effectAllowed = 'copy';
      });
      grid.append(card);
    }
    wrap.append(grid);
  }
  if (!wrap.children.length)
    wrap.append(h('p', { class: 'dim pad', text: `No component matches “${query}”.` }));
  body.replaceChildren(search, wrap);
}

// ------------------------------------------------------------------ script
function renderScript(body: HTMLElement): void {
  const lines = app.spec.script ?? [];
  const compiled = app.state?.script ?? [];
  const tlLines = app.timeline?.script ?? [];
  const t = ctx.time();
  const sel = app.selection;
  const list = h('ol', { class: 'script-list' });
  lines.forEach((l, i) => {
    const id = compiled[i]?.id ?? l.id ?? `l${i + 1}`;
    const info = tlLines.find((x) => x.id === id);
    const live = info ? t >= info.start && t < info.end : false;
    const li = h('li', {
      class: `${sel?.kind === 'line' && sel.index === i ? 'sel' : ''}${live ? ' live' : ''}`,
    });
    const head = h('div', { class: 'lhead' });
    head.innerHTML = `<span class="lid mono">${esc(id)}</span><span class="tm mono">${info ? fmt(info.start) : '—'}</span>`;
    const tools = h('span', { class: 'ltools' });
    const mk = (ic: string, title: string, fn: () => void, disabled = false) => {
      const b = h('button', { class: 'tbtn sm', title, disabled });
      b.innerHTML = icon(ic, 13);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
      tools.append(b);
    };
    mk('up', 'Move up', () => void moveLine(i, i - 1), i === 0);
    mk('down', 'Move down', () => void moveLine(i, i + 1), i === lines.length - 1);
    mk('plus', 'Add a line after this one', () => void insertLine(i));
    mk('trash', 'Delete line', () => void deleteLine(i));
    head.append(tools);
    const text = h('textarea', {
      class: 'ltext',
      dir: 'auto',
      rows: 1,
      'aria-label': `Line ${id}`,
    }) as HTMLTextAreaElement;
    text.value = l.text;
    const grow = () => {
      text.style.height = 'auto';
      text.style.height = `${text.scrollHeight}px`;
    };
    requestAnimationFrame(grow);
    text.addEventListener('input', grow);
    text.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        text.blur();
      }
      if (e.key === 'Escape') {
        text.value = l.text;
        text.blur();
      }
    });
    text.addEventListener('change', () => {
      const v = text.value.trim();
      if (v && v !== l.text)
        void app.edit([{ op: 'set', path: ['script', i, 'text'], value: v }], `Edit line ${id}`);
    });
    li.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
      app.select({ kind: 'line', index: i });
      if (info) ctx.seek(info.start);
    });
    li.append(head, text);
    list.append(li);
  });
  const add = h('button', { class: 'btn ghost block' });
  add.innerHTML = `${icon('plus', 14)} Add line at the end`;
  add.addEventListener('click', () => void insertLine(lines.length - 1));
  const note = h(
    'p',
    { class: 'dim small pad' },
    'One spoken sentence per line. Arabic, English and mixed text are all supported; captions follow the text direction automatically.',
  );
  body.replaceChildren(note, list, add);
  body.querySelector('li.sel, li.live')?.scrollIntoView({ block: 'nearest' });
}
