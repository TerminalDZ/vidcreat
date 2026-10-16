/** Hierarchy helpers shared by org-chart and tree: building a tree from nested/flat nodes, layout and connectors. */
import type { Pt } from './chart.js';

export interface TreeIn {
  id?: string;
  parent?: string;
  children?: TreeIn[];
}

export interface TreeNode<T> {
  data: T;
  children: TreeNode<T>[];
  parent?: TreeNode<T>;
  depth: number;
  /** Position in units: x = leaf slot (centre), y = depth. */
  x: number;
  y: number;
  /** Declaration order (stable key). */
  order: number;
}

/**
 * Builds the forest from nodes given nested (`children`) and/or flat (`id` + `parent`). An explicit
 * `parent` wins over nesting; unknown parents make a node a root (core validation reports them).
 */
export function buildTree<T extends TreeIn>(nodes: T[]): TreeNode<T>[] {
  const all: { node: TreeNode<T>; nestedIn?: TreeNode<T> }[] = [];
  const byId = new Map<string, TreeNode<T>>();
  const walk = (d: T, nestedIn?: TreeNode<T>) => {
    const node: TreeNode<T> = { data: d, children: [], depth: 0, x: 0, y: 0, order: all.length };
    all.push({ node, nestedIn });
    if (d.id !== undefined && !byId.has(d.id)) byId.set(d.id, node);
    for (const c of d.children ?? []) walk(c as T, node);
  };
  nodes.forEach((n) => walk(n));
  const roots: TreeNode<T>[] = [];
  for (const { node, nestedIn } of all) {
    const pid = node.data.parent;
    let parent = pid !== undefined ? byId.get(pid) : nestedIn;
    // Guard against cycles: never attach a node under its own descendant.
    for (let p = parent; p; p = p.parent) if (p === node) parent = undefined;
    if (parent) {
      node.parent = parent;
      parent.children.push(node);
    } else roots.push(node);
  }
  const setDepth = (n: TreeNode<T>, d: number) => {
    n.depth = d;
    n.y = d;
    n.children.forEach((c) => setDepth(c, d + 1));
  };
  roots.forEach((r) => setDepth(r, 0));
  return roots;
}

/**
 * Leaf-slot layout: leaves take consecutive slots left to right, parents sit centred over their
 * children. Returns all nodes (depth-first) and the extent in slots × levels.
 */
export function layoutTree<T>(roots: TreeNode<T>[]): { nodes: TreeNode<T>[]; slots: number; levels: number } {
  let next = 0;
  const nodes: TreeNode<T>[] = [];
  const place = (n: TreeNode<T>) => {
    nodes.push(n);
    if (!n.children.length) {
      n.x = next + 0.5;
      next += 1;
      return;
    }
    n.children.forEach(place);
    n.x = (n.children[0].x + n.children[n.children.length - 1].x) / 2;
  };
  roots.forEach(place);
  const levels = nodes.reduce((m, n) => Math.max(m, n.depth + 1), 1);
  return { nodes, slots: Math.max(1, next), levels };
}

/** Connector between a parent's outlet and a child's inlet: an elbow or a smooth S-curve. */
export function connector(
  a: Pt,
  b: Pt,
  vertical: boolean,
  style: 'elbow' | 'curve',
): { d: string; len: number } {
  const f = (n: number) => n.toFixed(2);
  if (style === 'elbow') {
    if (vertical) {
      const my = (a.y + b.y) / 2;
      return {
        d: `M${f(a.x)} ${f(a.y)} V${f(my)} H${f(b.x)} V${f(b.y)}`,
        len: Math.abs(my - a.y) + Math.abs(b.x - a.x) + Math.abs(b.y - my),
      };
    }
    const mx = (a.x + b.x) / 2;
    return {
      d: `M${f(a.x)} ${f(a.y)} H${f(mx)} V${f(b.y)} H${f(b.x)}`,
      len: Math.abs(mx - a.x) + Math.abs(b.y - a.y) + Math.abs(b.x - mx),
    };
  }
  const c1 = vertical ? { x: a.x, y: (a.y + b.y) / 2 } : { x: (a.x + b.x) / 2, y: a.y };
  const c2 = vertical ? { x: b.x, y: (a.y + b.y) / 2 } : { x: (a.x + b.x) / 2, y: b.y };
  let len = 0;
  let prev = a;
  for (let i = 1; i <= 24; i++) {
    const k = i / 24;
    const q = 1 - k;
    const p = {
      x: q ** 3 * a.x + 3 * q * q * k * c1.x + 3 * q * k * k * c2.x + k ** 3 * b.x,
      y: q ** 3 * a.y + 3 * q * q * k * c1.y + 3 * q * k * k * c2.y + k ** 3 * b.y,
    };
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return { d: `M${f(a.x)} ${f(a.y)} C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(b.x)} ${f(b.y)}`, len };
}
