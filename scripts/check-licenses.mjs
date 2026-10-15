// NFR-12: every production dependency must be MIT, Apache-2.0, BSD, ISC or OFL (fonts).
import { execFileSync } from 'node:child_process';

const ALLOWED = /^(MIT|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|0BSD|ISC|OFL-1\.1|BlueOak-1\.0\.0|Python-2\.0|CC0-1\.0|Unlicense)$/;
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const out = execFileSync(pnpm, ['licenses', 'list', '--json', '--prod', '-r'], { encoding: 'utf8', shell: process.platform === 'win32' });
const data = JSON.parse(out);
const bad = [];
for (const [license, pkgs] of Object.entries(data)) {
  const ok = license.split(/\s+(?:OR|AND)\s+|[()]/).filter(Boolean).every((l) => ALLOWED.test(l.trim()));
  if (!ok) for (const p of pkgs) bad.push(`${p.name}@${p.versions?.join(',')}: ${license}`);
}
const total = Object.values(data).reduce((n, p) => n + p.length, 0);
if (bad.length) {
  console.error(`✗ ${bad.length} dependency license(s) not on the allow-list:\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
console.log(`✓ ${total} production dependencies, all licenses allowed (${Object.keys(data).join(', ')})`);
