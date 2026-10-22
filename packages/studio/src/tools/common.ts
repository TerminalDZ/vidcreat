/** Helpers shared by the tool groups: episode lookup, compiling, issue summaries and results. */
import path from 'node:path';
import {
  compileEpisode,
  normalizeWord,
  readCues,
  resolveEpisode,
  resolveTime,
  type CompileResult,
  type EpisodePaths,
  type Issue,
} from '@reelforge/core';
import { z } from 'zod';
import { ToolError, type Json, type ToolHost, type ToolResult } from './types.js';

export const episodeArg = z
  .string()
  .min(1)
  .describe('Episode id (e.g. "ep10") or path relative to the project root (e.g. "examples/season1/ep02")');

/** Resolves an episode argument inside the project root. */
export function episodeOf(ctx: ToolHost, arg: string): EpisodePaths {
  const p = resolveEpisode(arg.trim(), ctx.root);
  if (!p) throw new ToolError(`Episode "${arg}" not found. Use list_episodes to see the available ones.`);
  const rel = path.relative(ctx.root, p.dir);
  if (rel.startsWith('..') || path.isAbsolute(rel))
    throw new ToolError('The episode must be inside the project folder');
  return p;
}

export const keyOf = (ctx: ToolHost, p: EpisodePaths) =>
  path.relative(ctx.root, p.dir).split(path.sep).join('/');

export const compile = (ctx: ToolHost, p: EpisodePaths, yamlText?: string): CompileResult =>
  compileEpisode(p, { draftCues: true, decode: ctx.decode, yamlText });

/** Errors that stop compilation altogether (schema or YAML syntax). */
export const fatal = (r: CompileResult) =>
  r.issues.some((i) => i.level === 'error' && (i.rule === 'V-1' || i.rule === 'V-13'));

export { atomicWrite } from '../server/edit.js';

/**
 * Text result. Some clients (Claude Code among them) show only structuredContent when it is present,
 * so it always carries the human message too.
 */
