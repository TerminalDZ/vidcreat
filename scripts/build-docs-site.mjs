// Builds the documentation site for the dashboard: the same VitePress pages as `pnpm docs:site`, with
// base /docs/, into documentation/site. `reelforge studio` serves it at http://127.0.0.1:4310/docs/
// (English at /docs/, Arabic at /docs/ar/), so the full site works offline.
// Usage: node scripts/build-docs-site.mjs   (pnpm docs:local)
import { readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'documentation', 'site');
// Built next to the old copy and swapped in only when the build succeeds.
const tmp = path.join(root, 'documentation', '.site-build');

// Read by docs/.vitepress/config.mts; set before VitePress loads the config. DOCS_OUT is relative to docs/.
process.env.DOCS_BASE = '/docs/';
process.env.DOCS_OUT = path.relative(path.join(root, 'docs'), tmp);

const { build } = await import('vitepress');
rmSync(tmp, { recursive: true, force: true });
try {
  await build(path.join(root, 'docs'));
} catch (e) {
  rmSync(tmp, { recursive: true, force: true });
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
// Nothing in the local copy needs source maps.
for (const f of files(tmp)) if (f.endsWith('.map')) rmSync(f);

rmSync(out, { recursive: true, force: true });
renameSync(tmp, out);

const all = files(out);
const mb = all.reduce((n, f) => n + statSync(f).size, 0) / 1048576;
console.log(`documentation/site: ${all.length} files, ${mb.toFixed(1)} MB`);
