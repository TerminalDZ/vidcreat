/** One render at a time, shared by the dashboard and the editors it opens; progress goes to listeners. */
import type { PcmAudio } from '@reelforge/audio';
import type { EpisodePaths, Issue } from '@reelforge/core';
import { renderEpisode, type Progress } from '@reelforge/renderer';

export interface Job {
  id: number;
  key: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  phase: string;
  done: number;
  total: number;
  fps?: number;
  eta?: number;
  started: number;
  finished?: number;
  message?: string;
  issues?: Issue[];
}

export interface RenderOptions {
  preset?: string;
  shareMb?: number;
  sfx?: boolean;
  silent?: boolean;
  fast?: boolean;
}

export class RenderBusyError extends Error {}

export class RenderRunner {
  job: Job | null = null;
  private abort: AbortController | null = null;
  private seq = 0;
  private listeners = new Set<(job: Job) => void>();

  constructor(private opts: { decode?: (file: string) => PcmAudio; log?: (msg: string) => void } = {}) {}

  subscribe(fn: (job: Job) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(job: Job): void {
    for (const fn of this.listeners) fn(job);
  }

  get running(): boolean {
    return this.job?.status === 'running';
  }

  start(key: string, p: EpisodePaths, o: RenderOptions): Job {
    if (this.running) throw new RenderBusyError(`A render is already running (${this.job!.key})`);
    const abort = (this.abort = new AbortController());
    const current: Job = {
      id: ++this.seq,
      key,
      status: 'running',
      phase: 'validate',
      done: 0,
      total: 1,
      started: Date.now(),
    };
    this.job = current;
    this.emit(current);
    let lastSent = 0;
    renderEpisode(p, {
      preset: typeof o.preset === 'string' && o.preset ? o.preset : undefined,
      shareMb: Number(o.shareMb) > 0 ? Number(o.shareMb) : undefined,
      sfx: o.sfx !== false,
      silent: Boolean(o.silent),
      fast: Boolean(o.fast),
      signal: abort.signal,
      compile: { decode: this.opts.decode },
      onLog: this.opts.log,
      onProgress: (pr: Progress) => {
        Object.assign(current, { phase: pr.phase, done: pr.done, total: pr.total, fps: pr.fps, eta: pr.eta });
        const now = Date.now();
        if (now - lastSent > 200 || pr.done === pr.total) {
          lastSent = now;
          this.emit(current);
        }
      },
    })
      .then((r) => {
        current.status = r.ok ? 'done' : 'failed';
        current.message = r.ok
          ? `Rendered ${r.frames} frames in ${Math.round(r.seconds)} s`
          : `Output check failed: ${Object.values(r.compliance)
              .flatMap((c) => c?.problems ?? [])
              .join('; ')}`;
      })
      .catch((e: Error & { issues?: Issue[] }) => {
        current.status = abort.signal.aborted ? 'cancelled' : 'failed';
        current.message = e.message;
        current.issues = (e.issues ?? []).filter((i) => i.level === 'error').slice(0, 20);
      })
      .finally(() => {
        current.finished = Date.now();
        this.emit(current);
      });
    return current;
  }

  cancel(): void {
    if (this.running) this.abort?.abort();
  }
}
