import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BLUEPRINTS,
  compileEpisode,
  episodePaths,
  fillTemplate,
  findTemplate,
  INSTALL_ROOT,
  listPacks,
  slotsSchema,
  type Lang,
  type Pack,
  type TemplateSpec,
} from '@reelforge/core';

const INDUSTRIES = [
  'education',
  'events-ngo',
  'finance',
  'food',
  'government',
  'healthcare',
  'manufacturing',
  'ports-logistics',
  'real-estate',
  'retail',
  'tech',
  'tourism',
];
const LAYOUT = ['V-6', 'V-7', 'V-8', 'V-12'];
const LANGS: Lang[] = ['en', 'ar'];

const { packs, errors } = listPacks();
const dir = mkdtempSync(path.join(os.tmpdir(), 'rf-packs-'));
const paths = episodePaths(dir, INSTALL_ROOT);

/** Small seeded PRNG so the "random" slot values are the same on every run. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS: Record<Lang, string[]> = {
  en: ['North', "St. Ann's", 'Café', 'Q&A', 'line: two', 'Riverside', 'x', 'Market', '24/7', 'Hall'],
  ar: ['مستشفى', 'الـ API', 'شارع', 'سوق', 'مدينة', 'نور', 'ميناء', 'كلية', 'Plus', 'الخير'],
};

function randomSlots(t: TemplateSpec, lang: Lang, seed: number): Record<string, unknown> {
  const r = rng(seed);
  const out: Record<string, unknown> = {};
  for (const [name, s] of Object.entries(t.slots)) {
    if (s.type === 'number') {
      const min = s.min ?? 0;
      const max = s.max ?? 1000;
      out[name] = Math.round(min + r() * (max - min));
    } else if (s.type === 'color') {
      out[name] = ['lime', 'cyan', 'amber', 'violet', '#ff8800'][Math.floor(r() * 5)];
    } else {
      const max = s.max ?? 80;
      const target = 1 + Math.floor(r() * max);
      let text = '';
      while (text.length < target) text += `${text ? ' ' : ''}${WORDS[lang][Math.floor(r() * 10)]}`;
      out[name] = text.slice(0, target).trim() || 'A';
    }
  }
  return out;
}

function compileFilled(pack: Pack, t: TemplateSpec, lang: Lang, slots?: Record<string, unknown>) {
  const { yaml } = fillTemplate(pack, t, { lang, id: `${t.id}-${lang}`, slots });
  return compileEpisode(paths, { yamlText: yaml, draftCues: true, voice: null });
}

/** Problems an episode made from a template must never have. */
function problems(r: ReturnType<typeof compileEpisode>, lang: Lang): string[] {
  const out = r.issues
    .filter((i) => i.level === 'error' || LAYOUT.includes(i.rule))
    .map((i) => `${i.rule} ${i.message}`);
  const tl = r.timeline;
  if (!tl) return [...out, 'no timeline'];
  if (!tl.meta.lang.startsWith(lang)) out.push(`meta.lang ${tl.meta.lang}`);
  for (const l of tl.script) {
    const covered = tl.scenes.some(
      (s) =>
        Math.abs(s.start - l.start) < 0.05 ||
        s.elements.some((e) => e.enter.t >= l.start - 0.05 && e.enter.t < l.end),
    );
    if (!covered) out.push(`line ${l.id}: no scene starts and nothing enters during it`);
  }
  return out;
}

