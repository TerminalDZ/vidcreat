import type { EnterAnim, Rect, TElement, Theme, Timeline } from '@reelforge/core';

/** Element-local time information passed to components (SRS §6.1). */
export interface LocalTime {
  /** Seconds since the element's enter time (negative before it). */
  since: number;
  /** Linear 0..1 progress through the enter animation. */
  enterRaw: number;
  /** Eased 0..1 enter progress. */
  enterP: number;
  /** Linear 0..1 progress through the exit animation (0 until exit starts). */
  exitP: number;
  /** Absolute time the enter animation completes. */
  enterEnd: number;
  /** Frame index of `t` (for seeded jitter). */
  frame: number;
}

/** Merge of every `states[].set` whose `at ≤ t`, plus the time each key was last set. */
export type ResolvedState = Record<string, unknown> & { $since: Record<string, number> };

export interface MountCtx {
  tl: Timeline;
  el: TElement;
  box: Rect;
  seed: number;
  /** Resolves an episode asset path (e.g. "assets/logo.svg") to a URL. */
  asset: (p: string) => string;
}

export interface Instance {
  update(t: number, local: LocalTime, state: ResolvedState): void;
}

export interface RuntimeComponent {
  name: string;
  /** Enter animations this component draws itself (the wrapper only fades it in). */
  handles?: EnterAnim[];
  mount(root: HTMLElement, props: any, theme: Theme, ctx: MountCtx): Instance;
}
