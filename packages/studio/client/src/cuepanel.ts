/** Cues mode (FR-CUE-1…7): press Space at the start of each line while listening; Review mode: lint. */
import type { Issue } from '@reelforge/core';
import { app, esc, fmt, h, toast } from './app.js';
import { latinKey } from './commands.js';
import { CueModel } from './cue.js';
import { icon } from './icons.js';
import type { DecodedAudio } from './wave.js';

interface Ctx {
  time: () => number;
  seek: (t: number) => void;
  redraw: () => void;
}
let ctx!: Ctx;
export const model = new CueModel([]);
let dirty = false;
let edits = 0;
let saveTimer: number | undefined;
let lastCurrent: string | null = null;

export function initCuePanel(c: Ctx): void {
  ctx = c;
  const root = document.querySelector<HTMLElement>('#cuePanel')!;
  root.innerHTML = `
    <div class="phead">
      <b>Mark cues</b>
      <span id="cueStats" class="mono dim"></span>
      <label class="check" title="Snap marks to the nearest voice onset (A)"><input type="checkbox" id="autoSnap" /> Snap to voice</label>
    </div>
    <div class="autocue">
      <button class="btn sm" id="autoCueBtn" title="Find every line and word in the recording automatically; then fix mistakes by ear">${icon('wave', 14)}<span>Auto-mark from voice</span></button>
      <span id="autoCueInfo" class="dim small"></span>
    </div>
    <div class="howto">
      <div><kbd>Space</kbd> mark the next line as you hear it start</div>
      <div><kbd>K</kbd> play / pause · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> speed 0.5× 0.75× 1×</div>
      <div><kbd>⌫</kbd> undo · click a line, then <kbd>Space</kbd> to re-mark it · <kbd>←</kbd><kbd>→</kbd> nudge · <kbd>W</kbd> word by word</div>
    </div>
    <ol id="lines"></ol>`;
  root.querySelector<HTMLInputElement>('#autoSnap')!.addEventListener('change', (e) => {
    model.autoSnap = (e.target as HTMLInputElement).checked;
  });
  root.querySelector('#autoCueBtn')!.addEventListener('click', () => void autoMark());
  void refreshAssist();
  document.addEventListener('rf:select-line', (e) => {
    model.selected = (e as CustomEvent<string>).detail;
    model.wordMode = false;
    renderLines(true);
  });
}

interface AssistInfo {
  whisper: boolean;
  vad: boolean;
  manualCues: boolean;
  voice: boolean;
  aligning: boolean;
}
let assist: AssistInfo | null = null;
/** Per-line confidence of the last automatic alignment (lines below 0.5 deserve a listen). */
let confidence: Record<string, number> = {};

async function refreshAssist(): Promise<void> {
  try {
    assist = (await (await fetch('/api/assist')).json()) as AssistInfo;
  } catch {
    assist = null;
  }
  const info = document.querySelector('#autoCueInfo');
  const btn = document.querySelector<HTMLButtonElement>('#autoCueBtn');
  if (!info || !btn) return;
  btn.disabled = !assist?.voice || Boolean(assist?.aligning) || Boolean(btn.dataset.busy);
  info.textContent = !assist?.voice
    ? 'needs a voice recording'
    : assist.whisper
      ? `Whisper${assist.vad ? ' + VAD' : ''} · word-accurate`
      : `pauses${assist.vad ? ' + VAD' : ''} · run \`reelforge align --setup\` for Whisper`;
}

/** Asks the server to align every line and word to the recording (undoable). */
export async function autoMark(): Promise<void> {
  const btn = document.querySelector<HTMLButtonElement>('#autoCueBtn')!;
  const label = btn.querySelector('span')!;
  if (btn.dataset.busy) return;
  // Busy from the first click: the status check below is a network round trip.
  btn.dataset.busy = '1';
  btn.disabled = true;
  label.textContent = 'Listening…';
  await refreshAssist();
  const stop = () => {
    label.textContent = 'Auto-mark from voice';
    delete btn.dataset.busy;
    void refreshAssist();
  };
  if (!assist?.voice) {
    stop();
    return toast('Add a voice recording first', 'err');
  }
  let force = false;
  if (assist.manualCues) {
    if (!confirm('Replace the cues you marked by hand with automatic ones? (Undo brings yours back.)'))
      return stop();
    force = true;
  }
  label.textContent = assist.whisper ? 'Listening… (Whisper)' : 'Listening…';
  try {
    const res = await fetch('/api/cues/auto', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ force }),
    });
    const j = (await res.json()) as {
      error?: string;
      engine?: string;
      vad?: boolean;
      matched?: number;
      confidence?: Record<string, number>;
      ms?: { total: number };
      note?: string;
      pauses?: { at: number; len: number }[];
    };
    if (!res.ok) throw new Error(j.error ?? res.statusText);
    dirty = false;
    confidence = j.confidence ?? {};
    const shaky = Object.values(confidence).filter((v) => v < 0.5).length;
    toast(
      `Marked ${Object.keys(confidence).length} lines with ${j.engine}${j.vad ? ' + VAD' : ''} in ${((j.ms?.total ?? 0) / 1000).toFixed(1)} s${j.matched !== undefined ? ` · ${Math.round(j.matched * 100)}% of words heard` : ''}. ${shaky ? `${shaky} line(s) to check by ear (amber).` : 'Listen through once and fix any line with Space.'}${j.note ? ` ${j.note}` : ''}`,
      'ok',
    );
  } catch (e) {
    toast(`Auto-mark failed: ${(e as Error).message}`, 'err');
  } finally {
    label.textContent = 'Auto-mark from voice';
    stop();
  }
}

