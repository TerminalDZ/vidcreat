import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compileEpisode,
  draftCues,
  episodeJsonSchema,
  episodePaths,
  episodeTemplate,
  INSTALL_ROOT,
  loadPreset,
  loadTheme,
  readCues,
  resolveEpisode,
  toPublishMd,
  toSrt,
  writeCues,
  type CuesFile,
} from '@reelforge/core';

const ROOT = INSTALL_ROOT;
const MINI = path.join(ROOT, 'fixtures/mini');
const LINT = path.join(ROOT, 'fixtures/lint');
const cases = JSON.parse(readFileSync(path.join(LINT, 'cases.json'), 'utf8')) as Record<string, string>;

/** Writes a throwaway episode folder. */
function tmpEpisode(yaml: string, cues?: Partial<CuesFile> | null): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'rf-'));
  writeFileSync(path.join(dir, 'episode.yaml'), yaml);
  if (cues !== null) {
    writeFileSync(
      path.join(dir, 'cues.json'),
      JSON.stringify({
        version: 1,
        audio: { file: 'voice.wav', duration: 6 },
        cues: { l1: 0.2, l2: 2.1, l3: 4.2 },
        words: {},
        ...cues,
      }),
    );
  }
  return dir;
}
const compileDir = (dir: string, opts = {}) =>
  compileEpisode(episodePaths(dir, ROOT), { voice: null, ...opts });
const BASE = (scenes: string, extra = '') => `meta:
  id: t
  series: S
${extra}script:
  - text: "المشكلة دي اسمها Duplicate Charge"
  - text: "الـ client بعت الـ request مرتين"
  - text: "والحل؟ Idempotency key"
scenes:
${scenes}`;

