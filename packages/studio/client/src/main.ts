/**
 * ReelForge Studio: a visual editor for one episode (canvas, layers, inspector, timeline), the cue
 * marker and the review panel, all synced to the voice recording and to episode.yaml on disk.
 */
import type { Timeline } from '@reelforge/core';
import {
  addScene,
  copySelection,
  deleteSelection,
  duplicateSelection,
  insertElement,
  paste,
  reorder,
  setInOut,
  takePendingSelect,
} from './actions.js';
import { $, app, fmt, h, toast, type Mode, type Selection } from './app.js';
import {
  consumeSpacePan,
  drawOverlay,
  fit,
  initCanvas,
  nudge,
  zoom100,
  zoomBy,
  zoomToSelection,
} from './canvas.js';
import { Clock } from './clock.js';
import { handleKey, openContextMenu, openHelp, openPalette, register } from './commands.js';
import { cueKey, initCuePanel, initReview, renderIssues, renderLines, syncCueModel } from './cuepanel.js';
import { icon } from './icons.js';
import { initInspector, renderInspector } from './inspector.js';
import { initPanels, renderPanels, setTab } from './panels.js';
import {
  fitTimeline,
  initTimeline,
  renderTimeline,
  revealTime,
  setTimelineAudio,
  toggleSnap,
  updatePlayhead,
  zoomTimeline,
} from './timeline.js';
import type { Job, RuntimeApi, StudioState } from './types.js';
import { decodeAudio, type DecodedAudio } from './wave.js';

const clock = new Clock();
let runtime: RuntimeApi | null = null;
let audio: DecodedAudio | null = null;
let voiceUrl: string | null = null;
let loadedTimeline: Timeline | null = null;
let first = true;

// ------------------------------------------------------------------ static icons in the markup
document.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
  el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon!, Number(el.dataset.size ?? 16)));
});

// ------------------------------------------------------------------ runtime iframe
const iframe = $<HTMLIFrameElement>('#runtime');
const runtimeReady = new Promise<RuntimeApi>((resolve) => {
  const check = () => {
    const w = iframe.contentWindow as (Window & { reelforge?: RuntimeApi }) | null;
    if (w?.reelforge) void w.reelforge.ready.then(() => resolve(w.reelforge!));
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
  app.timeline = tl;
  clock.duration = app.duration;
  $('#dur').textContent = fmt(app.duration);
  if (first) {
    first = false;
    fitTimeline();
  }
  renderAll();
  app.emit('timeline');
}

// ------------------------------------------------------------------ state
function connect(): void {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => document.body.classList.remove('offline');
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data as string) as {
      type: string;
      state?: StudioState;
      job?: Job;
      outputs?: StudioState['outputs'];
    };
    if (msg.type === 'state' && msg.state) applyState(msg.state);
    if (msg.type === 'job' && msg.job && app.state) {
      app.state = { ...app.state, job: msg.job, outputs: msg.outputs ?? app.state.outputs };
      renderJob();
    }
  };
  ws.onclose = () => {
    document.body.classList.add('offline');
    app.status('disconnected — retrying…', 'err');
    setTimeout(connect, 1000);
  };
}

function validSelection(s: Selection): Selection {
  if (!s) return null;
  if (s.kind === 'element') return app.scenes[s.scene]?.elements?.[s.index] ? s : null;
  if (s.kind === 'scene') return app.scenes[s.scene] ? s : null;
  return app.spec.script?.[s.index] ? s : null;
}

function applyState(s: StudioState): void {
  const first = !app.state;
  app.state = s;
  $('#epTitle').textContent = s.title || s.id;
  $('#epId').textContent = s.id;
  document.title = `${s.title || s.id} · ReelForge Studio`;
  if (first) {
    setMode((location.hash.slice(1) as Mode) || s.mode, false);
    // A render that finished before this tab opened is not news: don't pop its results up.
    lastJobNotified = s.job?.finished ?? 0;
    prevJob.status = s.job?.status ?? '';
  }
  const pending = takePendingSelect();
  app.selection = pending ? { kind: 'element', ...pending } : validSelection(app.selection);
  syncCueModel();
  const vurl = s.voice?.url ?? null;
  if (vurl !== voiceUrl) {
    voiceUrl = vurl;
    clock.setSource(vurl, s.voice?.duration ?? s.timeline?.duration ?? 1);
    audio = null;
    setTimelineAudio(null);
    if (vurl)
      void decodeAudio(vurl).then((a) => {
        audio = a;
        setTimelineAudio(a);
      });
  }
  clock.duration = app.duration;
  $('#dur').textContent = fmt(app.duration);
  const errBox = $('#errorBox');
  const errors = s.issues.filter((i) => i.level === 'error');
  if (s.error) {
    errBox.hidden = false;
    errBox.innerHTML = '';
    errBox.append(
      h('b', {}, 'episode.yaml has an error — showing the last version that worked'),
      ...errors
        .slice(0, 4)
        .map((i) =>
          h(
            'div',
            { class: 'mono' },
            `${i.line ? `line ${i.line}: ` : ''}${i.message}${i.hint ? ` → ${i.hint}` : ''}`,
          ),
        ),
    );
  } else errBox.hidden = true;
  syncHistory();
  renderJob();
  if (s.timeline && s.timeline !== loadedTimeline) void loadTimeline(s.timeline);
  else renderAll();
  if (!errors.length && !/saved|…/.test($('#status').textContent ?? ''))
    app.status(`Saved · compiled in ${s.compileMs} ms`, 'ok');
  if (first) maybeOnboard();
}