export function syncCueModel(): void {
  const s = app.state;
  if (!s) return;
  if (JSON.stringify(model.script) !== JSON.stringify(s.script)) model.setScript(s.script);
  if (!dirty) model.load(s.cues?.cues ?? {}, s.cues?.words ?? {});
  renderLines(true);
}

export function renderLines(force = false): void {
  const ol = document.querySelector<HTMLOListElement>('#lines');
  if (!ol) return;
  const t = ctx.time();
  const current = model.currentAt(t);
  if (!force && current === lastCurrent) return;
  lastCurrent = current;
  const next = model.nextUnmarked;
  const bad = model.badIds;
  if (force || ol.children.length !== model.script.length) {
    ol.replaceChildren(
      ...model.script.map((l) => {
        const li = h('li', {});
        li.dataset.id = l.id;
        li.innerHTML = `<span class="id mono"></span><span class="tx" dir="auto"></span><span class="tm mono"></span><div class="words" dir="auto"></div>`;
        li.querySelector('.id')!.textContent = l.id;
        li.querySelector('.tx')!.textContent = l.text;
        li.addEventListener('click', () => {
          model.selected = model.selected === l.id ? null : l.id;
          model.wordMode = false;
          renderLines(true);
        });
        li.addEventListener('dblclick', () => {
          if (model.cues[l.id] !== undefined) ctx.seek(model.cues[l.id]);
        });
        return li;
      }),
    );
  }
  let marked = 0;
  for (const li of Array.from(ol.children) as HTMLElement[]) {
    const id = li.dataset.id!;
    const v = model.cues[id];
    if (v !== undefined) marked++;
    li.classList.toggle('marked', v !== undefined);
    li.classList.toggle('current', id === current);
    li.classList.toggle('next', id === next && !model.selected);
    li.classList.toggle('sel', id === model.selected);
    li.classList.toggle('bad', bad.has(id));
    const conf = confidence[id];
    li.classList.toggle('shaky', conf !== undefined && conf < 0.5);
    li.title = conf !== undefined ? `Automatic cue, confidence ${Math.round(conf * 100)}%` : '';
    li.querySelector('.tm')!.textContent = v === undefined ? '—' : fmt(v);
    const wordsEl = li.querySelector('.words') as HTMLElement;
    const showWords = id === model.selected && (model.wordMode || (model.words[id]?.length ?? 0) > 0);
    if (showWords) {
      const ms = model.words[id] ?? [];
      wordsEl.replaceChildren(
        ...model.wordsOf(id).map((w, i) => h('span', { class: i < ms.length ? 'm' : '' }, w)),
      );
    } else wordsEl.replaceChildren();
  }
  const stats = document.querySelector('#cueStats');
  if (stats)
    stats.textContent = `${marked}/${model.script.length} marked${model.wordMode ? ' · WORD MODE' : ''}${bad.size ? ` · ${bad.size} out of order` : ''}`;
  if (current && app.mode === 'cue')
    ol.querySelector(`[data-id="${CSS.escape(current)}"]`)?.scrollIntoView({ block: 'nearest' });
}

function flash(id: string): void {
  const li = document.querySelector(`#lines li[data-id="${CSS.escape(id)}"]`);
  li?.classList.remove('flash');
  void (li as HTMLElement | null)?.offsetWidth;
  li?.classList.add('flash');
}

let actx: AudioContext | null = null;
function click(): void {
  try {
    actx ??= new AudioContext();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.frequency.value = 1800;
    g.gain.setValueAtTime(0.25, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.05);
    o.connect(g).connect(actx.destination);
    o.start();
    o.stop(actx.currentTime + 0.06);
  } catch {
    /* audio unavailable */
  }
}

function changed(id: string | null): void {
  if (!id) return;
  flash(id);
  click();
  renderLines(true);
  dirty = true;
  edits++;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 150);
}

async function save(): Promise<void> {
  const s = app.state;
  if (!s) return;
  const rev = edits;
  const body = model.toJson('voice.wav', app.duration);
  try {
    const res = await fetch('/cues', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) throw new Error(j.error ?? res.statusText);
    if (edits === rev) dirty = false;
    app.status(`cues saved ${new Date().toLocaleTimeString()}`, 'ok');
  } catch (e) {
    app.status(`save failed: ${(e as Error).message}`, 'err');
  }
}

