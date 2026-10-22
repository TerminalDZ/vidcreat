/** preview_frames: still frames as images for vision models plus a text layout description per time. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ffmpegBin, snapFrames } from '@reelforge/renderer';
import { z } from 'zod';
import { compile, episodeArg, episodeOf, fatal, issueSummary, resolveTimes } from './common.js';
import { describeLayout, layoutText } from './layout.js';
import { defineTool, ToolError, type ToolResult } from './types.js';

/** Downscaled JPEG for agent vision (the PNG frame is 1080×1920). */
function toJpeg(png: string, width: number): string {
  const out = png.replace(/\.png$/, `.${width}.jpg`);
  execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-i', png, '-vf', `scale=${width}:-2`, '-q:v', '4', out]);
  return readFileSync(out).toString('base64');
}

export const previewFrames = defineTool({
  name: 'preview_frames',
  title: 'Preview frames',
  description:
    'Render still frames of the episode and return them as images so you can see the result, each with a text layout description (visible elements and their canvas boxes, layers, overlaps between base elements, platform UI zones they touch). Times: seconds (12.5), line ids ("l7" = when line 7 starts), words ("l7:\'Idempotency\'"), or offsets ("l7+0.8"). Tip: check a moment shortly after elements enter.',
  input: z
    .object({
      episode: episodeArg,
      times: z
        .array(z.union([z.string(), z.number()]))
        .min(1)
        .max(8),
      width: z
        .number()
        .int()
        .min(180)
        .max(1080)
        .default(360)
        .describe('Image width in pixels (height is 16/9 × width; frames are 9:16)'),
    })
    .strict(),
  toolsets: ['basic'],
  annotations: { readOnlyHint: true },
  handler: async (a, ctx) => {
    const p = episodeOf(ctx, a.episode);
    const r = compile(ctx, p);
    if (!r.timeline || fatal(r))
      throw new ToolError(`The episode does not compile:\n${issueSummary(r.issues).list.join('\n')}`);
    const tl = r.timeline;
    const ts = resolveTimes(r, a.times);
    const layouts = ts.map((t, i) => describeLayout(tl, t, String(a.times[i])));
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'rf-mcp-'));
    try {
      ctx.progress(0, ts.length, 'rendering frames');
      const res = await snapFrames(tl, ts, tmp, { assetsDir: p.assets, sheet: false });
      const content: ToolResult['content'] = [];
      res.frames.forEach((f, i) => {
        content.push({ type: 'text', text: layoutText(layouts[i]) });
        content.push({ type: 'image', data: toJpeg(f, a.width), mimeType: 'image/jpeg' });
      });
      return {
        content,
        structuredContent: { message: layouts.map(layoutText).join('\n\n'), frames: layouts },
      };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
});

export const tools = [previewFrames];
