/** ReelForge Studio client: cue marker + live preview (SRS §4.2, §4.3, §8). */
import type { Issue, Timeline } from '@reelforge/core';
import { Clock } from './clock.js';
import { CueModel } from './cue.js';
import type { RuntimeApi, StudioState } from './types.js';
import { decodeAudio, Waves, type DecodedAudio } from './wave.js';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const SVG = 'http://www.w3.org/2000/svg';

let state: StudioState | null = null;
let mode: 'cue' | 'dev' = location.hash === '#dev' ? 'dev' : 'cue';
let runtime: RuntimeApi | null = null;
let loadedTimeline: Timeline | null = null;
let audio: DecodedAudio | null = null;
let voiceUrl: string | null = null;
let dirty = false;
/** Incremented on every local cue edit; a save only clears `dirty` if no newer edit happened meanwhile. */
let edits = 0;
let saveTimer: number | undefined;
let saveStatus = '';
const overlays = { safe: true, stage: false, boxes: false, time: true };
const clock = new Clock();
const model = new CueModel([]);
const waves = new Waves($<HTMLCanvasElement>('#overview'), $<HTMLCanvasElement>('#zoom'), (t) => seek(t));

// ---------------------------------------------------------------- runtime iframe
const iframe = $<HTMLIFrameElement>('#runtime');
const runtimeReady = new Promise<RuntimeApi>((resolve) => {
  const check = () => {
    const w = iframe.contentWindow as (Window & { reelforge?: RuntimeApi }) | null;
    if (w?.reelforge) w.reelforge.ready.then(() => resolve(w.reelforge!));
    else setTimeout(check, 30);
  };
  iframe.addEventListener('load', check);
  check();
});

async function loadTimeline(tl: Timeline): Promise<void> {
  const api = await runtimeReady;
  await api.load(tl);
  runtime = api;
  loadedTimeline = tl;
  clock.duration = tl.duration;
  waves.duration = tl.duration;
  renderNow();
}

// ---------------------------------------------------------------- layout
function layout(): void {
  const stage = $('#stage');
  const frame = $('#frame');
  const s = Math.min((stage.clientWidth - 24) / 1080, (stage.clientHeight - 24) / 1920);
  frame.style.transform = `scale(${s})`;
  frame.style.position = 'absolute';
  frame.style.left = `${(stage.clientWidth - 1080 * s) / 2}px`;
  frame.style.top = `${(stage.clientHeight - 1920 * s) / 2}px`;
}
window.addEventListener('resize', layout);

function setMode(m: 'cue' | 'dev'): void {
  mode = m;
  document.body.dataset.mode = m;
  history.replaceState(null, '', `#${m}`);
  document
    .querySelectorAll<HTMLButtonElement>('#tabs button')
    .forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  requestAnimationFrame(layout);
}

// ---------------------------------------------------------------- state
function connect(): void {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data as string) as { type: string; state: StudioState };
    if (msg.type === 'state') applyState(msg.state);
  };
  ws.onclose = () => {
    setStatus('disconnected — retrying…', 'err');
    setTimeout(connect, 1000);
  };
}

function applyState(s: StudioState): void {
  const first = !state;
  const scriptChanged = !state || JSON.stringify(state.script) !== JSON.stringify(s.script);
  state = s;
  $('#ep').textContent = `${s.id} · ${s.title}`;
  document.title = `${s.id} · ReelForge Studio`;
  if (first) setMode(location.hash ? mode : s.mode);
  if (scriptChanged) model.setScript(s.script);
  if (!dirty) model.load(s.cues?.cues ?? {}, s.cues?.words ?? {});
  if (s.timeline && s.timeline !== loadedTimeline) void loadTimeline(s.timeline);
  const vurl = s.voice?.url ?? null;
  if (vurl !== voiceUrl) {
    voiceUrl = vurl;
    clock.setSource(vurl, s.voice?.duration ?? s.timeline?.duration ?? 1);
    audio = null;
    waves.setAudio(null);
    if (vurl)
      void decodeAudio(vurl).then((a) => {
        audio = a;
        waves.setAudio(a);
      });
  }
  if (!clock.duration) clock.duration = s.voice?.duration ?? s.timeline?.duration ?? 1;
  waves.duration = s.voice?.duration ?? s.timeline?.duration ?? 1;
  $('#dur').textContent = fmt(waves.duration);
  renderLines(true);
  renderIssues(s.issues);
  const errors = s.issues.filter((i) => i.level === 'error');
  const box = $('#errorBox');
  if (s.error) {
    box.hidden = false;
    box.innerHTML = `<b>Cannot compile episode.yaml</b> — showing the last good version\n\n${errors
      .slice(0, 6)
      .map((i) => `${esc(loc(i))}  ${esc(i.message)}${i.hint ? `\n   → ${esc(i.hint)}` : ''}`)
      .join('\n\n')}`;
  } else box.hidden = true;
  if (errors.length) setStatus(`${errors.length} error(s) — see the lint panel`, 'err');
  else setStatus(saveStatus || `compiled in ${s.compileMs} ms · no errors`, 'ok');
}

