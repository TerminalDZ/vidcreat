/** MCP resources (docs, schema, episode files) and prompts, shared by every MCP transport. */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { episodeJsonSchema, INSTALL_ROOT } from '@reelforge/core';
import { episodeOf } from './common.js';
import type { ToolHost } from './types.js';

export class ResourceNotFound extends Error {}

export const RESOURCES = [
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

export const RESOURCE_TEMPLATES = [
  {
    uriTemplate: 'reelforge://episodes/{episode}/episode.yaml',
    name: 'episode.yaml',
    mimeType: 'text/yaml',
  },
];

/** A file shipped with ReelForge (installation first, then the project). */
export const docFile = (root: string, f: string) =>
  [path.join(INSTALL_ROOT, f), path.join(root, f)].find((x) => existsSync(x));

export function readResource(host: ToolHost, uri: string): { uri: string; mimeType: string; text: string } {
  const m = uri.match(/^reelforge:\/\/episodes\/(.+)\/episode\.yaml$/);
  if (m)
    return {
      uri,
      mimeType: 'text/yaml',
      text: readFileSync(episodeOf(host, decodeURIComponent(m[1])).yaml, 'utf8'),
    };
  const r = RESOURCES.find((x) => x.uri === uri);
  if (!r) throw new ResourceNotFound(`Resource not found: ${uri}`);
  const file = r.file ? docFile(host.root, r.file) : undefined;
  const body = r.file
    ? file
      ? readFileSync(file, 'utf8')
      : '(not available)'
    : JSON.stringify(episodeJsonSchema(), null, 2);
  return { uri, mimeType: r.mimeType, text: body };
}

export const PROMPTS = [
  {
    name: 'make_explainer',
    description: 'Plan and build a complete vertical explainer episode about a topic',
    arguments: [
      { name: 'topic', description: 'What the episode explains', required: true },
      { name: 'lang', description: 'en or ar (default en)', required: false },
      { name: 'seconds', description: 'Target length in seconds (default 45)', required: false },
    ],
    text: (a: Record<string, string>) =>
      `Create a ReelForge vertical explainer episode about: ${a.topic}.\nLanguage: ${a.lang === 'ar' ? 'Arabic (keep technical terms in English)' : 'English'}. Target length: about ${a.seconds || 45} seconds (roughly ${Math.round(Number(a.seconds || 45) * 2.4)} spoken words).\n\nWorkflow:\n1. Read reelforge://docs/ai-agents (or call get_guide) and call list_components.\n2. Write a script: one short spoken sentence per line, a hook in line 1, a clear payoff, and a call-to-action at the end.\n3. create_episode with the script, then design 4–7 scenes with edit_episode (or write_episode_yaml): one idea per scene, elements entering on the exact words that name them (l3:'word'). Vary the motion: reveal for big titles, pop or spring for chips, rise for cards and code, and a zoom or push scene transition at chapter changes.\n4. validate_episode and fix every error and warning (each result lists fixes and the next step).\n5. preview_frames at key moments and adjust layout until it looks clean (nothing in the platform safe zones, no overflowing text).\n6. Tell the user to record the voice-over, mark cues in the editor (open_editor), then render.`,
  },
];
