/**
 * Premiere-style multi-track timeline: ruler with chapters, scenes, script lines (cues), one track per
 * layer and the voice waveform with sound effects. Clips are dragged with magnetic snapping to
 * words, lines, scenes and the playhead, and saved as voice-anchored time expressions.
 */
import type { TElement } from '@reelforge/core';
import { effectiveCues, putCues } from './actions.js';
import { app, esc, fmt, h, type EditOp } from './app.js';
import { COMPONENT_ICON, icon } from './icons.js';
import { exprFor, nearestSnap, type SnapPoint } from './timeexpr.js';
import type { DecodedAudio } from './wave.js';

const HEAD = 132;
const ROW = { ruler: 26, scenes: 28, script: 34, layer: 30, audio: 64 };

interface Ctx {
  root: HTMLElement;
  time: () => number;
  seek: (t: number) => void;
  redraw: () => void;
  playing: () => boolean;
}

let ctx!: Ctx;
let pps = 60;
let fitted = true;
let env: Float32Array | null = null; // max |sample| per 1/200 s
const ENV_RATE = 200;
let scroll!: HTMLElement;
let content!: HTMLElement;
let playhead!: HTMLElement;
let rulerCanvas!: HTMLCanvasElement;
let waveCanvas!: HTMLCanvasElement;
let badge!: HTMLElement;
let snapLine!: HTMLElement;
let dragging = false;

export function initTimeline(c: Ctx): void {
  ctx = c;
  c.root.innerHTML = `
    <div class="tl-toolbar">
      <button class="tbtn" id="tlSnap" title="Snapping (S)">${icon('magnet')}</button>
      <span class="sep"></span>
      <button class="tbtn" id="tlOut" title="Zoom out (-)">${icon('zoomout')}</button>
      <input type="range" id="tlZoom" min="0" max="1000" value="200" aria-label="Timeline zoom" />
      <button class="tbtn" id="tlIn" title="Zoom in (=)">${icon('zoomin')}</button>
      <button class="tbtn" id="tlFit" title="Fit the whole episode (\\)">${icon('fit')}</button>
      <span class="sep"></span>
      <span class="tl-hint">Drag clips to retime · they snap to words · <kbd>I</kbd>/<kbd>O</kbd> set in/out at the playhead</span>
      <span class="spacer"></span>
      <span class="tl-tc mono" id="tlTc">0:00:00</span>
    </div>
    <div class="tl-scroll" tabindex="-1"><div class="tl-content"></div></div>`;
  scroll = c.root.querySelector('.tl-scroll')!;
  content = c.root.querySelector('.tl-content')!;
  scroll.addEventListener('scroll', () => {
    drawRuler();
    drawWave();
  });
  scroll.addEventListener(
    'wheel',
    (e) => {
      if (!(e.ctrlKey || e.metaKey || e.altKey)) return;
      e.preventDefault();
      const r = scroll.getBoundingClientRect();
      const mx = e.clientX - r.left - HEAD;
      const t = (scroll.scrollLeft + mx) / pps;
      setPps(pps * Math.exp(-e.deltaY * 0.003));
      scroll.scrollLeft = t * pps - mx;
    },
    { passive: false },
  );
  c.root.querySelector('#tlSnap')!.addEventListener('click', () => toggleSnap());
  c.root.querySelector('#tlIn')!.addEventListener('click', () => zoomTimeline(1.5));
  c.root.querySelector('#tlOut')!.addEventListener('click', () => zoomTimeline(1 / 1.5));
  c.root.querySelector('#tlFit')!.addEventListener('click', () => fitTimeline());
  const slider = c.root.querySelector<HTMLInputElement>('#tlZoom')!;
  slider.addEventListener('input', () => {
    const mid = scroll.scrollLeft + (scroll.clientWidth - HEAD) / 2;
    const t = mid / pps;
    setPps(sliderToPps(Number(slider.value)), false);
    scroll.scrollLeft = t * pps - (scroll.clientWidth - HEAD) / 2;
  });
  new ResizeObserver(() => {
    if (fitted) fitTimeline();
    else {
      drawRuler();
      drawWave();
    }
  }).observe(scroll);
  syncSnap();
}

