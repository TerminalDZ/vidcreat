/**
 * Commands: one registry drives keyboard shortcuts, the command palette (⌘K), the context menu
 * and the shortcut sheet (?), so every action is discoverable and has the same name everywhere.
 */
import { app, esc, h, keyLabel } from './app.js';
import { COMPONENT_ICON, icon } from './icons.js';

export interface Command {
  id: string;
  title: string;
  group: string;
  keys?: string[];
  icon?: string;
  /** Modes in which the shortcut is active (default: all). */
  modes?: ('edit' | 'cue' | 'dev')[];
  when?: () => boolean;
  run: () => void;
  /** Keeps firing while the key is held (frame steps, zoom, undo). Default: once per press. */
  repeat?: boolean;
  /** Shown in the palette (default true). */
  palette?: boolean;
}

const commands: Command[] = [];
const byCombo = new Map<string, Command[]>();

export function register(...cmds: Command[]): void {
  for (const c of cmds) {
    commands.push(c);
    for (const k of c.keys ?? []) {
      const list = byCombo.get(k) ?? [];
      list.push(c);
      byCombo.set(k, list);
    }
  }
}

export function run(id: string): void {
  commands.find((c) => c.id === id)?.run();
}

/** Normalized combo of a key event: "Mod+Shift+Z", "Alt+1", "Space", "?", "ArrowLeft". */
/**
 * The key as on a US layout when the layout types a non-Latin character (Arabic, Cyrillic, Greek…),
 * so K, J, L, ⌘Z… work whatever the keyboard language.
 */
export function latinKey(e: KeyboardEvent): string {
  if (e.key === '؟') return '?';
  if (e.key.length === 1 && e.key.charCodeAt(0) > 127 && /^(Key|Digit)/.test(e.code))
    return e.code.replace(/^(Key|Digit)/, '').toLowerCase();
  return e.key;
}

export function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  const mod = e.metaKey || e.ctrlKey;
  if (mod) parts.push('Mod');
  if (e.altKey) parts.push('Alt');
  let key: string;
  const k = latinKey(e);
  if ((e.altKey || e.shiftKey || (mod && /^Key/.test(e.code))) && /^(Digit|Key)/.test(e.code))
    key = e.code.replace(/^(Digit|Key)/, '');
  else if (k === ' ') key = 'Space';
  else if (k.length === 1) key = k.toUpperCase();
  else key = k;
  const printable = key.length === 1 && !/[A-Z0-9]/.test(key);
  if (e.shiftKey && !printable) parts.push('Shift');
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && printable) parts.push('Shift');
  if ((e.metaKey || e.ctrlKey) && (e.code === 'BracketRight' || e.code === 'BracketLeft'))
    key = e.code === 'BracketRight' ? ']' : '[';
  if ((e.metaKey || e.ctrlKey) && (e.code === 'Equal' || e.code === 'Minus'))
    key = e.code === 'Equal' ? '=' : '-';
  parts.push(key);
  return parts.join('+');
}

/** Dispatches a key event to the matching command. */
export function handleKey(e: KeyboardEvent): boolean {
  const combo = comboOf(e);
  const list = byCombo.get(combo);
  if (!list) return false;
  const cmd = list.find((c) => (!c.modes || c.modes.includes(app.mode)) && (!c.when || c.when()));
  if (!cmd) return false;
  e.preventDefault();
  if (e.repeat && !cmd.repeat) return true;
  cmd.run();
  return true;
}

// ------------------------------------------------------------------ palette
interface Item {
  title: string;
  hint?: string;
  icon: string;
  keys?: string[];
  run: () => void;
}

let paletteEl: HTMLDialogElement | null = null;

export function openPalette(prefix = ''): void {
  paletteEl ??= document.querySelector<HTMLDialogElement>('#palette');
  const dlg = paletteEl!;
  const input = dlg.querySelector<HTMLInputElement>('input')!;
  const list = dlg.querySelector<HTMLElement>('.results')!;
  let active = 0;
  let items: Item[] = [];
  const all = (): Item[] => {
    const out: Item[] = commands
      .filter((c) => c.palette !== false && (!c.modes || c.modes.includes(app.mode)) && (!c.when || c.when()))
      .map((c) => ({ title: c.title, hint: c.group, icon: c.icon ?? 'keyboard', keys: c.keys, run: c.run }));
    for (const m of app.meta?.components ?? [])
      out.push({
        title: `Insert ${m.name}`,
        hint: m.description.replace(/\*\*/g, ''),
        icon: COMPONENT_ICON[m.name] ?? 'box',
        run: () => document.dispatchEvent(new CustomEvent('rf:insert', { detail: m.name })),
      });
    app.scenes.forEach((s, si) => {
      out.push({
        title: `Go to scene ${s.id}`,
        hint: 'Scenes',
        icon: 'scene',
        run: () =>
          document.dispatchEvent(new CustomEvent('rf:goto', { detail: { kind: 'scene', scene: si } })),
      });
      (s.elements ?? []).forEach((e, ej) =>
        out.push({
          title: `Select ${app.elementId(si, ej)}`,
          hint: `${e.use} · scene ${s.id}`,
          icon: COMPONENT_ICON[e.use] ?? 'box',
          run: () =>
            document.dispatchEvent(
              new CustomEvent('rf:goto', { detail: { kind: 'element', scene: si, index: ej } }),
            ),
        }),
      );
    });
    (app.state?.script ?? []).forEach((l, i) =>
      out.push({
        title: `${l.id}: ${l.text}`,
        hint: 'Script line',
        icon: 'script',
        run: () => document.dispatchEvent(new CustomEvent('rf:goto', { detail: { kind: 'line', index: i } })),
      }),
    );
    return out;
  };
  const score = (q: string, s: string): number => {
    if (!q) return 1;
    const t = s.toLowerCase();
    const i = t.indexOf(q);
    if (i >= 0) return 100 - i;
    let k = 0;
    for (const ch of t) if (ch === q[k]) k++;
    return k === q.length ? 10 : 0;
  };
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    items = all()
      .map((it) => ({ it, s: Math.max(score(q, it.title), score(q, it.hint ?? '') / 2) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 60)
      .map((x) => x.it);
    active = Math.min(active, Math.max(0, items.length - 1));
    list.replaceChildren(
      ...items.map((it, i) => {
        const b = h('button', { class: `res${i === active ? ' on' : ''}`, role: 'option' });
        b.innerHTML = `${icon(it.icon, 15)}<span class="t" dir="auto">${esc(it.title)}</span><span class="g">${esc(it.hint ?? '')}</span>${it.keys?.length ? `<kbd>${esc(keyLabel(it.keys[0]))}</kbd>` : ''}`;
        b.addEventListener('click', () => choose(i));
        b.addEventListener('mousemove', () => {
          if (active !== i) {
            active = i;
            list.querySelectorAll('.res').forEach((r, k) => r.classList.toggle('on', k === i));
          }
        });
        return b;
      }),
    );
    if (!items.length) list.append(h('div', { class: 'none' }, 'No matching command'));
    list.querySelector('.res.on')?.scrollIntoView({ block: 'nearest' });
  };
  const choose = (i: number) => {
    const it = items[i];
    dlg.close();
    it?.run();
  };
  input.value = prefix;
  input.oninput = () => {
    active = 0;
    draw();
  };
  input.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length);
      draw();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') dlg.close();
  };
  draw();
  dlg.showModal();
  input.focus();
  input.select();
}

