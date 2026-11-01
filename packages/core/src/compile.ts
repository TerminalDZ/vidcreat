/**
 * Scene compiler (SRS §4.4): episode.yaml + cues.json + voice → Timeline (DR-5).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  analyzeSpeech,
  decodeWav,
  frameEnvelope,
  hashString,
  pausesIn,
  toMono,
  type PcmAudio,
  type SoundName,
} from '@reelforge/audio';
import { buildCaptions } from './captions.js';
import { COMPONENTS, COMPONENT_NAMES } from './components/index.js';
import { readCues, type CuesFile } from './cues.js';
import { lintTimeline } from './lint.js';
import { loadPreset } from './preset.js';
import type { EpisodePaths } from './project.js';
import { episodeSchema, type ElementSpec, type EpisodeSpec, type SceneSpec } from './schema/episode.js';
import { hasArabic, splitWords } from './text.js';
import { loadTheme, resolveColor, resolvedTheme } from './theme.js';
import { evalTime, parseTime, TimeError, type LineTiming, type TimeContext } from './time.js';
import type {
  CameraShake,
  EnterAnim,
  Flash,
  Issue,
  Preset,
  Rect,
  SourcePos,
  TElement,
  TFx,
  Theme,
  Timeline,
  TimelineSfx,
  TScene,
} from './types.js';
import { closest, didYouMean, round3, sha1, stableStringify } from './util.js';
import { buildLineTimings, estimateWordStarts } from './words.js';
import { formatPath, parseYaml, posAt, type YamlSource } from './yamlsrc.js';
import { zodToIssues } from './zodissues.js';

export interface VoiceInfo {
  file: string;
  duration: number;
  sha1: string;
  sampleRate: number;
  mono: Float32Array;
}

export interface CompileOptions {
  /** Override the YAML text (used by tests and the studio). */
  yamlText?: string;
  /** Override cues (otherwise read from cues.json). */
  cues?: CuesFile | null;
  /** Pre-loaded voice; `null` means "no voice". Default: load from the episode folder. */
  voice?: VoiceInfo | null;
  /** Fallback decoder for non-WAV or unusual voice files (the CLI passes an ffmpeg decoder). */
  decode?: (file: string) => PcmAudio;
  preset?: string;
  /** Use estimated cues when cues.json is missing (studio preview, `cue --draft`). */
  draftCues?: boolean;
}

export interface CompileResult {
  ok: boolean;
  timeline?: Timeline;
  spec?: EpisodeSpec;
  issues: Issue[];
  /** Files the result depends on (for hot reload). */
  files: string[];
  /** Script lines (available even when compilation fails, for the cue marker). */
  script: { id: string; text: string }[];
  voice?: VoiceInfo | null;
}

/** Reading speed used for draft cue estimates (Arabic letters per second, incl. pauses). */
const DRAFT_LPS = 13;
const DRAFT_GAP = 0.35;

/** Estimated cues from text length, for previewing before recording (`reelforge cue --draft`). */
export function draftCues(script: { id: string; text: string }[], audioFile = 'voice.wav'): CuesFile {
  const cues: Record<string, number> = {};
  let t = 0.2;
  for (const line of script) {
    cues[line.id] = round3(t);
    const letters = splitWords(line.text).reduce((n, w) => n + Math.max(2, [...w].length), 0);
    t += letters / DRAFT_LPS + DRAFT_GAP;
  }
  return { version: 1, audio: { file: audioFile, duration: round3(t + 0.6) }, cues, words: {}, draft: true };
}

/** Captions stop being readable above about this many spoken words per second. */
export const PACE_MAX_WPS = 3.5;
/** The hook should start within this many seconds, or viewers swipe away. */
export const HOOK_MAX_START = 3;

/** Silences longer than this inside the recording are worth trimming. */
export const LONG_PAUSE = 1.5;
const pauseCache = new Map<string, { at: number; len: number }[]>();

/** Long silences between spoken words (energy analysis, ~10 ms per minute, cached per recording). */
export function longSilences(voice: VoiceInfo): { at: number; len: number }[] {
  const hit = pauseCache.get(voice.sha1);
  if (hit) return hit;
  const map = analyzeSpeech(voice.mono, voice.sampleRate);
  const out = pausesIn(map, map.first, map.last, Math.round(LONG_PAUSE / map.hop)).map((p) => ({
    at: round3(p.from * map.hop),
    len: round3((p.to - p.from) * map.hop),
  }));
  if (pauseCache.size > 16) pauseCache.clear();
  pauseCache.set(voice.sha1, out);
  return out;
}

/**
 * V-14 pacing: words per second of each line (from its cue to the next), a late hook, and long
 * silences inside the recording.
 */