function syncHistory(): void {
  const hst = app.state?.history;
  const u = $<HTMLButtonElement>('#undoBtn');
  const r = $<HTMLButtonElement>('#redoBtn');
  u.disabled = !hst?.undo;
  r.disabled = !hst?.redo;
  u.title = `Undo${hst?.undoLabel ? `: ${hst.undoLabel}` : ''} (${isMacLabel('Mod+Z')})`;
  r.title = `Redo${hst?.redoLabel ? `: ${hst.redoLabel}` : ''} (${isMacLabel('Mod+Shift+Z')})`;
}

const isMacLabel = (k: string) => k.replace('Mod', /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl');

function renderAll(): void {
  renderPanels();
  renderInspector();
  renderTimeline();
  renderIssues();
  renderLines(true);
  renderNow();
}

app.on('selection', () => {
  renderPanels();
  renderInspector();
  renderTimeline();
  renderNow();
});

// ------------------------------------------------------------------ modes
function setMode(m: Mode, focus = true): void {
  if (!['edit', 'cue', 'dev'].includes(m)) m = 'edit';
  app.mode = m;
  document.body.dataset.mode = m;
  history.replaceState(null, '', `#${m}`);
  document.querySelectorAll<HTMLButtonElement>('#modes button').forEach((b) => {
    b.classList.toggle('on', b.dataset.mode === m);
    b.setAttribute('aria-selected', String(b.dataset.mode === m));
  });
  if (m === 'edit') renderInspector();
  if (m === 'cue') renderLines(true);
  renderNow();
  if (focus) $('#stage').focus({ preventScroll: true });
}

// ------------------------------------------------------------------ transport & loop
function time(): number {
  return clock.time;
}

function seek(t: number): void {
  clock.seek(Math.max(0, Math.min(app.duration, t)));
  renderNow();
}

let lastLive = '';
function renderNow(): void {
  const t = clock.time;
  runtime?.render(t);
  drawOverlay(t);
  updatePlayhead(t);
  $('#clock').textContent = fmt(t);
  const play = $('#play');
  const playing = clock.isPlaying;
  if (play.dataset.state !== String(playing)) {
    play.dataset.state = String(playing);
    play.innerHTML = icon(playing ? 'pause' : 'play', 18);
  }
  renderLines();
  // refresh the "on screen now" markers in the layers panel when the visible set changes
  const live = app.timeline
    ? app.timeline.scenes
        .flatMap((s) =>
          t >= s.start && t < s.end
            ? [
                s.id,
                ...s.elements
                  .filter((e) => t >= e.enter.t && (!e.exit || t < e.exit.t + e.exit.dur))
                  .map((e) => e.id),
              ]
            : [],
        )
        .join(',') + (app.timeline.script.find((l) => t >= l.start && t < l.end)?.id ?? '')
    : '';
  if (live !== lastLive) {
    lastLive = live;
    renderPanels();
  }
}

/** Plays [t0, t1] once and stops on t1, so an animation can be watched without leaving the clip. */
let previewEnd: number | null = null;
function preview(t0: number, t1: number): void {
  clock.pause();
  seek(t0);
  previewEnd = Math.min(app.duration, t1);
  void clock.play().then(renderNow);
}

function loop(): void {
  if (previewEnd !== null) {
    if (!clock.isPlaying) previewEnd = null;
    else if (clock.time >= previewEnd) {
      clock.pause();
      seek(previewEnd);
      previewEnd = null;
    }
  }
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

function step(frames: number): void {
  clock.pause();
  seek(Math.round(clock.time * app.fps + frames) / app.fps);
}

// ------------------------------------------------------------------ render dialog & outputs
function renderJob(): void {
  const j = app.state?.job;
  const pill = $('#jobPill');
  const btn = $<HTMLButtonElement>('#renderBtn');
  if (!j) {
    pill.hidden = true;
    btn.disabled = false;
    return;
  }
  pill.hidden = false;
  if (j.status === 'running') {
    const pct = j.total ? Math.round((j.done / j.total) * 100) : 0;
    pill.className = 'jobpill running';
    pill.innerHTML = `<i style="width:${pct}%"></i><span>${j.phase} ${pct}%${j.eta ? ` · ${Math.ceil(j.eta)} s left` : ''}</span>`;
    pill.title = 'Rendering — click to cancel';
    btn.disabled = true;
  } else {
    btn.disabled = false;
    pill.className = `jobpill ${j.status}`;
    pill.innerHTML = `${icon(j.status === 'done' ? 'check' : 'warn', 13)}<span>${j.status === 'done' ? 'Rendered — open' : j.status === 'cancelled' ? 'Render cancelled' : 'Render failed'}</span>`;
    pill.title = j.message ?? '';
  }
}

let lastJobNotified = 0;
function onJobEvent(): void {
  const j = app.state?.job;
  if (!j || j.status === 'running' || j.finished === lastJobNotified) return;
  lastJobNotified = j.finished ?? 0;
  if (j.status === 'done') {
    toast(j.message ?? 'Rendered', 'ok', 5000);
    openOutputs();
  } else if (j.status === 'failed') toast(j.message ?? 'Render failed', 'err', 8000);
}

$('#jobPill').addEventListener('click', () => {
  const j = app.state?.job;
  if (j?.status === 'running') {
    if (confirm('Cancel the render?')) void app.cancelRender();
  } else if (j?.status === 'done') openOutputs();
  else if (j?.message) toast(j.message, 'err', 8000);
});

function openRenderDialog(): void {
  if (app.state?.job?.status === 'running') return toast('A render is already running');
  const dlg = $<HTMLDialogElement>('#renderDlg');
  const presets = $<HTMLSelectElement>('#rPreset');
  presets.replaceChildren(
    h('option', { value: '' }, `Episode setting (${String(app.spec.meta?.preset ?? 'tiktok')})`),
    ...(app.meta?.presets ?? []).map((p) => h('option', { value: p }, p)),
  );
  const silent = $<HTMLInputElement>('#rSilent');
  silent.checked = !app.state?.voice;
  $('#rVoiceNote').hidden = Boolean(app.state?.voice);
  const errors = app.issues.filter((i) => i.level === 'error');
  $('#rErrors').hidden = !errors.length;
  $('#rErrors').textContent = errors.length
    ? `${errors.length} error(s) must be fixed first: ${errors[0].message}`
    : '';
  dlg.showModal();
}

$('#renderForm').addEventListener('submit', (e) => {
  const dlg = $<HTMLDialogElement>('#renderDlg');
  if ((e as SubmitEvent).submitter?.getAttribute('value') !== 'ok') return;
  e.preventDefault();
  const options = {
    preset: $<HTMLSelectElement>('#rPreset').value || undefined,
    shareMb: Number($<HTMLInputElement>('#rShare').value) || undefined,
    sfx: $<HTMLInputElement>('#rSfx').checked,
    silent: $<HTMLInputElement>('#rSilent').checked,
    fast: $<HTMLInputElement>('#rFast').checked,
  };
  dlg.close();
  app.render(options).then(
    () => toast('Rendering… you can keep editing'),
    (err: Error) => toast(err.message, 'err', 8000),
  );
});

function openOutputs(): void {
  const outs = app.state?.outputs ?? [];
  const dlg = $<HTMLDialogElement>('#outputsDlg');
  const video = $<HTMLVideoElement>('#outVideo');
  const share = outs.find((o) => o.file.endsWith('.share.mp4')) ?? outs.find((o) => o.file.endsWith('.mp4'));
  const sheet = outs.find((o) => o.file.endsWith('.sheet.jpg'));
  video.poster = sheet ? `/episode/out/${encodeURIComponent(sheet.file)}?v=${sheet.mtime}` : '';
  video.src = share ? `/episode/out/${encodeURIComponent(share.file)}?v=${share.mtime}` : '';
  const list = $('#outList');
  list.replaceChildren(
    ...outs.map((o) =>
      h(
        'li',
        {},
        h(
          'a',
          {
            href: `/episode/out/${encodeURIComponent(o.file)}?v=${o.mtime}`,
            target: '_blank',
            rel: 'noopener',
            download: o.file,
          },
          o.file,
        ),
        h('span', { class: 'dim mono' }, `${(o.size / 1048576).toFixed(1)} MB`),
      ),
    ),
  );
  if (!outs.length) list.append(h('li', { class: 'dim' }, 'Nothing rendered yet.'));
  dlg.showModal();
}

// ------------------------------------------------------------------ commands
const hasEl = () => app.selection?.kind === 'element';
const hasSel = () => Boolean(app.selection);

register(
  // playback
  {
    id: 'play',
    title: 'Play / pause',
    group: 'Playback',
    keys: ['Space', 'K'],
    icon: 'play',
    modes: ['edit', 'dev'],
    run: () => (clock.toggle(), renderNow()),
  },
  {
    id: 'play-cue',
    title: 'Play / pause',
    group: 'Playback',
    keys: ['K', 'Enter'],
    icon: 'play',
    modes: ['cue'],
    palette: false,
    run: () => (clock.toggle(), renderNow()),
  },
  {
    id: 'back',
    repeat: true,
    title: 'Back 1 second',
    group: 'Playback',
    keys: ['J'],
    icon: 'back',
    run: () => seek(clock.time - 1),
  },
  {
    id: 'fwd',
    repeat: true,
    title: 'Forward 1 second',
    group: 'Playback',
    keys: ['L'],
    icon: 'fwd',
    run: () => seek(clock.time + 1),
  },
  {
    id: 'prev-frame',
    repeat: true,
    title: 'Previous frame',
    group: 'Playback',
    keys: [',', 'Alt+ArrowLeft'],
    icon: 'back',
    run: () => step(-1),
  },
  {
    id: 'next-frame',
    repeat: true,
    title: 'Next frame',
    group: 'Playback',
    keys: ['.', 'Alt+ArrowRight'],
    icon: 'fwd',
    run: () => step(1),
  },
  {
    id: 'prev-frame-arrow',
    repeat: true,
    title: 'Previous frame',
    group: 'Playback',
    keys: ['ArrowLeft'],
    palette: false,
    modes: ['edit', 'dev'],
    when: () => !hasEl() || app.mode === 'dev',
    run: () => step(-1),
  },
  {
    id: 'next-frame-arrow',
    repeat: true,
    title: 'Next frame',
    group: 'Playback',
    keys: ['ArrowRight'],
    palette: false,
    modes: ['edit', 'dev'],
    when: () => !hasEl() || app.mode === 'dev',
    run: () => step(1),
  },
  { id: 'start', title: 'Go to start', group: 'Playback', keys: ['Home'], icon: 'start', run: () => seek(0) },
  {
    id: 'end',
    title: 'Go to end',
    group: 'Playback',
    keys: ['End'],
    icon: 'end',
    run: () => seek(app.duration),
  },
  { id: 'speed-50', title: 'Speed 0.5×', group: 'Playback', keys: ['1'], run: () => setSpeed(0.5) },
  { id: 'speed-75', title: 'Speed 0.75×', group: 'Playback', keys: ['2'], run: () => setSpeed(0.75) },
  { id: 'speed-100', title: 'Speed 1×', group: 'Playback', keys: ['3'], run: () => setSpeed(1) },
  // edit
  {
    id: 'undo',
    repeat: true,
    title: 'Undo',
    group: 'Edit',
    keys: ['Mod+Z'],
    icon: 'undo',
    run: () => void app.undo(),
  },
  {
    id: 'redo',
    repeat: true,
    title: 'Redo',
    group: 'Edit',
    keys: ['Mod+Shift+Z', 'Mod+Y'],
    icon: 'redo',
    run: () => void app.undo(true),
  },
  {
    id: 'delete',
    title: 'Delete',
    group: 'Edit',
    keys: ['Delete', 'Backspace'],
    icon: 'trash',
    modes: ['edit'],
    when: hasSel,
    run: () => void deleteSelection(),
  },
  {
    id: 'duplicate',
    title: 'Duplicate',
    group: 'Edit',
    keys: ['Mod+D'],
    icon: 'copy',
    modes: ['edit'],
    when: hasEl,
    run: () => void duplicateSelection(),
  },
  {
    id: 'copy',
    title: 'Copy',
    group: 'Edit',
    keys: ['Mod+C'],
    icon: 'copy',
    modes: ['edit'],
    when: hasEl,
    run: copySelection,
  },
  {
    id: 'paste',
    title: 'Paste at the playhead',
    group: 'Edit',
    keys: ['Mod+V'],
    icon: 'copy',
    modes: ['edit'],
    run: () => void paste(clock.time),
  },
  {
    id: 'forward',
    title: 'Bring forward',
    group: 'Edit',
    keys: ['Mod+]'],
    icon: 'up',
    modes: ['edit'],
    when: hasEl,
    run: () => void reorder(1),
  },
  {
    id: 'backward',
    title: 'Send backward',
    group: 'Edit',
    keys: ['Mod+['],
    icon: 'down',
    modes: ['edit'],
    when: hasEl,
    run: () => void reorder(-1),
  },
  {
    id: 'front',
    title: 'Bring to front',
    group: 'Edit',
    keys: ['Mod+Shift+]'],
    icon: 'up',
    modes: ['edit'],
    when: hasEl,
    run: () => void reorder('top'),
  },
  {
    id: 'back-most',
    title: 'Send to back',
    group: 'Edit',
    keys: ['Mod+Shift+['],
    icon: 'down',
    modes: ['edit'],
    when: hasEl,
    run: () => void reorder('bottom'),
  },
  {
    id: 'in',
    title: 'Enter at the playhead',
    group: 'Edit',
    keys: ['I'],
    icon: 'target',
    modes: ['edit'],
    when: hasSel,
    run: () => void setInOut('in', clock.time),
  },
  {
    id: 'out',
    title: 'Exit at the playhead',
    group: 'Edit',
    keys: ['O'],
    icon: 'target',
    modes: ['edit'],
    when: hasEl,
    run: () => void setInOut('out', clock.time),
  },
  {
    id: 'deselect',
    title: 'Deselect',
    group: 'Edit',
    keys: ['Escape'],
    modes: ['edit', 'dev'],
    run: () => app.select(null),
  },
  {
    id: 'next-el',
    title: 'Select next element',
    group: 'Edit',
    keys: ['Tab'],
    modes: ['edit'],
    run: () => cycle(1),
  },
  {
    id: 'prev-el',
    title: 'Select previous element',
    group: 'Edit',
    keys: ['Shift+Tab'],
    modes: ['edit'],
    run: () => cycle(-1),
  },
  {
    id: 'rename',
    title: 'Rename',
    group: 'Edit',
    keys: ['F2'],
    modes: ['edit'],
    when: hasEl,
    run: () => $<HTMLInputElement>('#inspector .ihead + .frow input')?.focus(),
  },
  {
    id: 'save',
    title: 'Save (automatic)',
    group: 'Edit',
    keys: ['Mod+S'],
    palette: false,
    run: () => toast('Every change is saved to episode.yaml automatically', 'ok'),
  },
  // insert
  {
    id: 'insert',
    title: 'Insert component…',
    group: 'Insert',
    keys: ['A', 'Mod+I'],
    icon: 'shapes',
    modes: ['edit'],
    run: () => openPalette('Insert '),
  },
  {
    id: 'add-scene',
    title: 'Add scene at the playhead',
    group: 'Insert',
    keys: ['N'],
    icon: 'scene',
    modes: ['edit'],
    run: () => void addScene(clock.time),
  },
  // view
  { id: 'fit', title: 'Zoom to fit', group: 'View', keys: ['Shift+1'], icon: 'fit', run: fit },
  {
    id: 'zoom-sel',
    title: 'Zoom to selection',
    group: 'View',
    keys: ['Shift+2'],
    icon: 'target',
    run: zoomToSelection,
  },
  { id: 'zoom-100', title: 'Zoom to 100%', group: 'View', keys: ['Shift+0'], run: zoom100 },
  {
    id: 'zoom-in',
    repeat: true,
    title: 'Zoom in',
    group: 'View',
    keys: ['Mod+='],
    icon: 'zoomin',
    run: () => zoomBy(1.25),
  },
  {
    id: 'zoom-out',
    repeat: true,
    title: 'Zoom out',
    group: 'View',
    keys: ['Mod+-'],
    icon: 'zoomout',
    run: () => zoomBy(0.8),
  },
  {
    id: 'tl-in',
    repeat: true,
    title: 'Timeline zoom in',
    group: 'View',
    keys: ['='],
    run: () => zoomTimeline(1.5),
  },
  {
    id: 'tl-out',
    repeat: true,
    title: 'Timeline zoom out',
    group: 'View',
    keys: ['-'],
    run: () => zoomTimeline(1 / 1.5),
  },
  { id: 'tl-fit', title: 'Fit the timeline', group: 'View', keys: ['\\'], run: fitTimeline },
  {
    id: 'safe',
    title: 'Platform safe zones',
    group: 'View',
    keys: ['Z'],
    icon: 'safe',
    modes: ['edit', 'dev'],
    run: () => toggleOverlay('safe'),
  },
  {
    id: 'boxes',
    title: 'Element outlines',
    group: 'View',
    keys: ['E'],
    icon: 'frame',
    modes: ['edit', 'dev'],
    run: () => toggleOverlay('boxes'),
  },
  {
    id: 'stage',
    title: 'Stage & caption guides',
    group: 'View',
    keys: ['B'],
    icon: 'grid',
    modes: ['edit', 'dev'],
    run: () => toggleOverlay('stage'),
  },
  {
    id: 'time',
    title: 'Time readout on the frame',
    group: 'View',
    keys: ['T'],
    modes: ['edit', 'dev'],
    run: () => toggleOverlay('time'),
  },
  {
    id: 'snap',
    title: 'Snapping',
    group: 'View',
    keys: ['S'],
    icon: 'magnet',
    modes: ['edit', 'dev'],
    run: () => (toggleSnap(), toast(app.snap ? 'Snapping on' : 'Snapping off')),
  },
  {
    id: 'hand',
    title: 'Hand tool (pan)',
    group: 'View',
    keys: ['H'],
    icon: 'hand',
    modes: ['edit', 'dev'],
    run: () => setTool('hand'),
  },
  {
    id: 'move',
    title: 'Move tool',
    group: 'View',
    keys: ['V'],
    icon: 'cursor',
    modes: ['edit', 'dev'],
    run: () => setTool('move'),
  },
  // panels & modes
  {
    id: 'mode-edit',
    title: 'Edit mode',
    group: 'Modes & panels',
    keys: ['Alt+1'],
    icon: 'cursor',
    run: () => setMode('edit'),
  },
  {
    id: 'mode-cue',
    title: 'Cues mode (mark the voice)',
    group: 'Modes & panels',
    keys: ['Alt+2'],
    icon: 'mic',
    run: () => setMode('cue'),
  },
  {
    id: 'mode-dev',
    title: 'Review mode (checks)',
    group: 'Modes & panels',
    keys: ['Alt+3'],
    icon: 'check',
    run: () => setMode('dev'),
  },
  {
    id: 'tab-layers',
    title: 'Show layers',
    group: 'Modes & panels',
    keys: ['Alt+L'],
    icon: 'layers',
    run: () => setTab('layers'),
  },
  {
    id: 'tab-insert',
    title: 'Show components',
    group: 'Modes & panels',
    keys: ['Alt+I'],
    icon: 'shapes',
    run: () => setTab('insert'),
  },
  {
    id: 'tab-script',
    title: 'Show script',
    group: 'Modes & panels',
    keys: ['Alt+S'],
    icon: 'script',
    run: () => setTab('script'),
  },
  {
    id: 'render',
    title: 'Render video…',
    group: 'Export',
    keys: ['Mod+Enter'],
    icon: 'render',
    run: openRenderDialog,
  },
  { id: 'outputs', title: 'Open rendered videos', group: 'Export', icon: 'film', run: openOutputs },
  {
    id: 'palette',
    title: 'Command palette',
    group: 'Help',
    keys: ['Mod+K', 'Mod+Shift+P'],
    icon: 'search',
    palette: false,
    run: () => openPalette(),
  },
  { id: 'help', title: 'Keyboard shortcuts', group: 'Help', keys: ['?'], icon: 'keyboard', run: openHelp },
  { id: 'tour', title: 'Show the quick tour', group: 'Help', icon: 'help', run: () => showTour(0) },
);

function toggleOverlay(k: keyof typeof app.overlays): void {
  app.overlays[k] = !app.overlays[k];
  syncOverlayButtons();
  renderNow();
}

function syncOverlayButtons(): void {
  document
    .querySelectorAll<HTMLButtonElement>('[data-ov]')
    .forEach((b) => b.classList.toggle('on', app.overlays[b.dataset.ov as keyof typeof app.overlays]));
}

function setTool(t: 'move' | 'hand'): void {
  app.tool = t;
  document
    .querySelectorAll<HTMLButtonElement>('[data-tool]')
    .forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
  $('#stage').style.cursor = t === 'hand' ? 'grab' : '';
}

/** Tab / Shift+Tab through the elements of the scene at the playhead. */
function cycle(d: number): void {
  const si = app.selection?.kind === 'element' ? app.selection.scene : app.sceneIndexAt(clock.time);
  const n = app.scenes[si]?.elements?.length ?? 0;
  if (!n) return;
  const cur = app.selection?.kind === 'element' ? app.selection.index : d > 0 ? -1 : n;
  app.select({ kind: 'element', scene: si, index: (cur + d + n) % n });
}

// ------------------------------------------------------------------ keyboard
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (document.querySelector('dialog[open]')) return; // dialogs handle their own keys (Esc closes)
  const typing = t.matches(
    'input:not([type=checkbox]):not([type=range]), textarea, select, [contenteditable]',
  );
  if (typing) return;
  if (app.mode === 'cue' && cueKey(e, audio)) {
    e.preventDefault();
    renderNow();
    return;
  }
  // Space plays/pauses on release, so that Space+drag can pan the canvas without toggling playback.
  if (e.code === 'Space' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    return;
  }
  // arrow-key nudge of the selected element
  if (app.mode === 'edit' && hasEl() && !e.altKey && !e.metaKey && !e.ctrlKey && e.key.startsWith('Arrow')) {
    const d = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
    const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
    if (nudge(dx, dy)) {
      e.preventDefault();
      return;
    }
  }
  if (handleKey(e)) renderNow();
});