describe('industry packs', () => {
  it('ships one valid pack per industry', () => {
    expect(errors).toEqual([]);
    expect(packs.map((p) => p.id).sort()).toEqual(INDUSTRIES);
    const names = new Set(BLUEPRINTS.map((b) => b.name));
    for (const p of packs) {
      expect(existsSync(path.join(INSTALL_ROOT, 'themes', `${p.theme}.theme.yaml`)), p.id).toBe(true);
      expect(existsSync(path.join(INSTALL_ROOT, p.playbook ?? 'missing')), p.id).toBe(true);
      expect(
        p.blueprints.filter((b) => !names.has(b)),
        p.id,
      ).toEqual([]);
      expect(p.templates, p.id).toHaveLength(3);
      expect(p.examples.length, p.id).toBeGreaterThanOrEqual(2);
      for (const ex of p.examples) {
        expect(existsSync(path.join(p.dir, ex, 'episode.yaml')), `${p.id}/${ex}`).toBe(true);
        expect(existsSync(path.join(p.dir, ex, 'cues.json')), `${p.id}/${ex}`).toBe(true);
      }
    }
  });

  it('templates use exactly their declared slots, in both languages', () => {
    for (const p of packs)
      for (const t of p.templates) {
        const n = Object.keys(t.slots).length;
        expect(n >= 5 && n <= 10, `${p.id}/${t.id} has ${n} slots`).toBe(true);
        for (const lang of LANGS) {
          const file = t.files[lang];
          expect(file, `${p.id}/${t.id} ${lang}`).toBeDefined();
          const src = readFileSync(path.join(p.dir, file!), 'utf8');
          const used = new Set([...src.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g)].map((m) => m[1]));
          const declared = new Set([...Object.keys(t.slots), 'id']);
          expect(
            [...used].filter((u) => !declared.has(u)),
            `${p.id}/${t.id}.${lang}`,
          ).toEqual([]);
          expect(
            [...declared].filter((d) => !used.has(d)),
            `${p.id}/${t.id}.${lang} unused`,
          ).toEqual([]);
          expect(src, `${p.id}/${t.id}.${lang}`).toMatch(lang === 'ar' ? /lang: ar-EG/ : /lang: en-US/);
        }
      }
  });

  it(
    'every template compiles cleanly with defaults and with seeded random slot values',
    { timeout: 60000 },
    () => {
      const bad: string[] = [];
      for (const p of packs)
        for (const t of p.templates)
          for (const lang of LANGS) {
            const runs: [string, Record<string, unknown> | undefined][] = [
              ['defaults', undefined],
              ['random 1', randomSlots(t, lang, 1)],
              ['random 2', randomSlots(t, lang, 7)],
            ];
            for (const [label, slots] of runs) {
              const r = compileFilled(p, t, lang, slots);
              for (const m of problems(r, lang)) bad.push(`${p.id}/${t.id} ${lang} ${label}: ${m}`);
              if (label === 'defaults') {
                const lines = r.timeline?.script.length ?? 0;
                const scenes = r.timeline?.scenes.length ?? 0;
                if (lines < 5 || lines > 8) bad.push(`${p.id}/${t.id} ${lang}: ${lines} script lines`);
                if (scenes < 4 || scenes > 6) bad.push(`${p.id}/${t.id} ${lang}: ${scenes} scenes`);
              }
            }
          }
      expect(bad).toEqual([]);
    },
  );

  it('slot validation rejects bad values with a clear message', () => {
    const { template } = findTemplate(packs, 'healthcare', 'patient-journey');
    const s = slotsSchema(template, 'en');
    expect(s.safeParse({}).success).toBe(true);
    expect(s.safeParse({ org: 'N'.repeat((template.slots.org.max ?? 80) + 1) }).success).toBe(false);
    expect(s.safeParse({ org: 'Two\nlines' }).success).toBe(false);
    expect(s.safeParse({ org: 'Hi {{id}}' }).success).toBe(false);
    expect(s.safeParse({ wait: 'ten' }).success).toBe(false);
    expect(s.safeParse({ wait: 100000 }).success).toBe(false);
    expect(s.safeParse({ accent: 'not a color!' }).success).toBe(false);
    expect(s.safeParse({ bogus: 'x' }).success).toBe(false);
    expect(() => findTemplate(packs, 'healthcare', 'nope')).toThrow(/patient-journey/);
  });

  it('escapes quotes so filled values cannot break the YAML', () => {
    const { pack, template } = findTemplate(packs, 'healthcare', 'patient-journey');
    const r = compileFilled(pack, template, 'en', { org: "St. Ann's: 'East' Wing" });
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(r.spec?.script[0].text).toContain("St. Ann's: 'East' Wing");
  });
});
