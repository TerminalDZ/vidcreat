import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileEpisode, episodePaths, INSTALL_ROOT } from '@reelforge/core';
import { describeLayout, layoutText } from '../src/tools/layout.js';
import { listSkills, parseSkill, shortGuide } from '../src/tools/guide.js';
import { openApiDocument } from '../src/tools/openapi.js';
import { callTool, describeTool, parseToolsets, selectTools, TOOLS } from '../src/tools/registry.js';
import { fixHints, nextStep } from '../src/tools/common.js';
import { RenderRunner } from '../src/server/jobs.js';
import {
  configDir,
  hostAllowed,
  isLoopback,
  loadOrCreateToken,
  originAllowed,
  tokenMatches,
} from '../src/server/security.js';
import type { ToolContext } from '../src/tools/types.js';

const ctxFor = (root: string): ToolContext => ({
  root,
  runner: new RenderRunner(),
  log: () => undefined,
  progress: () => undefined,
  openStudio: async () => ({ url: 'http://127.0.0.1:1/' }),
});

describe('tool registry', () => {
  it('keeps every tool name, with object schemas and toolsets', () => {
    const names = TOOLS.map((t) => t.name);
    for (const n of [
      'list_episodes',
      'get_episode',
      'create_episode',
      'edit_episode',
      'write_episode_yaml',
      'validate_episode',
      'preview_frames',
      'list_components',
      'get_component_schema',
      'suggest_scene',
      'draft_cues',
      'set_cues',
      'align_cues',
      'render_episode',
      'get_render_status',
      'cancel_render',
      'open_editor',
      'doctor',
      'get_guide',
    ])
      expect(names).toContain(n);
    expect(new Set(names).size).toBe(names.length);
    for (const t of TOOLS) {
      const d = describeTool(t);
      expect(d.inputSchema.type).toBe('object');
      expect(d.inputSchema.$schema).toBeUndefined();
      expect(t.toolsets.length).toBeGreaterThan(0);
    }
    const create = describeTool(TOOLS.find((t) => t.name === 'create_episode')!);
    expect(create.inputSchema.required).toEqual(['id']);
    expect(create.inputSchema.additionalProperties).toBe(false);
    expect(create.outputSchema).toBeDefined();
  });

  it('filters by toolsets', () => {
    expect(parseToolsets(undefined)).toBe('all');
    expect(parseToolsets('all')).toBe('all');
    expect(parseToolsets(' basic , design ')).toEqual(['basic', 'design']);
    expect(() => parseToolsets('basic,nope')).toThrow(/nope/);
    const basic = selectTools(['basic']).map((t) => t.name);
    expect(basic).toContain('validate_episode');
    expect(basic).toContain('get_guide');
    expect(basic).not.toContain('render_episode');
    expect(basic).not.toContain('edit_episode');
    const render = selectTools(['render']).map((t) => t.name);
    expect(render).toEqual(
      expect.arrayContaining([
        'render_episode',
        'get_render_status',
        'cancel_render',
        'open_editor',
        'doctor',
      ]),
    );
    expect(selectTools(['basic', 'design']).map((t) => t.name)).toContain('edit_episode');
    expect(selectTools('all')).toHaveLength(TOOLS.length);
  });

  it('turns invalid arguments into a readable tool error', async () => {
    const tool = TOOLS.find((t) => t.name === 'create_episode')!;
    const r = await callTool(tool, { id: 'bad id!' }, ctxFor(os.tmpdir()));
    expect(r.isError).toBe(true);
    expect(r.content[0]).toMatchObject({ type: 'text' });
    expect((r.content[0] as { text: string }).text).toMatch(/id: id must be a slug/);
    const extra = await callTool(tool, { id: 'ep1', nope: 1 }, ctxFor(os.tmpdir()));
    expect(extra.isError).toBe(true);
  });

  it('describes every tool as one OpenAPI operation', () => {
    const doc = openApiDocument(TOOLS, {
      origin: 'http://127.0.0.1:4310',
      version: '1.0.0',
      tokenRequired: true,
    });
    expect(doc.openapi).toBe('3.1.0');
    const paths = doc.paths as Record<string, { post: { operationId: string; requestBody: unknown } }>;
    expect(Object.keys(paths)).toHaveLength(TOOLS.length);
    expect(paths['/api/v1/tools/validate_episode'].post.operationId).toBe('validate_episode');
    expect(doc.security).toEqual([{ bearerAuth: [] }]);
  });

  it('writes fix hints and a next step', () => {
    const issues = [
      { rule: 'V-8', level: 'warn' as const, message: 'overlap', hint: 'Move one', line: 12, elementId: 'a' },
      { rule: 'V-11', level: 'info' as const, message: 'dead air', hint: 'ignored' },
    ];
    expect(fixHints(issues)).toEqual(['V-8 (line 12, a): Move one']);
    expect(nextStep({ errors: 1, warnings: 0, list: [] }, 'x')).toMatch(/Fix the 1 error/);
    expect(nextStep({ errors: 0, warnings: 0, list: [] }, 'preview_frames.')).toBe('Preview_frames.');
  });
});