describe('compileEpisode (FR-CORE-1…6)', () => {
  it('compiles the mini fixture into a complete timeline', () => {
    const r = compileEpisode(episodePaths(MINI, ROOT));
    expect(r.ok).toBe(true);
    const tl = r.timeline!;
    expect(tl.duration).toBe(6);
    expect(tl.frames).toBe(180);
    expect(tl.scenes.map((s) => [s.id, s.start, s.end])).toEqual([
      ['hook', 0.2, 4.2],
      ['fix', 4.2, 6],
    ]);
    expect(tl.scenes[0].hash).toMatch(/^[0-9a-f]{16}$/);
    expect(tl.audio.envelope).toHaveLength(180);
    expect(tl.theme.captions.active).toBe('#b8ff3c');
    const arrow = tl.scenes[0].elements.find((e) => e.id === 'req')!;
    expect(arrow.props.points).toHaveLength(2);
    expect((arrow.props.packets as unknown[]).length).toBe(1);
    expect(tl.sfx.map((s) => s.sound)).toContain('hit');
    expect(tl.flashes).toHaveLength(1);
    expect(tl.chapters.map((c) => c.label)).toEqual(['01 · THE PROBLEM', '02 · THE FIX']);
  });

  it('reports every schema error with line, column and did-you-mean', () => {
    const dir = tmpEpisode(`meta:
  id: t
  titel: x
script:
  - text: "a b"
    captoin: none
scenes:
  - id: s
    at: l1
    transition: fade
`);
    const r = compileDir(dir);
    expect(r.ok).toBe(false);
    const msgs = r.issues.map((i) => `${i.line}:${i.col} ${i.message}`);
    expect(msgs).toContainEqual(expect.stringMatching(/^3:3 .*unknown key "titel". Did you mean "title"/));
    expect(msgs).toContainEqual(
      expect.stringMatching(/^6:5 .*unknown key "captoin". Did you mean "caption"/),
    );
    expect(msgs).toContainEqual(expect.stringMatching(/^10:17 .*Expected one of: crossfade, cut, slide-up/));
    expect(r.script).toEqual([{ id: 'l1', text: 'a b' }]);
  });

  it('reports YAML syntax errors with positions', () => {
    const r = compileDir(tmpEpisode('meta:\n  id: [unclosed\n'));
    expect(r.issues[0]).toMatchObject({ rule: 'V-1', level: 'error' });
    expect(r.issues[0].line).toBeGreaterThan(0);
  });

  it('validates component props strictly', () => {
    const r = compileDir(
      tmpEpisode(
        BASE(`  - id: s
    at: l1
    elements:
      - use: chip
        props: { txt: "x" }
      - use: node
        props: { title: "n", status: broken }
`),
      ),
    );
    const m = r.issues.map((i) => i.message).join('\n');
    expect(m).toMatch(/unknown key "txt". Did you mean "text"/);
    expect(m).toMatch(/Invalid value "broken"/);
  });

  it('resolves time-valued strike/highlight props and keeps booleans', () => {
    const r = compileDir(
      tmpEpisode(
        BASE(`  - id: s
    at: l1
    elements:
      - { use: chip, id: a, props: { text: x, strike: "l2+0.5" } }
      - use: table
        id: t
        props: { columns: [a], rows: [{ cells: [x], highlight: l3 }, { cells: [y], strike: true }] }
        place: { x: 0, y: 400, w: 600, h: 300 }
`),
      ),
    );
    const [chip, table] = r.timeline!.scenes[0].elements;
    expect(chip.props.strike).toBe(2.6);
    const rows = table.props.rows as { highlight?: unknown; strike?: unknown }[];
    expect(rows[0].highlight).toBe(4.2);
    expect(rows[1].strike).toBe(true);
  });

  it('detects duplicate ids', () => {
    const r = compileDir(
      tmpEpisode(
        BASE(`  - id: s
    at: l1
    elements:
      - { use: chip, id: a, props: { text: x } }
      - { use: chip, id: a, props: { text: y }, place: { x: 0, y: 500, w: 200, h: 80 } }
  - id: s
    at: l2
`),
      ),
    );
    expect(r.issues.filter((i) => /Duplicate/.test(i.message)).length).toBe(2);
  });

  it('runs every seeded-bug fixture and reports its rule (static rules)', () => {
    for (const [name, rule] of Object.entries(cases)) {
      if (rule === 'V-9' || rule === 'V-10') continue; // measured in the browser suite
      const r = compileEpisode(episodePaths(path.join(LINT, name), ROOT));
      expect(
        r.issues.map((i) => i.rule),
        name,
      ).toContain(rule);
    }
  });

  it('resolves scene references, layout helpers and arrow sides', () => {
    const r = compileDir(
      tmpEpisode(
        BASE(`  - id: a
    at: l1
    end: "@b-0.5"
    row: { gap: 40, h: 200 }
    elements:
      - { use: node, id: n1, props: { title: A } }
      - { use: node, id: n2, props: { title: B } }
      - { use: arrow, id: ar, props: { from: n1, to: n2 } }
  - id: b
    at: l2
    columns: 2
    elements:
      - { use: chip, id: c1, props: { text: one } }
      - { use: chip, id: c2, props: { text: two } }
      - { use: chip, id: c3, props: { text: three }, col: 0 }
  - id: c
    at: l3
    column: { gap: 20 }
    elements:
      - { use: label, id: lab1, props: { text: x } }
      - { use: label, id: lab2, props: { text: y } }
`),
      ),
    );
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    const tl = r.timeline!;
    expect(tl.scenes[0].end).toBe(1.6);
    const [n1, n2, ar] = tl.scenes[0].elements;
    expect(n1.box.y).toBe(n2.box.y);
    expect(n2.box.x).toBeGreaterThan(n1.box.x + n1.box.w);
    const pts = ar.props.points as { x: number; y: number }[];
    // starts just right of n1, ends just left of n2 (auto sides + gap)
    expect(pts[0].x + ar.box.x).toBeGreaterThan(n1.box.x + n1.box.w);
    expect(pts[1].x + ar.box.x).toBeLessThan(n2.box.x);
    expect(pts[0].y + ar.box.y).toBeCloseTo(n1.box.y + n1.box.h / 2, 0);
    const [c1, c2, c3] = tl.scenes[1].elements;
    expect(c1.box.x).toBe(c3.box.x);
    expect(c2.box.x).toBeGreaterThan(c1.box.x);
    const [l1, l2] = tl.scenes[2].elements;
    expect(l2.box.y).toBeGreaterThan(l1.box.y);
  });

  it('clamps enter/exit to the scene and keeps states/fx sorted', () => {
    const r = compileDir(
      tmpEpisode(
        BASE(`  - id: s
    at: l1
    elements:
      - use: node
        id: n
        props: { title: N }
        exit: { at: l3, anim: rise }
        states:
          - { at: l2, set: { status: err, color: lime } }
          - { at: l1, set: { status: ok } }
        fx:
          - { at: l2, do: shake, target: camera }
          - { at: l2, do: flash, color: red }
          - { at: l1, do: pulse }
  - id: s2
    at: l2+0.5
`),
      ),
    );
    const el = r.timeline!.scenes[0].elements[0];
    expect(el.exit!.t).toBe(2.6);
    expect(el.states.map((s) => s.t)).toEqual([0.2, 2.1]);
    expect(el.states[1].set.color).toBe('#b8ff3c');
    expect(el.fx.map((f) => f.do)).toEqual(['pulse']);
    expect(r.timeline!.shakes).toHaveLength(1);
    expect(r.timeline!.flashes[0].color).toBe('#ff4a5c');
  });

  it('collects and deduplicates SFX (FR-CORE-5), honoring audio.sfx', () => {
    const scenes = `  - id: s
    at: l1
    elements:
      - { use: stamp, id: s1, props: { text: A }, enter: { at: l2 } }
      - { use: stamp, id: s2, props: { text: B }, enter: { at: "l2+0.03" }, layer: overlay, place: { x: 0, y: 600, w: 400, h: 200 } }
`;
    const auto = compileDir(
      tmpEpisode(BASE(scenes, `audio:\n  extra: [{ at: l3, sound: ding }]\n`)),
    ).timeline!;
    expect(auto.sfx.filter((s) => s.sound === 'hit')).toHaveLength(1);
    expect(auto.sfx.some((s) => s.sound === 'ding' && s.source === 'audio.extra')).toBe(true);
    const manual = compileDir(
      tmpEpisode(BASE(scenes, `audio:\n  sfx: manual\n  extra: [{ at: l3, sound: ding }]\n`)),
    ).timeline!;
    expect(manual.sfx.map((s) => s.sound)).toEqual(['ding']);
    const none = compileDir(
      tmpEpisode(BASE(scenes, `audio:\n  sfx: none\n  extra: [{ at: l3, sound: ding }]\n`)),
    ).timeline!;
    expect(none.sfx).toEqual([]);
  });

  it('handles missing cues (error unless draft), missing voice (warning) and extra cue ids', () => {
    const dir = tmpEpisode(BASE(`  - { id: s, at: l1 }\n`), null);
    const strict = compileEpisode(episodePaths(dir, ROOT));
    expect(strict.issues.find((i) => i.rule === 'V-3')?.level).toBe('error');
    expect(strict.issues.find((i) => i.rule === 'V-4')?.level).toBe('warn');
    const draft = compileEpisode(episodePaths(dir, ROOT), { draftCues: true });
    expect(draft.ok).toBe(true);
    const extra = compileDir(
      tmpEpisode(BASE(`  - { id: s, at: l1 }\n`), { cues: { l1: 0, l2: 1, l3: 2, old: 3 } }),
    );
    expect(extra.issues.some((i) => /unknown line "old"/.test(i.message))).toBe(true);
    const missing = compileDir(tmpEpisode(BASE(`  - { id: s, at: l1 }\n`), { cues: { l1: 0, l2: 1 } }));
    expect(missing.issues.some((i) => /Missing cue for script line l3/.test(i.message))).toBe(true);
  });

  it('reports unknown themes and presets with suggestions', () => {
    const r = compileDir(
      tmpEpisode(
        BASE(`  - { id: s, at: l1 }\n`).replace(
          '  series: S\n',
          '  series: S\n  theme: seasn1\n  preset: tiktk\n',
        ),
      ),
    );
    const m = r.issues.map((i) => `${i.message} ${i.hint}`).join('\n');
    expect(m).toMatch(/Theme "seasn1" not found.*season1/);
    expect(m).toMatch(/Preset "tiktk" not found.*tiktok/);
  });
});

