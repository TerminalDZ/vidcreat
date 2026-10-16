/**
 * The compiled timeline (SRS DR-5): the only contract between Core and Runtime.
 * All times are in seconds (3-decimal precision), all defaults applied, all theme tokens resolved.
 */
import type { SoundName } from '@reelforge/audio';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SafeRect extends Rect {
  name: string;
}

export interface Preset {
  name: string;
  label: string;
  width: number;
  height: number;
  fps: number;
  headerTop: number;
  stage: { y: number; h: number };
  captionsY: number;
  /** Canvas areas covered by platform UI. */
  safe: SafeRect[];
  shareMb: number;
  maxDuration: number;
}

export interface Theme {
  name: string;
  colors: Record<string, string>;
  fonts: { display: string; mono: string; arabic: string };
  type: { caption: number; title: number; h2: number; body: number; label: number };
  chrome: {
    header: boolean;
    progress: boolean;
    waveform: boolean;
    grain: number;
    /** Grain changes per second (0 = static texture; animated grain costs a lot of bitrate). */
    grain_fps: number;
    vignette: number;
    grid: boolean;
  };
  motion: { pop_overshoot: number; default_dur: number; crossfade: number };
  captions: {
    active: string;
    english: string;
    future_opacity: number;
    max_lines: number;
    max_chars: number;
    scrim: number;
  };
}

export type EnterAnim =
  | 'pop'
  | 'rise'
  | 'slide-l'
  | 'slide-r'
  | 'fade'
  | 'draw'
  | 'type'
  | 'count'
  | 'flip'
  | 'glitch'
  | 'stamp'
  | 'zoom'
  | 'blur'
  | 'wipe'
  | 'spring'
  | 'drop'
  | 'reveal'
  | 'none';
export type ExitAnim =
  | 'fade'
  | 'pop'
  | 'rise'
  | 'sink'
  | 'slide-l'
  | 'slide-r'
  | 'zoom'
  | 'blur'
  | 'wipe'
  | 'none';
/** Easing of an enter animation: smooth (cubic), snappy (quint), gentle (sine), linear. */
export type Ease = 'smooth' | 'snappy' | 'gentle' | 'linear';
/** Slow continuous camera move over a scene. */
export type Camera = 'still' | 'drift' | 'push-in' | 'pull-out';
export type FxKind = 'shake' | 'flash' | 'glitch' | 'pulse' | 'bump';

export interface TEnter {
  t: number;
  anim: EnterAnim;
  dur: number;
  ease?: Ease;
  /** Animation parameters (s0, dy, dist, cps, rot, …). */
  params: Record<string, number | boolean>;
}

export interface TExit {
  t: number;
  anim: ExitAnim;
  dur: number;
}

export interface TState {
  t: number;
  set: Record<string, unknown>;
}

export interface TFx {
  t: number;
  do: FxKind;
  amp: number;
  dur: number;
  color: string;
  rate: number;
}

export interface SourcePos {
  line: number;
  col: number;
}

export interface TElement {
  id: string;
  component: string;
  props: Record<string, unknown>;
  /** Box in scene coordinates (stage coordinates for `layout: stage`, canvas for `full`). */
  box: Rect;
  layer: 'base' | 'overlay';
  z: number;
  enter: TEnter;
  exit: TExit | null;
  states: TState[];
  fx: TFx[];
  source?: SourcePos;
}

export type Transition = 'crossfade' | 'cut' | 'slide-up' | 'zoom' | 'push' | 'blur';

export interface TScene {
  id: string;
  start: number;
  end: number;
  transition: Transition;
  camera?: Camera;
  layout: 'stage' | 'full';
  /** Top-left of the scene coordinate system on the canvas. */
  origin: { x: number; y: number; w: number; h: number };
  elements: TElement[];
  hash: string;
  source?: SourcePos;
}

export interface CaptionPart {
  text: string;
  latin: boolean;
}

export interface CaptionToken {
  start: number;
  parts: CaptionPart[];
  english: boolean;
  /** Plain text of the token (NBSP joiners included). */
  text: string;
}

export interface CaptionChunk {
  lineId: string;
  start: number;
  end: number;
  dir: 'rtl' | 'ltr';
  tokens: CaptionToken[];
  text: string;
}

export interface Flash {
  t: number;
  color: string;
  dur: number;
  intensity: number;
}

export interface CameraShake {
  t: number;
  amp: number;
  dur: number;
}

export interface TimelineSfx {
  t: number;
  sound: SoundName;
  gain_db: number;
  source: string;
}

export interface ScriptLineInfo {
  id: string;
  text: string;
  start: number;
  end: number;
  words: { text: string; start: number }[];
}

export interface Timeline {
  version: 1;
  fps: number;
  width: number;
  height: number;
  duration: number;
  frames: number;
  meta: {
    id: string;
    series: string;
    title: string;
    episode: number;
    lang: string;
    dir: 'rtl' | 'ltr';
  };
  preset: Preset;
  theme: Theme;
  chapters: { t: number; label: string }[];
  glow: { t: number; color: string }[];
  scenes: TScene[];
  captions: CaptionChunk[];
  flashes: Flash[];
  shakes: CameraShake[];
  sfx: TimelineSfx[];
  audio: { sfxGainDb: number; duck: boolean; envelope: number[] };
  script: ScriptLineInfo[];
  cues: Record<string, number>;
  /** Base URL (relative to the runtime page) for episode assets. */
  assetBase: string;
  seed: number;
}

export type IssueLevel = 'error' | 'warn' | 'info';

export interface Issue {
  rule: string;
  level: IssueLevel;
  message: string;
  hint?: string;
  file?: string;
  line?: number;
  col?: number;
  path?: string;
  time?: number;
  sceneId?: string;
  elementId?: string;
}