function setStatus(text: string, cls = ''): void {
  const el = $('#status');
  el.textContent = text;
  el.className = `mono ${cls}`;
}

// ---------------------------------------------------------------- cue list
let lastCurrent: string | null = null;
function renderLines(force = false): void {
  const ol = $('#lines');
  const t = clock.time;
  const current = model.currentAt(t);
  if (!force && current === lastCurrent) return;
  lastCurrent = current;
  const next = model.nextUnmarked;
  const bad = model.badIds;
  if (force || ol.children.length !== model.script.length) {
    ol.replaceChildren(
      ...model.script.map((l) => {
        const li = document.createElement('li');
        li.dataset.id = l.id;
        li.innerHTML = `<span class="id"></span><span class="tx"></span><span class="tm"></span><div class="words"></div>`;
        li.querySelector('.id')!.textContent = l.id;
        li.querySelector('.tx')!.textContent = l.text;
        li.addEventListener('click', () => {
          model.selected = model.selected === l.id ? null : l.id;
          model.wordMode = false;
          renderLines(true);
        });
        li.addEventListener('dblclick', () => {
          if (model.cues[l.id] !== undefined) seek(model.cues[l.id]);
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
    li.querySelector('.tm')!.textContent = v === undefined ? '—' : fmt(v);
    const wordsEl = li.querySelector('.words') as HTMLElement;
    const showWords = id === model.selected && (model.wordMode || (model.words[id]?.length ?? 0) > 0);
    if (showWords) {
      const ws = model.wordsOf(id);
      const ms = model.words[id] ?? [];
      wordsEl.replaceChildren(
        ...ws.map((w, i) =>
          Object.assign(document.createElement('span'), {
            textContent: w,
            className: i < ms.length ? 'm' : '',
          }),
        ),
      );
    } else wordsEl.replaceChildren();
  }
  $('#cueStats').textContent =
    `${marked}/${model.script.length} marked${model.wordMode ? ' · WORD MODE' : ''}${bad.size ? ` · ${bad.size} out of order` : ''}`;
  if (current) ol.querySelector(`[data-id="${CSS.escape(current)}"]`)?.scrollIntoView({ block: 'nearest' });
}

function flashLine(id: string): void {
  const li = document.querySelector(`#lines li[data-id="${CSS.escape(id)}"]`);
  li?.classList.remove('flash');
  void (li as HTMLElement | null)?.offsetWidth;
  li?.classList.add('flash');
}

let actx: AudioContext | null = null;
function click(): void {
  actx ??= new AudioContext();
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.frequency.value = 1800;
  g.gain.setValueAtTime(0.25, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.05);
  o.connect(g).connect(actx.destination);
  o.start();
  o.stop(actx.currentTime + 0.06);
}

function changed(id: string | null): void {
  if (!id) return;
  flashLine(id);
  click();
  renderLines(true);
  scheduleSave();
}

function scheduleSave(): void {
  dirty = true;
  edits++;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 150);
}

async function save(): Promise<void> {
  if (!state) return;
  const rev = edits;
  // The server fills in the real voice file name, duration and hash.
  const body = model.toJson('voice.wav', state.voice?.duration ?? state.timeline?.duration ?? 0);
  try {
    const res = await fetch('/cues', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) throw new Error(j.error ?? res.statusText);
    saveStatus = `saved ${new Date().toLocaleTimeString()}`;
    if (edits === rev) dirty = false;
    setStatus(saveStatus, 'ok');
  } catch (e) {
    saveStatus = '';
    setStatus(`save failed: ${(e as Error).message}`, 'err');
  }
}

// ---------------------------------------------------------------- lint panel
function loc(i: Issue): string {
  const file = i.file ? i.file.split(/[\\/]/).pop() : '';
  return file
    ? `${file}${i.line ? `:${i.line}:${i.col ?? 1}` : ''}`
    : i.time !== undefined
      ? `@${fmt(i.time)}`
      : '';
}

function renderIssues(issues: Issue[]): void {
  const ul = $('#issues');
  const counts = { error: 0, warn: 0, info: 0 };
  for (const i of issues) counts[i.level]++;
  $('#lintStats').textContent = `${counts.error} errors · ${counts.warn} warnings · ${counts.info} info`;
  if (!issues.length) {
    ul.innerHTML = '<li class="empty">No issues. Ready to render.</li>';
    return;
  }
  ul.replaceChildren(
    ...issues.map((i) => {
      const li = document.createElement('li');
      li.className = i.level;
      const link =
        i.file && i.line
          ? `<a href="vscode://file/${encodeURI(i.file)}:${i.line}:${i.col ?? 1}" title="Open in VS Code">${esc(loc(i))}</a>`
          : esc(loc(i));
      li.innerHTML = `<span class="rule">${esc(i.rule)}</span><span class="msg">${esc(i.message)}</span><span class="loc">${link}${i.time !== undefined ? ` · ${fmt(i.time)}` : ''}${i.hint ? ` · ${esc(i.hint)}` : ''}</span>`;
      li.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).tagName === 'A') return;
        if (i.time !== undefined) seek(i.time);
        if (i.elementId) {
          overlays.boxes = true;
          syncToggles();
        }
      });
      return li;
    }),
  );
}

