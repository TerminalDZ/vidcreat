/** Render tools: background render, status, cancel, the visual editor and the environment check. */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { runDoctor } from '@reelforge/renderer';
import { z } from 'zod';
import { episodeArg, episodeOf, keyOf, text } from './common.js';
import { defineTool, ToolError, type Json } from './types.js';

export const renderEpisode = defineTool({
  name: 'render_episode',
  title: 'Render an episode',
  description:
    'Start rendering the final videos (master MP4, share MP4, SRT, contact sheet, publish.md in <episode>/out/). Rendering takes minutes: it runs in the background; poll get_render_status. Use silent: true when there is no voice recording.',
  input: z
    .object({
      episode: episodeArg,
      preset: z
        .string()
        .optional()
        .describe('Platform preset: tiktok, reels, shorts or a preset in presets/ (default: meta.preset)'),
      silent: z.boolean().default(false),
      fast: z.boolean().default(false).describe('Quick lower-quality draft'),
      shareMb: z.number().min(5).max(500).optional(),
      sfx: z.boolean().default(true),
      denoise: z
        .boolean()
        .optional()
        .describe('Remove background noise from the voice (default: audio.denoise in episode.yaml)'),
    })
    .strict(),
  toolsets: ['render'],
  handler: async (a, ctx) => {
    const p = episodeOf(ctx, a.episode);
    try {
      const job = ctx.runner.start(keyOf(ctx, p), p, {
        preset: a.preset,
        silent: a.silent,
        fast: a.fast,
        shareMb: a.shareMb,
        sfx: a.sfx,
        denoise: a.denoise,
      });
      return text(`Render started (job ${job.id}). Poll get_render_status.`, {
        job: { ...job },
        next: 'Poll get_render_status every 15-30 s; do other work in between.',
      });
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
  },
});

export const getRenderStatus = defineTool({
  name: 'get_render_status',
  title: 'Render status',
  description: "Progress of the current/last render, and the files in the episode's out/ folder.",
  input: z.object({ episode: episodeArg.optional() }).strict(),
  toolsets: ['basic', 'render'],
  annotations: { readOnlyHint: true },
  handler: async (a, ctx) => {
    const job = ctx.runner.job;
    let files: string[] = [];
    if (a.episode) {
      const p = episodeOf(ctx, a.episode);
      files = existsSync(p.out)
        ? readdirSync(p.out)
            .filter((f) => !f.startsWith('.'))
            .map((f) => path.join(p.out, f))
        : [];
    }
    const pct = job && job.total ? Math.round((job.done / job.total) * 100) : 0;
    const msg = job
      ? `${job.key}: ${job.status} · ${job.phase} ${pct}%${job.eta ? ` · ~${Math.ceil(job.eta)} s left` : ''}${job.message ? ` · ${job.message}` : ''}`
      : 'No render has been started.';
    return text(`${msg}${files.length ? `\nOutputs:\n${files.join('\n')}` : ''}`, {
      job: job ? { ...job } : null,
      files,
    });
  },
});

export const cancelRender = defineTool({
  name: 'cancel_render',
  title: 'Cancel the render',
  description: 'Cancel the running render.',
  input: z.object({}).strict(),
  toolsets: ['render'],
  annotations: { idempotentHint: true },
  handler: async (_a, ctx) => {
    ctx.runner.cancel();
    return text('Cancel requested.');
  },
});

export const openEditor = defineTool({
  name: 'open_editor',
  title: 'Open the visual editor',
  description:
    'Start the ReelForge visual editor for an episode on 127.0.0.1 and return its URL, so a person can review or fine-tune what you made (and mark cues by ear).',
  input: z.object({ episode: episodeArg }).strict(),
  toolsets: ['render'],
  handler: async (a, ctx) => {
    const p = episodeOf(ctx, a.episode);
    const { url } = await ctx.openStudio(p, keyOf(ctx, p));
    return text(`Editor for ${keyOf(ctx, p)}: ${url}`, { url });
  },
});

export const doctor = defineTool({
  name: 'doctor',
  title: 'Check the environment',
  description: 'Check Node.js, FFmpeg, the rendering Chromium and fonts.',
  input: z.object({}).strict(),
  toolsets: ['render'],
  annotations: { readOnlyHint: true },
  handler: async () => {
    const checks = await runDoctor();
    return text(
      checks
        .map(
          (c) => `${c.ok ? 'OK ' : 'FAIL'} ${c.name}: ${c.detail}${!c.ok && c.fix ? ` — fix: ${c.fix}` : ''}`,
        )
        .join('\n'),
      { checks: checks as unknown as Json },
    );
  },
});

export const tools = [renderEpisode, getRenderStatus, cancelRender, openEditor, doctor];
