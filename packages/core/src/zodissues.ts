/** Converts zod issues into ReelForge issues with source positions and "did you mean" hints. */
import { z, type ZodIssue, type ZodTypeAny } from 'zod';
import type { Issue } from './types.js';
import { didYouMean } from './util.js';
import { formatPath, keyPos, posAt, type YamlSource } from './yamlsrc.js';

function unwrap(s: ZodTypeAny): ZodTypeAny {
  for (;;) {
    if (s instanceof z.ZodOptional || s instanceof z.ZodNullable) s = s.unwrap();
    else if (s instanceof z.ZodDefault) s = s._def.innerType;
    else if (s instanceof z.ZodEffects) s = s.innerType();
    else return s;
  }
}

/** Keys accepted by the object schema found at `path` (union options are merged). */
export function knownKeys(schema: ZodTypeAny, path: (string | number)[]): string[] {
  const out = new Set<string>();
  const visit = (s: ZodTypeAny, rest: (string | number)[]) => {
    s = unwrap(s);
    if (s instanceof z.ZodUnion) {
      for (const o of s.options as ZodTypeAny[]) visit(o, rest);
      return;
    }
    if (!rest.length) {
      if (s instanceof z.ZodObject) Object.keys(s.shape).forEach((k) => out.add(k));
      return;
    }
    const [head, ...tail] = rest;
    if (s instanceof z.ZodObject && typeof head === 'string' && head in s.shape) visit(s.shape[head], tail);
    else if (s instanceof z.ZodArray && typeof head === 'number') visit(s.element, tail);
    else if (s instanceof z.ZodRecord) visit(s._def.valueType, tail);
  };
  visit(schema, path);
  return [...out];
}

function describe(issue: ZodIssue): string {
  if (issue.code === 'invalid_union') {
    const inner = issue.unionErrors
      .flatMap((e) => e.issues)
      .find((i) => i.code !== 'invalid_type' || i.path.length > issue.path.length);
    if (inner) return describe(inner);
  }
  if (issue.code === 'invalid_type') {
    return issue.received === 'undefined'
      ? `Required (expected ${issue.expected})`
      : `Expected ${issue.expected}, got ${issue.received}`;
  }
  if (issue.code === 'invalid_enum_value') {
    const alt = didYouMean(String(issue.received), issue.options.map(String));
    return `Invalid value "${issue.received}". Expected one of: ${issue.options.join(', ')}${alt ? `. Did you mean "${alt}"?` : ''}`;
  }
  return issue.message;
}

export function zodToIssues(
  error: z.ZodError,
  schema: ZodTypeAny,
  src: YamlSource,
  prefix: (string | number)[] = [],
): Issue[] {
  const issues: Issue[] = [];
  for (const zi of error.issues) {
    const path = [...prefix, ...zi.path];
    if (zi.code === 'unrecognized_keys') {
      const known = knownKeys(schema, zi.path);
      for (const key of zi.keys) {
        const alt = didYouMean(key, known);
        const pos = keyPos(src, path, key);
        issues.push({
          rule: 'V-1',
          level: 'error',
          message: `${formatPath(path) || '(root)'}: unknown key "${key}"${alt ? `. Did you mean "${alt}"?` : ''}`,
          hint: known.length ? `Allowed keys: ${known.join(', ')}` : undefined,
          file: src.file,
          line: pos?.line,
          col: pos?.col,
          path: formatPath([...path, key]),
        });
      }
      continue;
    }
    const pos = posAt(src, path);
    issues.push({
      rule: 'V-1',
      level: 'error',
      message: `${formatPath(path) || '(root)'}: ${describe(zi)}`,
      file: src.file,
      line: pos?.line,
      col: pos?.col,
      path: formatPath(path),
    });
  }
  return issues;
}