/** Cue-mode keys; returns true when handled. */
export function cueKey(e: KeyboardEvent, audio: DecodedAudio | null): boolean {
  const step = e.shiftKey ? 0.01 : 0.05;
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  switch (latinKey(e)) {
    case ' ':
      // a held Space must not mark several lines at once
      if (!e.repeat) changed(model.mark(ctx.time(), audio));
      return true;
    case 'Backspace':
      changed(model.undo());
      return true;
    case 'ArrowLeft':
      changed(model.nudge(-step));
      return true;
    case 'ArrowRight':
      changed(model.nudge(step));
      return true;
    case 'ArrowUp':
    case 'ArrowDown': {
      const ids = model.script.map((l) => l.id);
      const cur = model.selected ? ids.indexOf(model.selected) : e.key === 'ArrowUp' ? ids.length : -1;
      const n = Math.max(0, Math.min(ids.length - 1, cur + (e.key === 'ArrowUp' ? -1 : 1)));
      model.selected = ids[n] ?? null;
      model.wordMode = false;
      renderLines(true);
      return true;
    }
    case 'Escape':
      model.selected = null;
      model.wordMode = false;
      renderLines(true);
      return true;
    case 's':
    case 'S':
      changed(model.snapSelected(audio));
      return true;
    case 'a':
    case 'A':
      model.autoSnap = !model.autoSnap;
      (document.querySelector('#autoSnap') as HTMLInputElement).checked = model.autoSnap;
      return true;
    case 'w':
    case 'W':
      if (model.startWordMode()) {
        const v = model.selected ? model.cues[model.selected] : undefined;
        if (v !== undefined) ctx.seek(Math.max(0, v - 0.5));
        renderLines(true);
      }
      return true;
    case 'g':
    case 'G':
      if (model.selected && model.cues[model.selected] !== undefined) ctx.seek(model.cues[model.selected]);
      return true;
  }
  return false;
}

// ------------------------------------------------------------------ review
export function initReview(): void {
  const root = document.querySelector<HTMLElement>('#reviewPanel')!;
  root.innerHTML = `
    <div class="phead"><b>Review</b><span id="lintStats" class="mono dim"></span></div>
    <p class="note">Every check runs on each save: schema, timing, overlaps, safe zones and text overflow. Click an issue to jump to it.</p>
    <ul id="issues"></ul>`;
}

function loc(i: Issue): string {
  const file = i.file ? i.file.split(/[\\/]/).pop() : '';
  return file
    ? `${file}${i.line ? `:${i.line}:${i.col ?? 1}` : ''}`
    : i.time !== undefined
      ? `@${fmt(i.time)}`
      : '';
}

export function renderIssues(): void {
  const ul = document.querySelector<HTMLUListElement>('#issues');
  if (!ul) return;
  const issues = app.issues;
  const counts = { error: 0, warn: 0, info: 0 };
  for (const i of issues) counts[i.level]++;
  const stats = document.querySelector('#lintStats');
  if (stats) stats.textContent = `${counts.error} errors · ${counts.warn} warnings · ${counts.info} info`;
  const pill = document.querySelector<HTMLElement>('#issuesPill');
  if (pill) {
    pill.className = `pill ${counts.error ? 'bad' : counts.warn ? 'warn' : 'ok'}`;
    pill.innerHTML = counts.error
      ? `${icon('warn', 13)} ${counts.error} error${counts.error > 1 ? 's' : ''}`
      : counts.warn
        ? `${icon('info', 13)} ${counts.warn} warning${counts.warn > 1 ? 's' : ''}`
        : `${icon('check', 13)} Ready to render`;
  }
  if (!issues.length) {
    ul.innerHTML = '<li class="empty">No issues. Ready to render.</li>';
    return;
  }
  ul.replaceChildren(
    ...issues.map((i) => {
      const li = h('li', { class: i.level });
      li.innerHTML = `<span class="rule">${esc(i.rule)}</span><span class="msg">${esc(i.message)}</span><span class="loc">${esc(loc(i))}${i.time !== undefined ? ` · ${fmt(i.time)}` : ''}${i.hint ? ` · ${esc(i.hint)}` : ''}</span>`;
      li.addEventListener('click', () => {
        if (i.time !== undefined) ctx.seek(i.time);
        if (i.elementId) {
          const pos = app.findElement(i.elementId);
          if (pos) app.select({ kind: 'element', ...pos });
        } else if (i.sceneId) {
          const si = app.scenes.findIndex((s) => s.id === i.sceneId);
          if (si >= 0) app.select({ kind: 'scene', scene: si });
        }
        ctx.redraw();
      });
      return li;
    }),
  );
}