// ------------------------------------------------------------------ shortcut sheet
export function openHelp(): void {
  const dlg = document.querySelector<HTMLDialogElement>('#helpDlg')!;
  const body = dlg.querySelector<HTMLElement>('.help-body')!;
  const groups = new Map<string, Command[]>();
  for (const c of commands) {
    if (!c.keys?.length) continue;
    const g = groups.get(c.group) ?? [];
    const same = g.find((x) => x.title === c.title);
    if (same) same.keys = [...new Set([...(same.keys ?? []), ...c.keys])];
    else g.push({ ...c, keys: [...c.keys] });
    groups.set(c.group, g);
  }
  const extra: [string, [string, string][]][] = [
    [
      'Canvas',
      [
        ['Click / Alt+click', 'Select / select the element underneath'],
        ['Drag', 'Move (Shift: straight lines, Alt: no snapping)'],
        ['Drag a handle', 'Resize (Shift: keep proportions, Alt: from the centre)'],
        ['Double-click', 'Edit the text in place'],
        ['← → ↑ ↓', 'Nudge 1 px (Shift: 10 px)'],
        ['Space + drag / middle drag', 'Pan'],
        [`${keyLabel('Mod')} + wheel`, 'Zoom at the cursor'],
      ],
    ],
    [
      'Timeline',
      [
        ['Drag a clip', 'Retime (snaps to words, lines, scenes and the playhead; Alt: no snapping)'],
        ['Drag a clip edge', 'Change when it enters / exits'],
        ['Double-click a clip', 'Move the playhead there'],
        [`${keyLabel('Mod')} + wheel`, 'Zoom the timeline'],
      ],
    ],
    [
      'Cues mode',
      [
        ['Space', 'Mark the next line (or the selected line)'],
        ['Backspace', 'Undo the last mark'],
        ['↑ ↓ / click', 'Select a line to re-mark'],
        ['← →', 'Nudge the selected cue 50 ms (Shift: 10 ms)'],
        ['S / A', 'Snap to voice onset / auto-snap'],
        ['W', 'Mark word by word'],
      ],
    ],
  ];
  const col = (title: string, rows: [string, string][]) =>
    `<section><h3>${esc(title)}</h3><dl>${rows.map(([k, d]) => `<dt>${esc(k)}</dt><dd>${esc(d)}</dd>`).join('')}</dl></section>`;
  body.innerHTML =
    [...groups]
      .map(([g, cs]) =>
        col(
          g,
          cs.map((c) => [c.keys!.map(keyLabel).join('  '), c.title]),
        ),
      )
      .join('') + extra.map(([g, rows]) => col(g, rows)).join('');
  dlg.showModal();
}

// ------------------------------------------------------------------ context menu
export function openContextMenu(x: number, y: number, ids: (string | '-')[]): void {
  const menu = document.querySelector<HTMLElement>('#ctxmenu')!;
  menu.replaceChildren(
    ...ids.map((id) => {
      if (id === '-') return h('hr');
      const c = commands.find((k) => k.id === id);
      if (!c) return h('span');
      const enabled = (!c.when || c.when()) && (!c.modes || c.modes.includes(app.mode));
      const b = h('button', { disabled: !enabled, role: 'menuitem' });
      b.innerHTML = `${icon(c.icon ?? 'dots', 14)}<span>${esc(c.title)}</span>${c.keys?.length ? `<kbd>${esc(keyLabel(c.keys[0]))}</kbd>` : ''}`;
      b.addEventListener('click', () => {
        menu.hidden = true;
        c.run();
      });
      return b;
    }),
  );
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
  menu.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`;
  const close = (e: Event) => {
    if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
    if (e.type === 'pointerdown' && menu.contains(e.target as Node)) return;
    menu.hidden = true;
    window.removeEventListener('pointerdown', close, true);
    window.removeEventListener('keydown', close, true);
    window.removeEventListener('blur', close);
  };
  setTimeout(() => {
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', close, true);
    window.addEventListener('blur', close);
  });
}
