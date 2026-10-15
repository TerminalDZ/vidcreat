/** Schemas and compiler support of the general-purpose components (callout endpoints, spotlight targets). */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPONENTS, compileEpisode, episodePaths, INSTALL_ROOT } from '@reelforge/core';

const parse = (name: string, props: unknown) => COMPONENTS[name].schema.safeParse(props);

describe('general component schemas', () => {
  it('fills defaults and keeps the meter bar style unchanged by default', () => {
    const m = parse('meter', { keyframes: [{ at: 1, value: 3 }] });
    expect(m.success && (m.data as { style: string }).style).toBe('bar');
    const c = parse('calendar', { year: 2026, month: 11 });
    expect(c.success && c.data).toMatchObject({ lang: 'en', weekStart: 'mon', days: [] });
    const k = parse('clock', {});
    expect(k.success && k.data).toMatchObject({ mode: 'clock', face: 'analog', time: '09:00' });
  });

  it('rejects unknown keys and out-of-range values with clear messages', () => {
    expect(parse('calendar', { year: 2026, month: 13 }).success).toBe(false);
    expect(parse('chat', { messages: [{ text: 'hi', form: 'me' }] }).success).toBe(false);
    const r = parse('rating', { value: 6 });
    expect(!r.success && r.error.issues[0].message).toMatch(/cannot exceed/);
    const q = parse('qr-code', { text: 'x'.repeat(214) });
    expect(!q.success && q.error.issues[0].message).toMatch(/too long/);
    expect(parse('qr-code', { text: 'x'.repeat(271), ecc: 'L' }).success).toBe(true);
    expect(parse('clock', { time: '25:00' }).success).toBe(false);
    expect(parse('map', { countries: ['France'] }).success).toBe(false);
    expect(parse('map', { view: { west: 10, south: 0, east: 0, north: 10 } }).success).toBe(false);
    expect(parse('logo', {}).success).toBe(false);
    expect(parse('route', { stops: [{ label: 'A', x: 0.1 }, { label: 'B' }] }).success).toBe(false);
  });

  it('describes rating as illustrative, never as real reviews', () => {
    expect(COMPONENTS.rating.description).toMatch(/never as real customer reviews/);
  });
});

describe('compiler support', () => {
  const tl = compileEpisode(
    episodePaths(path.join(INSTALL_ROOT, 'fixtures/golden/components'), INSTALL_ROOT),
    { voice: null },
  ).timeline!;
  const el = (id: string) => tl.scenes.flatMap((s) => s.elements).find((e) => e.id === id)!;

  it('keeps a callout in its own box and resolves its target relative to it', () => {
    const co = el('co');
    expect(co.box).toEqual({ x: 360, y: 720, w: 460, h: 110 });
    expect(co.props.to).toEqual({ x: 470 - 360, y: 520 - 720 });
  });

  it('resolves a spotlight target element to a box relative to the scene', () => {
    const sp = el('spot');
    const target = el('sp_b');
    expect(sp.box).toMatchObject({ x: 0, y: 0 });
    expect(sp.props.target).toEqual({ x: target.box.x, y: target.box.y, w: target.box.w, h: target.box.h });
  });
});
