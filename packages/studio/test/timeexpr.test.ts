import { describe, expect, it } from 'vitest';
import type { Timeline } from '@reelforge/core';
import { app } from '../client/src/app.js';
import { exprFor } from '../client/src/timeexpr.js';

const tl = (texts: string[][]): Timeline =>
  ({
    script: texts.map((words, i) => ({
      id: `l${i + 1}`,
      text: words.join(' '),
      start: i * 10,
      end: i * 10 + 10,
      words: words.map((text, k) => ({ text, start: i * 10 + k })),
    })),
    scenes: [],
  }) as unknown as Timeline;

describe('exprFor (editor snapping → time expressions)', () => {
  it('writes line starts, words and line offsets', () => {
    app.timeline = tl([
      ['Your', 'API', 'is', 'flooded.'],
      ['A', 'rate', 'limiter'],
    ]);
    expect(exprFor(10)).toBe('l2');
    expect(exprFor(3)).toBe("l1:'flooded.'");
    expect(exprFor(12.5)).toBe('l2+2.5');
  });

  it('counts repeated words the way the compiler matches them (case and punctuation ignored)', () => {
    app.timeline = tl([['Cache', 'the', 'cache.']]);
    expect(exprFor(2)).toBe("l1:'cache.'#2");
  });

  it('falls back to a word index when the word cannot be quoted', () => {
    app.timeline = tl([['Conway', "Conway's", 'law']]);
    expect(exprFor(1)).toBe('l1.1');
  });

  it('handles Arabic words with diacritics and alef forms like the compiler', () => {
    app.timeline = tl([['الأول', 'قرا', 'الاول']]);
    expect(exprFor(2)).toBe("l1:'الاول'#2");
  });
});