const minPps = () => Math.max(2, (scroll.clientWidth - HEAD - 24) / Math.max(1, app.duration));
const sliderToPps = (v: number) => minPps() * Math.pow(400 / minPps(), v / 1000);
const ppsToSlider = (p: number) => (Math.log(p / minPps()) / Math.log(400 / minPps())) * 1000;

function setPps(p: number, updateSlider = true): void {
  pps = Math.max(minPps(), Math.min(400, p));
  fitted = Math.abs(pps - minPps()) < 0.01;
  if (updateSlider) (ctx.root.querySelector('#tlZoom') as HTMLInputElement).value = String(ppsToSlider(pps));
  renderTimeline();
}

export function zoomTimeline(k: number): void {
  const t = ctx.time();
  setPps(pps * k);
  scroll.scrollLeft = t * pps - (scroll.clientWidth - HEAD) / 2;
}

export function fitTimeline(): void {
  setPps(minPps());
  fitted = true;
  scroll.scrollLeft = 0;
}

export function toggleSnap(): void {
  app.snap = !app.snap;
  syncSnap();
}

function syncSnap(): void {
  ctx.root.querySelector('#tlSnap')?.classList.toggle('on', app.snap);
}

export function setTimelineAudio(a: DecodedAudio | null): void {
  env = null;
  if (a) {
    const n = Math.ceil(a.duration * ENV_RATE);
    env = new Float32Array(n);
    const per = a.sampleRate / ENV_RATE;
    let peak = 1e-6;
    for (let i = 0; i < n; i++) {
      let m = 0;
      const end = Math.min(a.mono.length, Math.floor((i + 1) * per));
      for (let k = Math.floor(i * per); k < end; k++) {
        const v = Math.abs(a.mono[k]);
        if (v > m) m = v;
      }
      env[i] = m;
      if (m > peak) peak = m;
    }
    for (let i = 0; i < n; i++) env[i] /= peak;
  }
  drawWave();
}

// ------------------------------------------------------------------ render
const x = (t: number) => t * pps;

interface Row {
  key: string;
  label: string;
  icon: string;
  height: number;
  cls: string;
}

let hold = false;

/** Selects from a timeline clip without rebuilding the clips under the pointer. */
function selectFromClip(clip: HTMLElement, sel: Parameters<typeof app.select>[0]): void {
  content.querySelectorAll('.clip.sel').forEach((c) => c.classList.remove('sel'));
  clip.classList.add('sel');
  hold = true;
  app.select(sel);
  hold = false;
}

export function renderTimeline(): void {
  if (!content || hold || dragging) return;
  const tl = app.timeline;
  const dur = app.duration;
  const width = Math.ceil(dur * pps) + 40;
  const layers = Math.max(1, ...app.scenes.map((s) => s.elements?.length ?? 0));
  const rows: Row[] = [
    { key: 'scenes', label: 'Scenes', icon: 'scene', height: ROW.scenes, cls: 'scenes' },
    { key: 'script', label: 'Script', icon: 'script', height: ROW.script, cls: 'script' },
  ];
  for (let j = layers - 1; j >= 0; j--)
    rows.push({ key: `layer${j}`, label: `Layer ${j + 1}`, icon: 'layers', height: ROW.layer, cls: 'layer' });
  rows.push({ key: 'audio', label: 'Voice', icon: 'mic', height: ROW.audio, cls: 'audio' });

  const frag = document.createDocumentFragment();
  // ruler
  const ruler = h(
    'div',
    { class: 'tl-row tl-ruler-row' },
    h('div', { class: 'tl-head corner' }, h('span', { class: 'mono dim', text: fmt(dur) })),
  );
  const rulerLane = h('div', { class: 'tl-lane ruler', style: `width:${width}px;height:${ROW.ruler}px` });
  rulerCanvas = h('canvas', { class: 'tl-ruler-canvas' });
  rulerLane.append(rulerCanvas);
  for (const ch of tl?.chapters ?? [])
    rulerLane.append(
      h('div', { class: 'tl-chapter', style: `left:${x(ch.t)}px`, title: `Chapter: ${ch.label}` }, ch.label),
    );
  ruler.append(rulerLane);
  rulerLane.addEventListener('pointerdown', (e) => scrub(e, rulerLane));
  frag.append(ruler);

  for (const r of rows) {
    const head = h('div', { class: 'tl-head' });
    head.innerHTML = `${icon(r.icon, 14)}<span>${esc(r.label)}</span>`;
    const lane = h('div', { class: `tl-lane ${r.cls}`, style: `width:${width}px;height:${r.height}px` });
    lane.dataset.key = r.key;
    lane.addEventListener('pointerdown', (e) => {
      if (e.target === lane) scrub(e, lane);
    });
    if (r.key === 'scenes') fillScenes(lane);
    else if (r.key === 'script') fillScript(lane);
    else if (r.key === 'audio') fillAudio(lane);
    else fillLayer(lane, Number(r.key.slice(5)));
    frag.append(h('div', { class: `tl-row ${r.cls}` }, head, lane));
  }
  playhead = h('div', { class: 'tl-playhead' }, h('i'));
  snapLine = h('div', { class: 'tl-snapline', hidden: true });
  badge = h('div', { class: 'tl-badge', hidden: true });
  content.replaceChildren(frag, playhead, snapLine, badge);
  content.style.width = `${width + HEAD}px`;
  drawRuler();
  drawWave();
  updatePlayhead(ctx.time());
}