// ---------------------------------------------------------------- overlays (FR-DEV-4)
function syncToggles(): void {
  document
    .querySelectorAll<HTMLInputElement>('#toggles input')
    .forEach((i) => (i.checked = overlays[i.dataset.ov as keyof typeof overlays]));
  renderNow();
}
document.querySelectorAll<HTMLInputElement>('#toggles input').forEach((i) =>
  i.addEventListener('change', () => {
    overlays[i.dataset.ov as keyof typeof overlays] = i.checked;
    renderNow();
  }),
);

function svg(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text) el.textContent = text;
  return el;
}

function drawOverlay(t: number): void {
  const root = $('#overlay') as unknown as SVGSVGElement;
  const tl = loadedTimeline;
  const nodes: SVGElement[] = [];
  if (tl && overlays.safe) {
    for (const z of tl.preset.safe) {
      nodes.push(
        svg('rect', {
          x: z.x,
          y: z.y,
          width: z.w,
          height: z.h,
          fill: 'rgba(255,74,92,0.16)',
          stroke: '#ff4a5c',
          'stroke-dasharray': '12 10',
          'stroke-width': 3,
        }),
      );
      nodes.push(
        svg(
          'text',
          { x: z.x + 14, y: z.y + 36, fill: '#ff4a5c', 'font-size': 26, 'font-family': 'monospace' },
          `${tl.preset.label} UI · ${z.name}`,
        ),
      );
    }
  }
  if (tl && overlays.stage) {
    nodes.push(
      svg('rect', {
        x: 0,
        y: tl.preset.stage.y,
        width: tl.width,
        height: tl.preset.stage.h,
        fill: 'none',
        stroke: '#55dcff',
        'stroke-width': 3,
        'stroke-dasharray': '6 8',
      }),
    );
    nodes.push(
      svg('line', {
        x1: 0,
        x2: tl.width,
        y1: tl.preset.captionsY,
        y2: tl.preset.captionsY,
        stroke: '#b8ff3c',
        'stroke-width': 2,
        'stroke-dasharray': '4 8',
      }),
    );
  }
  if (runtime && overlays.boxes) {
    for (const b of runtime.boxes(t)) {
      if (!b.visible) continue;
      nodes.push(
        svg('rect', {
          x: b.x,
          y: b.y,
          width: b.w,
          height: b.h,
          fill: 'none',
          stroke: '#c792ff',
          'stroke-width': 3,
        }),
      );
      nodes.push(
        svg(
          'text',
          { x: b.x + 6, y: b.y - 8, fill: '#c792ff', 'font-size': 24, 'font-family': 'monospace' },
          `${b.id} (${b.component})`,
        ),
      );
    }
  }
  if (overlays.time) {
    nodes.push(svg('rect', { x: 20, y: 1830, width: 330, height: 66, rx: 14, fill: 'rgba(0,0,0,0.7)' }));
    nodes.push(
      svg(
        'text',
        { x: 40, y: 1876, fill: '#eef1f7', 'font-size': 34, 'font-family': 'monospace' },
        `${fmt(t)}  f${Math.round(t * (tl?.fps ?? 30))}`,
      ),
    );
  }
  root.replaceChildren(...nodes);
}

// ---------------------------------------------------------------- transport & loop
function seek(t: number): void {
  clock.seek(t);
  renderNow();
}