window.addEventListener('keyup', (e) => {
  if (e.code !== 'Space' || app.mode === 'cue' || document.querySelector('dialog[open]')) return;
  const t = e.target as HTMLElement;
  if (t.matches('input:not([type=checkbox]):not([type=range]), textarea, select, [contenteditable]')) return;
  if (consumeSpacePan()) return;
  clock.toggle();
  renderNow();
});

// ------------------------------------------------------------------ cross-module events
document.addEventListener(
  'rf:insert',
  (e) => void insertElement((e as CustomEvent<string>).detail, { time: clock.time }),
);
document.addEventListener('rf:goto', (e) => {
  const s = (e as CustomEvent<NonNullable<Selection>>).detail;
  app.select(s);
  let t: number | undefined;
  if (s.kind === 'scene') t = app.compiledScene(s.scene)?.start;
  if (s.kind === 'element') {
    const el = app.compiledElement(s.scene, s.index);
    if (el) t = el.enter.t + el.enter.dur;
  }
  if (s.kind === 'line') t = app.timeline?.script[s.index]?.start;
  if (t !== undefined) {
    seek(t);
    revealTime(t);
  }
});

// ------------------------------------------------------------------ context menus
$('#stage').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (app.mode !== 'edit') return;
  openContextMenu(
    e.clientX,
    e.clientY,
    hasEl()
      ? [
          'duplicate',
          'copy',
          'paste',
          '-',
          'forward',
          'backward',
          'front',
          'back-most',
          '-',
          'in',
          'out',
          'zoom-sel',
          '-',
          'delete',
        ]
      : ['paste', 'insert', 'add-scene', '-', 'fit', 'safe', 'boxes', 'stage'],
  );
});
$('#left').addEventListener('contextmenu', (e) => {
  if (!(e.target as HTMLElement).closest('.trow')) return;
  e.preventDefault();
  (e.target as HTMLElement).closest<HTMLElement>('.trow')?.click();
  openContextMenu(
    e.clientX,
    e.clientY,
    hasEl()
      ? ['duplicate', 'copy', 'paste', '-', 'forward', 'backward', '-', 'rename', 'delete']
      : ['add-scene', 'paste', '-', 'in', 'delete'],
  );
});
$('#timeline').addEventListener('contextmenu', (e) => {
  if (!(e.target as HTMLElement).closest('.clip')) return;
  e.preventDefault();
  openContextMenu(
    e.clientX,
    e.clientY,
    hasEl() ? ['in', 'out', '-', 'duplicate', 'delete'] : ['in', 'delete'],
  );
});