function scrub(e: PointerEvent, lane: HTMLElement): void {
  if (e.button !== 0) return;
  const move = (ev: PointerEvent) => {
    const r = lane.getBoundingClientRect();
    ctx.seek(Math.max(0, Math.min(app.duration, (ev.clientX - r.left) / pps)));
  };
  move(e);
  lane.setPointerCapture(e.pointerId);
  lane.onpointermove = move;
  lane.onpointerup = () => {
    lane.onpointermove = null;
    lane.onpointerup = null;
  };
}

function fillScenes(lane: HTMLElement): void {
  const tl = app.timeline;
  if (!tl) return;
  app.scenes.forEach((s, si) => {
    const c = tl.scenes.find((x) => x.id === s.id);
    if (!c) return;
    const sel = app.selection?.kind === 'scene' && app.selection.scene === si;
    const clip = h('div', {
      class: `clip scene${sel ? ' sel' : ''}`,
      style: `left:${x(c.start)}px;width:${Math.max(4, x(c.end - c.start))}px`,
      title: `Scene ${s.id} · ${fmt(c.start)}–${fmt(c.end)} · at: ${s.at}`,
    });
    clip.innerHTML = `<span class="grip l"></span><b>${esc(s.id)}</b><small>${esc(String(s.at))}</small>`;
    clip.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      selectFromClip(clip, { kind: 'scene', scene: si });
      if (si === 0) return; // the first scene always starts the episode
      const prev = tl.scenes[tl.scenes.indexOf(c) - 1];
      startDrag(e, clip, {
        t0: c.start,
        min: prev ? prev.start + 0.2 : 0,
        max: c.end - 0.2,
        kinds: ['word', 'line'],
        apply: (t) => {
          clip.style.left = `${x(t)}px`;
          clip.style.width = `${x(c.end - t)}px`;
        },
        commit: (t) =>
          app.edit([{ op: 'set', path: ['scenes', si, 'at'], value: exprFor(t) }], `Scene ${s.id} start`),
      });
    });
    clip.addEventListener('dblclick', () => ctx.seek(c.start));
    lane.append(clip);
  });
}

