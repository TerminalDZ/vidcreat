// Fails when a committed generated documentation file differs from what the generators produce now
// (reference pages, component frames, docs/components.md, llms-full.txt). Fix with `pnpm docs:gen`.
//   node scripts/check-docs-fresh.mjs      (needs `pnpm build`)
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { generateDocs, staleFiles } from './gen-docs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const normalize = (b) => (typeof b === 'string' ? b.replace(/\r\n/g, '\n') : b);
/** PNGs are compared by pixels: zlib versions may compress the same image differently. */
const samePixels = (a, b) => {
  const x = PNG.sync.read(a);
  const y = PNG.sync.read(b);
  return x.width === y.width && x.height === y.height && Buffer.compare(x.data, y.data) === 0;
};

const out = await generateDocs();
const problems = [];
for (const [file, content] of out) {
  const abs = path.join(ROOT, file);
  if (!existsSync(abs)) {
    problems.push(`missing: ${file}`);
    continue;
  }
  const disk = typeof content === 'string' ? readFileSync(abs, 'utf8') : readFileSync(abs);
  const same =
    typeof content === 'string'
      ? normalize(disk) === normalize(content)
      : file.endsWith('.png')
        ? samePixels(disk, content)
        : Buffer.compare(disk, content) === 0;
  if (!same) problems.push(`out of date: ${file}`);
}
for (const f of staleFiles(out)) problems.push(`no longer generated: ${f}`);

if (problems.length) {
  console.error(`✗ generated docs are stale (${problems.length}):\n  ${problems.join('\n  ')}`);
  console.error('Run `pnpm docs:gen` and commit the result.');
  process.exit(1);
}
console.log(`✓ ${out.size} generated documentation files are up to date`);
