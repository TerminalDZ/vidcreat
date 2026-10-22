/** Shapes shared by every tool and every transport (MCP stdio, MCP HTTP, REST). */
import type { PcmAudio } from '@reelforge/audio';
import type { EpisodePaths } from '@reelforge/core';
import type { z } from 'zod';
import type { RenderRunner } from '../server/jobs.js';

export type Json = Record<string, unknown>;

export type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

export interface ToolResult {
  content: Content[];
  structuredContent?: Json;
  isError?: boolean;
}

/** Toolsets are tags: a client asks for one or more and gets the union (`all` = every tool). */
export const TOOLSETS = ['basic', 'design', 'render'] as const;
export type Toolset = (typeof TOOLSETS)[number];

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** What a transport gives the tools: the project, the shared render queue and a few host services. */
export interface ToolHost {
  root: string;
  /** Decoder for voice files that are not plain PCM WAV (the CLI passes its ffmpeg decoder). */
  decode?: (file: string) => PcmAudio;
  runner: RenderRunner;
  /** Starts (or reuses) the visual editor for an episode and returns its URL. */
  openStudio: (p: EpisodePaths, key: string) => Promise<{ url: string }>;
  log: (msg: string) => void;
}

export interface ToolContext extends ToolHost {
  /** Progress of a long call (MCP progress notifications; a no-op where the transport has none). */
  progress: (progress: number, total?: number, message?: string) => void;
}

export interface ToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  /** Stable public name (semver, see ADR-014). */
  name: string;
  title: string;
  description: string;
  input: S;
  /** Shape of structuredContent, where it helps clients. */
  output?: z.ZodTypeAny;
  toolsets: readonly Toolset[];
  annotations?: ToolAnnotations;
  handler: (args: z.output<S>, ctx: ToolContext) => Promise<ToolResult>;
}

export type AnyTool = ToolDef<z.ZodTypeAny>;

/** Identity helper that keeps the handler's argument type tied to its schema. */
export function defineTool<S extends z.ZodTypeAny>(tool: ToolDef<S>): AnyTool {
  return tool as unknown as AnyTool;
}

/** An expected failure: its message is shown to the caller as is. */
export class ToolError extends Error {}