function fillScript(lane: HTMLElement): void {
  const tl = app.timeline;
  if (!tl) return;
  const marked = app.state?.cues?.cues ?? {};
  const draft = !app.state?.cues || Object.keys(marked).length === 0;
  const cues = effectiveCues();
  tl.script.forEach((l, i) => {
    const sel = app.selection?.kind === 'line' && app.selection.index === i;
    const end = tl.script[i + 1]?.start ?? app.duration;
    const clip = h('div', {
      class: `clip line${sel ? ' sel' : ''}${draft ? ' draft' : ''}`,
      style: `left:${x(l.start)}px;width:${Math.max(4, x(end - l.start) - 2)}px`,
      title: `${l.id} · ${fmt(l.start)} · ${l.text}`,
      dir: 'auto',
    });
    clip.innerHTML = `<span class="grip l"></span><em>${esc(l.id)}</em><span class="tx" dir="auto">${esc(l.text)}</span>`;
    if (pps > 70)
      l.words
        .slice(1)
        .forEach((w) =>
          clip.append(h('i', { class: 'wtick', style: `left:${x(w.start - l.start)}px`, title: w.text })),
        );
    clip.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      selectFromClip(clip, { kind: 'line', index: i });
      if (app.mode === 'dev') return;
      const prev = tl.script[i - 1];
      startDrag(e, clip, {
        t0: l.start,
        min: prev ? prev.start + 0.1 : 0,
        max: end - 0.1,
        kinds: ['playhead'],
        apply: (t) => {
          clip.style.left = `${x(t)}px`;
          clip.style.width = `${Math.max(4, x(end - t) - 2)}px`;
        },
        commit: async (t) => {
          const next = { ...cues, [l.id]: Math.round(t * 1000) / 1000 };
          const words = { ...(app.state?.cues?.words ?? {}) };
          if (words[l.id]) words[l.id] = words[l.id].map((w) => Math.round((w + t - l.start) * 1000) / 1000);
          await putCues(next, words);
        },
      });
    });
    clip.addEventListener('dblclick', () => ctx.seek(l.start));
    lane.append(clip);
  });
}

function elementEnd(e: TElement, sceneEnd: number): number {
  return e.exit ? e.exit.t + e.exit.dur : sceneEnd;
}

function fillLayer(lane: HTMLElement, j: number): void {
  const tl = app.timeline;
  if (!tl) return;
  app.scenes.forEach((s, si) => {
    const spec = s.elements?.[j];
    const c = tl.scenes.find((x) => x.id === s.id);
    if (!spec || !c) return;
    const id = app.elementId(si, j);
    const e = c.elements.find((x) => x.id === id);
    if (!e) return;
    const sel = app.selection?.kind === 'element' && app.selection.scene === si && app.selection.index === j;
    const end = Math.min(elementEnd(e, c.end), c.end);
    const clip = h('div', {
      class: `clip el c-${spec.use}${sel ? ' sel' : ''}`,
      style: `left:${x(e.enter.t)}px;width:${Math.max(6, x(end - e.enter.t))}px`,
      title: `${id} (${spec.use})\nenter: ${String(spec.enter?.at ?? 'scene start')}${spec.exit ? `\nexit: ${String(spec.exit.at)}` : ''}`,
    });
    clip.innerHTML = `<span class="grip l"></span>${icon(COMPONENT_ICON[spec.use] ?? 'box', 13)}<span class="nm">${esc(id)}</span><span class="grip r"></span>`;
    clip.append(
      h('i', { class: 'enter-bar', style: `width:${Math.min(x(e.enter.dur), x(end - e.enter.t))}px` }),
    );
    for (const f of e.fx)
      clip.append(
        h('i', { class: 'kf fx', style: `left:${x(f.t - e.enter.t)}px`, title: `${f.do} at ${fmt(f.t)}` }),
      );
    for (const st of e.states)
      clip.append(
        h('i', { class: 'kf st', style: `left:${x(st.t - e.enter.t)}px`, title: `state at ${fmt(st.t)}` }),
      );
    clip.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      selectFromClip(clip, { kind: 'element', scene: si, index: j });
      if (app.mode !== 'edit') return;
      const edge = (ev.target as HTMLElement).classList.contains('r')
        ? 'r'
        : (ev.target as HTMLElement).classList.contains('l')
          ? 'l'
          : 'body';
      const base = ['scenes', si, 'elements', j];
      const len = end - e.enter.t;
      if (edge === 'r') {
        startDrag(ev, clip, {
          t0: end,
          min: e.enter.t + 0.1,
          max: c.end,
          kinds: ['word', 'line', 'scene'],
          apply: (t) => {
            clip.style.width = `${Math.max(6, x(t - e.enter.t))}px`;
          },
          commit: (t) =>
            app.edit(
              t >= c.end - 0.02
                ? [{ op: 'delete', path: [...base, 'exit'] }]
                : [
                    {
                      op: 'set',
                      path: [...base, 'exit', 'at'],
                      value: exprFor(Math.max(e.enter.t, t - (e.exit?.dur ?? 0.3))),
                    },
                  ],
              `Exit of ${id}`,
            ),
        });
        return;
      }
      const original = e.enter.t;
      const origExit = e.exit?.t;
      startDrag(ev, clip, {
        t0: e.enter.t,
        min: c.start,
        max: edge === 'l' ? end - 0.1 : c.end - Math.min(len, 0.2),
        kinds: ['word', 'line', 'scene', 'playhead'],
        apply: (t) => {
          clip.style.left = `${x(t)}px`;
          if (edge === 'l') clip.style.width = `${Math.max(6, x(end - t))}px`;
          // live preview: the runtime reads these objects directly
          e.enter.t = t;
          if (edge === 'body' && e.exit && origExit !== undefined) e.exit.t = origExit + (t - original);
          ctx.redraw();
        },
        cancel: () => {
          e.enter.t = original;
          if (e.exit && origExit !== undefined) e.exit.t = origExit;
          ctx.redraw();
        },
        commit: (t) => {
          const ops: EditOp[] = [{ op: 'set', path: [...base, 'enter', 'at'], value: exprFor(t) }];
          if (edge === 'body' && spec.exit && origExit !== undefined)
            ops.push({
              op: 'set',
              path: [...base, 'exit', 'at'],
              value: exprFor(Math.min(c.end, origExit + (t - original))),
            });
          return app.edit(ops, `Retime ${id}`);
        },
      });
    });
    clip.addEventListener('dblclick', () => ctx.seek(Math.min(end, e.enter.t + e.enter.dur)));
    lane.append(clip);
  });
}

