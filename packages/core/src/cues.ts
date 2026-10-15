/** `cues.json` (SRS DR-3): reading, validating and atomic writing. */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const cuesSchema = z
  .object({
    version: z.literal(1),
    audio: z
      .object({ file: z.string(), duration: z.number().nonnegative(), sha1: z.string() })
      .partial({ sha1: true })
      .strict(),
    cues: z.record(z.number().nonnegative()),
    words: z.record(z.array(z.number().nonnegative())).default({}),
    updated: z.string().optional(),
    draft: z.boolean().optional(),
    /** Aligned automatically from the recording; worth a listen before publishing. */
    auto: z.boolean().optional(),
  })
  .strict();

export type CuesFile = z.infer<typeof cuesSchema>;

export function readCues(file: string): { cues?: CuesFile; error?: string } {
  if (!existsSync(file)) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { error: `cues.json is not valid JSON: ${(e as Error).message}` };
  }
  const parsed = cuesSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: `cues.json: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`,
    };
  }
  return { cues: parsed.data };
}

/** Atomic write: temporary file, then rename (FR-CUE-5). */
export function writeCues(file: string, cues: CuesFile): void {
  const tmp = path.join(path.dirname(file), `.cues.${process.pid}.${Date.now()}.tmp`);
  const data: CuesFile = { ...cues, updated: cues.updated ?? new Date().toISOString() };
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, file);
}
