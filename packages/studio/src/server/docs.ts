/**
 * The offline documentation behind the dashboard's /docs/ route: the bilingual VitePress site built
 * with base /docs/ into documentation/site (`pnpm docs:local`) when present, else the single-file guide
 * documentation/index.html. Paths are resolved with safeJoin, so nothing outside these folders is served.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { INSTALL_ROOT } from '@reelforge/core';
import { safeJoin, sendFile } from './http.js';

export const DOCS_DIR = path.join(INSTALL_ROOT, 'documentation');

const isFile = (f: string | undefined): f is string => Boolean(f && existsSync(f) && statSync(f).isFile());

/** Which build /docs/ serves, or null when the documentation is not built. */
export function docsKind(dir = DOCS_DIR): 'site' | 'single' | null {
  if (isFile(path.join(dir, 'site', 'index.html'))) return 'site';
  if (isFile(path.join(dir, 'index.html'))) return 'single';
  return null;
}

/**
 * The file for a path below /docs/ (`rel` without the prefix, still URL-encoded) and its status.
 * Site pages are `x.html`; `x` and `x/` resolve to `x.html` and `x/index.html` too, and anything else
 * gets the site's 404 page. Undefined when the path escapes the documentation folder.
 */
export function resolveDocs(rel: string, dir = DOCS_DIR): { file: string; status: 200 | 404 } | undefined {
  const kind = docsKind(dir);
  if (!kind) return undefined;
  const base = kind === 'site' ? path.join(dir, 'site') : dir;
  const f = safeJoin(base, rel || 'index.html');
  if (!f) return undefined;
  if (kind === 'single') return isFile(f) ? { file: f, status: 200 } : undefined;
  for (const c of [f, path.join(f, 'index.html'), path.extname(f) ? undefined : `${f}.html`])
    if (isFile(c)) return { file: c, status: 200 };
  const notFound = path.join(base, '404.html');
  return isFile(notFound) ? { file: notFound, status: 404 } : undefined;
}

/** Serves GET/HEAD /docs and /docs/…; false when the request is not for the documentation. */
export function serveDocs(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  dir = DOCS_DIR,
): boolean {
  if (pathname !== '/docs' && !pathname.startsWith('/docs/')) return false;
  if (pathname === '/docs') {
    // Relative asset links need the trailing slash.
    res.writeHead(301, { location: '/docs/' }).end();
    return true;
  }
  const r = resolveDocs(pathname.slice('/docs/'.length), dir);
  if (r?.status === 404) {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : readFileSync(r.file));
    return true;
  }
  sendFile(req, res, r?.file);
  return true;
}