function fillAudio(lane: HTMLElement): void {
  waveCanvas = h('canvas', { class: 'tl-wave' });
  lane.append(waveCanvas);
  if (!app.state?.voice)
    lane.append(
      h(
        'div',
        { class: 'tl-empty' },
        'No voice recording yet — upload one from the dashboard, or keep editing with estimated timing',
      ),
    );
  for (const s of app.timeline?.sfx ?? [])
    lane.append(
      h('i', { class: 'sfx', style: `left:${x(s.t)}px`, title: `${s.sound} (${s.source}) at ${fmt(s.t)}` }),
    );
}

// ------------------------------------------------------------------ drag
interface DragSpec {
  t0: number;
  min: number;
  max: number;
  kinds: SnapPoint['kind'][];
  apply: (t: number) => void;
  commit: (t: number) => unknown;
  cancel?: () => void;
}

function startDrag(e: PointerEvent, el: HTMLElement, d: DragSpec): void {
  if (e.button !== 0) return;
  const x0 = e.clientX;
  let moved = false;
  let t = d.t0;
  dragging = true;
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    /* element re-rendered */
  }
  el.classList.add('dragging');
  const extra: SnapPoint[] = [{ t: ctx.time(), expr: '', label: 'playhead', kind: 'playhead' }];
  const onMove = (ev: PointerEvent) => {
    if (!moved && Math.abs(ev.clientX - x0) < 3) return;
    moved = true;
    let nt = d.t0 + (ev.clientX - x0) / pps;
    let snapped: SnapPoint | null = null;
    if (app.snap && !ev.altKey) {
      snapped = nearestSnap(nt, 8 / pps, extra);
      if (snapped && !d.kinds.includes(snapped.kind)) snapped = null;
      if (snapped) nt = snapped.t;
    }
    t = Math.max(d.min, Math.min(d.max, nt));
    d.apply(t);
    const lx = x(t) + HEAD;
    snapLine.hidden = !snapped;
    snapLine.style.left = `${lx}px`;
    badge.hidden = false;
    badge.style.left = `${lx + 8}px`;
    badge.style.top = `${el.offsetTop + (el.parentElement?.parentElement?.offsetTop ?? 0) - 26}px`;
    badge.textContent = `${fmt(t)} · ${snapped ? snapped.label : exprFor(t)}`;
  };
  const end = (ev: PointerEvent) => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', end);
    el.removeEventListener('pointercancel', end);
    el.classList.remove('dragging');
    snapLine.hidden = true;
    badge.hidden = true;
    dragging = false;
    if (!moved || ev.type === 'pointercancel') {
      if (moved) d.cancel?.();
      renderTimeline();
      return;
    }
    void Promise.resolve(d.commit(t)).then((ok) => {
      if (ok === false) {
        d.cancel?.();
        renderTimeline();
      }
    });
  };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

