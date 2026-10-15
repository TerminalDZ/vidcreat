/** Waveform + timeline canvases: overview (scenes, chapters, cues) and zoomed cue strip. */
import { peaks } from '@reelforge/audio';
import type { Timeline } from '@reelforge/core';

export interface DecodedAudio {
  mono: Float32Array;
  sampleRate: number;
  duration: number;
}

export async function decodeAudio(url: string): Promise<DecodedAudio | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const audio = await ctx.decodeAudioData(buf);
    const mono = new Float32Array(audio.length);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const d = audio.getChannelData(c);
      for (let i = 0; i < d.length; i++) mono[i] += d[i] / audio.numberOfChannels;
    }
    return { mono, sampleRate: audio.sampleRate, duration: audio.duration };
  } catch {
    return null;
  }
}

const COLORS = {
  line: '#222735',
  dim: '#7d8496',
  ink: '#eef1f7',
  lime: '#b8ff3c',
  cyan: '#55dcff',
  red: '#ff4a5c',
};

function fit(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight || Number(canvas.getAttribute('height'));
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export interface Marks {
  cues: { id: string; t: number; selected: boolean }[];
  words: number[];
}

export class Waves {
  audio: DecodedAudio | null = null;
  private overviewPeaks: Float32Array | null = null;
  zoomWindow = 3; // seconds each side of the playhead

  constructor(
    readonly overview: HTMLCanvasElement,
    readonly zoom: HTMLCanvasElement,
    private seek: (t: number) => void,
  ) {
    const drag = (canvas: HTMLCanvasElement, toTime: (x: number) => number) => {
      let down = false;
      const go = (e: PointerEvent) => this.seek(toTime(e.clientX - canvas.getBoundingClientRect().left));
      canvas.addEventListener('pointerdown', (e) => {
        down = true;
        canvas.setPointerCapture(e.pointerId);
        go(e);
      });
      canvas.addEventListener('pointermove', (e) => down && go(e));
      canvas.addEventListener('pointerup', () => (down = false));
    };
    drag(overview, (x) => (x / overview.clientWidth) * this.duration);
    drag(zoom, (x) => this.lastT + ((x / zoom.clientWidth) * 2 - 1) * this.zoomWindow);
  }

  duration = 1;
  private lastT = 0;

  setAudio(a: DecodedAudio | null): void {
    this.audio = a;
    this.overviewPeaks = a ? peaks(a.mono, 1600) : null;
  }

  draw(t: number, tl: Timeline | null, marks: Marks, mode: 'cue' | 'dev'): void {
    this.lastT = t;
    this.drawOverview(t, tl, marks);
    if (mode === 'cue') this.drawZoom(t, marks);
  }

  private drawOverview(t: number, tl: Timeline | null, marks: Marks): void {
    const ctx = fit(this.overview);
    const W = this.overview.clientWidth;
    const H = this.overview.clientHeight;
    const D = this.duration;
    const X = (s: number) => (s / D) * W;
    ctx.clearRect(0, 0, W, H);
    // scenes
    if (tl) {
      tl.scenes.forEach((s, i) => {
        ctx.fillStyle = i % 2 ? 'rgba(85,220,255,0.07)' : 'rgba(199,146,255,0.07)';
        ctx.fillRect(X(s.start), 0, X(s.end) - X(s.start), 18);
        ctx.fillStyle = COLORS.dim;
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillText(s.id, X(s.start) + 4, 12, Math.max(0, X(s.end) - X(s.start) - 6));
      });
      for (const ch of tl.chapters) {
        ctx.fillStyle = COLORS.lime;
        ctx.fillRect(X(ch.t), 0, 2, H);
      }
    }
    // waveform
    const p = this.overviewPeaks;
    const mid = 18 + (H - 18) / 2;
    if (p) {
      ctx.fillStyle = '#3a4156';
      const step = W / p.length;
      for (let i = 0; i < p.length; i++) {
        const a = p[i] * (H - 22) * 0.5;
        ctx.fillRect(i * step, mid - a, Math.max(1, step - 0.2), a * 2 || 1);
      }
    } else if (tl) {
      ctx.fillStyle = '#2a3042';
      const env = tl.audio.envelope;
      for (let x = 0; x < W; x += 2) {
        const v = env[Math.floor((x / W) * env.length)] ?? 0;
        ctx.fillRect(x, mid - v * 20, 1.5, v * 40 || 1);
      }
    }
    for (const c of marks.cues) {
      ctx.fillStyle = c.selected ? COLORS.cyan : 'rgba(184,255,60,0.7)';
      ctx.fillRect(X(c.t), 18, 1, H - 18);
    }
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(X(t) - 1, 0, 2, H);
  }

  private drawZoom(t: number, marks: Marks): void {
    const ctx = fit(this.zoom);
    const W = this.zoom.clientWidth;
    const H = this.zoom.clientHeight;
    const a = t - this.zoomWindow;
    const span = this.zoomWindow * 2;
    const X = (s: number) => ((s - a) / span) * W;
    ctx.clearRect(0, 0, W, H);
    // second grid
    ctx.fillStyle = COLORS.line;
    ctx.font = '10px ui-monospace, monospace';
    for (let s = Math.ceil(a * 2) / 2; s < a + span; s += 0.5) {
      ctx.fillRect(X(s), 0, 1, H);
      if (Number.isInteger(s) && s >= 0) {
        ctx.fillStyle = COLORS.dim;
        ctx.fillText(`${s}s`, X(s) + 3, H - 4);
        ctx.fillStyle = COLORS.line;
      }
    }
    const au = this.audio;
    if (au) {
      const mid = H / 2;
      ctx.fillStyle = '#55657f';
      const spp = (span * au.sampleRate) / W;
      for (let x = 0; x < W; x++) {
        const i0 = Math.floor((a + (x / W) * span) * au.sampleRate);
        let m = 0;
        for (let i = Math.max(0, i0); i < Math.min(au.mono.length, i0 + spp); i++)
          m = Math.max(m, Math.abs(au.mono[i]));
        const hgt = m * (H - 20) * 0.5;
        ctx.fillRect(x, mid - hgt, 1, hgt * 2 || 1);
      }
    }
    for (const w of marks.words) {
      ctx.fillStyle = 'rgba(85,220,255,0.6)';
      ctx.fillRect(X(w), 10, 1, H - 20);
    }
    for (const c of marks.cues) {
      const x = X(c.t);
      if (x < -40 || x > W + 40) continue;
      ctx.fillStyle = c.selected ? COLORS.cyan : COLORS.lime;
      ctx.fillRect(x, 0, 2, H);
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillText(c.id, x + 4, 12);
    }
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(W / 2 - 1, 0, 2, H);
  }
}
