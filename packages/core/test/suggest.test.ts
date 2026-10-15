import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import {
  compileEpisode,
  COMPONENTS,
  episodePaths,
  INSTALL_ROOT,
  parseYaml,
  suggestForLine,
  wordExpr,
} from '@reelforge/core';

const line = (text: string) => ({ id: 'l1', text });
const uses = (text: string) => suggestForLine(line(text)).map((s) => s.use);

describe('suggestForLine (keyword smart insert, no model)', () => {
  it.each([
    ['Two requests race to update the same row.', 'lanes'],
    ['The client sends a retry after a timeout.', 'arrow'],
    ['Your database is choking.', 'node'],
    ['Compare SQL vs NoSQL.', 'table'],
    ['Picture a token bucket.', 'bucket'],
    ['CPU usage is at 92%.', 'meter'],
    ['Firing 12,000 requests per second.', 'counter'],
    ['Remember these steps.', 'checklist'],
    ['Before and after the migration.', 'timeline'],
    ['Write the SQL query with FOR UPDATE.', 'code'],
    ['The payment app shows a notification.', 'phone'],
    ["Here's the trap most teams fall into.", 'trap'],
    ['Data is split across four shards.', 'grid'],
    ['Follow for the next episode.', 'cta'],
    ['Conway said it best.', 'quote'],
    ['The second payment gets rejected.', 'stamp'],
    ['Store the password safely.', 'icon'],
    ['الـ client بعت الـ request مرتين', 'lanes'],
    ['الـ database اتخنقت', 'node'],
    ['قارن في جدول', 'table'],
  ])('%s → %s', (text, use) => {
    expect(uses(text)).toContain(use);
  });

  it('enters on the word that triggered it, with valid props', () => {
    const s = suggestForLine({ id: 'l3', text: 'Now the server is taking thirty thousand requests.' });
    const counter = s.find((x) => x.use === 'counter')!;
    expect(counter.enter.at).toBe("l3:'thousand'");
    expect((counter.props.keyframes as { value: number }[])[0].value).toBe(30000);
    for (const x of s) expect(COMPONENTS[x.use].schema.safeParse(x.props).success).toBe(true);
  });

  it.each([
    ['تلاتة آلاف request في الثانية', 3000], // Egyptian
    ['ثلاثة آلاف طلب في الثانية', 3000], // MSA (ة folds to ه)
    ['جوج مليون مستخدم', 2_000_000], // Maghrebi
    ['زوج ملايين زبون', 2_000_000], // Maghrebi
    ['ثنين مليون عميل', 2_000_000], // Gulf
    ['ألفين طلب', 2000], // dual
    ['خمسين ألف زائر', 50_000],
    ['ربعة آلاف', 4000],
  ])('reads Arabic number words: %s → %d', (text, value) => {
    const c = suggestForLine(line(text)).find((s) => s.use === 'counter');
    expect(c, text).toBeTruthy();
    expect((c!.props.keyframes as { value: number }[])[0].value).toBe(value);
  });

  it('offers a title for the hook and when nothing matches', () => {
    expect(suggestForLine(line('Why does this keep happening?'), { first: true })[0].use).toBe('title');
    expect(uses('Something completely unrelated here.')).toEqual(['title']);
    expect(suggestForLine(line('والـ users الحقيقيين')).find((s) => s.use === 'title')!.word).toBe('users');
  });

  it('builds word expressions with repeats and quotes', () => {
    expect(wordExpr('l2', ['the', 'cat', 'saw', 'the', 'dog'], 3)).toBe("l2:'the'#2");
    expect(wordExpr('l2', ["it's", 'fine'], 0)).toBe('l2.0');
  });

  // 18 episodes, ~200 suggestions, each compiled for real: heavier than a unit test, so a longer timeout.
  it('every suggestion for every example line compiles without errors', { timeout: 60_000 }, () => {
    let count = 0;
    for (const group of ['examples/season1', 'examples/season1-arabic']) {
      for (const ep of readdirSync(path.join(INSTALL_ROOT, group))) {
        const src = path.join(INSTALL_ROOT, group, ep);
        const raw = parseYaml(readFileSync(path.join(src, 'episode.yaml'), 'utf8'), 'episode.yaml').data as {
          meta: { lang?: string };
          script: { id?: string; text: string }[];
        };
        const base = {
          script: raw.script.map((l, i) => ({ id: l.id ?? `l${i + 1}`, text: l.text })),
          lang: raw.meta.lang ?? 'ar-EG',
        };
        const dir = mkdtempSync(path.join(os.tmpdir(), 'rf-suggest-'));
        const scenes = base.script.map((l, i) => ({
          id: `s${i + 1}`,
          at: l.id,
          elements: suggestForLine(l, { first: i === 0 }).map((s, k) => {
            count++;
            return { use: s.use, id: `${s.use}_${i}_${k}`, props: s.props, enter: s.enter };
          }),
        }));
        writeFileSync(
          path.join(dir, 'episode.yaml'),
          stringify({
            meta: { id: 'sug', lang: base.lang },
            script: base.script.map((l) => ({ id: l.id, text: l.text })),
            scenes,
          }),
        );
        writeFileSync(path.join(dir, 'cues.json'), readFileSync(path.join(src, 'cues.json')));
        const r = compileEpisode(episodePaths(dir, INSTALL_ROOT), { voice: null });
        const errors = r.issues.filter((i) => i.level === 'error');
        expect(errors, `${group}/${ep}: ${errors.map((e) => e.message).join('; ')}`).toEqual([]);
      }
    }
    expect(count).toBeGreaterThan(150);
  });
});
