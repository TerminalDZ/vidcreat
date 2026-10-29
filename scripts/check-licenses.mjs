// NFR-12: every production dependency must be MIT, Apache-2.0, BSD, ISC or OFL (fonts).
import { execFileSync, execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ALLOWED =
  /^(MIT|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|0BSD|ISC|OFL-1\.1|BlueOak-1\.0\.0|Python-2\.0|CC0-1\.0|Unlicense)$/;
// Fixed arguments; Windows needs a shell to run pnpm.cmd, so pass one command string there.
const out =
  process.platform === 'win32'
    ? execSync('pnpm licenses list --json --prod -r', { encoding: 'utf8' })
    : execFileSync('pnpm', ['licenses', 'list', '--json', '--prod', '-r'], { encoding: 'utf8' });
const data = JSON.parse(out);
const bad = [];
for (const [license, pkgs] of Object.entries(data)) {
  const ok = license
    .split(/\s+(?:OR|AND)\s+|[()]/)
    .filter(Boolean)
    .every((l) => ALLOWED.test(l.trim()));
  if (!ok) for (const p of pkgs) bad.push(`${p.name}@${p.versions?.join(',')}: ${license}`);
}
// Fonts are dev dependencies of the runtime but ship inside its dist/page: they must be OFL-1.1.
const require = createRequire(new URL('../packages/runtime/package.json', import.meta.url));
const runtimePkg = require('./package.json');
const fonts = Object.keys(runtimePkg.devDependencies ?? {}).filter((n) => n.startsWith('@fontsource'));
for (const name of fonts) {
  const { version, license } = require(`${name}/package.json`);
  if (license !== 'OFL-1.1') bad.push(`${name}@${version}: ${license} (bundled font, must be OFL-1.1)`);
}
const total = Object.values(data).reduce((n, p) => n + p.length, 0);
if (bad.length) {
  console.error(`✗ ${bad.length} dependency license(s) not on the allow-list:\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
console.log(`✓ ${total} production dependencies, all licenses allowed (${Object.keys(data).join(', ')})`);
console.log(`✓ ${fonts.length} bundled font packages, all OFL-1.1`);
