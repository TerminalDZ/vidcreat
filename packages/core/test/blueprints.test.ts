import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import {
  BLUEPRINTS,
  blueprint,
  compileEpisode,
  draftCues,
  episodePaths,
  INSTALL_ROOT,
} from '@reelforge/core';

/** One spoken line per built-in blueprint (each example starts on its own line). */
const LINES = Array.from({ length: Math.max(10, BLUEPRINTS.length) }, (_, i) => ({
  id: `l${i + 1}`,
  text: `This is spoken line number ${i + 1} of the blueprint test episode.`,
}));

function compileScenes(scenes: unknown[], theme = 'default') {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'rf-bp-'));
  writeFileSync(
    path.join(dir, 'episode.yaml'),
    stringify({
      meta: { id: 'bp', lang: 'en-US', theme },
      script: LINES.map((l) => ({ text: l.text })),
      scenes,
    }),
  );
  writeFileSync(path.join(dir, 'cues.json'), JSON.stringify({ ...draftCues(LINES), draft: false }));
  return compileEpisode(episodePaths(dir, INSTALL_ROOT), { voice: null });
}

describe('scene blueprints', () => {
  it('every built-in blueprint has a valid example', () => {
    expect(BLUEPRINTS.length).toBeGreaterThanOrEqual(10);
    for (const b of BLUEPRINTS) expect(b.params.safeParse(b.example).success, b.name).toBe(true);
  });

  it('every example compiles with no errors and no layout warnings', () => {
    const scenes = BLUEPRINTS.map((b) => b.build(b.example));
    const r = compileScenes(scenes);
    const bad = r.issues.filter((i) => i.level === 'error' || ['V-6', 'V-7', 'V-8', 'V-12'].includes(i.rule));
    expect(bad.map((i) => `${i.rule} ${i.message}`)).toEqual([]);
    expect(r.timeline!.scenes).toHaveLength(BLUEPRINTS.length);
  });

  it('enters on the given word and rejects bad parameters with a clear message', () => {
    const s = blueprint('stat-reveal')!.build({ line: 'l3', at: "l3:'number'", value: 5, label: 'beds' });
    expect((s.elements as { enter: { at: string } }[])[0].enter.at).toBe("l3:'number'");
    expect(() => blueprint('process-steps')!.build({ line: 'l1', steps: [] })).toThrow(/steps/);
    expect(() => blueprint('hook')!.build({ line: 'l1', headline: 'x', bogus: 1 })).toThrow(/bogus/);
  });
});