describe('themes, presets, cues, outputs', () => {
  it('loads themes with extends and resolves caption colors', () => {
    const t = loadTheme('season1', ROOT, ROOT);
    expect(t.issues).toEqual([]);
    expect(t.theme.colors.lime).toBe('#b8ff3c');
    expect(t.files.map((f) => path.basename(f))).toEqual(['default.theme.yaml', 'season1.theme.yaml']);
    const w = loadTheme('workshop', ROOT, ROOT);
    expect(w.theme.chrome.grain).toBe(0);
    expect(w.theme.fonts.arabic).toBe('Cairo');
  });

  it('loads editable presets', () => {
    for (const name of ['tiktok', 'reels', 'shorts']) {
      const p = loadPreset(name, ROOT, ROOT);
      expect(p.issues).toEqual([]);
      expect(p.preset.width).toBe(1080);
      expect(p.preset.fps).toBe(30);
    }
    expect(loadPreset('shorts', ROOT, ROOT).preset.headerTop).toBe(130);
  });

  it('writes cues atomically and reads them back', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'rf-'));
    const f = path.join(dir, 'cues.json');
    writeCues(
      f,
      draftCues([
        { id: 'l1', text: 'a b c' },
        { id: 'l2', text: 'd' },
      ]),
    );
    const back = readCues(f);
    expect(back.cues?.cues.l1).toBe(0.2);
    expect(back.cues?.draft).toBe(true);
    writeFileSync(f, '{bad');
    expect(readCues(f).error).toMatch(/not valid JSON/);
  });

  it('produces SRT and publish.md', () => {
    const r = compileEpisode(episodePaths(MINI, ROOT));
    const srt = toSrt(r.timeline!);
    expect(srt).toMatch(/^1\n00:00:00,200 --> 00:00:02,100\n/);
    expect(srt.split('\n\n').length).toBe(3);
    const md = toPublishMd(r.spec!, r.timeline!, { share: 'out/mini.share.mp4' });
    expect(md).toMatch(/# SYSTEM DESIGN · EP01 · Mini/);
    expect(md).toMatch(/#reelforge/);
  });

  it('exports a JSON schema and a template that compiles', () => {
    const s = episodeJsonSchema() as { 'x-components': Record<string, unknown> };
    expect(Object.keys(s['x-components'])).toHaveLength(21);
    const dir = mkdtempSync(path.join(os.tmpdir(), 'rf-'));
    writeFileSync(path.join(dir, 'episode.yaml'), episodeTemplate('ep99'));
    const r = compileEpisode(episodePaths(dir, ROOT), { draftCues: true, voice: null });
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('resolves episode arguments', () => {
    expect(resolveEpisode('fixtures/mini', ROOT)?.dir).toBe(MINI);
    expect(resolveEpisode('nope', ROOT)).toBeUndefined();
  });
});

describe('Season 1 examples (F17, SRS §12.1 regression)', () => {
  const dir = path.join(ROOT, 'examples/season1');
  const eps = existsSync(dir)
    ? readdirSync(dir).filter((d) => existsSync(path.join(dir, d, 'episode.yaml')))
    : [];
  it.each(eps)('%s compiles and validates with zero errors', (ep) => {
    const r = compileEpisode(episodePaths(path.join(dir, ep), ROOT));
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(r.issues.filter((i) => i.level === 'warn' && i.rule !== 'V-4')).toEqual([]);
  });
});