function lintPacing(
  c: Compiler,
  script: { id: string; text: string }[],
  timings: Map<string, LineTiming>,
  voice: VoiceInfo | null,
): void {
  const lines = script.map((s) => timings.get(s.id)).filter((l): l is LineTiming => Boolean(l));
  lines.forEach((l, i) => {
    const words = splitWords(script[i].text).length;
    const span = l.next - l.start;
    if (words < 3 || span <= 0) return;
    const wps = words / span;
    if (wps > PACE_MAX_WPS)
      c.issue(
        'V-14',
        'warn',
        `Line ${l.id} is spoken at ${wps.toFixed(1)} words/s: too fast to read in captions (aim for ≤ ${PACE_MAX_WPS})`,
        ['script', i],
        { hint: 'Split the line, cut words, or leave a short pause before the next line', time: l.start },
      );
  });
  if (voice)
    for (const p of longSilences(voice))
      c.issues.push({
        rule: 'V-14',
        level: 'info',
        message: `${p.len.toFixed(1)} s of silence at ${p.at}s in the recording`,
        hint: 'Viewers swipe during long pauses: trim it in your audio editor, or fill it with something on screen',
        file: c.src.file,
        time: p.at,
      });
  if (lines.length && lines[0].start > HOOK_MAX_START)
    c.issue(
      'V-14',
      'warn',
      `The hook (${lines[0].id}) starts at ${round3(lines[0].start)}s; start speaking within ${HOOK_MAX_START} s`,
      ['script', 0],
      { hint: 'Trim the silence at the start of the recording', time: lines[0].start },
    );
}

export function loadVoice(file: string, decode?: (file: string) => PcmAudio): VoiceInfo {
  const buf = readFileSync(file);
  let pcm: PcmAudio;
  try {
    pcm = decodeWav(buf);
  } catch (e) {
    if (!decode) throw e;
    pcm = decode(file);
  }
  const mono = toMono(pcm);
  return { file, duration: mono.length / pcm.sampleRate, sha1: sha1(buf), sampleRate: pcm.sampleRate, mono };
}

const DEFAULT_FX: Record<TFx['do'], { amp: number; dur: number }> = {
  shake: { amp: 18, dur: 0.45 },
  flash: { amp: 0.35, dur: 0.3 },
  glitch: { amp: 30, dur: 0.4 },
  pulse: { amp: 0.06, dur: 1.2 },
  bump: { amp: 0.12, dur: 0.3 },
};

const DEFAULT_ENTER_DUR: Partial<Record<EnterAnim, number>> = {
  blur: 0.6,
  wipe: 0.6,
  spring: 0.8,
  drop: 0.7,
  reveal: 0.6,
  draw: 0.6,
  stamp: 0.5,
  glitch: 0.5,
  none: 0.001,
  type: 0.3,
};
const COLOR_KEYS = new Set(['color', 'accent', 'danger']);
/** Prop keys holding time expressions (booleans in `strike`/`highlight` pass through unchanged). */
const TIME_KEYS = new Set(['at', 'until', 'strike', 'highlight']);
type Side = 'left' | 'right' | 'top' | 'bottom' | 'center';

class Compiler {
  issues: Issue[] = [];
  files = new Set<string>();
  ctx!: TimeContext;
  theme!: Theme;
  preset!: Preset;
  sceneStart = new Map<string, number>();
  sceneEnd = new Map<string, number>();
  sceneResolving = new Set<string>();
  flashes: Flash[] = [];
  shakes: CameraShake[] = [];

  constructor(
    readonly paths: EpisodePaths,
    readonly src: YamlSource,
    readonly spec: EpisodeSpec,
  ) {}

  pos(p: (string | number)[]): SourcePos | undefined {
    return posAt(this.src, p);
  }

  issue(
    rule: string,
    level: Issue['level'],
    message: string,
    p?: (string | number)[],
    extra: Partial<Issue> = {},
  ) {
    const pos = p ? this.pos(p) : undefined;
    this.issues.push({
      rule,
      level,
      message,
      file: this.src.file,
      line: pos?.line,
      col: pos?.col,
      path: p ? formatPath(p) : undefined,
      ...extra,
    });
  }

  /** Resolves a time expression; on failure reports V-2 and returns `fallback`. */
  time(expr: string | number, p: (string | number)[], fallback: number): number {
    try {
      return evalTime(parseTime(expr), this.ctx);
    } catch (e) {
      if (!(e instanceof TimeError)) throw e;
      this.issue('V-2', 'error', `${formatPath(p)}: ${e.message}`, p, { hint: e.hint });
      return fallback;
    }
  }

  color(c: unknown): unknown {
    return typeof c === 'string' ? resolveColor(this.theme, c) : c;
  }

  /** Deep-walks props: resolves `at`/`until` time keys and color keys. */
  resolveProps(v: unknown, p: (string | number)[], fallback: number, key?: string): unknown {
    if (Array.isArray(v)) {
      return v.map((x, i) => (key === 'colors' ? this.color(x) : this.resolveProps(x, [...p, i], fallback)));
    }
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (TIME_KEYS.has(k) && (typeof x === 'string' || typeof x === 'number'))
          out[k] = this.time(x, [...p, k], fallback);
        else if (COLOR_KEYS.has(k)) out[k] = this.color(x);
        else out[k] = this.resolveProps(x, [...p, k], fallback, k);
      }
      return out;
    }
    return v;
  }

  sceneTime(spec: SceneSpec[], id: string, part: 'start' | 'end'): number {
    const cache = part === 'start' ? this.sceneStart : this.sceneEnd;
    const hit = cache.get(id);
    if (hit !== undefined) return hit;
    const key = `${id}.${part}`;
    if (this.sceneResolving.has(key)) throw new TimeError(`Circular scene reference involving "@${key}"`);
    this.sceneResolving.add(key);
    try {
      const i = spec.findIndex((s) => s.id === id);
      const s = spec[i];
      let t: number;
      if (part === 'start') {
        t = this.time(s.at, ['scenes', i, 'at'], 0);
      } else if (s.end !== undefined) {
        t = this.time(s.end, ['scenes', i, 'end'], this.ctx.duration);
      } else {
        t = i + 1 < spec.length ? this.sceneTime(spec, spec[i + 1].id, 'start') : this.ctx.duration;
      }
      cache.set(id, t);
      return t;
    } finally {
      this.sceneResolving.delete(key);
    }
  }
}