export const text = (t: string, structured?: Json): ToolResult => ({
  content: [{ type: 'text', text: t }],
  ...(structured
    ? { structuredContent: /^\s*[[{]/.test(t) ? structured : { message: t, ...structured } }
    : {}),
});

export const fmtIssue = (i: Issue) =>
  `${i.level.toUpperCase()} ${i.rule}${i.line ? ` (line ${i.line})` : ''}${i.time !== undefined ? ` @${i.time}s` : ''}: ${i.message}${i.hint ? ` — hint: ${i.hint}` : ''}`;

export interface IssueSummary {
  errors: number;
  warnings: number;
  list: string[];
}

export function issueSummary(issues: Issue[]): IssueSummary {
  return {
    errors: issues.filter((i) => i.level === 'error').length,
    warnings: issues.filter((i) => i.level === 'warn').length,
    list: issues.slice(0, 40).map(fmtIssue),
  };
}

/** Actionable hints for errors and warnings, one per distinct problem. */
export function fixHints(issues: Issue[]): string[] {
  const out = new Set<string>();
  for (const i of issues) {
    if (i.level === 'info') continue;
    const where = [i.line ? `line ${i.line}` : '', i.elementId ?? ''].filter(Boolean).join(', ');
    const fix = i.hint ?? i.message;
    out.add(`${i.rule}${where ? ` (${where})` : ''}: ${fix}`);
    if (out.size >= 20) break;
  }
  return [...out];
}

/** The recommended next step after a change, so a model can keep going or self-correct. */
export function nextStep(s: IssueSummary, whenClean: string): string {
  if (s.errors)
    return `Fix the ${s.errors} error(s) listed in "fixes" (edit_episode), then call validate_episode again.`;
  if (s.warnings)
    return `Fix the ${s.warnings} warning(s) listed in "fixes" or explain them to the person, then ${whenClean}`;
  return whenClean.charAt(0).toUpperCase() + whenClean.slice(1);
}

export const checkedOutput = z
  .object({
    message: z.string(),
    issues: z.object({ errors: z.number(), warnings: z.number(), list: z.array(z.string()) }),
    fixes: z.array(z.string()).describe('Fix hints for the errors and warnings'),
    next: z.string().describe('Recommended next step'),
  })
  .passthrough();

/**
 * Result of a write or check: the message, the validation summary, fix hints and the next step,
 * in both the text and the structured content.
 */
export function checked(
  message: string,
  issues: Issue[],
  whenClean: string,
  extra: Json = {},
  isError = false,
): ToolResult {
  const s = issueSummary(issues);
  const fixes = fixHints(issues);
  const next = nextStep(s, whenClean);
  const body = [
    `${message} ${s.errors} error(s), ${s.warnings} warning(s).`,
    ...s.list,
    ...(fixes.length ? ['', 'Fixes:', ...fixes.map((f) => `- ${f}`)] : []),
    '',
    `Next: ${next}`,
  ].join('\n');
  return {
    content: [{ type: 'text', text: body }],
    structuredContent: { message: body, ...extra, issues: s, fixes, next },
    ...(isError ? { isError: true } : {}),
  };
}

/** Compiled outline of an episode: what a model needs to edit it by path and time. */
export function outline(ctx: ToolHost, p: EpisodePaths, r: CompileResult) {
  const tl = r.timeline;
  const cues = readCues(p.cues).cues;
  return {
    episode: keyOf(ctx, p),
    title: r.spec?.meta.title,
    lang: r.spec?.meta.lang,
    preset: r.spec?.meta.preset,
    theme: r.spec?.meta.theme,
    duration: tl?.duration,
    voice: r.voice ? { file: path.basename(r.voice.file), duration: r.voice.duration } : null,
    cues: cues ? { marked: Object.keys(cues.cues).length, draft: Boolean(cues.draft) } : null,
    script: tl
      ? tl.script.map((l) => ({
          id: l.id,
          text: l.text,
          start: l.start,
          end: l.end,
          words: l.words.map((w) => w.text),
        }))
      : r.script.map((l) => ({ id: l.id, text: l.text })),
    scenes: (r.spec?.scenes ?? []).map((s, si) => {
      const c = tl?.scenes.find((x) => x.id === s.id);
      return {
        index: si,
        id: s.id,
        at: s.at,
        start: c?.start,
        end: c?.end,
        elements: s.elements.map((e, ej) => {
          const id = e.id ?? `${s.id}-${e.use}-${ej + 1}`;
          const ce = c?.elements.find((x) => x.id === id);
          return {
            index: ej,
            path: ['scenes', si, 'elements', ej],
            id,
            use: e.use,
            enter: e.enter?.at ?? '(scene start)',
            enterSeconds: ce?.enter.t,
            exitSeconds: ce?.exit?.t,
            box: ce ? { ...ce.box } : undefined,
          };
        }),
      };
    }),
    issues: issueSummary(r.issues),
  };
}

/** Resolves seconds or time expressions (l3, l3:'word'+0.8, @scene) against a compiled timeline. */
export function resolveTimes(r: CompileResult, times: (string | number)[]): number[] {
  const tl = r.timeline!;
  const lines = new Map(
    tl.script.map((l) => [
      l.id,
      {
        id: l.id,
        start: l.start,
        next: l.end,
        words: l.words.map((w) => ({ ...w, norm: normalizeWord(w.text) })),
      },
    ]),
  );
  return times.map((x) => {
    if (typeof x === 'number') return Math.max(0, Math.min(tl.duration, x));
    const s = String(x).trim();
    try {
      return resolveTime(/^\d+(\.\d+)?$/.test(s) ? `${s}s` : s, {
        lines,
        duration: tl.duration,
        sceneIds: () => tl.scenes.map((sc) => sc.id),
        sceneTime: (id, part) => {
          const sc = tl.scenes.find((y) => y.id === id)!;
          return part === 'end' ? sc.end : sc.start;
        },
      });
    } catch (e) {
      throw new ToolError(`Invalid time "${s}": ${(e as Error).message}`);
    }
  });
}
