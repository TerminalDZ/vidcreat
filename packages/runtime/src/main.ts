/**
 * Runtime page entry. Exposes window.reelforge (FR-RT-1):
 *   { ready, render(t), duration, load(timeline), measure(), boxes(t), fonts }
 * Load a timeline with `runtime.html?timeline=<url>` or by calling `reelforge.load(tl)`.
 */
import type { Timeline } from '@reelforge/core';
import { Engine, type MeasureResult } from './engine.js';
import { loadFonts } from './fonts.js';

export interface ReelforgeApi {
  ready: Promise<void>;
  duration: number;
  fonts: { ok: boolean; missing: string[] };
  timeline: Timeline | null;
  render(t: number): void;
  load(tl: Timeline): Promise<void>;
  measure(): MeasureResult;
  boxes(t: number): ReturnType<Engine['boxes']>;
  error: string | null;
}

declare global {
  interface Window {
    reelforge: ReelforgeApi;
    __REELFORGE_TIMELINE__?: Timeline;
  }
}

let engine: Engine | null = null;
const host = document.getElementById('app') ?? document.body;
const fontsReady = loadFonts();

const api: ReelforgeApi = {
  ready: Promise.resolve(),
  duration: 0,
  fonts: { ok: false, missing: [] },
  timeline: null,
  error: null,
  render(t: number) {
    engine?.render(t);
  },
  async load(tl: Timeline) {
    api.fonts = await fontsReady;
    engine = new Engine(tl, host);
    api.timeline = tl;
    api.duration = tl.duration;
    engine.render(0);
  },
  measure() {
    if (!engine) throw new Error('No timeline loaded');
    return engine.measure();
  },
  boxes(t: number) {
    return engine ? engine.boxes(t) : [];
  },
};

api.ready = (async () => {
  api.fonts = await fontsReady;
  const url = new URLSearchParams(location.search).get('timeline');
  try {
    if (window.__REELFORGE_TIMELINE__) await api.load(window.__REELFORGE_TIMELINE__);
    else if (url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Cannot load timeline (${res.status})`);
      await api.load((await res.json()) as Timeline);
    }
  } catch (e) {
    api.error = (e as Error).message;
    throw e;
  }
})();

window.reelforge = api;
