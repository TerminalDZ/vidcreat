// @vitest-environment happy-dom
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { compileEpisode, episodePaths, INSTALL_ROOT, type Timeline } from '@reelforge/core';
import { easeOutBack, easeOutCubic, formatNumber, progress, typedCount } from '../src/anim.js';
import { mix, parse, rgba } from '../src/color.js';
import { COMPONENT_REGISTRY } from '../src/components/index.js';
import { highlight } from '../src/components/code.js';
import { expandTiles } from '../src/components/data.js';
import { pointAt, samplePath } from '../src/components/diagram.js';
import { keyframeValue, parseAccent, typingUnits } from '../src/components/util.js';
import { Engine } from '../src/engine.js';
import { resolveState } from '../src/scene.js';
import { COMPONENT_NAMES } from '@reelforge/core';

/**
 * DOM snapshot independent of the order in which style properties/classes were first written.
 * Walks the live tree instead of cloning it (a clone of the whole gallery per sample exhausts the
 * heap on CI runners). Hidden subtrees do not contribute pixels, so their content is left out.
 */
function canonical(root: HTMLElement): string {
  const out: string[] = [];
  const sorted = (s: string, sep: RegExp, join: string) =>
    s
      .split(sep)
      .map((x) => x.trim())
      .filter(Boolean)
      .sort()
      .join(join);
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      out.push(node.textContent ?? '');
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    const hidden = el.style?.display === 'none';
    const attrs = [...el.attributes]
      .map((a) => {
        if (a.name === 'style') return `style="${hidden ? 'display: none' : sorted(a.value, /;/, ';')}"`;
        if (a.name === 'class') return `class="${sorted(a.value, /\s+/, ' ')}"`;
        return `${a.name}="${a.value}"`;
      })
      .sort();
    out.push(`<${el.tagName.toLowerCase()} ${attrs.join(' ')}>`);
    if (!hidden) for (const c of el.childNodes) walk(c);
    out.push(`</${el.tagName.toLowerCase()}>`);
  };
  for (const c of root.childNodes) walk(c);
  return out.join('');
}

let gallery: Timeline;
let mini: Timeline;
beforeAll(() => {
  gallery = compileEpisode(
    episodePaths(path.join(INSTALL_ROOT, 'fixtures/golden/components'), INSTALL_ROOT),
    { voice: null },
  ).timeline!;
  mini = compileEpisode(episodePaths(path.join(INSTALL_ROOT, 'fixtures/mini'), INSTALL_ROOT)).timeline!;
});

describe('runtime primitives', () => {
  it('easings and progress are pure and bounded', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutBack(1.9)(0.6)).toBeGreaterThan(1);
    expect(progress(5, 4, 2)).toBe(0.5);
    expect(progress(5, 4, 0)).toBe(1);
    expect(typedCount(1.5, 1, 10, 100)).toBe(5);
    expect(formatNumber(1234567.891, 2, true)).toBe('1,234,567.89');
    expect(formatNumber(-5, 0, false)).toBe('-5');
  });
  it('colors', () => {
    expect(parse('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(rgba('#b8ff3c', 0.5)).toBe('rgba(184,255,60,0.5)');
    expect(mix('#000000', '#ffffff', 0.5)).toBe('rgb(128,128,128)');
    expect(parse('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3 });
  });
  it('component helpers', () => {
    expect(parseAccent('a **b** c')).toEqual([
      { text: 'a ', accent: false },
      { text: 'b', accent: true },
      { text: ' c', accent: false },
    ]);
    expect(typingUnits('ab')).toEqual(['a', 'b']);
    expect(typingUnits('مرحبا بيك')).toEqual(['مرحبا ', 'بيك']);
    expect(keyframeValue([{ at: 1, value: 10, dur: 0 }], 2, 0, (x) => x)).toBe(10);
    expect(keyframeValue([{ at: 1, value: 10, dur: 2 }], 2, 0, (x) => x)).toBe(5);
    expect([...expandTiles({ '1-3': 'busy', '*': 'idle' }, 4).entries()]).toEqual([
      [1, 'idle'],
      [2, 'idle'],
      [3, 'idle'],
      [0, 'idle'],
    ]);
    expect(highlight('const x = "a"; // hi').map((t) => t.cls)).toContain('tk-com');
    const p = samplePath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      'straight',
    );
    expect(pointAt(p, 0.5).x).toBe(50);
    const c = samplePath(
      [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 0 },
      ],
      'curve',
    );
    expect(c.pts.length).toBe(41);
  });
  it('resolves state as the merge of sets up to t', () => {
    const el = gallery.scenes.find((s) => s.id === 'phone')!.elements[0];
    const last = el.states[el.states.length - 1].t;
    const st = resolveState(el, last + 0.01);
    expect(st.loading).toBe(true);
    expect(st.offline).toBe(true);
    expect(st.$since.offline).toBe(el.states.find((x) => 'offline' in x.set)!.t);
    expect(resolveState(el, 0).loading).toBeUndefined();
  });
});

describe('Engine', () => {
  it('has a runtime implementation for every core component', () => {
    expect(Object.keys(COMPONENT_REGISTRY).sort()).toEqual([...COMPONENT_NAMES].sort());
  });

  it('mounts every component and renders the whole gallery', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const e = new Engine(gallery, host);
    for (let t = 0; t <= gallery.duration; t += 0.25) e.render(t);
    expect(host.querySelectorAll('.rf-el').length).toBe(
      gallery.scenes.reduce((n, s) => n + s.elements.length, 0),
    );
    expect(e.boxes(4).filter((b) => b.visible).length).toBeGreaterThan(0);
  });

  // 45 times × 5 renders of the 62-component gallery, serialized in happy-dom: slower than a unit test.
  it('render(t) is idempotent and order-independent (FR-RT-3)', { timeout: 120_000 }, () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    const ea = new Engine(gallery, a);
    const eb = new Engine(gallery, b);
    const times = [
      0.5, 3.3, 7.1, 13.2, 19.9, 27.6, 31.1, 34.0, 37.9, 40.7, 43.4, 46.2, 49.6, 52.3, 55.5, 58.9, 61.2, 64.4,
      67.1, 70.3, 74.4, 76.3, 80.4, 82.3, 86.4, 88.3, 92.4, 94.3, 98.4, 100.3, 104.4, 106.3, 110.4, 112.3,
      116.4, 118.3, 122.4, 124.3, 128.4, 130.3, 133.5, 136.4, 138.9, 140.2, 142.3,
    ];
    for (const t of times) ea.render(t);
    for (const t of [...times].reverse()) {
      eb.render(t);
      eb.render(t + 1.37);
    }
    for (const t of times) {
      ea.render(t);
      eb.render(t);
      const ca = canonical(a);
      const cb = canonical(b);
      if (ca !== cb) {
        let i = 0;
        while (ca[i] === cb[i]) i++;
        expect(cb.slice(i - 200, i + 120), `t=${t}`).toBe(ca.slice(i - 200, i + 120));
      }
    }
  });

  it('shows the caption active at t with the karaoke states', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const e = new Engine(mini, host);
    e.render(2.95);
    const chunks = [...host.querySelectorAll<HTMLElement>('.rf-chunk')].filter(
      (c) => c.style.display === 'block',
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].getAttribute('dir')).toBe('rtl');
    const toks = chunks[0].querySelectorAll('.rf-tok');
    expect(toks[2].classList.contains('is-active')).toBe(true);
    expect(toks[0].querySelector('bdi')?.textContent).toBe('client');
    e.render(5.9);
    expect(host.querySelector('.rf-chapter span')?.textContent).toBe('02 · THE FIX');
  });
});
