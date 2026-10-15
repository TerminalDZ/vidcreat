/** Tiny DOM helpers. Style/text writes are cached so render(t) only touches what changed (FR-RT-8). */

type Attrs = Record<string, string | number | boolean | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined) el.append(c);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Node[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs))
    if (v !== undefined && v !== false) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

const styleCache = new WeakMap<Element, Map<string, string>>();

/** Sets a style property only when its value changed. */
export function css(el: HTMLElement | SVGElement, prop: string, value: string | number): void {
  const v = String(value);
  let m = styleCache.get(el);
  if (!m) styleCache.set(el, (m = new Map()));
  if (m.get(prop) === v) return;
  m.set(prop, v);
  el.style.setProperty(prop, v);
}

const attrCache = new WeakMap<Element, Map<string, string>>();
export function attr(el: Element, name: string, value: string | number): void {
  const v = String(value);
  let m = attrCache.get(el);
  if (!m) attrCache.set(el, (m = new Map()));
  if (m.get(name) === v) return;
  m.set(name, v);
  el.setAttribute(name, v);
}

const textCache = new WeakMap<Node, string>();
export function text(el: Element, value: string): void {
  if (textCache.get(el) === value) return;
  textCache.set(el, value);
  el.textContent = value;
}

/** Shows/hides with `display`. */
export function show(el: HTMLElement | SVGElement, visible: boolean, display = ''): void {
  css(el, 'display', visible ? display || 'block' : 'none');
}

export function px(n: number): string {
  return `${Math.round(n * 100) / 100}px`;
}

const toggleCache = new WeakMap<Element, Map<string, boolean>>();
export function cls(el: Element, name: string, on: boolean): void {
  let m = toggleCache.get(el);
  if (!m) toggleCache.set(el, (m = new Map()));
  if (m.get(name) === on) return;
  m.set(name, on);
  el.classList.toggle(name, on);
}