function renderNow(): void {
  const t = clock.time;
  runtime?.render(t);
  drawOverlay(t);
  waves.draw(t, loadedTimeline, marks(), mode);
  $('#clock').textContent = fmt(t);
  $('#play').textContent = clock.isPlaying ? '❚❚' : '▶';
  renderLines();
}

function marks() {
  return {
    cues: model.script
      .filter((l) => model.cues[l.id] !== undefined)
      .map((l) => ({ id: l.id, t: model.cues[l.id], selected: l.id === model.selected })),
    words: model.selected ? (model.words[model.selected] ?? []) : [],
  };
}

function loop(): void {
  if (clock.isPlaying) renderNow();
  requestAnimationFrame(loop);
}

clock.onEnd = () => renderNow();

function setSpeed(r: number): void {
  clock.setRate(r);
  document
    .querySelectorAll<HTMLButtonElement>('#speed button')
    .forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === r));
}

// ---------------------------------------------------------------- keyboard (IR-3)
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'checkbox')
    return;
  const fps = loadedTimeline?.fps ?? 30;
  const k = e.key;
  const help = $('#help');
  if (k === '?') return void (help.hidden = !help.hidden);
  if (!help.hidden && k === 'Escape') return void (help.hidden = true);
  let handled = true;
  switch (k) {
    case 'c':
    case 'C':
      setMode('cue');
      break;
    case 'v':
    case 'V':
      setMode('dev');
      break;
    case 'k':
    case 'K':
    case 'Enter':
      clock.toggle();
      break;
    case 'j':
    case 'J':
      seek(clock.time - 1);
      break;
    case 'l':
    case 'L':
      seek(clock.time + 1);
      break;
    case ',':
      clock.pause();
      seek(Math.round(clock.time * fps - 1) / fps);
      break;
    case '.':
      clock.pause();
      seek(Math.round(clock.time * fps + 1) / fps);
      break;
    case 'Home':
      seek(0);
      break;
    case 'End':
      seek(clock.duration);
      break;
    case '1':
      setSpeed(0.5);
      break;
    case '2':
      setSpeed(0.75);
      break;
    case '3':
      setSpeed(1);
      break;
    default:
      handled = mode === 'cue' ? cueKey(e) : devKey(e);
  }
  if (handled) {
    e.preventDefault();
    renderNow();
  }
});

function cueKey(e: KeyboardEvent): boolean {
  const step = e.shiftKey ? 0.01 : 0.05;
  switch (e.key) {
    case ' ':
      changed(model.mark(clock.time, audio));
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
      const next = Math.max(0, Math.min(ids.length - 1, cur + (e.key === 'ArrowUp' ? -1 : 1)));
      model.selected = ids[next] ?? null;
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
      $<HTMLInputElement>('#autoSnap').checked = model.autoSnap;
      return true;
    case 'w':
    case 'W':
      if (model.startWordMode()) {
        const v = model.selected ? model.cues[model.selected] : undefined;
        if (v !== undefined) seek(Math.max(0, v - 0.5));
        renderLines(true);
      }
      return true;
    case 'g':
    case 'G':
      if (model.selected && model.cues[model.selected] !== undefined) seek(model.cues[model.selected]);
      return true;
  }
  return false;
}

function devKey(e: KeyboardEvent): boolean {
  const toggle = (key: keyof typeof overlays) => {
    overlays[key] = !overlays[key];
    syncToggles();
    return true;
  };
  switch (e.key) {
    case ' ':
      clock.toggle();
      return true;
    case 'z':
    case 'Z':
      return toggle('safe');
    case 'b':
    case 'B':
      return toggle('stage');
    case 'e':
    case 'E':
      return toggle('boxes');
    case 't':
    case 'T':
      return toggle('time');
  }
  return false;
}

// ---------------------------------------------------------------- helpers & boot
function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

$('#play').addEventListener('click', () => {
  clock.toggle();
  renderNow();
});
$('#helpBtn').addEventListener('click', () => ($('#help').hidden = false));
$('#help').addEventListener('click', (e) => {
  if (e.target === $('#help')) $('#help').hidden = true;
});
$<HTMLInputElement>('#autoSnap').addEventListener(
  'change',
  (e) => (model.autoSnap = (e.target as HTMLInputElement).checked),
);
document
  .querySelectorAll<HTMLButtonElement>('#tabs button')
  .forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode as 'cue' | 'dev')));
document
  .querySelectorAll<HTMLButtonElement>('#speed button')
  .forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));

setMode(mode);
setSpeed(1);
layout();
connect();
requestAnimationFrame(loop);
