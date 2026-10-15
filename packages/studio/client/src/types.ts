import type { Issue, Timeline } from '@reelforge/core';

export interface StudioState {
  mode: 'cue' | 'dev';
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
}

export interface RuntimeApi {
  ready: Promise<void>;
  render(t: number): void;
  load(tl: Timeline): Promise<void>;
  boxes(t: number): { id: string; component: string; x: number; y: number; w: number; h: number; visible: boolean }[];
}
