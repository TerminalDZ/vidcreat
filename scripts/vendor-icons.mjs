// Vendors a curated subset of Lucide icons (ISC, https://lucide.dev) into the runtime and core.
// Reads `lucide-static/icon-nodes.json` (a pinned devDependency of @reelforge/runtime) and writes:
//   packages/runtime/src/data/lucide-icons.ts       path data in the runtime's compact icon format
//   packages/runtime/src/data/LICENSE-lucide.txt    the Lucide license, kept next to the data
//   packages/core/src/components/icon-names.ts      the icon names for the schema enum
// The 30 original ReelForge icons keep their own drawings: a Lucide icon with the same name is skipped.
// Usage: node scripts/vendor-icons.mjs
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'packages/runtime/package.json'));
const pkgDir = path.dirname(require.resolve('lucide-static/package.json'));
const { version } = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
const nodes = JSON.parse(readFileSync(path.join(pkgDir, 'icon-nodes.json'), 'utf8'));

/** Names drawn for ReelForge (packages/runtime/src/icons.ts); never replaced. */
const OWN = new Set(
  'lock unlock bell clock warn bubble bomb check x server db user users bolt card wifi wifi-off cloud key mail cart cpu queue shield fire refresh hourglass phone code globe'.split(
    ' ',
  ),
);

const GROUPS = {
  healthcare:
    'heart-pulse stethoscope pill syringe hospital ambulance activity thermometer bandage cross microscope dna brain bone baby accessibility test-tube clipboard-plus heart hand-heart eye ear tablets pill-bottle bed briefcase-medical shield-plus scan-heart',
  'real estate':
    'house building building-complex hotel key-round door-open door-closed sofa bath ruler landmark fence trees tree-pine house-plus map-pin-house bed-double',
  'logistics & ports':
    'ship anchor container package package-check package-open boxes forklift truck warehouse barcode scan-barcode route waypoints map map-pin map-pinned navigation compass earth weight scale clipboard-list clipboard-check',
  transport:
    'plane plane-takeoff plane-landing train-front bus car bike sailboat fuel ticket luggage cable-car traffic-cone milestone signpost rocket',
  education:
    'graduation-cap book book-open school pencil pen-tool notebook library backpack calculator presentation lightbulb award trophy medal atom flask-conical',
  finance:
    'wallet banknote coins piggy-bank credit-card receipt chart-line chart-column chart-pie trending-up trending-down dollar-sign percent hand-coins badge-dollar-sign briefcase vault circle-dollar-sign',
  food: 'utensils utensils-crossed chef-hat coffee pizza apple carrot croissant cake wine beer cup-soda ice-cream-cone soup sandwich salad cooking-pot fish wheat',
  retail: 'shopping-bag shopping-basket store tag tags gift shirt badge-percent',
  government:
    'gavel flag vote id-card file-text stamp shield-check scroll badge-check siren fingerprint-pattern',
  energy:
    'zap battery battery-charging sun wind droplet droplets flame plug plug-zap power gauge leaf recycle solar-panel waves-horizontal cloud-sun moon snowflake',
  manufacturing:
    'factory cog settings wrench hammer drill hard-hat construction pickaxe bot cable shovel paint-bucket',
  tourism: 'camera tree-palm mountain mountain-snow tent umbrella binoculars castle',
  'general UI':
    'search star thumbs-up message-circle send calendar calendar-check calendar-days alarm-clock timer info circle-question-mark circle-check circle-x triangle-alert plus arrow-right link image mic qr-code smartphone sparkles target crown user-plus user-check phone-call megaphone newspaper',
};

const n = (v) => Number(Number(v).toFixed(3)).toString();
const pts = (s) =>
  s
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .reduce((acc, v, i) => (i % 2 ? (acc[acc.length - 1].push(v), acc) : (acc.push([v]), acc)), []);

/** One SVG child → one part of the compact format ("C cx cy r", "E cx cy rx ry" or path data). */
function part([tag, a]) {
  switch (tag) {
    case 'path':
      return a.d;
    case 'circle':
      return `C${n(a.cx)} ${n(a.cy)} ${n(a.r)}`;
    case 'ellipse':
      return `E${n(a.cx)} ${n(a.cy)} ${n(a.rx)} ${n(a.ry)}`;
    case 'line':
      return `M${n(a.x1)} ${n(a.y1)}L${n(a.x2)} ${n(a.y2)}`;
    case 'polyline':
    case 'polygon': {
      const p = pts(a.points);
      return `M${p.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}${tag === 'polygon' ? 'z' : ''}`;
    }
    case 'rect': {
      const x = Number(a.x ?? 0);
      const y = Number(a.y ?? 0);
      const w = Number(a.width);
      const h = Number(a.height);
      const rx = Math.min(Number(a.rx ?? a.ry ?? 0), w / 2);
      const ry = Math.min(Number(a.ry ?? a.rx ?? 0), h / 2);
      if (!rx && !ry) return `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`;
      const arc = (dx, dy) => `a${n(rx)} ${n(ry)} 0 0 1 ${n(dx)} ${n(dy)}`;
      return `M${n(x + rx)} ${n(y)}h${n(w - 2 * rx)}${arc(rx, ry)}v${n(h - 2 * ry)}${arc(-rx, ry)}h${n(-(w - 2 * rx))}${arc(-rx, -ry)}v${n(-(h - 2 * ry))}${arc(rx, -ry)}z`;
    }
    default:
      throw new Error(`unsupported SVG element <${tag}>`);
  }
}

const out = new Map();
const missing = [];
for (const [group, list] of Object.entries(GROUPS)) {
  for (const name of list.split(/\s+/).filter(Boolean)) {
    if (OWN.has(name) || out.has(name)) continue;
    const node = nodes[name];
    if (!node) {
      missing.push(`${name} (${group})`);
      continue;
    }
    out.set(name, node.map(part).join('|'));
  }
}
if (missing.length) {
  console.error(`Not in lucide-static ${version}: ${missing.join(', ')}`);
  process.exit(1);
}

async function writeTs(file, code) {
  const options = (await prettier.resolveConfig(file)) ?? {};
  writeFileSync(file, await prettier.format(code, { ...options, filepath: file }));
}

const header = (what) =>
  `// Generated by scripts/vendor-icons.mjs from lucide-static ${version} (ISC, see LICENSE-lucide.txt). Do not edit.\n// ${what}\n`;
const runtimeFile = path.join(root, 'packages/runtime/src/data/lucide-icons.ts');
await writeTs(
  runtimeFile,
  `${header('Lucide icons in the runtime icon format: parts joined by "|"; "C cx cy r" circles, "E cx cy rx ry" ellipses, else path data.')}export const LUCIDE: Record<string, string> = {\n${[
    ...out,
  ]
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join('\n')}\n};\n`,
);
copyFileSync(path.join(pkgDir, 'LICENSE'), path.join(root, 'packages/runtime/src/data/LICENSE-lucide.txt'));
await writeTs(
  path.join(root, 'packages/core/src/components/icon-names.ts'),
  `${header('Names of the vendored Lucide icons (the runtime holds their drawings).')}export const LUCIDE_ICONS = [\n${[
    ...out.keys(),
  ]
    .map((k) => `  ${JSON.stringify(k)},`)
    .join('\n')}\n] as const;\n`,
);
console.log(`vendored ${out.size} Lucide icons (+${OWN.size} ReelForge icons = ${out.size + OWN.size})`);
