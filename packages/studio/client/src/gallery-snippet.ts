/** Example episode.yaml element for a component (gallery "Copy YAML snippet"). */
import { stringify } from 'yaml';
import { starterProps } from './starter-props.js';

export interface SnippetComponent {
  name: string;
  size: { w: number; h: number };
  fill?: boolean;
  endpoints?: string[];
}

/** Stage is 1080×1000; keep the 60 px side margins and stay clear of the right rail lower down. */
export function snippetElement(c: SnippetComponent): Record<string, unknown> {
  const el: Record<string, unknown> = {
    use: c.name,
    id: `${c.name.replace(/-/g, '_')}_1`,
    props: starterProps(c.name, 'l1'),
  };
  if (!c.fill && !c.endpoints?.length) {
    const w = Math.min(c.size.w, 960);
    const h = Math.min(c.size.h, 880);
    const y = 60;
    const maxRight = y + h > 600 ? 920 : 1020;
    const x = Math.max(60, Math.min(Math.round((1080 - w) / 2), maxRight - w));
    el.place = { x, y, w: Math.min(w, maxRight - x), h };
  }
  el.enter = { at: 'l1' };
  return el;
}

export function snippetYaml(c: SnippetComponent): string {
  return stringify([snippetElement(c)], { lineWidth: 0 });
}
