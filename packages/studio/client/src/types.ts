import type { Issue, Timeline } from '@reelforge/core';

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

export interface StudioState {
  mode: 'edit' | 'cue' | 'dev';
  id: string;
  title: string;
  script: { id: string; text: string }[];
  cues: { cues: Record<string, number>; words: Record<string, number[]> } | null;
  timeline: Timeline | null;
  issues: Issue[];
  error: boolean;
  voice: { url: string; duration: number } | null;
  compiledAt: number;
  compileMs: number;
  spec: Record<string, unknown> | null;
  history: { undo: number; redo: number; undoLabel?: string; redoLabel?: string };
  job: Job | null;
  outputs: { file: string; size: number; mtime: number }[];
  file: string;
}

export interface RuntimeApi {
  ready: Promise<void>;
  render(t: number): void;
  load(tl: Timeline): Promise<void>;
  boxes(
    t: number,
  ): { id: string; component: string; x: number; y: number; w: number; h: number; visible: boolean }[];
}