describe('preview layout', () => {
  it('lists visible elements with canvas boxes, overlaps and safe zones', () => {
    const dir = path.join(INSTALL_ROOT, 'fixtures/mini');
    const r = compileEpisode(episodePaths(dir, INSTALL_ROOT), { voice: null });
    const tl = r.timeline!;
    const client = tl.scenes[0].elements.find((e) => e.id === 'client')!;
    const l = describeLayout(tl, client.enter.t + 0.05, 'l2+0.05');
    const c = l.elements.find((e) => e.id === 'client')!;
    expect(c.box).toEqual({
      x: client.box.x + tl.scenes[0].origin.x,
      y: client.box.y + tl.scenes[0].origin.y,
      w: client.box.w,
      h: client.box.h,
    });
    expect(c.entering).toBe(true);
    expect(l.scene?.id).toBe('hook');
    const text = layoutText(l);
    expect(text).toMatch(/Frame at .*\(l2\+0\.05\) · scene "hook"/);
    expect(text).toMatch(/- client \(node, base\) box x \d+ y \d+ w 300 h 170/);
    expect(text).toMatch(/Overlaps between base elements:/);
    expect(text).toMatch(/Platform UI zones:/);

    // Two base elements forced onto the same box overlap (V-8 geometry).
    const t1 = tl.scenes[0].elements.find((e) => e.id === 't1')!;
    const moved = { ...tl, scenes: [{ ...tl.scenes[0], elements: [t1, { ...client, box: { ...t1.box } }] }] };
    const ov = describeLayout(moved, client.enter.t + 0.5);
    expect(ov.overlaps).toEqual([{ a: 't1', b: 'client', ratio: 1, v8: true }]);
    // A box in the right rail touches a platform UI zone.
    const z = tl.preset.safe[0];
    const inZone = {
      ...client,
      box: { x: z.x - tl.scenes[0].origin.x, y: z.y - tl.scenes[0].origin.y, w: 50, h: 50 },
    };
    const sz = describeLayout(
      { ...tl, scenes: [{ ...tl.scenes[0], elements: [inZone] }] },
      client.enter.t + 0.5,
    );
    expect(sz.safeZones.map((s) => s.zone)).toContain(z.name);
  });
});

describe('get_guide', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'rf-skills-'));
  const skill = path.join(root, 'skills', 'make-video');
  mkdirSync(path.join(skill, 'references'), { recursive: true });
  writeFileSync(
    path.join(skill, 'SKILL.md'),
    `---\nname: make-video\ndescription: Build a ReelForge episode from a topic.\n---\n\n# Make a video\n\nIntro text.\n\n## Steps\n\n1. Script first.\n\n## Details\n\nLong details here.\n\n## Checklist\n\n- [ ] validate\n`,
  );
  writeFileSync(path.join(skill, 'references', 'layout.md'), '# Layout\n\nStage is 1080×1000.\n');
  const tool = TOOLS.find((t) => t.name === 'get_guide')!;
  const run = async (args: Record<string, unknown>) => {
    const r = await callTool(tool, args, ctxFor(root));
    return {
      text: (r.content[0] as { text: string }).text,
      s: r.structuredContent as Record<string, unknown>,
    };
  };

  it('parses the skill layout', () => {
    const s = listSkills(path.join(root, 'skills'));
    expect(s).toMatchObject([
      { name: 'make-video', description: 'Build a ReelForge episode from a topic.', references: ['layout'] },
    ]);
    expect(parseSkill('no frontmatter').body).toBe('no frontmatter');
    const short = shortGuide(parseSkill(readFileSync(path.join(skill, 'SKILL.md'), 'utf8')).body);
    expect(short).toContain('1. Script first.');
    expect(short).toContain('- [ ] validate');
    expect(short).not.toContain('Long details');
  });

  it('returns short and full guides, references and the topic list', async () => {
    const short = await run({ topic: 'make-video' });
    expect(short.text).toMatch(/^Build a ReelForge episode/);
    expect(short.text).not.toContain('Long details');
    const full = await run({ topic: 'make-video', detail: true });
    expect(full.text).toContain('Long details');
    expect(full.text).toContain('make-video/<name>');
    expect((await run({ topic: 'make-video/layout' })).text).toContain('1080×1000');
    const unknown = await run({ topic: 'nope' });
    expect(unknown.text).toMatch(/No guide named "nope"/);
    expect(unknown.s.topics).toHaveLength(1);
    expect((await run({})).text).toMatch(/- make-video: Build/);
  });

  it('degrades gracefully without a skills folder', async () => {
    const empty = mkdtempSync(path.join(os.tmpdir(), 'rf-noskills-'));
    if (existsSync(path.join(INSTALL_ROOT, 'skills'))) return; // the installation ships guides
    const r = await callTool(tool, { topic: 'x' }, ctxFor(empty));
    expect(r.isError).toBeFalsy();
    expect((r.content[0] as { text: string }).text).toMatch(/No guides are installed/);
  });
});