// ------------------------------------------------------------------ drawing
function fitCanvas(c: HTMLCanvasElement, w: number, hgt: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hgt * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(hgt * dpr);
    c.style.width = `${w}px`;
    c.style.height = `${hgt}px`;
  }
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;
}

function visibleRange(): [number, number, number] {
  const w = Math.max(10, scroll.clientWidth - HEAD);
  const t0 = scroll.scrollLeft / pps;
  return [t0, t0 + w / pps, w];
}

function drawRuler(): void {
  if (!rulerCanvas) return;
  const [t0, t1, w] = visibleRange();
  rulerCanvas.style.left = `${scroll.scrollLeft}px`;
  const g = fitCanvas(rulerCanvas, w, ROW.ruler);
  g.clearRect(0, 0, w, ROW.ruler);
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60];
  const major = steps.find((s) => s * pps >= 70) ?? 60;
  const minor =
    steps
      .slice()
      .reverse()
      .find((s) => s < major && s * pps >= 10) ?? major / 5;
  g.font = '10px Inter, system-ui, sans-serif';
  g.textBaseline = 'top';
  for (let t = Math.floor(t0 / minor) * minor; t <= t1; t += minor) {
    const px = (t - t0) * pps;
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    g.fillStyle = isMajor ? '#5b6378' : '#2c3242';
    g.fillRect(Math.round(px), isMajor ? 12 : 18, 1, isMajor ? 14 : 8);
    if (isMajor) {
      g.fillStyle = '#8a91a3';
      const m = Math.floor(t / 60);
      const s = t - m * 60;
      g.fillText(
        major < 1
          ? `${m}:${s.toFixed(1).padStart(4, '0')}`
          : `${m}:${String(Math.round(s)).padStart(2, '0')}`,
        Math.round(px) + 4,
        2,
      );
    }
  }
}

function drawWave(): void {
  if (!waveCanvas) return;
  const [t0, t1, w] = visibleRange();
  const hgt = ROW.audio;
  waveCanvas.style.left = `${scroll.scrollLeft}px`;
  const g = fitCanvas(waveCanvas, w, hgt);
  g.clearRect(0, 0, w, hgt);
  const mid = hgt / 2;
  if (!env) return;
  g.fillStyle = 'rgba(85,220,255,0.55)';
  for (let px = 0; px < w; px++) {
    const a = t0 + px / pps;
    const b = Math.min(t1, a + 1 / pps);
    const i0 = Math.floor(a * ENV_RATE);
    const i1 = Math.max(i0 + 1, Math.floor(b * ENV_RATE));
    let m = 0;
    for (let i = i0; i < i1 && i < env.length; i++) if (env[i] > m) m = env[i];
    const v = Math.sqrt(m) * (mid - 4);
    g.fillRect(px, mid - v, 1, v * 2 || 1);
  }
}

export function updatePlayhead(t: number): void {
  if (!playhead) return;
  playhead.style.transform = `translateX(${HEAD + x(t)}px)`;
  const tc = ctx.root.querySelector('#tlTc');
  if (tc) tc.textContent = fmt(t, true);
  // keep the playhead in view while playing
  if (ctx.playing()) {
    const left = scroll.scrollLeft;
    const w = scroll.clientWidth - HEAD;
    const px = x(t);
    if (px > left + w - 40 || px < left) scroll.scrollLeft = px - 60;
  }
}

/** Scrolls the timeline so time t is visible. */
export function revealTime(t: number): void {
  const w = scroll.clientWidth - HEAD;
  const px = x(t);
  if (px < scroll.scrollLeft || px > scroll.scrollLeft + w - 20) scroll.scrollLeft = px - w / 3;
}