// ------------------------------------------------------------------ resizable panels
function splitter(
  id: string,
  cssVar: string,
  axis: 'x' | 'y',
  invert: boolean,
  min: number,
  max: number,
): void {
  const el = $(id);
  const key = `rf-${cssVar}`;
  try {
    const v = localStorage.getItem(key);
    if (v) document.documentElement.style.setProperty(`--${cssVar}`, v);
  } catch {
    /* storage unavailable */
  }
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const start = axis === 'x' ? e.clientX : e.clientY;
    const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--${cssVar}`));
    document.body.classList.add('resizing');
    const mv = (ev: PointerEvent) => {
      const d = (axis === 'x' ? ev.clientX : ev.clientY) - start;
      const v = Math.max(min, Math.min(max, cur + (invert ? -d : d)));
      document.documentElement.style.setProperty(`--${cssVar}`, `${v}px`);
    };
    const up = () => {
      el.removeEventListener('pointermove', mv);
      el.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
      try {
        localStorage.setItem(
          key,
          getComputedStyle(document.documentElement).getPropertyValue(`--${cssVar}`).trim(),
        );
      } catch {
        /* storage unavailable */
      }
    };
    el.addEventListener('pointermove', mv);
    el.addEventListener('pointerup', up);
  });
}

// ------------------------------------------------------------------ onboarding
const TOUR = [
  [
    'Welcome to the ReelForge editor',
    'Your episode is on the canvas. Click anything to select it, drag to move it, double-click text to edit it in place.',
  ],
  [
    'Layers, components and script',
    'The left panel lists every scene and element. “Insert” has 21 animated components: click one, or drag it onto the canvas.',
  ],
  [
    'Inspector',
    'Every property of the selection is on the right: text, colors, size, animation, effects. Times can be anchored to a spoken word.',
  ],
  [
    'Timeline',
    'Drag clips to change when things appear. They snap to the words in your recording. Press I / O to set in and out points at the playhead.',
  ],
  [
    'Shortcuts everywhere',
    'Press ⌘K / Ctrl+K to search every command, ? for all shortcuts. Every change is saved to episode.yaml and can be undone.',
  ],
];

function showTour(i: number): void {
  const box = $('#tour');
  if (i >= TOUR.length) {
    box.hidden = true;
    try {
      localStorage.setItem('rf-tour', 'done');
    } catch {
      /* storage unavailable */
    }
    return;
  }
  box.hidden = false;
  box.querySelector('h4')!.textContent = TOUR[i][0];
  box.querySelector('p')!.textContent = TOUR[i][1];
  box.querySelector('.steps')!.textContent = `${i + 1} / ${TOUR.length}`;
  box.querySelector<HTMLButtonElement>('.next')!.textContent =
    i === TOUR.length - 1 ? 'Start editing' : 'Next';
  box.querySelector<HTMLButtonElement>('.next')!.onclick = () => showTour(i + 1);
  box.querySelector<HTMLButtonElement>('.skip')!.onclick = () => showTour(TOUR.length);
  box.dataset.step = String(i);
}

function maybeOnboard(): void {
  try {
    if (localStorage.getItem('rf-tour') !== 'done' && !navigator.webdriver) showTour(0);
  } catch {
    /* storage unavailable */
  }
}

// ------------------------------------------------------------------ wiring & boot
$('#play').addEventListener('click', () => (clock.toggle(), renderNow()));
$('#startBtn').addEventListener('click', () => seek(0));
$('#endBtn').addEventListener('click', () => seek(app.duration));
$('#backBtn').addEventListener('click', () => step(-1));
$('#fwdBtn').addEventListener('click', () => step(1));
$('#undoBtn').addEventListener('click', () => void app.undo());
$('#redoBtn').addEventListener('click', () => void app.undo(true));
$('#paletteBtn').addEventListener('click', () => openPalette());
$('#helpBtn').addEventListener('click', openHelp);
$('#renderBtn').addEventListener('click', openRenderDialog);
$('#issuesPill').addEventListener('click', () => setMode('dev'));
$('#fitBtn').addEventListener('click', fit);
$('#zoomLabel').addEventListener('click', zoom100);
document
  .querySelectorAll<HTMLButtonElement>('[data-ov]')
  .forEach((b) =>
    b.addEventListener('click', () => toggleOverlay(b.dataset.ov as keyof typeof app.overlays)),
  );
document
  .querySelectorAll<HTMLButtonElement>('[data-tool]')
  .forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool as 'move' | 'hand')));
document
  .querySelectorAll<HTMLButtonElement>('#modes button')
  .forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode as Mode)));
document
  .querySelectorAll<HTMLButtonElement>('#speed button')
  .forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));
document.querySelectorAll<HTMLDialogElement>('dialog').forEach((d) =>
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  }),
);
document
  .querySelectorAll<HTMLButtonElement>('[data-close]')
  .forEach((b) => b.addEventListener('click', () => b.closest('dialog')?.close()));
$<HTMLDialogElement>('#outputsDlg').addEventListener('close', () => $<HTMLVideoElement>('#outVideo').pause());

initCanvas({
  stage: $('#stage'),
  viewport: $('#viewport'),
  iframe,
  overlay: $('#overlay') as unknown as SVGSVGElement,
  runtime: () => runtime,
  time,
  redraw: renderNow,
});
initTimeline({ root: $('#timeline'), time, seek, redraw: renderNow, playing: () => clock.isPlaying });
initPanels({ time, seek });
initInspector({ time, seek, setMode, preview });
initCuePanel({ time, seek, redraw: renderNow });
initReview();
splitter('#splitL', 'left-w', 'x', false, 200, 520);
splitter('#splitR', 'right-w', 'x', true, 260, 560);
splitter('#splitB', 'timeline-h', 'y', true, 150, 620);
syncOverlayButtons();
setTool('move');
setSpeed(1);

const prevJob = { status: '' };
setInterval(() => {
  const s = app.state?.job?.status ?? '';
  if (s !== prevJob.status) {
    prevJob.status = s;
    onJobEvent();
  }
}, 300);

fetch('/api/meta')
  .then((r) => r.json())
  .then((m) => {
    app.meta = m;
    renderAll();
  })
  .catch(() => toast('Could not load the component catalog', 'err'));
connect();
requestAnimationFrame(loop);
// Automation hook (screenshots, tests, browser agents): seek and read the playhead.
(window as unknown as { reelforgeStudio: object }).reelforgeStudio = { seek, time, setMode, fit };
