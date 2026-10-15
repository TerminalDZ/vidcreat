import { describe, expect, it } from 'vitest';
import {
  buildLineTimings,
  estimateWordStarts,
  LINE_TAIL,
  parseTime,
  resolveTime,
  TimeError,
  type TimeContext,
} from '@reelforge/core';

const script = [
  { id: 'l1', text: 'عمرك دفعت حاجة أونلاين، والنت فصل؟' },
  { id: 'l2', text: 'الـ client بعت الـ request، والـ request اتكرر' },
  { id: 'intro_2', text: 'timeout and retry' },
];
const cues = { l1: 0, l2: 3, intro_2: 6 };
const ctx = (): TimeContext => {
  const scenes: Record<string, [number, number]> = { hook: [0, 3], fix: [3, 9] };
  return {
    lines: buildLineTimings(script, cues, 9),
    duration: 9,
    sceneIds: () => Object.keys(scenes),
    sceneTime: (id, part) => scenes[id][part === 'start' ? 0 : 1],
  };
};

describe('time expressions (SRS §5)', () => {
  it('parses every grammar form', () => {
    expect(parseTime('12.5s').base).toEqual({ kind: 'seconds', value: 12.5 });
    expect(parseTime(4).base).toEqual({ kind: 'seconds', value: 4 });
    expect(parseTime('l7').base).toEqual({ kind: 'line', id: 'l7', part: 'start' });
    expect(parseTime('l7.end').base).toEqual({ kind: 'line', id: 'l7', part: 'end' });
    expect(parseTime("l7:'timeout'").base).toEqual({
      kind: 'word',
      id: 'l7',
      word: 'timeout',
      occurrence: 1,
    });
    expect(parseTime("l7:'الاتنين'#2").base).toEqual({
      kind: 'word',
      id: 'l7',
      word: 'الاتنين',
      occurrence: 2,
    });
    expect(parseTime('l7.3').base).toEqual({ kind: 'wordIndex', id: 'l7', index: 3 });
    expect(parseTime('@hook.end').base).toEqual({ kind: 'scene', id: 'hook', part: 'end' });
    expect(parseTime('@hook').base).toEqual({ kind: 'scene', id: 'hook', part: 'start' });
    expect(parseTime('l7+0.4').offset).toBe(0.4);
    expect(parseTime('l7 - 0.25s').offset).toBe(-0.25);
    expect(parseTime('l7+1-0.5').offset).toBe(0.5);
    expect(parseTime('l7:"x y"').base).toMatchObject({ word: 'x y' });
    expect(parseTime(`l21:"Conway's"`).base).toMatchObject({ word: "Conway's" });
  });

  it('rejects malformed expressions with a hint', () => {
    expect(() => parseTime('')).toThrow(TimeError);
    expect(() => parseTime('l7 * 2')).toThrow(/Unexpected/);
    expect(() => parseTime('%%')).toThrow(/Cannot parse/);
  });

  it('resolves lines, ends, words, indices and scenes', () => {
    const c = ctx();
    expect(resolveTime('l2', c)).toBe(3);
    expect(resolveTime('l1.end', c)).toBe(2.85);
    expect(resolveTime('intro_2.end', c)).toBe(8.85);
    expect(resolveTime('l2+0.4', c)).toBe(3.4);
    expect(resolveTime('l2.0', c)).toBe(3);
    expect(resolveTime("l1:'فصل'", c)).toBeGreaterThan(resolveTime("l1:'دفعت'", c));
    expect(resolveTime("l2:'request'#2", c)).toBeGreaterThan(resolveTime("l2:'request'", c));
    expect(resolveTime('@fix.end', c)).toBe(9);
    expect(resolveTime('7.25s', c)).toBe(7.25);
  });

  it('matches multi-word phrases and loose forms (punctuation, tatweel)', () => {
    const c = ctx();
    expect(resolveTime("intro_2:'and retry'", c)).toBe(resolveTime('intro_2.1', c));
    expect(resolveTime("l1:'أونلاين'", c)).toBe(resolveTime('l1.3', c));
    expect(resolveTime("l2:'الـ'", c)).toBe(3);
  });

  it('reports errors with the closest valid alternative', () => {
    const c = ctx();
    expect(() => resolveTime('l9', c)).toThrow(/Unknown script line "l9"/);
    try {
      resolveTime("l2:'requst'", c);
    } catch (e) {
      expect((e as TimeError).message).toMatch(/not found in line l2/);
      expect((e as TimeError).hint).toMatch(/request/);
    }
    expect(() => resolveTime('l1.40', c)).toThrow(/out of range/);
    expect(() => resolveTime('@nope', c)).toThrow(/Unknown scene/);
    expect(() => resolveTime('l1-1', c)).toThrow(/before the start/);
    expect(() => resolveTime('20s', c)).toThrow(/after the end/);
    expect(() => resolveTime("l2:'request'#5", c)).toThrow(/fewer than 5/);
  });
});

describe('word timing estimation (SRS §5.2)', () => {
  it('weights words by letters (min 2) over span minus tail', () => {
    const s = estimateWordStarts(['a', 'abcd', 'xy'], 10, 12);
    const span = 2 - LINE_TAIL;
    // weights 2, 4, 2 → starts at 0, 2/8, 6/8 of the span
    expect(s).toEqual([
      10,
      Math.round((10 + span * 0.25) * 1000) / 1000,
      Math.round((10 + span * 0.75) * 1000) / 1000,
    ]);
  });
  it('ignores punctuation in weights', () => {
    expect(estimateWordStarts(['؟؟؟؟', 'ab'], 0, 1.18)).toEqual([0, 0.5]);
  });
  it('uses manual word overrides when complete', () => {
    const lines = buildLineTimings([{ id: 'l1', text: 'a b c' }], { l1: 1 }, 5, { l1: [1, 1.5, 3] });
    expect(lines.get('l1')!.words.map((w) => w.start)).toEqual([1, 1.5, 3]);
  });
});
