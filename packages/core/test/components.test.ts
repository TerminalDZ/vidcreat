import { describe, expect, it } from 'vitest';
import { COMPONENTS } from '@reelforge/core';

const parse = (name: string, props: unknown) => COMPONENTS[name].schema.safeParse(props);

describe('data & structure component schemas', () => {
  it('accept minimal props and fill defaults', () => {
    const bar = parse('bar-chart', { bars: [{ label: 'A', value: 3 }] });
    expect(bar.success && bar.data).toMatchObject({
      orient: 'vertical',
      values: true,
      color: 'cyan',
      stagger: 0.12,
    });
    expect(parse('progress-ring', { value: 40 }).data).toMatchObject({ max: 100, suffix: '%' });
    expect(parse('before-after', { before: { text: 'x' }, after: { text: 'y' } }).data).toMatchObject({
      before: { label: 'BEFORE', color: 'red' },
      after: { label: 'AFTER', color: 'lime' },
      split: 0.5,
    });
    expect(parse('matrix-2x2', {}).data).toMatchObject({ x: { low: 'Low', high: 'High' }, items: [] });
  });
  it('are strict', () => {
    expect(parse('ranking', { items: [{ label: 'a', value: 1 }], colour: 'red' }).success).toBe(false);
    expect(parse('before-after', { before: {}, after: { text: 'y' } }).success).toBe(false);
  });
  it('validate hierarchy nodes (nested or parent ids)', () => {
    expect(
      parse('org-chart', {
        people: [
          { id: 'a', name: 'A', children: [{ name: 'B' }] },
          { parent: 'a', name: 'C' },
        ],
      }).success,
    ).toBe(true);
    const unknown = parse('tree', { nodes: [{ label: 'x', parent: 'nope' }] });
    expect(unknown.success).toBe(false);
    expect(unknown.error?.issues[0].message).toMatch(/Unknown parent "nope"/);
    const cycle = parse('tree', {
      nodes: [
        { id: 'a', parent: 'b', label: 'A' },
        { id: 'b', parent: 'a', label: 'B' },
      ],
    });
    expect(cycle.error?.issues.some((i) => /cycle/.test(i.message))).toBe(true);
  });
  it('schedule one sound per sequenced item', () => {
    const el = { enter: { t: 2, dur: 0.4 }, states: [] } as never;
    const p = parse('steps', { items: [{ title: 'a' }, { title: 'b', at: 9 }] }).data;
    expect(COMPONENTS.steps.events!(p, el).map((e) => e.t)).toEqual([2, 9]);
  });
});