function sceneArea(layout: 'stage' | 'full', preset: Preset) {
  return layout === 'stage'
    ? { x: 0, y: preset.stage.y, w: preset.width, h: preset.stage.h }
    : { x: 0, y: 0, w: preset.width, h: preset.height };
}

const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

function anchorPoint(r: Rect, side: Side) {
  switch (side) {
    case 'left':
      return { x: r.x, y: r.y + r.h / 2 };
    case 'right':
      return { x: r.x + r.w, y: r.y + r.h / 2 };
    case 'top':
      return { x: r.x + r.w / 2, y: r.y };
    case 'bottom':
      return { x: r.x + r.w / 2, y: r.y + r.h };
    default:
      return center(r);
  }
}

function autoSide(from: Rect, toward: { x: number; y: number }): Side {
  const c = center(from);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (Math.abs(dx) / Math.max(1, from.w) >= Math.abs(dy) / Math.max(1, from.h))
    return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

const roundRect = (r: Rect): Rect => ({
  x: Math.round(r.x),
  y: Math.round(r.y),
  w: Math.round(r.w),
  h: Math.round(r.h),
});

export function compileEpisode(paths: EpisodePaths, opts: CompileOptions = {}): CompileResult {
  const files = new Set<string>([paths.yaml]);
  const text = opts.yamlText ?? (existsSync(paths.yaml) ? readFileSync(paths.yaml, 'utf8') : undefined);
  if (text === undefined) {
    return {
      ok: false,
      issues: [
        {
          rule: 'V-1',
          level: 'error',
          message: `episode.yaml not found in ${paths.dir}`,
          hint: 'Create one with `reelforge new <id>`',
        },
      ],
      files: [...files],
      script: [],
    };
  }
  const src = parseYaml(text, paths.yaml);
  const rawScript = extractScript(src.data);
  if (src.errors.some((e) => e.level === 'error')) {
    return { ok: false, issues: src.errors, files: [...files], script: rawScript };
  }
  const parsed = episodeSchema.safeParse(src.data);
  if (!parsed.success) {
    return {
      ok: false,
      issues: [...src.errors, ...zodToIssues(parsed.error, episodeSchema, src)],
      files: [...files],
      script: rawScript,
    };
  }
  const spec = parsed.data;
  const c = new Compiler(paths, src, spec);
  c.issues.push(...src.errors);

  // ---- script ids (DR-2.2)
  const script = spec.script.map((l, i) => ({ ...l, id: l.id ?? `l${i + 1}` }));
  const seenIds = new Map<string, number>();
  script.forEach((l, i) => {
    if (seenIds.has(l.id))
      c.issue('V-1', 'error', `Duplicate script id "${l.id}" (also line ${seenIds.get(l.id)! + 1})`, [
        'script',
        i,
        'id',
      ]);
    seenIds.set(l.id, i);
  });

  // ---- theme & preset
  const themeRes = loadTheme(spec.meta.theme, paths.root, paths.dir);
  themeRes.files.forEach((f) => files.add(f));
  for (const i of themeRes.issues)
    c.issue(i.rule, i.level, i.message, i.path ? ['meta', 'theme'] : undefined, {
      hint: i.hint,
      ...(i.file ? { file: i.file } : {}),
    });
  c.theme = themeRes.theme;
  const presetName = opts.preset ?? process.env.REELFORGE_PRESET ?? spec.meta.preset;
  const presetRes = loadPreset(presetName, paths.root, paths.dir);
  if (presetRes.file) files.add(presetRes.file);
  for (const i of presetRes.issues)
    c.issue(i.rule, i.level, i.message, i.path ? ['meta', 'preset'] : undefined, {
      hint: i.hint,
      ...(i.file ? { file: i.file } : {}),
    });
  c.preset = presetRes.preset;
  const fps = c.preset.fps;

  // ---- voice
  const voiceFile = path.resolve(paths.dir, spec.audio.voice);
  let voice: VoiceInfo | null | undefined = opts.voice;
  if (voice === undefined) {
    voice = null;
    if (existsSync(voiceFile)) {
      files.add(voiceFile);
      try {
        voice = loadVoice(voiceFile, opts.decode);
      } catch (e) {
        c.issue(
          'V-4',
          'error',
          `Cannot read voice file ${spec.audio.voice}: ${(e as Error).message}`,
          ['audio', 'voice'],
          {
            hint: 'Export the recording as PCM WAV (16/24-bit or float), or install ffmpeg so ReelForge can convert it',
          },
        );
      }
    } else {
      c.issue(
        'V-4',
        'warn',
        `Voice file "${spec.audio.voice}" not found; render needs it`,
        ['audio', 'voice'],
        {
          hint: `Record ${spec.audio.voice} into ${paths.dir} (or render with --silent for a silent preview)`,
        },
      );
    }
  }

  // ---- cues (DR-3, V-3, V-4)
  files.add(paths.cues);
  let cues: CuesFile | undefined = opts.cues ?? undefined;
  if (opts.cues === undefined) {
    const r = readCues(paths.cues);
    if (r.error)
      c.issues.push({
        rule: 'V-3',
        level: 'error',
        message: r.error,
        file: paths.cues,
        hint: 'Fix the JSON or re-mark cues with `reelforge cue`',
      });
    cues = r.cues;
  }
  if (!cues) {
    if (!opts.draftCues) {
      c.issues.push({
        rule: 'V-3',
        level: 'error',
        message: 'No cues.json: script lines have no timing yet',
        file: paths.cues,
        hint: `Mark cues with \`reelforge cue ${paths.id}\`, or create estimated ones with \`reelforge cue ${paths.id} --draft\``,
      });
    }
    cues = draftCues(script, spec.audio.voice);
  } else if (cues.draft) {
    c.issues.push({
      rule: 'V-3',
      level: 'info',
      message: 'cues.json holds draft (estimated) cues; mark real cues before publishing',
      file: paths.cues,
    });
  } else if (cues.auto) {
    c.issues.push({
      rule: 'V-3',
      level: 'info',
      message: 'cues.json was aligned automatically from the recording; listen through once in Cues mode',
      file: paths.cues,
    });
  }
  const cueMap: Record<string, number> = {};
  let prevCue = -Infinity;
  let prevId = '';
  script.forEach((l, i) => {
    const v = cues!.cues[l.id];
    if (v === undefined) {
      c.issue('V-3', 'error', `Missing cue for script line ${l.id}`, ['script', i], {
        hint: `Mark it with \`reelforge cue ${paths.id}\``,
      });
      cueMap[l.id] = Math.max(0, prevCue === -Infinity ? 0 : prevCue);
    } else {
      if (v < prevCue) {
        c.issue(
          'V-3',
          'error',
          `Cues are not in script order: ${l.id} (${v}s) is before ${prevId} (${prevCue}s)`,
          ['script', i],
          {
            hint: 'Re-mark the line in the editor’s Cues mode, or reorder the script',
            time: v,
          },
        );
      }
      cueMap[l.id] = v;
      prevCue = Math.max(prevCue, v);
      prevId = l.id;
    }
  });
  for (const id of Object.keys(cues.cues)) {
    if (!seenIds.has(id)) {
      const alt = closest(id, seenIds.keys());
      c.issues.push({
        rule: 'V-3',
        level: 'warn',
        message: `cues.json has a cue for unknown line "${id}"`,
        file: paths.cues,
        hint: alt ? `Renamed to "${alt}"? Re-mark it` : undefined,
      });
    }
  }
  for (const [id, w] of Object.entries(cues.words ?? {})) {
    const line = script.find((l) => l.id === id);
    if (line && w.length !== splitWords(line.text).length) {
      c.issues.push({
        rule: 'V-3',
        level: 'warn',
        message: `cues.json words.${id} has ${w.length} entries but line ${id} has ${splitWords(line.text).length} words; using estimates`,
        file: paths.cues,
      });
    }
  }
  if (voice && cues.audio.sha1 && cues.audio.sha1 !== voice.sha1) {
    c.issues.push({
      rule: 'V-4',
      level: 'warn',
      message: 'voice changed since cues were marked',
      file: paths.cues,
      hint: `Check the cues in \`reelforge cue ${paths.id}\` (saving updates the stored hash)`,
    });
  }

  // ---- duration
  const lastCue = Math.max(0, ...Object.values(cueMap));
  let duration = voice?.duration ?? cues.audio.duration ?? 0;
  if (!(duration > 0)) duration = lastCue + 3;
  if (lastCue > duration) {
    c.issues.push({
      rule: 'V-3',
      level: 'error',
      message: `Cue at ${lastCue}s is after the end of the audio (${round3(duration)}s)`,
      file: paths.cues,
    });
  }
  duration = round3(duration);
  const frames = Math.ceil(duration * fps - 1e-6);
  if (duration > c.preset.maxDuration) {
    c.issue(
      'V-1',
      'warn',
      `Duration ${duration}s exceeds the ${c.preset.label} limit of ${c.preset.maxDuration}s`,
      ['meta', 'preset'],
    );
  }

  // ---- time context
  const lines = buildLineTimings(script, cueMap, duration, cues.words);
  if (!cues.draft) lintPacing(c, script, lines, voice);
  const sceneIds = spec.scenes.map((s) => s.id);
  c.ctx = {
    lines,
    duration,
    sceneIds: () => sceneIds,
    sceneTime: (id, part) => c.sceneTime(spec.scenes, id, part),
  };

  // ---- scenes
  const seenScene = new Map<string, number>();
  const seenEl = new Map<string, string>();
  const scenes: TScene[] = [];
  const sfx: TimelineSfx[] = [];
  const glow: { t: number; color: string }[] = [];
  const sfxMode = spec.audio.sfx;
  const addSfx = (t: number, sound: SoundName, gain: number | undefined, source: string) => {
    if (t >= 0 && t < duration) sfx.push({ t: round3(t), sound, gain_db: gain ?? 0, source });
  };

  spec.scenes.forEach((s, si) => {
    const sp = ['scenes', si];
    if (seenScene.has(s.id)) c.issue('V-1', 'error', `Duplicate scene id "${s.id}"`, [...sp, 'id']);
    seenScene.set(s.id, si);
    const start = c.sceneTime(spec.scenes, s.id, 'start');
    let end = c.sceneTime(spec.scenes, s.id, 'end');
    if (end <= start) {
      c.issue(
        'V-5',
        'error',
        `Scene "${s.id}" ends (${end}s) before it starts (${start}s)`,
        [...sp, s.end !== undefined ? 'end' : 'at'],
        {
          hint: 'Scenes must be listed in time order; check "at" and "end"',
          time: start,
        },
      );
      end = Math.min(duration, start + 0.5);
    }
    const area = sceneArea(s.layout, c.preset);
    const W = area.w;
    const H = area.h;

    // glow keyframes
    if (typeof s.glow === 'string') glow.push({ t: start, color: resolveColor(c.theme, s.glow) });
    else if (Array.isArray(s.glow)) {
      s.glow.forEach((g, gi) =>
        glow.push({
          t: c.time(g.at, [...sp, 'glow', gi, 'at'], start),
          color: resolveColor(c.theme, g.color),
        }),
      );
    }

    if (si > 0 && s.transition !== 'cut' && sfxMode === 'auto') addSfx(start, 'whoosh', -14, `scene:${s.id}`);

    // ---- elements: validate + times
    type Pending = { spec: ElementSpec; ej: number; el: TElement; def: (typeof COMPONENTS)[string] };
    const pending: Pending[] = [];
    s.elements.forEach((e, ej) => {
      const ep = [...sp, 'elements', ej];
      const def = COMPONENTS[e.use];
      if (!def) {
        const alt = didYouMean(e.use, COMPONENT_NAMES, 3);
        c.issue(
          'V-13',
          'error',
          `Unknown component "${e.use}"${alt ? `. Did you mean "${alt}"?` : ''}`,
          [...ep, 'use'],
          {
            hint: `Components: ${COMPONENT_NAMES.join(', ')}`,
          },
        );
        return;
      }
      const id = e.id ?? `${s.id}-${e.use}-${ej + 1}`;
      if (seenEl.has(id))
        c.issue('V-1', 'error', `Duplicate element id "${id}" (also in scene "${seenEl.get(id)}")`, [
          ...ep,
          'id',
        ]);
      seenEl.set(id, s.id);
      const pr = def.schema.safeParse(e.props);
      if (!pr.success) {
        c.issues.push(...zodToIssues(pr.error, def.schema, src, [...ep, 'props']));
        return;
      }
      const anim: EnterAnim = e.enter?.anim ?? def.enter ?? 'pop';
      const rawEnter = e.enter?.at !== undefined ? c.time(e.enter.at, [...ep, 'enter', 'at'], start) : start;
      const enterDur = e.enter?.dur ?? DEFAULT_ENTER_DUR[anim] ?? c.theme.motion.default_dur;
      const rawExit = e.exit ? c.time(e.exit.at, [...ep, 'exit', 'at'], end) : undefined;
      if (rawEnter < start - 0.0005 || rawEnter > end + 0.0005) {
        c.issue(
          'V-5',
          'error',
          `Element "${id}" enters at ${rawEnter}s, outside its scene "${s.id}" (${start}s–${end}s)`,
          [...ep, 'enter', 'at'],
          {
            hint: 'Move the element to the scene that is visible then, or change enter.at',
            time: rawEnter,
            sceneId: s.id,
            elementId: id,
          },
        );
      }
      if (rawExit !== undefined && rawExit < rawEnter) {
        c.issue(
          'V-5',
          'error',
          `Element "${id}" exits (${rawExit}s) before it enters (${rawEnter}s)`,
          [...ep, 'exit', 'at'],
          {
            time: rawExit,
            sceneId: s.id,
            elementId: id,
          },
        );
      }
      const enterT = round3(Math.min(Math.max(rawEnter, start), end));
      const exitT = rawExit === undefined ? undefined : round3(Math.min(Math.max(rawExit, enterT), end));
      const params: Record<string, number | boolean> = {};
      for (const k of ['s0', 'dy', 'dist', 'cps', 'caret', 'rot', 'amp'] as const) {
        const v = e.enter?.[k];
        if (v !== undefined) params[k] = v;
      }
      if (anim === 'pop' && params.s0 === undefined) params.s0 = 0.8;
      const props = c.resolveProps(pr.data, [...ep, 'props'], enterT) as Record<string, unknown>;
      const states = e.states
        .map((st, k) => ({
          t: c.time(st.at, [...ep, 'states', k, 'at'], enterT),
          set: c.resolveProps(st.set, [...ep, 'states', k, 'set'], enterT) as Record<string, unknown>,
        }))
        .sort((a, b) => a.t - b.t);
      const fx: TFx[] = [];
      e.fx.forEach((f, k) => {
        const t = c.time(f.at, [...ep, 'fx', k, 'at'], enterT);
        const d = DEFAULT_FX[f.do];
        const fxColor = resolveColor(c.theme, f.color ?? (f.do === 'flash' ? 'ink' : 'lime'));
        const amp = f.amp ?? d.amp;
        const dur = f.dur ?? d.dur;
        if (f.do === 'flash')
          c.flashes.push({ t, color: fxColor, dur, intensity: Math.min(1, f.amp ?? d.amp) });
        else if (f.do === 'shake' && f.target === 'camera') c.shakes.push({ t, amp, dur });
        else fx.push({ t, do: f.do, amp, dur, color: fxColor, rate: f.rate ?? 2 });
        if (sfxMode === 'auto' && e.sfx !== 'none' && f.sound !== 'none') {
          const auto: SoundName | undefined =
            f.sound ?? (f.do === 'flash' ? 'hit' : f.do === 'glitch' ? 'glitch' : undefined);
          if (auto) addSfx(t, auto, f.sound ? 0 : -3, `${id}:fx`);
        }
      });
      const el: TElement = {
        id,
        component: e.use,
        props,
        box: { x: 0, y: 0, w: 0, h: 0 },
        layer: e.layer ?? def.layer ?? 'base',
        z: e.z ?? ej,
        enter: {
          t: enterT,
          anim,
          dur: round3(enterDur),
          params,
          ...(e.enter?.ease ? { ease: e.enter.ease } : {}),
        },
        exit:
          exitT === undefined ? null : { t: exitT, anim: e.exit?.anim ?? 'fade', dur: e.exit?.dur ?? 0.3 },
        states,
        fx: fx.sort((a, b) => a.t - b.t),
        source: c.pos(ep),
      };
      pending.push({ spec: e, ej, el, def });
    });

    // ---- placement (DR-2.4, §6.4)
    const sizeOf = (p: Pending) => ({
      w: Math.min(p.spec.place?.w ?? p.spec.size?.w ?? p.def.size.w, W),
      h: Math.min(p.spec.place?.h ?? p.spec.size?.h ?? p.def.size.h, H),
    });
    const flowItems: Pending[] = [];
    for (const p of pending) {
      if (p.def.endpoints && !p.def.fill) continue; // arrows: placed after their targets
      const pl = p.spec.place;
      const { w, h } = sizeOf(p);
      if (p.def.fill && !pl) {
        p.el.box = { x: 0, y: 0, w: W, h: H };
      } else if (pl) {
        const m = pl.margin ?? 0;
        let x = pl.x ?? (W - w) / 2;
        let y = pl.y ?? (H - h) / 2;
        if (pl.anchor === 'top') y = pl.y ?? m;
        if (pl.anchor === 'bottom') y = H - h - m;
        if (pl.anchor === 'left') x = m;
        if (pl.anchor === 'right') x = W - w - m;
        if (pl.anchor === 'center' || pl.center) {
          x = pl.x ?? (W - w) / 2;
          y = pl.y ?? (H - h) / 2;
        }
        p.el.box = roundRect({ x, y, w, h });
      } else if (s.row || s.column || s.columns) {
        flowItems.push(p);
      } else {
        p.el.box = roundRect({ x: (W - w) / 2, y: (H - h) / 2, w, h });
      }
    }
    layoutFlow(s, flowItems, W, H, sizeOf);

    // endpoints (arrows, particles from/to)
    const boxes = new Map(pending.filter((p) => !p.def.endpoints).map((p) => [p.el.id, p.el.box]));
    for (const p of pending) {
      if (!p.def.endpoints) continue;
      const ep = [...sp, 'elements', p.ej, 'props'];
      const raw = p.el.props as Record<string, unknown>;
      const parse = (key: string) => {
        const v = raw[key];
        if (v === undefined) return undefined;
        if (typeof v === 'object') return { point: v as { x: number; y: number } };
        const [id, side] = String(v).split('.') as [string, Side | undefined];
        const box = boxes.get(id);
        if (!box) {
          const alt = closest(id, boxes.keys());
          c.issue('V-1', 'error', `${p.el.id}.${key}: no element "${id}" in scene "${s.id}"`, [...ep, key], {
            hint: alt
              ? `Did you mean "${alt}"? Arrows connect elements of the same scene`
              : 'Use an element id of this scene or {x, y}',
          });
          return { point: { x: W / 2, y: H / 2 } };
        }
        return { box, side };
      };
      const a = parse('from');
      const b = parse('to');
      const resolvePt = (e: ReturnType<typeof parse>, other: ReturnType<typeof parse>) => {
        if (!e) return undefined;
        if ('point' in e && e.point) return e.point;
        const otherC = other
          ? 'point' in other && other.point
            ? other.point
            : center((other as { box: Rect }).box)
          : { x: W / 2, y: H / 2 };
        const { box, side } = e as { box: Rect; side?: Side };
        return anchorPoint(box, side ?? autoSide(box, otherC));
      };
      const pa = resolvePt(a, b);
      const pb = resolvePt(b, a);
      if (p.def.name === 'arrow') {
        placeArrow(p.el, pa!, pb!, W, H);
      } else {
        if (!p.spec.place) p.el.box = { x: 0, y: 0, w: W, h: H };
        const off = (pt?: { x: number; y: number }) =>
          pt ? { x: Math.round(pt.x - p.el.box.x), y: Math.round(pt.y - p.el.box.y) } : undefined;
        p.el.props = { ...raw, from: off(pa), to: off(pb) };
      }
    }

    // ---- per-component normalization, events, hits
    for (const p of pending) {
      const el = p.el;
      if (el.component === 'arrow') {
        const pr = el.props as {
          packet: unknown;
          packets: { at?: number; dur: number; color?: string; reverse: boolean }[];
        };
        const packets = [...pr.packets];
        if (pr.packet) {
          const pk =
            typeof pr.packet === 'object'
              ? (pr.packet as (typeof packets)[number])
              : { dur: 0.8, reverse: false };
          packets.unshift(pk);
        }
        el.props = {
          ...el.props,
          packets: packets.map((pk) => ({ ...pk, at: pk.at ?? round3(el.enter.t + el.enter.dur) })),
        };
      }
      if (el.component === 'stamp') {
        const hitT = round3(el.enter.t + el.enter.dur * 0.6);
        c.flashes.push({
          t: hitT,
          color: String((el.props as { color: string }).color),
          dur: 0.28,
          intensity: 0.22,
        });
        c.shakes.push({ t: hitT, amp: 14, dur: 0.35 });
      }
      if (el.component === 'trap') {
        const t = typeof el.props.at === 'number' ? (el.props.at as number) : el.enter.t;
        c.flashes.push({ t, color: String(el.props.color), dur: 0.35, intensity: 0.3 });
        c.shakes.push({ t, amp: 18, dur: 0.4 });
      }
      if (sfxMode === 'auto' && p.spec.sfx === 'auto' && p.def.events) {
        for (const ev of p.def.events(el.props, el)) addSfx(ev.t, ev.sound, ev.gain_db, el.id);
      }
      if (Array.isArray(p.spec.sfx) && sfxMode !== 'none') {
        p.spec.sfx.forEach((x, k) =>
          addSfx(
            c.time(x.at, [...sp, 'elements', p.ej, 'sfx', k, 'at'], el.enter.t),
            x.sound,
            x.gain_db,
            el.id,
          ),
        );
      }
    }

    const elements = pending.map((p) => p.el).sort((a, b) => a.z - b.z);
    scenes.push({
      id: s.id,
      start,
      end,
      transition: s.transition,
      ...(s.camera !== 'still' ? { camera: s.camera } : {}),
      layout: s.layout,
      origin: area,
      elements,
      hash: '',
      source: c.pos(sp),
    });
  });

  // ---- audio.extra
  if (sfxMode !== 'none') {
    spec.audio.extra.forEach((x, k) =>
      addSfx(c.time(x.at, ['audio', 'extra', k, 'at'], 0), x.sound, x.gain_db, 'audio.extra'),
    );
  }

  // ---- chapters
  const chapters = spec.chapters
    .map((ch, i) => ({ t: c.time(ch.at, ['chapters', i, 'at'], 0), label: ch.label }))
    .sort((a, b) => a.t - b.t);

  // ---- captions (FR-CORE-4)
  const captions = buildCaptions(
    script.map((l) => {
      const lt = lines.get(l.id)!;
      return {
        id: l.id,
        text: l.text,
        caption: l.caption,
        breaks: l.break,
        start: lt.start,
        next: lt.next,
        wordStarts: lt.words.map((w) => w.start),
      };
    }),
    { maxChars: c.theme.captions.max_chars, duration },
  );

  // ---- SFX dedupe (FR-CORE-5): same sound closer than 80 ms → keep the louder one
  sfx.sort((a, b) => a.t - b.t || b.gain_db - a.gain_db);
  const deduped: TimelineSfx[] = [];
  const lastBySound = new Map<string, TimelineSfx>();
  for (const ev of sfx) {
    const prev = lastBySound.get(ev.sound);
    if (prev && ev.t - prev.t < 0.08) {
      if (ev.gain_db > prev.gain_db) prev.gain_db = ev.gain_db;
      continue;
    }
    deduped.push(ev);
    lastBySound.set(ev.sound, ev);
  }

  glow.sort((a, b) => a.t - b.t);
  if (!glow.length || glow[0].t > 0)
    glow.unshift({ t: 0, color: glow[0]?.color ?? c.theme.colors.cyan ?? '#55dcff' });

  const theme = resolvedTheme(c.theme);
  for (const s of scenes) {
    s.hash = sha1(
      stableStringify({ s: { ...s, hash: '', source: undefined }, theme, preset: c.preset }),
    ).slice(0, 16);
  }

  const envelope = voice
    ? frameEnvelope(voice.mono, voice.sampleRate, fps, frames)
    : new Array<number>(frames).fill(0);
  const dir =
    hasArabic(script.map((l) => l.text).join(' ')) || spec.meta.lang.startsWith('ar') ? 'rtl' : 'ltr';

  const timeline: Timeline = {
    version: 1,
    fps,
    width: c.preset.width,
    height: c.preset.height,
    duration,
    frames,
    meta: {
      id: spec.meta.id,
      series: spec.meta.series,
      title: spec.meta.title,
      episode: spec.meta.episode,
      lang: spec.meta.lang,
      dir,
    },
    preset: c.preset,
    theme,
    chapters,
    glow,
    scenes,
    captions,
    flashes: c.flashes.sort((a, b) => a.t - b.t),
    shakes: c.shakes.sort((a, b) => a.t - b.t),
    sfx: deduped,
    audio: {
      sfxGainDb: spec.audio.sfx_gain_db,
      duck: spec.audio.duck,
      denoise: spec.audio.denoise,
      envelope,
    },
    script: script.map((l) => {
      const lt = lines.get(l.id)!;
      return {
        id: l.id,
        text: l.text,
        start: lt.start,
        end: lt.next,
        words: lt.words.map((w) => ({ text: w.text, start: w.start })),
      };
    }),
    cues: cueMap,
    assetBase: '../episode/assets/',
    seed: hashString(spec.meta.id),
  };

  c.issues.push(...lintTimeline(timeline, { file: src.file }));
  const issues = sortIssues(c.issues);
  return {
    ok: !issues.some((i) => i.level === 'error'),
    timeline,
    spec,
    issues,
    files: [...files],
    script: script.map((l) => ({ id: l.id, text: l.text })),
    voice,
  };
}

function layoutFlow(
  s: SceneSpec,
  items: { spec: ElementSpec; el: TElement }[],
  W: number,
  H: number,
  sizeOf: (p: never) => { w: number; h: number },
) {
  if (!items.length) return;
  const size = sizeOf as unknown as (p: { spec: ElementSpec }) => { w: number; h: number };
  const pad = 60;
  const alignPos = (avail: number, len: number, align: string | undefined, origin: number) =>
    origin + (align === 'start' ? 0 : align === 'end' ? avail - len : (avail - len) / 2);

  const stack = (
    list: typeof items,
    x0: number,
    colW: number,
    gap: number,
    y0: number,
    availH: number,
    align?: string,
  ) => {
    const hs = list.map(
      (p) => p.spec.size?.h ?? Math.min(size(p).h, (availH - gap * (list.length - 1)) / list.length),
    );
    const total = hs.reduce((a, b) => a + b, 0) + gap * (list.length - 1);
    let y = alignPos(availH, total, align, y0);
    list.forEach((p, i) => {
      const w = Math.min(p.spec.size?.w ?? size(p).w, colW);
      p.el.box = roundRect({ x: x0 + (colW - w) / 2, y, w, h: hs[i] });
      y += hs[i] + gap;
    });
  };

  if (s.columns) {
    const n = s.columns;
    const gutter = s.gutter ?? 40;
    const colW = (W - 2 * pad - gutter * (n - 1)) / n;
    for (let k = 0; k < n; k++) {
      const list = items.filter((p, i) => (p.spec.col ?? i % n) === k);
      if (list.length) stack(list, pad + k * (colW + gutter), colW, 30, 40, H - 80, 'center');
    }
    return;
  }
  if (s.column) {
    const f = s.column;
    const gap = f.gap ?? 30;
    const colW = f.w ?? W - 2 * pad;
    const x0 = f.x ?? (W - colW) / 2;
    stack(items, x0, colW, gap, f.y ?? 40, f.h ?? H - 80, f.align);
    return;
  }
  const f = s.row!;
  const gap = f.gap ?? 40;
  const availW = f.w ?? W - 2 * pad;
  const ws = items.map(
    (p) => p.spec.size?.w ?? Math.min(size(p).w, (availW - gap * (items.length - 1)) / items.length),
  );
  const totalW = ws.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
  let x = f.x ?? (W - totalW) / 2;
  items.forEach((p, i) => {
    const h = p.spec.size?.h ?? f.h ?? size(p).h;
    const y = f.y !== undefined ? f.y : alignPos(H, h, f.align, 0);
    p.el.box = roundRect({ x, y, w: ws[i], h });
    x += ws[i] + gap;
  });
}

function placeArrow(
  el: TElement,
  a: { x: number; y: number },
  b: { x: number; y: number },
  W: number,
  H: number,
) {
  const props = el.props as { gap: number; route: string; label?: string };
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const g = Math.min(props.gap, len / 4);
  const p0 = { x: a.x + ux * g, y: a.y + uy * g };
  const p1 = { x: b.x - ux * g, y: b.y - uy * g };
  let pts: { x: number; y: number }[];
  if (props.route === 'elbow') {
    if (Math.abs(p1.x - p0.x) >= Math.abs(p1.y - p0.y)) {
      const mx = (p0.x + p1.x) / 2;
      pts = [p0, { x: mx, y: p0.y }, { x: mx, y: p1.y }, p1];
    } else {
      const my = (p0.y + p1.y) / 2;
      pts = [p0, { x: p0.x, y: my }, { x: p1.x, y: my }, p1];
    }
  } else if (props.route === 'curve') {
    const mx = (p0.x + p1.x) / 2;
    const my = (p0.y + p1.y) / 2;
    const bend = len * 0.22;
    pts = [p0, { x: mx - uy * bend, y: my + ux * bend }, p1];
  } else {
    pts = [p0, p1];
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const padX = props.label ? 160 : 30;
  const padY = props.label ? 60 : 30;
  const x0 = Math.max(0, Math.min(...xs) - padX);
  const y0 = Math.max(0, Math.min(...ys) - padY);
  const x1 = Math.min(W, Math.max(...xs) + padX);
  const y1 = Math.min(H, Math.max(...ys) + padY);
  el.box = roundRect({ x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) });
  el.props = {
    ...el.props,
    points: pts.map((p) => ({ x: round3(p.x - el.box.x), y: round3(p.y - el.box.y) })),
    from: undefined,
    to: undefined,
  };
}

function extractScript(data: unknown): { id: string; text: string }[] {
  const s = (data as { script?: unknown })?.script;
  if (!Array.isArray(s)) return [];
  return s
    .map((l, i) => ({
      id: typeof l?.id === 'string' ? l.id : `l${i + 1}`,
      text: typeof l?.text === 'string' ? l.text : '',
    }))
    .filter((l) => l.text);
}

const LEVEL_ORDER = { error: 0, warn: 1, info: 2 } as const;
export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) =>
      LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
      (a.line ?? 1e9) - (b.line ?? 1e9) ||
      a.rule.localeCompare(b.rule),
  );
}

export { estimateWordStarts };
