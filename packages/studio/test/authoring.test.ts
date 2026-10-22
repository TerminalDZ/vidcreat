import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { callTool as call, TOOLS } from '../src/tools/registry.js';
import { RenderRunner } from '../src/server/jobs.js';
import type { ToolContext } from '../src/tools/types.js';

const ctxFor = (root: string): ToolContext => ({
  root,
  runner: new RenderRunner(),
  log: () => undefined,
  progress: () => undefined,
  openStudio: async () => ({ url: 'http://127.0.0.1:1/' }),
});

const callTool = (name: string, args: unknown, ctx: ToolContext) =>
  call(TOOLS.find((t) => t.name === name)!, args, ctx);

/** A project with one small pack, so the test does not depend on the shipped packs. */
function project(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'rf-auth-'));
  const dir = path.join(root, 'packs', 'zz-test');
  mkdirSync(path.join(dir, 'templates'), { recursive: true });
  writeFileSync(
    path.join(dir, 'pack.yaml'),
    `id: zz-test
name: { en: Test pack, ar: حزمة تجربة }
description: Only for tests.
theme: default
templates:
  - id: intro
    title: Intro
    description: A short intro.
    slots:
      org: { label: Organization, max: 30, default: Northwind Clinic }
      beds: { label: Beds, type: number, min: 1, max: 5000, default: 120 }
    files: { en: templates/intro.en.yaml }
`,
  );
  writeFileSync(
    path.join(dir, 'templates', 'intro.en.yaml'),
    `meta: { id: '{{id}}', title: 'Welcome to {{org}}', lang: en-US }
script:
  - text: 'Welcome to {{org}}, where care starts with you.'
  - text: 'We have {{beds}} beds and a team ready every day.'
  - text: 'Book your visit online today.'
scenes:
  - id: hook
    at: l1
    elements:
      - use: title
        props: { text: '{{org}}' }
        place: { x: 60, y: 200, w: 960, h: 240 }
        enter: { at: l1 }
`,
  );
  return root;
}

describe('guided authoring tools (Tier 1 and 2)', () => {
  it('lists templates, creates an episode from slots and rejects bad slots', async () => {
    const root = project();
    const ctx = ctxFor(root);
    const list = await callTool('list_templates', {}, ctx);
    expect(list.isError, JSON.stringify(list.content)).toBeFalsy();
    expect(JSON.stringify(list.structuredContent)).toContain('"template":"intro"');
    const bad = await callTool(
      'create_from_template',
      { id: 'x1', pack: 'zz-test', template: 'intro', slots: { org: 'A'.repeat(31) } },
      ctx,
    );
    expect(bad.isError).toBe(true);
    expect(bad.content[0]).toMatchObject({ text: expect.stringMatching(/org/) });
    const ok = await callTool(
      'create_from_template',
      { id: 'clinic', pack: 'zz-test', template: 'intro', slots: { org: "Saint Ann's Clinic", beds: 80 } },
      ctx,
    );
    expect(ok.isError).toBeFalsy();
    const s = ok.structuredContent as { issues: { errors: number }; next: string };
    expect(s.issues.errors).toBe(0);
    expect(s.next).toMatch(/preview_frames/);
    const yaml = parse(readFileSync(path.join(root, 'episodes', 'clinic', 'episode.yaml'), 'utf8'));
    expect(yaml.script[0].text).toBe("Welcome to Saint Ann's Clinic, where care starts with you.");
    expect(yaml.script[1].text).toContain('80 beds');
  });

  it('adds blueprint scenes in time order, refuses duplicates, and plans every line', async () => {
    const root = project();
    const ctx = ctxFor(root);
    await callTool('create_from_template', { id: 'c', pack: 'zz-test', template: 'intro' }, ctx);
    const plan = await callTool('suggest_scenes', { episode: 'c' }, ctx);
    const p = (plan.structuredContent as { plan: { line: string; blueprint: string | null }[] }).plan;
    expect(p.map((x) => x.blueprint)).toEqual(['hook', 'stat-reveal', 'cta']);

    const cta = await callTool(
      'add_scene',
      { episode: 'c', blueprint: 'cta', params: { line: 'l3', next: 'Book a visit' } },
      ctx,
    );
    expect((cta.structuredContent as { issues: { errors: number } }).issues.errors).toBe(0);
    const stat = await callTool(
      'add_scene',
      {
        episode: 'c',
        blueprint: 'stat-reveal',
        params: { line: 'l2', at: "l2:'beds'", value: 120, label: 'beds' },
      },
      ctx,
    );
    expect((stat.structuredContent as { issues: { errors: number } }).issues.errors).toBe(0);
    const yaml = parse(readFileSync(path.join(root, 'episodes', 'c', 'episode.yaml'), 'utf8'));
    expect(yaml.scenes.map((s: { at: string }) => s.at)).toEqual(['l1', 'l2', 'l3']);

    const dup = await callTool(
      'add_scene',
      { episode: 'c', blueprint: 'cta', params: { line: 'l3', next: 'x' } },
      ctx,
    );
    expect(dup.isError).toBe(true);
    const badParams = await callTool(
      'add_scene',
      { episode: 'c', blueprint: 'comparison', params: { line: 'l2' } },
      ctx,
    );
    expect(badParams.isError).toBe(true);
    expect(badParams.content[0]).toMatchObject({ text: expect.stringMatching(/Example:/) });
    const blueprints = await callTool('list_blueprints', { name: 'comparison' }, ctx);
    expect(JSON.stringify(blueprints.structuredContent)).toContain('"rows"');
  });
});
