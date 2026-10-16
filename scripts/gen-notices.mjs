// Generates THIRD-PARTY-NOTICES.md: every production dependency and bundled asset, with its full
// license text (required attribution for MIT / ISC / Apache-2.0 / OFL components).
// Usage: node scripts/gen-notices.mjs   (after `pnpm install` and `pnpm build`)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const data = JSON.parse(
  execFileSync(pnpm, ['licenses', 'list', '--json', '--prod', '-r'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' }),
);

const licenseText = (dir) => {
  if (!dir || !existsSync(dir)) return undefined;
  const f = readdirSync(dir).find((n) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(n));
  return f ? readFileSync(path.join(dir, f), 'utf8').trim() : undefined;
};

let md = `# Third-party notices

ReelForge includes or downloads the open-source components listed below. Each is used under its own
license, reproduced here. These licenses apply to those components only; ReelForge itself is licensed
as described in [LICENSE.md](LICENSE.md).

## External tools (not bundled)

| Tool | License | How it is used |
|---|---|---|
| FFmpeg (with libx264) | LGPL-2.1+ / GPL-2.0+ depending on the build | Installed separately by the user and called as an external program. Not distributed with ReelForge. |
| Chromium (Playwright build) | BSD-3-Clause and others | Downloaded by \`reelforge doctor --fix\` / Playwright from Microsoft's CDN. Not distributed with ReelForge. |

## Bundled fonts (SIL Open Font License 1.1)

| Font | Copyright | Files |
|---|---|---|
| Cairo | The Cairo Project Authors | \`packages/runtime/dist/page/fonts/cairo-*.woff2\` |
| JetBrains Mono | The JetBrains Mono Project Authors | \`packages/runtime/dist/page/fonts/jetbrains-mono-*.woff2\` |
| Space Grotesk | The Space Grotesk Project Authors | \`packages/runtime/dist/page/fonts/space-grotesk-*.woff2\` |

## npm packages (runtime dependencies)

| Package | Version | License | Author | Homepage |
|---|---|---|---|---|
`;
const entries = [];
for (const [license, pkgs] of Object.entries(data)) {
  for (const p of pkgs) {
    const author = typeof p.author === 'string' ? p.author : (p.author?.name ?? '');
    entries.push({ ...p, license, author });
  }
}
entries.sort((a, b) => a.name.localeCompare(b.name));
for (const e of entries) md += `| ${e.name} | ${e.versions.join(', ')} | ${e.license} | ${e.author} | ${e.homepage ?? ''} |\n`;

md += '\n## License texts\n';
for (const e of entries) {
  const text = licenseText(e.paths?.[0]);
  md += `\n### ${e.name} (${e.license})\n\n\`\`\`text\n${text ?? `${e.license} — see ${e.homepage ?? 'the package repository'}`}\n\`\`\`\n`;
}
const fontsDir = path.join(root, 'packages/runtime/dist/page/fonts');
for (const f of ['cairo', 'jetbrains-mono', 'space-grotesk']) {
  const file = path.join(fontsDir, `${f}.LICENSE.txt`);
  if (existsSync(file)) md += `\n### Font: ${f} (OFL-1.1)\n\n\`\`\`text\n${readFileSync(file, 'utf8').trim()}\n\`\`\`\n`;
}
writeFileSync(path.join(root, 'THIRD-PARTY-NOTICES.md'), md);
console.log(`wrote THIRD-PARTY-NOTICES.md (${entries.length} packages, 3 fonts)`);
