/** Golden frames, caption bidi geometry and determinism (SRS §9.3, §12.1, NFR-4). */
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCapturer, launchBrowser, openRuntime } from '@reelforge/renderer';
import { matchGolden, ROOT, timelineOf } from './helpers.js';

let browser: Browser;
beforeAll(async () => {
  browser = await launchBrowser();
});
afterAll(async () => {
  await browser?.close();
});

const sha1 = (b: Buffer) => createHash('sha1').update(b).digest('hex');

describe('caption fixture suite (SRS §9.3)', () => {
  const CASES = [
    { name: 'duplicate-charge', t: 1.9 },
    { name: 'al-client', t: 3.9 },
    { name: 'ledger-question', t: 5.9 },
    { name: 'english-ltr', t: 7.9 },
    { name: 'conways-law', t: 9.9 },
    { name: 'select-for-update', t: 11.9 },
  ];

  type Tok = { left: number; right: number; top: number };
  /** Reading order: on the same line RTL tokens go right → left (LTR left → right); a new line starts lower. */
  const expectOrder = (toks: Tok[], dir: 'rtl' | 'ltr') => {
    for (let i = 1; i < toks.length; i++) {
      const [a, b] = [toks[i - 1], toks[i]];
      if (Math.abs(a.top - b.top) < 10) {
        if (dir === 'rtl') expect(b.right).toBeLessThanOrEqual(a.left + 1);
        else expect(b.left).toBeGreaterThanOrEqual(a.right - 1);
      } else expect(b.top).toBeGreaterThan(a.top);
    }
  };

  it('lays out tokens in the normative visual order', async () => {
    const tl = timelineOf('fixtures/golden/captions');
    const rp = await openRuntime(browser, tl);
    const layout = async (t: number) =>
      rp.page.evaluate((tt) => {
        window.reelforge.render(tt);
        const chunk = [...document.querySelectorAll<HTMLElement>('.rf-chunk')].find(
          (c) => c.style.display === 'block',
        )!;
        const toks = [...chunk.querySelectorAll<HTMLElement>('.rf-tok')].map((el) => {
          const r = el.getBoundingClientRect();
          const parts = [...el.childNodes].map((n) => {
            const range = document.createRange();
            range.selectNodeContents(n);
            const b = range.getBoundingClientRect();
            return { text: n.textContent ?? '', bdi: n.nodeName === 'BDI', left: b.left, right: b.right };
          });
          return { text: el.textContent ?? '', left: r.left, right: r.right, top: r.top, parts };
        });
        return { dir: chunk.getAttribute('dir'), toks };
      }, t);

    // 1. المشكلة · دي · اسمها · [Duplicate Charge]  (right → left)
    let l = await layout(1.9);
    expect(l.dir).toBe('rtl');
    expect(l.toks.map((t) => t.text)).toEqual(['المشكلة', 'دي', 'اسمها', 'Duplicate Charge']);
    expectOrder(l.toks, 'rtl');

    // 2. [الـ client] · بعت · [الـ request]; inside a token الـ is right of its noun
    l = await layout(3.9);
    expect(l.toks).toHaveLength(3);
    expectOrder(l.toks, 'rtl');
    for (const k of [0, 2]) {
      const [al, noun] = l.toks[k].parts;
      expect(noun.bdi).toBe(true);
      expect(al.left).toBeGreaterThanOrEqual(noun.right - 1);
    }

    // 3. … [الـ Double-entry ledger] with ؟ at the far left
    l = await layout(5.9);
    const last = l.toks[l.toks.length - 1];
    expect(last.parts.map((p) => p.text)).toEqual(['الـ ', 'Double-entry ledger', '؟']);
    const q = last.parts[2];
    expect(q.right).toBeLessThanOrEqual(Math.min(...last.parts.slice(0, 2).map((p) => p.left)) + 1);

    // 4. LTR line, left → right
    l = await layout(7.9);
    expect(l.dir).toBe('ltr');
    expectOrder(l.toks, 'ltr');

    // 5. وافتكر · [Conway's law]
    l = await layout(9.9);
    expect(l.toks.map((t) => t.text)).toEqual(['وافتكر', "Conway's law"]);
    expectOrder(l.toks, 'rtl');

    // 6. [بـ SELECT FOR UPDATE] as one unbreakable token
    l = await layout(11.9);
    expect(l.toks).toHaveLength(1);
    expect(l.toks[0].parts[0].left).toBeGreaterThanOrEqual(l.toks[0].parts[1].right - 1);
    await rp.close();
  });

  it('matches golden frames', async () => {
    const tl = timelineOf('fixtures/golden/captions');
    const rp = await openRuntime(browser, tl);
    const cap = await createCapturer(rp.page, { format: 'png', quality: 100 });
    for (const c of CASES) {
      const r = matchGolden(
        await cap.frame(c.t),
        path.join(ROOT, 'fixtures/golden/captions/frames', `${c.name}.png`),
      );
      expect(r.ratio, c.name).toBeLessThanOrEqual(0.002);
    }
    await rp.close();
  });
});

describe('component golden frames (NFR-11)', () => {
  it('renders every component like its reference', async () => {
    const tl = timelineOf('fixtures/golden/components');
    const rp = await openRuntime(browser, tl, path.join(ROOT, 'fixtures/golden/components/assets'));
    const cap = await createCapturer(rp.page, { format: 'png', quality: 100 });
    for (const s of tl.scenes) {
      const r = matchGolden(
        await cap.frame(s.end - 0.2),
        path.join(ROOT, 'fixtures/golden/components/frames', `${s.id}.png`),
      );
      expect(r.ratio, s.id).toBeLessThanOrEqual(0.002);
    }
    await rp.close();
  });
});

describe('determinism (NFR-4, FR-RT-3)', () => {
  it('gives identical frame hashes regardless of worker split and render order', async () => {
    const tl = timelineOf('fixtures/mini');
    const frames = [0, 90, 179];
    const a = await openRuntime(browser, tl);
    const b = await openRuntime(browser, tl);
    const ca = await createCapturer(a.page, { format: 'jpeg', quality: 95 });
    const cb = await createCapturer(b.page, { format: 'jpeg', quality: 95 });
    // worker A renders the range sequentially; worker B starts mid-way, jumps around and goes backwards
    const ha: string[] = [];
    for (const f of frames) ha.push(sha1(await ca.frame(f / tl.fps)));
    const hb: Record<number, string> = {};
    for (const f of [120, 179, 30, 90, 0, 150]) {
      const h = sha1(await cb.frame(f / tl.fps));
      if (frames.includes(f)) hb[f] = h;
    }
    expect(frames.map((f) => hb[f])).toEqual(ha);
    expect(new Set(ha).size).toBe(3);
    expect(a.blocked).toEqual([]);
    await a.close();
    await b.close();
  });
});
