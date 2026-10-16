/**
 * `reelforge mcp`: a Model Context Protocol server over stdio, so AI agents (Claude Code, Claude
 * Desktop, Cursor, VS Code Copilot, Windsurf, Codex, Gemini CLI, …) can create, edit, preview,
 * validate and render episodes. JSON-RPC 2.0, one message per line; stdout carries protocol
 * messages only (all logging goes to stderr).
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import {
  COMPONENTS,
  compileEpisode,
  draftCues,
  episodeJsonSchema,
  episodePaths,
  episodeTemplate,
  INSTALL_ROOT,
  listResources,
  normalizeWord,
  readCues,
  resolveEpisode,
  resolveTime,
  writeCues,
  type CompileResult,
  type EpisodePaths,
  type Issue,
} from '@reelforge/core';
import { ffmpegBin, measureTimeline, runDoctor, snapFrames } from '@reelforge/renderer';
import { applyOps, parseOps, RenderRunner, startStudio, type EditOp, type Studio } from '@reelforge/studio';
import { ffmpegDecode } from './decode.js';

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

type Json = Record<string, unknown>;
interface ToolResult {
  content: ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[];
  structuredContent?: Json;
  isError?: boolean;
}
interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  annotations?: Json;
  run: (
    args: Json,
    ctx: { progress: (p: number, total?: number, message?: string) => void },
  ) => Promise<ToolResult>;
}

class ToolError extends Error {}

/** Writes via a temp file + rename, so a watching editor never reads a half-written file. */
function atomicWrite(file: string, text: string): void {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

/**
 * Text result. Some clients (Claude Code among them) show only structuredContent when it is present,
 * so it always carries the human message too.
 */
const text = (t: string, structured?: Json): ToolResult => ({
  content: [{ type: 'text', text: t }],
  ...(structured
    ? { structuredContent: /^\s*[[{]/.test(t) ? structured : { message: t, ...structured } }
    : {}),
});

const EPISODE = {
  type: 'string',
  description: 'Episode id (e.g. "ep10") or path relative to the project root (e.g. "examples/season1/ep02")',
};

export async function startMcp(opts: { root: string; version: string }): Promise<void> {
  const root = path.resolve(opts.root);
  const log = (m: string): void => {
    process.stderr.write(`[reelforge-mcp] ${m}\n`);
  };
  // Keep stdout clean for the protocol.
  console.log = (...a: unknown[]) => log(a.map(String).join(' '));
  console.info = console.log;
  console.warn = (...a: unknown[]) => log(a.map(String).join(' '));
  const runner = new RenderRunner({ decode: ffmpegDecode, log });
  const studios = new Map<string, Studio>();

  // ------------------------------------------------------------------ helpers
  const ep = (arg: unknown): EpisodePaths => {
    if (typeof arg !== 'string' || !arg.trim())
      throw new ToolError('"episode" is required (an id like "ep10" or a path)');
    const p = resolveEpisode(arg.trim(), root);
    if (!p) throw new ToolError(`Episode "${arg}" not found. Use list_episodes to see the available ones.`);
    const rel = path.relative(root, p.dir);
    if (rel.startsWith('..') || path.isAbsolute(rel))
      throw new ToolError('The episode must be inside the project folder');
    return p;
  };
  const keyOf = (p: EpisodePaths) => path.relative(root, p.dir).split(path.sep).join('/');
  const compile = (p: EpisodePaths): CompileResult =>
    compileEpisode(p, { draftCues: true, decode: ffmpegDecode });
  const fatal = (r: CompileResult) =>
    r.issues.some((i) => i.level === 'error' && (i.rule === 'V-1' || i.rule === 'V-13'));
  const fmtIssue = (i: Issue) =>
    `${i.level.toUpperCase()} ${i.rule}${i.line ? ` (line ${i.line})` : ''}${i.time !== undefined ? ` @${i.time}s` : ''}: ${i.message}${i.hint ? ` — hint: ${i.hint}` : ''}`;
  const issueSummary = (issues: Issue[]) => {
    const errors = issues.filter((i) => i.level === 'error');
    const warns = issues.filter((i) => i.level === 'warn');
    return { errors: errors.length, warnings: warns.length, list: issues.slice(0, 40).map(fmtIssue) };
  };

  const outline = (p: EpisodePaths, r: CompileResult) => {
    const tl = r.timeline;
    const cues = readCues(p.cues).cues;
    return {
      episode: keyOf(p),
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
  };

  const resolveTimes = (r: CompileResult, times: unknown[]): number[] => {
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
          sceneIds: () => tl.scenes.map((x) => x.id),
          sceneTime: (id, part) => {
            const sc = tl.scenes.find((x) => x.id === id)!;
            return part === 'end' ? sc.end : sc.start;
          },
        });
      } catch (e) {
        throw new ToolError(`Invalid time "${s}": ${(e as Error).message}`);
      }
    });
  };

  /** Downscaled JPEG for agent vision (the PNG frame is 1080×1920). */
  const toJpeg = (png: string, width: number): string => {
    const out = png.replace(/\.png$/, `.${width}.jpg`);
    execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-i', png, '-vf', `scale=${width}:-2`, '-q:v', '4', out]);
    return readFileSync(out).toString('base64');
  };

  // ------------------------------------------------------------------ tools
  const tools: Tool[] = [
    {
      name: 'list_episodes',
      title: 'List episodes',
      description:
        'List every episode in the project (episodes/ and examples/) with title, language, duration, voice/cue status and error count.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      run: async () => {
        const found: Json[] = [];
        const scan = (dir: string, depth: number) => {
          if (!existsSync(dir) || depth > 2) return;
          for (const name of readdirSync(dir).sort()) {
            const full = path.join(dir, name);
            if (name.startsWith('.') || name === 'out' || !statSync(full).isDirectory()) continue;
            if (existsSync(path.join(full, 'episode.yaml'))) {
              const p = episodePaths(full, root);
              const r = compileEpisode(p, { draftCues: true, voice: null });
              const cues = readCues(p.cues).cues;
              found.push({
                episode: keyOf(p),
                title: r.spec?.meta.title,
                lang: r.spec?.meta.lang,
                lines: r.script.length,
                scenes: r.spec?.scenes.length ?? 0,
                voice: existsSync(path.join(full, r.spec?.audio.voice ?? 'voice.wav')),
                cues: cues ? (cues.draft ? 'draft' : 'marked') : 'none',
                errors: r.issues.filter((i) => i.level === 'error' && !(i.rule === 'V-4')).length,
              });
            } else scan(full, depth + 1);
          }
        };
        scan(path.join(root, 'episodes'), 0);
        scan(path.join(root, 'examples'), 0);
        return text(JSON.stringify(found, null, 2), { episodes: found });
      },
    },
    {
      name: 'get_episode',
      title: 'Read an episode',
      description:
        'Return the full episode.yaml text plus a compiled outline: script lines with ids, start times and words; scenes and elements with their YAML paths, resolved times and boxes; voice/cue status and lint issues. Read this before editing.',
      inputSchema: {
        type: 'object',
        properties: { episode: EPISODE },
        required: ['episode'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      run: async (a) => {
        const p = ep(a.episode);
        const r = compile(p);
        const o = outline(p, r);
        return text(
          `# ${keyOf(p)}/episode.yaml\n\n${readFileSync(p.yaml, 'utf8')}\n\n# Outline (compiled)\n\n${JSON.stringify(o, null, 2)}`,
          o,
        );
      },
    },
    {
      name: 'create_episode',
      title: 'Create an episode',
      description:
        'Create episodes/<id>/episode.yaml from the commented template. Optionally give the script (one spoken sentence per entry) to replace the template lines; estimated (draft) cues are written so the episode previews immediately. Then design scenes with edit_episode or write_episode_yaml.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$',
            description: 'Slug, e.g. "ep10"',
          },
          title: { type: 'string' },
          series: { type: 'string', description: 'Series name shown in the header' },
          lang: {
            type: 'string',
            enum: ['en', 'ar'],
            description: 'Language of the voice-over (default en)',
          },
          script: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
            description: 'Spoken sentences, one per line',
          },
        },
        required: ['id'],
        additionalProperties: false,
      },
      run: async (a) => {
        const id = String(a.id ?? '');
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id))
          throw new ToolError('id must be a slug like "ep10"');
        const dir = path.join(root, 'episodes', id);
        if (existsSync(path.join(dir, 'episode.yaml'))) throw new ToolError(`episodes/${id} already exists`);
        mkdirSync(path.join(dir, 'assets'), { recursive: true });
        let yaml = episodeTemplate(id, {
          series: a.series ? String(a.series) : undefined,
          lang: a.lang === 'ar' ? 'ar' : 'en',
        });
        writeFileSync(path.join(dir, 'episode.yaml'), yaml);
        const p = episodePaths(dir, root);
        const ops: EditOp[] = [];
        if (a.title) ops.push({ op: 'set', path: ['meta', 'title'], value: String(a.title) });
        if (Array.isArray(a.script) && a.script.length) {
          ops.push({ op: 'set', path: ['script'], value: a.script.map((t) => ({ text: String(t) })) });
          // keep the template scenes valid: anchor them to line starts
          ops.push({
            op: 'set',
            path: ['scenes'],
            value: [
              {
                id: 'hook',
                at: 'l1',
                elements: [
                  {
                    use: 'title',
                    id: 'hook_title',
                    props: { text: String(a.title ?? 'Your **headline**') },
                    enter: { at: 'l1', anim: 'pop' },
                  },
                ],
              },
            ],
          });
          ops.push({ op: 'set', path: ['chapters'], value: [] });
        }
        if (ops.length) {
          yaml = applyOps(yaml, ops);
          writeFileSync(p.yaml, yaml);
        }
        const r = compile(p);
        writeCues(p.cues, draftCues(r.script, r.spec?.audio.voice));
        const schemaFile = path.join(root, 'schema', 'episode.schema.json');
        if (!existsSync(schemaFile)) {
          mkdirSync(path.dirname(schemaFile), { recursive: true });
          writeFileSync(schemaFile, `${JSON.stringify(episodeJsonSchema(), null, 2)}\n`);
        }
        return text(
          `Created episodes/${id}/episode.yaml with draft cues.\n\n${JSON.stringify(outline(p, compile(p)), null, 2)}`,
          { episode: keyOf(p) },
        );
      },
    },
    {
      name: 'edit_episode',
      title: 'Edit an episode (structured)',
      description: [
        'Apply structured edits to episode.yaml. Comments and formatting of untouched parts are kept. Operations (applied in order):',
        '- {"op":"set","path":[...],"value":...} sets a value (missing parents are created);',
        '- {"op":"delete","path":[...]} removes a key or list item;',
        '- {"op":"insert","path":[...list],"index":n?,"value":...} inserts into a list (appends without index);',
        '- {"op":"move","path":[...list],"from":i,"to":j} reorders a list.',
        'Paths are arrays of keys and 0-based indexes, e.g. ["scenes",0,"elements",2,"props","text"] or ["scenes",1,"elements"] to add an element. Get paths from get_episode. Returns the compile result (errors/warnings).',
      ].join('\n'),
      inputSchema: {
        type: 'object',
        properties: {
          episode: EPISODE,
          ops: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                op: { type: 'string', enum: ['set', 'delete', 'insert', 'move'] },
                path: { type: 'array', items: { type: ['string', 'integer'] } },
                value: {},
                index: { type: 'integer', minimum: 0 },
                from: { type: 'integer', minimum: 0 },
                to: { type: 'integer', minimum: 0 },
              },
              required: ['op', 'path'],
            },
          },
        },
        required: ['episode', 'ops'],
        additionalProperties: false,
      },
      run: async (a) => {
        const p = ep(a.episode);
        const before = readFileSync(p.yaml, 'utf8');
        let after: string;
        try {
          after = applyOps(before, parseOps({ ops: a.ops }));
        } catch (e) {
          throw new ToolError((e as Error).message);
        }
        atomicWrite(p.yaml, after);
        const r = compile(p);
        const s = issueSummary(r.issues);
        return text(
          `Applied ${(a.ops as unknown[]).length} edit(s). ${s.errors} error(s), ${s.warnings} warning(s).${s.list.length ? `\n${s.list.join('\n')}` : ''}`,
          { issues: s },
        );
      },
    },
    {
      name: 'write_episode_yaml',
      title: 'Replace episode.yaml',
      description:
        'Replace the whole episode.yaml with new YAML text (use for large rewrites; prefer edit_episode for small changes). The file is only written when it parses and has no schema errors, unless force is true.',
      inputSchema: {
        type: 'object',
        properties: {
          episode: EPISODE,
          yaml: { type: 'string', minLength: 10 },
          force: { type: 'boolean', default: false },
        },
        required: ['episode', 'yaml'],
        additionalProperties: false,
      },
      run: async (a) => {
        const p = ep(a.episode);
        const r = compileEpisode(p, { draftCues: true, decode: ffmpegDecode, yamlText: String(a.yaml) });
        const s = issueSummary(r.issues);
        if (fatal(r) && !a.force)
          return {
            ...text(`Not written: the YAML has errors.\n${s.list.join('\n')}`, { issues: s }),
            isError: true,
          };
        atomicWrite(p.yaml, String(a.yaml).endsWith('\n') ? String(a.yaml) : `${String(a.yaml)}\n`);
        return text(
          `Wrote ${keyOf(p)}/episode.yaml. ${s.errors} error(s), ${s.warnings} warning(s).${s.list.length ? `\n${s.list.join('\n')}` : ''}`,
          { issues: s },
        );
      },
    },
    {
      name: 'validate_episode',
      title: 'Validate an episode',
      description:
        'Run every check (V-1…V-13: schema, cues, timing, overlaps, off-screen elements, platform safe zones, text overflow measured in the real browser, caption length). Each issue has a line, time and fix hint.',
      inputSchema: {
        type: 'object',
        properties: {
          episode: EPISODE,
          measure: { type: 'boolean', default: true, description: 'Measure text overflow headless (slower)' },
        },
        required: ['episode'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      run: async (a) => {
        const p = ep(a.episode);
        const r = compile(p);
        const issues = [...r.issues];
        if (a.measure !== false && r.timeline && !fatal(r))
          issues.push(
            ...(await measureTimeline(r.timeline, {
              cacheDir: path.join(p.out, '.cache'),
              assetsDir: p.assets,
              file: p.yaml,
            })),
          );
        const s = issueSummary(issues);
        return text(
          s.list.length
            ? `${s.errors} error(s), ${s.warnings} warning(s):\n${s.list.join('\n')}`
            : 'No issues. Ready to render.',
          { issues: s },
        );
      },
    },
    {
      name: 'preview_frames',
      title: 'Preview frames',
      description:
        'Render still frames of the episode and return them as images so you can see the result. Times: seconds (12.5), line ids ("l7" = when line 7 starts), words ("l7:\'Idempotency\'"), or offsets ("l7+0.8"). Tip: check a moment shortly after elements enter.',
      inputSchema: {
        type: 'object',
        properties: {
          episode: EPISODE,
          times: { type: 'array', minItems: 1, maxItems: 8, items: { type: ['string', 'number'] } },
          width: {
            type: 'integer',
            minimum: 180,
            maximum: 1080,
            default: 360,
            description: 'Image width in pixels (height is 16/9 × width; frames are 9:16)',
          },
        },
        required: ['episode', 'times'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      run: async (a, ctx) => {
        const p = ep(a.episode);
        const r = compile(p);
        if (!r.timeline || fatal(r))
          throw new ToolError(`The episode does not compile:\n${issueSummary(r.issues).list.join('\n')}`);
        const ts = resolveTimes(r, a.times as unknown[]);
        const tmp = mkdtempSync(path.join(os.tmpdir(), 'rf-mcp-'));
        try {
          ctx.progress(0, ts.length, 'rendering frames');
          const res = await snapFrames(r.timeline, ts, tmp, { assetsDir: p.assets, sheet: false });
          const width = Number(a.width) || 360;
          const content: ToolResult['content'] = [];
          res.frames.forEach((f, i) => {
            content.push({ type: 'text', text: `Frame at ${ts[i]}s (${String((a.times as unknown[])[i])})` });
            content.push({ type: 'image', data: toJpeg(f, width), mimeType: 'image/jpeg' });
          });
          return { content };
        } finally {
          rmSync(tmp, { recursive: true, force: true });
        }
      },
    },
    {
      name: 'list_components',
      title: 'List components',
      description:
        'The 21 animated components (name, description, default size). Use get_component_schema for the props of one component.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      run: async () => {
        const list = Object.values(COMPONENTS).map((c) => ({
          name: c.name,
          description: c.description,
          defaultSize: c.size,
          layer: c.layer ?? 'base',
          fillsScene: Boolean(c.fill),
          positionedByEndpoints: Boolean(c.endpoints?.length && !c.fill),
        }));
        return text(JSON.stringify(list, null, 2), { components: list });
      },
    },
    {
      name: 'get_component_schema',
      title: 'Component props schema',
      description: "JSON Schema of a component's props (types, enums, defaults, required fields).",
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', enum: Object.keys(COMPONENTS) } },
        required: ['name'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      run: async (a) => {
        const schemas = (episodeJsonSchema() as { 'x-components': Json })['x-components'];
        const s = schemas[String(a.name)];
        if (!s) throw new ToolError(`Unknown component "${a.name}"`);
        return text(JSON.stringify(s, null, 2), s as Json);
      },
    },
    {
      name: 'set_cues',
      title: 'Set cues',
      description:
        'Set the start time (seconds in the voice recording) of script lines, e.g. {"l1": 0.2, "l2": 3.4}. Normally a person marks cues by ear in the studio; use this to apply known timings. Use draft_cues for estimates.',
      inputSchema: {
        type: 'object',
        properties: {
          episode: EPISODE,
          cues: { type: 'object', additionalProperties: { type: 'number', minimum: 0 } },
        },
        required: ['episode', 'cues'],
        additionalProperties: false,
      },
      run: async (a) => {
        const p = ep(a.episode);
        const r = compile(p);
        const known = new Set(r.script.map((l) => l.id));
        const given = a.cues as Record<string, number>;
        const unknown = Object.keys(given).filter((k) => !known.has(k));
        if (unknown.length) throw new ToolError(`Unknown line ids: ${unknown.join(', ')}`);
        const cur = readCues(p.cues).cues;
        const cues = { ...(cur?.cues ?? {}), ...given };
        writeCues(p.cues, {
          version: 1,
          audio: cur?.audio ?? {
            file: r.spec?.audio.voice ?? 'voice.wav',
            duration: r.voice?.duration ?? r.timeline?.duration ?? 0,
          },
          cues,
          words: cur?.words ?? {},
        });
        const s = issueSummary(compile(p).issues);
        return text(`Saved ${Object.keys(given).length} cue(s). ${s.errors} error(s).`, { issues: s });
      },
    },
    {
      name: 'draft_cues',
      title: 'Draft cues',
      description:
        'Write estimated cues (from the text length, scaled to the voice recording if there is one) so the episode can be previewed and rendered before cues are marked by ear.',
      inputSchema: {
        type: 'object',
        properties: { episode: EPISODE, overwrite: { type: 'boolean', default: false } },
        required: ['episode'],
        additionalProperties: false,
      },
      run: async (a) => {
        const p = ep(a.episode);
        if (existsSync(p.cues) && !a.overwrite && !readCues(p.cues).cues?.draft)
          throw new ToolError(
            'cues.json has marked cues; pass overwrite: true to replace them with estimates',
          );
        const r = compile(p);
        const d = draftCues(r.script, r.spec?.audio.voice);
        if (r.voice) {
          const k = r.voice.duration / d.audio.duration;
          for (const id of Object.keys(d.cues)) d.cues[id] = Math.round(d.cues[id] * k * 1000) / 1000;
          d.audio.duration = Math.round(r.voice.duration * 1000) / 1000;
        }
        writeCues(p.cues, d);
        return text(`Wrote draft cues for ${Object.keys(d.cues).length} line(s).`, { cues: d.cues });
      },
    },
    {
      name: 'render_episode',
      title: 'Render an episode',
      description:
        'Start rendering the final videos (master MP4, share MP4, SRT, contact sheet, publish.md in <episode>/out/). Rendering takes minutes: it runs in the background; poll get_render_status. Use silent: true when there is no voice recording.',
      inputSchema: {
        type: 'object',
        properties: {
          episode: EPISODE,
          preset: {
            type: 'string',
            description: `Platform preset (${listResources('preset', root).join(', ')})`,
          },
          silent: { type: 'boolean', default: false },
          fast: { type: 'boolean', default: false, description: 'Quick lower-quality draft' },
          shareMb: { type: 'number', minimum: 5, maximum: 500 },
          sfx: { type: 'boolean', default: true },
        },
        required: ['episode'],
        additionalProperties: false,
      },
      run: async (a) => {
        const p = ep(a.episode);
        try {
          const job = runner.start(keyOf(p), p, {
            preset: a.preset as string | undefined,
            silent: Boolean(a.silent),
            fast: Boolean(a.fast),
            shareMb: a.shareMb as number | undefined,
            sfx: a.sfx !== false,
          });
          return text(`Render started (job ${job.id}). Poll get_render_status.`, { job: { ...job } });
        } catch (e) {
          throw new ToolError((e as Error).message);
        }
      },
    },
    {
      name: 'get_render_status',
      title: 'Render status',
      description: "Progress of the current/last render, and the files in the episode's out/ folder.",
      inputSchema: { type: 'object', properties: { episode: EPISODE }, additionalProperties: false },
      annotations: { readOnlyHint: true },
      run: async (a) => {
        const job = runner.job;
        let files: string[] = [];
        if (a.episode) {
          const p = ep(a.episode);
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
    },
    {
      name: 'cancel_render',
      title: 'Cancel the render',
      description: 'Cancel the running render.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: async () => {
        runner.cancel();
        return text('Cancel requested.');
      },
    },
    {
      name: 'open_editor',
      title: 'Open the visual editor',
      description:
        'Start the ReelForge visual editor for an episode on 127.0.0.1 and return its URL, so a person can review or fine-tune what you made (and mark cues by ear).',
      inputSchema: {
        type: 'object',
        properties: { episode: EPISODE },
        required: ['episode'],
        additionalProperties: false,
      },
      run: async (a) => {
        const p = ep(a.episode);
        let s = studios.get(p.dir);
        if (!s) {
          s = await startStudio({
            paths: p,
            mode: 'edit',
            port: 0,
            decode: ffmpegDecode,
            renderer: runner,
            renderKey: keyOf(p),
            log,
          });
          studios.set(p.dir, s);
        }
        return text(`Editor for ${keyOf(p)}: ${s.url}`, { url: s.url });
      },
    },
    {
      name: 'doctor',
      title: 'Check the environment',
      description: 'Check Node.js, FFmpeg, the rendering Chromium and fonts.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      run: async () => {
        const checks = await runDoctor();
        return text(
          checks
            .map(
              (c) =>
                `${c.ok ? 'OK ' : 'FAIL'} ${c.name}: ${c.detail}${!c.ok && c.fix ? ` — fix: ${c.fix}` : ''}`,
            )
            .join('\n'),
          { checks: checks as unknown as Json },
        );
      },
    },
  ];

  // ------------------------------------------------------------------ resources & prompts
  const docFile = (f: string) => [path.join(INSTALL_ROOT, f), path.join(root, f)].find((x) => existsSync(x));
  const resources = [
    {
      uri: 'reelforge://docs/authoring',
      name: 'Authoring guide',
      description: 'How episode.yaml works: script, cues, time expressions, scenes, layout, animation',
      mimeType: 'text/markdown',
      file: 'docs/authoring.md',
    },
    {
      uri: 'reelforge://docs/components',
      name: 'Component reference',
      description: 'Every component with its props and defaults',
      mimeType: 'text/markdown',
      file: 'docs/components.md',
    },
    {
      uri: 'reelforge://docs/ai-agents',
      name: 'Guide for AI agents',
      description: 'Workflow, rules and examples for agents',
      mimeType: 'text/markdown',
      file: 'AGENTS.md',
    },
    {
      uri: 'reelforge://schema/episode',
      name: 'episode.yaml JSON Schema',
      description: 'Full JSON Schema including component props',
      mimeType: 'application/json',
      file: '',
    },
  ];
  const prompts = [
    {
      name: 'make_explainer',
      description: 'Plan and build a complete vertical explainer episode about a topic',
      arguments: [
        { name: 'topic', description: 'What the episode explains', required: true },
        { name: 'lang', description: 'en or ar (default en)', required: false },
        { name: 'seconds', description: 'Target length in seconds (default 45)', required: false },
      ],
      text: (a: Record<string, string>) =>
        `Create a ReelForge vertical explainer episode about: ${a.topic}.\nLanguage: ${a.lang === 'ar' ? 'Arabic (keep technical terms in English)' : 'English'}. Target length: about ${a.seconds || 45} seconds (roughly ${Math.round(Number(a.seconds || 45) * 2.4)} spoken words).\n\nWorkflow:\n1. Read reelforge://docs/ai-agents and call list_components.\n2. Write a script: one short spoken sentence per line, a hook in line 1, a clear payoff, and a call-to-action at the end.\n3. create_episode with the script, then design 4–7 scenes with edit_episode (or write_episode_yaml): one idea per scene, elements entering on the exact words that name them (l3:'word').\n4. validate_episode and fix every error and warning.\n5. preview_frames at key moments and adjust layout until it looks clean (nothing in the platform safe zones, no overflowing text).\n6. Tell the user to record the voice-over, mark cues in the editor (open_editor), then render.`,
    },
  ];

  // ------------------------------------------------------------------ protocol
  const send = (msg: Json): void => {
    process.stdout.write(`${JSON.stringify(msg)}\n`);
  };
  const reply = (id: unknown, result: unknown) => send({ jsonrpc: '2.0', id, result });
  const fail = (id: unknown, code: number, message: string) =>
    send({ jsonrpc: '2.0', id, error: { code, message } });

  const handle = async (msg: Json): Promise<void> => {
    const { id, method } = msg;
    const params = (msg.params ?? {}) as Json;
    if (method === undefined) return; // a response to something we never sent
    const isNotification = id === undefined || id === null;
    try {
      switch (method) {
        case 'initialize': {
          const asked = String(params.protocolVersion ?? '');
          reply(id, {
            protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
            capabilities: {
              tools: { listChanged: false },
              resources: { listChanged: false },
              prompts: { listChanged: false },
              logging: {},
            },
            serverInfo: { name: 'reelforge', title: 'ReelForge', version: opts.version },
            instructions:
              "ReelForge turns a voice recording and an episode.yaml into finished vertical (1080×1920) explainer videos. Read the episode with get_episode before editing; anchor element timing to spoken words (l3:'word'); validate_episode after edits; use preview_frames to look at the result. Rendering runs in the background (render_episode + get_render_status). Everything is local.",
          });
          return;
        }
        case 'notifications/initialized':
        case 'notifications/cancelled':
          return;
        case 'ping':
          return reply(id, {});
        case 'logging/setLevel':
          return reply(id, {});
        case 'tools/list':
          return reply(id, {
            tools: tools.map(({ name, title, description, inputSchema, annotations }) => ({
              name,
              title,
              description,
              inputSchema,
              ...(annotations ? { annotations } : {}),
            })),
          });
        case 'tools/call': {
          const tool = tools.find((t) => t.name === params.name);
          if (!tool) return fail(id, -32602, `Unknown tool: ${String(params.name)}`);
          const token = (params._meta as Json | undefined)?.progressToken;
          const progress = (p: number, total?: number, message?: string) => {
            if (token !== undefined)
              send({
                jsonrpc: '2.0',
                method: 'notifications/progress',
                params: { progressToken: token, progress: p, total, message },
              });
          };
          try {
            const res = await tool.run((params.arguments ?? {}) as Json, { progress });
            return reply(id, res);
          } catch (e) {
            const m = e instanceof ToolError ? e.message : `${(e as Error).message}`;
            if (!(e instanceof ToolError)) log(`tool ${tool.name} failed: ${(e as Error).stack}`);
            return reply(id, { content: [{ type: 'text', text: m }], isError: true });
          }
        }
        case 'resources/list':
          return reply(id, {
            resources: resources.map(({ uri, name, description, mimeType }) => ({
              uri,
              name,
              description,
              mimeType,
            })),
          });
        case 'resources/templates/list':
          return reply(id, {
            resourceTemplates: [
              {
                uriTemplate: 'reelforge://episodes/{episode}/episode.yaml',
                name: 'episode.yaml',
                mimeType: 'text/yaml',
              },
            ],
          });
        case 'resources/read': {
          const uri = String(params.uri ?? '');
          const m = uri.match(/^reelforge:\/\/episodes\/(.+)\/episode\.yaml$/);
          if (m)
            return reply(id, {
              contents: [
                { uri, mimeType: 'text/yaml', text: readFileSync(ep(decodeURIComponent(m[1])).yaml, 'utf8') },
              ],
            });
          const r = resources.find((x) => x.uri === uri);
          if (!r) return fail(id, -32002, `Resource not found: ${uri}`);
          const body = r.file
            ? docFile(r.file)
              ? readFileSync(docFile(r.file)!, 'utf8')
              : '(not available)'
            : JSON.stringify(episodeJsonSchema(), null, 2);
          return reply(id, { contents: [{ uri, mimeType: r.mimeType, text: body }] });
        }
        case 'prompts/list':
          return reply(id, {
            prompts: prompts.map(({ name, description, arguments: args }) => ({
              name,
              description,
              arguments: args,
            })),
          });
        case 'prompts/get': {
          const pr = prompts.find((x) => x.name === params.name);
          if (!pr) return fail(id, -32602, `Unknown prompt: ${String(params.name)}`);
          return reply(id, {
            description: pr.description,
            messages: [
              {
                role: 'user',
                content: { type: 'text', text: pr.text((params.arguments ?? {}) as Record<string, string>) },
              },
            ],
          });
        }
        case 'completion/complete':
          return reply(id, { completion: { values: [], hasMore: false } });
        default:
          if (!isNotification) fail(id, -32601, `Method not found: ${String(method)}`);
      }
    } catch (e) {
      if (!isNotification) fail(id, e instanceof ToolError ? -32602 : -32603, (e as Error).message);
    }
  };

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const pending = new Set<Promise<void>>();
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      fail(null, -32700, 'Parse error');
      return;
    }
    const batch = Array.isArray(msg) ? msg : [msg];
    for (const m of batch) {
      const p = handle(m as Json).catch((e) => log(String(e)));
      pending.add(p);
      void p.finally(() => pending.delete(p));
    }
  });
  log(`ready · project ${root}`);
  await new Promise<void>((resolve) => rl.on('close', resolve));
  await Promise.allSettled([...pending]);
  for (const s of studios.values()) await s.close().catch(() => undefined);
}