describe('local server security', () => {
  const policy = { port: () => 4310, allowed: ['studio.lan', 'box.lan:8080'] };

  it('resolves the config folder per platform', () => {
    expect(configDir({ REELFORGE_CONFIG_DIR: '/x/y' }, 'linux', '/home/a')).toBe(path.resolve('/x/y'));
    expect(configDir({ APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, 'win32', 'C:\\Users\\a')).toBe(
      path.join('C:\\Users\\a\\AppData\\Roaming', 'reelforge'),
    );
    expect(configDir({}, 'darwin', '/Users/a')).toBe(
      path.join('/Users/a', 'Library', 'Application Support', 'reelforge'),
    );
    expect(configDir({ XDG_CONFIG_HOME: '/cfg' }, 'linux', '/home/a')).toBe(path.join('/cfg', 'reelforge'));
    expect(configDir({}, 'linux', '/home/a')).toBe(path.join('/home/a', '.config', 'reelforge'));
  });

  it('creates the token once, with a restrictive mode', () => {
    const dir = path.join(mkdtempSync(path.join(os.tmpdir(), 'rf-cfg-')), 'reelforge');
    const t = loadOrCreateToken(dir);
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(loadOrCreateToken(dir)).toBe(t);
    if (process.platform !== 'win32') expect(statSync(path.join(dir, 'token')).mode & 0o077).toBe(0);
    expect(tokenMatches(`Bearer ${t}`, t)).toBe(true);
    expect(tokenMatches(`Bearer ${t}x`, t)).toBe(false);
    expect(tokenMatches(undefined, t)).toBe(false);
  });

  it('allows loopback and listed hosts only', () => {
    for (const h of ['127.0.0.1', 'localhost', '::1', '[::1]', '127.1.2.3']) expect(isLoopback(h)).toBe(true);
    expect(isLoopback('192.168.1.2')).toBe(false);
    expect(hostAllowed('127.0.0.1:4310', policy)).toBe(true);
    expect(hostAllowed('localhost:4310', policy)).toBe(true);
    expect(hostAllowed('[::1]:4310', policy)).toBe(true);
    expect(hostAllowed('127.0.0.1:4311', policy)).toBe(false);
    expect(hostAllowed('evil.example:4310', policy)).toBe(false);
    expect(hostAllowed('127.0.0.1.evil.example:4310', policy)).toBe(false);
    expect(hostAllowed('studio.lan:4310', policy)).toBe(true);
    expect(hostAllowed('box.lan:8080', policy)).toBe(true);
    expect(hostAllowed('box.lan:4310', policy)).toBe(false);
    expect(hostAllowed(undefined, policy)).toBe(false);
    expect(originAllowed(undefined, policy)).toBe(true);
    expect(originAllowed('http://127.0.0.1:4310', policy)).toBe(true);
    expect(originAllowed('http://localhost', policy)).toBe(false);
    expect(originAllowed('http://evil.example', policy)).toBe(false);
    expect(originAllowed('null', policy)).toBe(false);
    expect(originAllowed('file://', policy)).toBe(false);
  });
});
