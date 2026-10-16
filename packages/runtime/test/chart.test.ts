import { describe, expect, it } from 'vitest';
import {
  linearScale,
  mirrorX,
  niceScale,
  partialPolyline,
  polar,
  polyLengths,
  textDir,
  valueDomain,
} from '../src/components/chart.js';
import { buildTree, connector, layoutTree } from '../src/components/hierarchy.js';

describe('chart scales', () => {
  it('rounds bounds outwards to nice steps', () => {
    expect(niceScale(0, 610, 4)).toEqual({ min: 0, max: 800, step: 200, ticks: [0, 200, 400, 600, 800] });
    expect(niceScale(0, 0.37, 4).step).toBe(0.1);
    expect(niceScale(-35, 80, 4)).toMatchObject({ min: -50, max: 100, step: 50 });
    const flat = niceScale(5, 5);
    expect(flat.max).toBeGreaterThan(flat.min);
    // no floating-point noise in ticks
    expect(niceScale(0, 0.7, 7).ticks).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
  });
  it('includes zero and honours fixed bounds', () => {
    expect(valueDomain([120, 410]).min).toBe(0);
    const d = valueDomain([120, 410], undefined, 500);
    expect(d.max).toBe(500);
    expect(d.ticks.every((t) => t <= 500)).toBe(true);
  });
  it('maps linearly and mirrors for right-to-left', () => {
    const y = linearScale(0, 100, 500, 0);
    expect(y(0)).toBe(500);
    expect(y(25)).toBe(375);
    expect(mirrorX(10, 100, 1000, false)).toBe(10);
    expect(mirrorX(10, 100, 1000, true)).toBe(890);
    expect(textDir('Revenue', 'الإيرادات')).toBe('rtl');
    expect(textDir('Revenue', undefined)).toBe('ltr');
  });
  it('cuts a polyline at a fraction of its length', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const acc = polyLengths(pts);
    expect(acc).toEqual([0, 100, 200]);
    expect(partialPolyline(pts, acc, 0.75)).toEqual([pts[0], pts[1], { x: 100, y: 50 }]);
    expect(partialPolyline(pts, acc, 1)).toEqual(pts);
    const p = polar(0, 0, 10, Math.PI / 2);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(0);
  });
});

describe('hierarchy layout', () => {
  it('builds the same tree from nested and parent-id nodes', () => {
    const flat = buildTree([
      { id: 'a', name: 'A' },
      { id: 'b', parent: 'a', name: 'B' },
      { id: 'c', parent: 'a', name: 'C' },
      { parent: 'b', name: 'D' },
    ]);
    const nested = buildTree([
      { name: 'A', children: [{ name: 'B', children: [{ name: 'D' }] }, { name: 'C' }] },
    ]);
    const shape = (n: { data: { name: string }; children: unknown[] }): unknown => [
      n.data.name,
      (n.children as (typeof n)[]).map(shape),
    ];
    expect(flat.map(shape)).toEqual(nested.map(shape));
    expect(flat[0].children[0].children[0].depth).toBe(2);
  });
  it('centres parents over their children on leaf slots', () => {
    const roots = buildTree([
      { id: 'r' },
      { id: 'x', parent: 'r' },
      { id: 'y', parent: 'r' },
      { id: 'y1', parent: 'y' },
      { id: 'y2', parent: 'y' },
      { id: 'y3', parent: 'y' },
    ]);
    const { nodes, slots, levels } = layoutTree(roots);
    expect(slots).toBe(4);
    expect(levels).toBe(3);
    const at = (id: string) => nodes.find((n) => n.data.id === id)!;
    expect(at('x').x).toBe(0.5);
    expect(at('y').x).toBe(2.5);
    expect(at('r').x).toBe(1.5);
  });
  it('breaks parent cycles and roots nodes with unknown parents', () => {
    const roots = buildTree([
      { id: 'a', parent: 'b' },
      { id: 'b', parent: 'a' },
      { id: 'c', parent: 'zzz' },
    ]);
    const { nodes } = layoutTree(roots);
    expect(roots.map((r) => r.data.id)).toEqual(['b', 'c']);
    expect(nodes.map((n) => n.data.id)).toEqual(['b', 'a', 'c']);
  });
  it('measures elbow connectors exactly', () => {
    const c = connector({ x: 0, y: 0 }, { x: 30, y: 40 }, true, 'elbow');
    expect(c.len).toBe(70);
    expect(c.d).toBe('M0.00 0.00 V20.00 H30.00 V40.00');
    expect(connector({ x: 0, y: 0 }, { x: 100, y: 0 }, false, 'curve').len).toBeCloseTo(100, 3);
  });
});
