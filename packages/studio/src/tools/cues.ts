/** Cue tools: estimated, known and automatically aligned line (and word) timings. */
import { existsSync } from 'node:fs';
import { draftCues, readCues, writeCues } from '@reelforge/core';
import { alignEpisode } from '@reelforge/assist';
import { z } from 'zod';
import { checked, checkedOutput, compile, episodeArg, episodeOf } from './common.js';
import { defineTool, ToolError } from './types.js';

const AFTER_CUES = 'preview_frames at key moments, then render_episode when it looks clean.';

export const setCues = defineTool({
  name: 'set_cues',
  title: 'Set cues',
  description:
    'Set the start time (seconds in the voice recording) of script lines, e.g. {"l1": 0.2, "l2": 3.4}. Normally a person marks cues by ear in the studio; use this to apply known timings. Use draft_cues for estimates. Without a recording (silent videos), `duration` sets the total length; otherwise it grows to fit the last line.',
  input: z
    .object({
      episode: episodeArg,
      cues: z.record(z.number().min(0)),
      duration: z
        .number()
        .positive()
        .optional()
        .describe('Total length in seconds. Only used when there is no voice recording.'),
    })
    .strict(),
  output: checkedOutput,
  toolsets: ['basic'],
  handler: async (a, ctx) => {
    const p = episodeOf(ctx, a.episode);
    const r = compile(ctx, p);
    const known = new Set(r.script.map((l) => l.id));
    const unknown = Object.keys(a.cues).filter((k) => !known.has(k));
    if (unknown.length) throw new ToolError(`Unknown line ids: ${unknown.join(', ')}`);
    const cur = readCues(p.cues).cues;
    const cues = { ...(cur?.cues ?? {}), ...a.cues };
    const file = cur?.audio.file ?? r.spec?.audio.voice ?? 'voice.wav';
    let duration = r.voice?.duration ?? cur?.audio.duration ?? r.timeline?.duration ?? 0;
    if (!r.voice) {
      // No recording to measure: the length is the caller's, or long enough to say the last line.
      const est = draftCues(r.script, file);
      const ids = r.script.map((l) => l.id);
      const last = ids.filter((id) => cues[id] !== undefined).at(-1);
      const lastLen = last
        ? (est.cues[ids[ids.indexOf(last) + 1]] ?? est.audio.duration - 0.6) - est.cues[last]
        : 0;
      const fit = last ? cues[last] + lastLen + 0.6 : 0;
      duration = a.duration ?? Math.max(duration, fit);
    }
    writeCues(p.cues, {
      version: 1,
      audio: { file, duration: Math.round(duration * 1000) / 1000 },
      cues,
      words: cur?.words ?? {},
    });
    return checked(`Saved ${Object.keys(a.cues).length} cue(s).`, compile(ctx, p).issues, AFTER_CUES);
  },
});

export const draftCuesTool = defineTool({
  name: 'draft_cues',
  title: 'Draft cues',
  description:
    'Write estimated cues (from the text length, scaled to the voice recording if there is one) so the episode can be previewed and rendered before cues are marked by ear.',
  input: z.object({ episode: episodeArg, overwrite: z.boolean().default(false) }).strict(),
  output: checkedOutput,
  toolsets: ['basic'],
  handler: async (a, ctx) => {
    const p = episodeOf(ctx, a.episode);
    if (existsSync(p.cues) && !a.overwrite && !readCues(p.cues).cues?.draft)
      throw new ToolError('cues.json has marked cues; pass overwrite: true to replace them with estimates');
    const r = compile(ctx, p);
    const d = draftCues(r.script, r.spec?.audio.voice);
    if (r.voice) {
      const k = r.voice.duration / d.audio.duration;
      for (const id of Object.keys(d.cues)) d.cues[id] = Math.round(d.cues[id] * k * 1000) / 1000;
      d.audio.duration = Math.round(r.voice.duration * 1000) / 1000;
    }
    writeCues(p.cues, d);
    return checked(
      `Wrote draft cues for ${Object.keys(d.cues).length} line(s).`,
      compile(ctx, p).issues,
      AFTER_CUES,
      { cues: d.cues },
    );
  },
});

export const alignCues = defineTool({
  name: 'align_cues',
  title: 'Align cues to the recording',
  description:
    'Mark cues automatically from the voice recording: every line start and every word (cues.json, flagged auto). Engine "auto" uses Whisper word timings matched to the known script when the optional speech models are installed (`reelforge align --setup`), otherwise pause detection (fast, no model). Lines with confidence < 0.5 deserve a listen. Refuses to replace cues marked by hand unless force: true.',
  input: z
    .object({
      episode: episodeArg,
      engine: z.enum(['auto', 'dsp', 'whisper']).default('auto'),
      words: z.boolean().default(true).describe('Also place every word'),
      force: z.boolean().default(false).describe('Replace cues marked by hand'),
    })
    .strict(),
  output: checkedOutput,
  toolsets: ['basic'],
  handler: async (a, ctx) => {
    const p = episodeOf(ctx, a.episode);
    ctx.progress(0, 1, 'aligning');
    let r: Awaited<ReturnType<typeof alignEpisode>>;
    try {
      r = await alignEpisode(p, { engine: a.engine, words: a.words, force: a.force, decode: ctx.decode });
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
    const shaky = Object.entries(r.confidence)
      .filter(([, v]) => v < 0.5)
      .map(([k]) => k);
    return checked(
      `Aligned ${Object.keys(r.cues.cues).length} line(s) with ${r.engine}${r.vad ? ' + VAD' : ''} in ${(r.ms.total / 1000).toFixed(1)} s${r.matched !== undefined ? ` (${Math.round(r.matched * 100)}% of words heard)` : ''}.${shaky.length ? ` Check by ear: ${shaky.join(', ')}.` : ''}${r.note ? ` ${r.note}` : ''}`,
      compile(ctx, p).issues,
      shaky.length
        ? `ask the person to listen to ${shaky.join(', ')} in the editor (open_editor, Cues mode), then preview_frames.`
        : AFTER_CUES,
      {
        engine: r.engine,
        vad: r.vad,
        matched: r.matched,
        cues: r.cues.cues,
        confidence: r.confidence,
        pauses: r.pauses,
        ms: r.ms,
      },
    );
  },
});

export const tools = [setCues, draftCuesTool, alignCues];
