// Builds the runtime page: dist/page/{runtime.html, runtime.js, fonts/*} and dist/index.js (Node entry).
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, 'dist');
const page = path.join(dist, 'page');
rmSync(dist, { recursive: true, force: true });
mkdirSync(path.join(page, 'fonts'), { recursive: true });

await build({
  entryPoints: [path.join(here, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  outfile: path.join(page, 'runtime.js'),
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'warning',
});
await build({
  entryPoints: [path.join(here, 'src/node.ts')],
  bundle: false,
  platform: 'node',
  format: 'esm',
  outfile: path.join(dist, 'index.js'),
  logLevel: 'warning',
});
mkdirSync(path.join(dist, 'types'), { recursive: true });
writeFileSync(
  path.join(dist, 'types/index.d.ts'),
  'export declare const RUNTIME_DIR: string;\nexport declare const RUNTIME_HTML: string;\n',
);
copyFileSync(path.join(here, 'page/runtime.html'), path.join(page, 'runtime.html'));

// Vendored fonts (OFL), served locally: no network at runtime (NFR-8).
const require = createRequire(import.meta.url);
const FAMILIES = [
  {
    pkg: '@fontsource-variable/cairo',
    family: 'Cairo',
    prefix: 'cairo',
    subsets: ['arabic', 'latin', 'latin-ext'],
  },
  {
    pkg: '@fontsource-variable/space-grotesk',
    family: 'Space Grotesk',
    prefix: 'space-grotesk',
    subsets: ['latin', 'latin-ext'],
  },
  {
    pkg: '@fontsource-variable/jetbrains-mono',
    family: 'JetBrains Mono',
    prefix: 'jetbrains-mono',
    subsets: ['latin', 'latin-ext'],
  },
  // Theme pairings (packages/core/src/theme.ts BUNDLED_FONTS). `weight` is the real wght axis.
  {
    pkg: '@fontsource-variable/inter',
    family: 'Inter',
    prefix: 'inter',
    subsets: ['latin', 'latin-ext'],
    weight: '100 900',
  },
  {
    pkg: '@fontsource-variable/manrope',
    family: 'Manrope',
    prefix: 'manrope',
    subsets: ['latin', 'latin-ext'],
    weight: '200 800',
  },
  {
    pkg: '@fontsource-variable/playfair-display',
    family: 'Playfair Display',
    prefix: 'playfair-display',
    subsets: ['latin', 'latin-ext'],
    weight: '400 900',
  },
  {
    pkg: '@fontsource-variable/noto-kufi-arabic',
    family: 'Noto Kufi Arabic',
    prefix: 'noto-kufi-arabic',
    subsets: ['arabic', 'latin', 'latin-ext'],
    weight: '100 900',
  },
  {
    pkg: '@fontsource-variable/noto-naskh-arabic',
    family: 'Noto Naskh Arabic',
    prefix: 'noto-naskh-arabic',
    subsets: ['arabic', 'latin', 'latin-ext'],
    weight: '400 700',
  },
  {
    pkg: '@fontsource-variable/readex-pro',
    family: 'Readex Pro',
    prefix: 'readex-pro',
    subsets: ['arabic', 'latin', 'latin-ext'],
    weight: '160 700',
  },
];
const RANGES = {
  arabic:
    'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC',
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
};
let cssText = '/* Vendored fonts (SIL Open Font License 1.1) from @fontsource-variable. */\n';
for (const f of FAMILIES) {
  const dir = path.join(path.dirname(require.resolve(`${f.pkg}/package.json`)), 'files');
  const files = readdirSync(dir);
  for (const sub of f.subsets) {
    const name = `${f.prefix}-${sub}-wght-normal.woff2`;
    if (!files.includes(name)) throw new Error(`missing font file ${name}`);
    copyFileSync(path.join(dir, name), path.join(page, 'fonts', name));
    cssText += `@font-face { font-family: '${f.family}'; font-style: normal; font-display: block; font-weight: ${f.weight ?? '100 1000'}; src: url(./${name}) format('woff2'); unicode-range: ${RANGES[sub]}; }\n`;
  }
  copyFileSync(path.join(path.dirname(dir), 'LICENSE'), path.join(page, 'fonts', `${f.prefix}.LICENSE.txt`));
}
writeFileSync(path.join(page, 'fonts', 'fonts.css'), cssText);
console.log('runtime built →', path.relative(process.cwd(), page));
