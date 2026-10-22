/** A default tool host: the project, a render queue and editors started on demand. */
import path from 'node:path';
import type { PcmAudio } from '@reelforge/audio';
import { measureTimeline } from '@reelforge/renderer';
import { startStudio, type Studio } from '../server/index.js';
import { RenderRunner } from '../server/jobs.js';
import type { ToolHost } from './types.js';

export interface ToolHostOptions {
  root: string;
  decode?: (file: string) => PcmAudio;
  runner?: RenderRunner;
  log?: (msg: string) => void;
}

export function createToolHost(opts: ToolHostOptions): ToolHost & { close(): Promise<void> } {
  const log = opts.log ?? (() => undefined);
  const runner = opts.runner ?? new RenderRunner({ decode: opts.decode, log });
  const studios = new Map<string, Studio>();
  return {
    root: path.resolve(opts.root),
    decode: opts.decode,
    runner,
    log,
    openStudio: async (p, key) => {
      let s = studios.get(p.dir);
      if (!s) {
        s = await startStudio({
          paths: p,
          mode: 'edit',
          port: 0,
          decode: opts.decode,
          measure: (tl) =>
            measureTimeline(tl, { cacheDir: path.join(p.out, '.cache'), assetsDir: p.assets, file: p.yaml }),
          renderer: runner,
          renderKey: key,
          log,
        });
        studios.set(p.dir, s);
      }
      return { url: s.url };
    },
    close: async () => {
      for (const s of studios.values()) await s.close().catch(() => undefined);
      studios.clear();
    },
  };
}
