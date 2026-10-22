/**
 * get_guide: task guides read from `skills/<name>/SKILL.md` (Agent Skills layout: YAML frontmatter
 * with `name` and `description`, a Markdown body, optional `references/*.md`).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { INSTALL_ROOT } from '@reelforge/core';
import { parse } from 'yaml';
import { z } from 'zod';
import { text } from './common.js';
import { defineTool } from './types.js';

export interface Skill {
  name: string;
  description: string;
  dir: string;
  file: string;
  references: string[];
}

/** The skills folder of the project, else of the installation. */
export function skillsDir(root: string): string | undefined {
  return [path.join(root, 'skills'), path.join(INSTALL_ROOT, 'skills')].find(
    (d) => existsSync(d) && statSync(d).isDirectory(),
  );
}

/** Splits a SKILL.md into its frontmatter fields and body. */
export function parseSkill(source: string): { name?: string; description?: string; body: string } {
  const m = source.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { body: source };
  let meta: Record<string, unknown> = {};
  try {
    meta = (parse(m[1]) as Record<string, unknown>) ?? {};
  } catch {
    meta = {};
  }
  return {
    name: typeof meta.name === 'string' ? meta.name : undefined,
    description: typeof meta.description === 'string' ? meta.description.trim() : undefined,
    body: m[2],
  };
}

export function listSkills(dir: string | undefined): Skill[] {
  if (!dir) return [];
  const out: Skill[] = [];
  for (const name of readdirSync(dir).sort()) {
    const file = path.join(dir, name, 'SKILL.md');
    if (!existsSync(file)) continue;
    const s = parseSkill(readFileSync(file, 'utf8'));
    const refDir = path.join(dir, name, 'references');
    out.push({
      name: s.name ?? name,
      description: s.description ?? '',
      dir: path.join(dir, name),
      file,
      references: existsSync(refDir)
        ? readdirSync(refDir)
            .filter((f) => f.endsWith('.md'))
            .map((f) => f.slice(0, -3))
            .sort()
        : [],
    });
  }
  return out;
}

/**
 * The short form of a guide: everything up to the second `##` heading (intro plus first section),
 * plus the first checklist section when it comes later.
 */
export function shortGuide(body: string): string {
  const sections = body.split(/^(?=## )/m);
  const n = sections[0].startsWith('## ') ? 1 : 2;
  const head = sections.slice(0, n).join('');
  const rest = sections.slice(n);
  const checklist = rest.find((s) => /^## .*checklist/i.test(s) || /^\s*[-*] \[ \]/m.test(s));
  return [head.trim(), checklist?.trim()].filter(Boolean).join('\n\n');
}

function findSkill(skills: Skill[], topic: string): Skill | undefined {
  const t = topic.trim().toLowerCase();
  const exact = skills.find((s) => s.name.toLowerCase() === t || path.basename(s.dir).toLowerCase() === t);
  if (exact) return exact;
  const partial = skills.filter((s) => s.name.toLowerCase().includes(t));
  return partial.length === 1 ? partial[0] : undefined;
}

export const getGuide = defineTool({
  name: 'get_guide',
  title: 'Read a guide',
  description:
    'Task guides for working with ReelForge (writing scripts, designing scenes, layout, cues, rendering…). detail false (default) gives the short version: what the guide is for and its first section or checklist; detail true gives the whole guide and lists its references ("<topic>/<reference>" reads one). Call without a topic (or with an unknown one) to list the topics.',
  input: z
    .object({
      topic: z
        .string()
        .optional()
        .describe('Guide name, e.g. "make-video"; "<topic>/<reference>" for a reference'),
      detail: z.boolean().default(false).describe('Return the full guide instead of the summary'),
    })
    .strict(),
  toolsets: ['basic', 'design', 'render'],
  annotations: { readOnlyHint: true },
  handler: async (a, ctx) => {
    const dir = skillsDir(ctx.root);
    const skills = listSkills(dir);
    if (!skills.length)
      return text(
        'No guides are installed (no skills/ folder with SKILL.md files in the project or the ReelForge installation). Read the resource reelforge://docs/ai-agents (AGENTS.md) and reelforge://docs/authoring instead.',
        { topics: [] },
      );
    const topics = skills.map((s) => ({
      name: s.name,
      description: s.description,
      references: s.references,
    }));
    const listing = (lead: string) =>
      text(
        `${lead}\n\n${topics.map((t) => `- ${t.name}: ${t.description}`).join('\n')}\n\nCall get_guide with one of these topics.`,
        { topics },
      );
    if (!a.topic?.trim()) return listing('Available guides:');
    const [base, ref] = a.topic.split('/', 2);
    const skill = findSkill(skills, base);
    if (!skill) return listing(`No guide named "${a.topic}". Available guides:`);
    if (ref) {
      const name = ref.replace(/\.md$/i, '');
      if (!skill.references.includes(name))
        return text(
          `No reference "${ref}" in ${skill.name}. References: ${skill.references.join(', ') || '(none)'}.`,
          { topic: skill.name, references: skill.references },
        );
      const body = readFileSync(path.join(skill.dir, 'references', `${name}.md`), 'utf8');
      return text(body, { topic: skill.name, reference: name, content: body });
    }
    const parsed = parseSkill(readFileSync(skill.file, 'utf8'));
    const refs = skill.references.length
      ? `\n\nReferences (get_guide "${skill.name}/<name>"): ${skill.references.join(', ')}`
      : '';
    const body = a.detail
      ? `${parsed.body.trim()}${refs}`
      : `${skill.description}\n\n${shortGuide(parsed.body)}\n\n(Short version. get_guide with detail: true returns the full guide.)${refs}`;
    return text(body, {
      topic: skill.name,
      description: skill.description,
      detail: a.detail,
      content: body,
      references: skill.references,
    });
  },
});

export const tools = [getGuide];
