import { describe, expect, it } from 'vitest';
import {
  buildCaptions,
  chunkUnits,
  forcedBreaks,
  NBSP,
  splitWords,
  tokenizeWords,
  tokenParts,
} from '@reelforge/core';

const units = (s: string) => tokenizeWords(splitWords(s)).map((u) => u.text);

describe('caption tokenization (SRS §9.2, fixture suite §9.3)', () => {
  it('merges Latin runs', () => {
    expect(units('المشكلة دي اسمها Duplicate Charge')).toEqual([
      'المشكلة',
      'دي',
      'اسمها',
      'Duplicate Charge',
    ]);
  });
  it('joins tatweel tokens with NBSP', () => {
    expect(units('الـ client بعت الـ request')).toEqual([`الـ${NBSP}client`, 'بعت', `الـ${NBSP}request`]);
  });
  it('keeps trailing Arabic punctuation outside the Latin isolate', () => {
    const u = units('عايز الجزء الجاي عن الـ Double-entry ledger؟');
    expect(u[u.length - 1]).toBe(`الـ${NBSP}Double-entry ledger؟`);
    expect(tokenParts(u[u.length - 1], true)).toEqual([
      { text: `الـ${NBSP}`, latin: false },
      { text: 'Double-entry ledger', latin: true },
      { text: '؟', latin: false },
    ]);
  });
  it('leaves English-only lines as plain LTR words', () => {
    expect(units('There are only two hard things')).toEqual([
      'There',
      'are',
      'only',
      'two',
      'hard',
      'things',
    ]);
    expect(tokenParts('There', false)).toEqual([{ text: 'There', latin: false }]);
  });
  it("merges apostrophes (Conway's law)", () => {
    expect(units("وافتكر Conway's law")).toEqual(['وافتكر', "Conway's law"]);
  });
  it('makes بـ SELECT FOR UPDATE one unbreakable token', () => {
    expect(units('بـ SELECT FOR UPDATE')).toEqual([`بـ${NBSP}SELECT FOR UPDATE`]);
  });
  it('does not merge across punctuation', () => {
    expect(units('قال Hello، world تمام')).toEqual(['قال', 'Hello،', 'world', 'تمام']);
  });
  it('marks tokens containing Latin as english in RTL chunks only', () => {
    const [ar] = buildCaptions(
      [
        {
          id: 'l1',
          text: 'الـ client بعت',
          caption: 'auto',
          breaks: [],
          start: 0,
          next: 2,
          wordStarts: [0, 0.5, 1],
        },
      ],
      { maxChars: 34, duration: 2 },
    );
    expect(ar.dir).toBe('rtl');
    expect(ar.tokens.map((t) => t.english)).toEqual([true, false]);
    expect(ar.tokens[0].start).toBe(0);
    expect(ar.tokens[1].start).toBe(1);
    const [en] = buildCaptions(
      [
        {
          id: 'l1',
          text: 'cache invalidation',
          caption: 'auto',
          breaks: [],
          start: 0,
          next: 2,
          wordStarts: [0, 1],
        },
      ],
      {
        maxChars: 34,
        duration: 2,
      },
    );
    expect(en.dir).toBe('ltr');
    expect(en.tokens.every((t) => !t.english)).toBe(true);
  });
});

describe('caption chunking (SRS §9.1)', () => {
  it('splits at punctuation closest to the middle, then by word count', () => {
    const u = tokenizeWords(splitWords('عمرك دفعت حاجة أونلاين، والنت فصل في نص الدفع؟'));
    const chunks = chunkUnits(u, 34).map((c) => c.map((x) => x.text).join(' '));
    expect(chunks[0]).toBe('عمرك دفعت حاجة أونلاين،');
    expect(chunks.every((c) => c.length <= 34)).toBe(true);
    const long = tokenizeWords(splitWords('a b c d e f g h i j k l m n o p q r s t u v w x y z aa bb cc dd'));
    expect(chunkUnits(long, 20).every((c) => c.map((x) => x.text).join(' ').length <= 20)).toBe(true);
  });
  it('forces breaks before listed words', () => {
    const u = tokenizeWords(splitWords('عمرك دفعت حاجة والنت فصل'));
    expect(forcedBreaks(u, ['والنت']).map((g) => g.length)).toEqual([3, 2]);
  });
  it('computes chunk visibility windows', () => {
    const caps = buildCaptions(
      [
        {
          id: 'l1',
          text: 'one two',
          caption: 'auto',
          breaks: ['two'],
          start: 0,
          next: 2,
          wordStarts: [0, 1],
        },
        { id: 'l2', text: 'gone', caption: 'none', breaks: [], start: 2, next: 4, wordStarts: [2] },
        { id: 'l3', text: 'three', caption: 'auto', breaks: [], start: 4, next: 6, wordStarts: [4] },
        {
          id: 'l4',
          text: 'shown instead',
          caption: 'custom words here',
          breaks: [],
          start: 6,
          next: 8,
          wordStarts: [6, 7],
        },
      ],
      { maxChars: 34, duration: 8 },
    );
    expect(caps.map((c) => [c.text, c.start, c.end])).toEqual([
      ['one', 0, 1],
      ['two', 1, 2.3],
      ['three', 4, 6],
      ['custom words here', 6, 8],
    ]);
  });
});
