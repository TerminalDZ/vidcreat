// Builds the CodeCanyon release into release/:
//   ReelForge-<v>.zip            main file (prebuilt, installs with --prod; documentation inside)
//   ReelForge-<v>-previews.zip   preview screenshots + full-resolution example frames
//   ReelForge-<v>-marketing/     thumbnail.png, inline-preview.jpg, cover, demo.mp4, item description
// Then unzips the main file into a temporary folder and verifies install → doctor → validate → render.
// Usage: node scripts/release.mjs [--skip-tests] [--skip-verify] [--skip-assets]
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const { version } = JSON.parse(execFileSync('node', ['-p', 'JSON.stringify(require("./package.json"))'], { cwd: ROOT, encoding: 'utf8' }));
const NAME = `ReelForge-${version}`;
const REL = path.join(ROOT, 'release');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const step = (m) => console.log(`\n\x1b[1m▶ ${m}\x1b[0m`);
const run = (cmd, a, opts = {}) => execFileSync(cmd, a, { cwd: ROOT, stdio: 'inherit', ...opts });

step('Build, typecheck, lint, licenses');
run(pnpm, ['build']);
run(pnpm, ['typecheck']);
run(pnpm, ['lint']);
run(pnpm, ['check:licenses']);
run(pnpm, ['audit', '--prod']);
if (!args.has('--skip-tests')) {
  step('Tests');
  run(pnpm, ['test']);
}

step('Generated docs, notices and marketing assets');
run('node', ['scripts/gen-components-doc.mjs']);
run('node', ['scripts/gen-notices.mjs']);
if (!args.has('--skip-assets') && !existsSync(path.join(ROOT, 'docs/screenshots/00-dashboard.jpg'))) run('node', ['scripts/screenshots.mjs']);
run('node', ['scripts/build-docs.mjs']);
if (!args.has('--skip-assets')) run('node', ['scripts/marketing.mjs']);

step('Stage the package');
rmSync(REL, { recursive: true, force: true });
const stage = path.join(REL, 'stage', NAME);
mkdirSync(stage, { recursive: true });
const EXCLUDE = [/^\.github\//, /^marketing\//, /^docs\/codecanyon\//, /^docs\/PRD\.md$/, /^docs\/SRS\.md$/, /^docs\/screenshots\//, /^release\//];
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
let files = 0;
for (const f of tracked) {
  if (EXCLUDE.some((re) => re.test(f)) || !existsSync(path.join(ROOT, f))) continue;
  mkdirSync(path.dirname(path.join(stage, f)), { recursive: true });
  copyFileSync(path.join(ROOT, f), path.join(stage, f));
  files++;
}
// generated, untracked parts: documentation (if not tracked) and the prebuilt dist folders
cpSync(path.join(ROOT, 'documentation'), path.join(stage, 'documentation'), { recursive: true });
for (const p of readdirSync(path.join(ROOT, 'packages'))) {
  const dist = path.join(ROOT, 'packages', p, 'dist');
  if (existsSync(dist)) cpSync(dist, path.join(stage, 'packages', p, 'dist'), { recursive: true, filter: (s) => !s.endsWith('.tsbuildinfo') });
}
for (const f of ['install.sh', 'start.sh', 'reelforge', 'ReelForge.command', 'scripts/make-test-voice.mjs']) {
  if (existsSync(path.join(stage, f))) chmodSync(path.join(stage, f), 0o755);
}
console.log(`${files} tracked files + documentation + prebuilt dist`);

step('Zip');
const mainZip = path.join(REL, `${NAME}.zip`);
execFileSync('zip', ['-qr', '-X', mainZip, NAME], { cwd: path.join(REL, 'stage') });
const mkt = path.join(REL, `${NAME}-marketing`);
if (existsSync(path.join(ROOT, 'marketing'))) {
  cpSync(path.join(ROOT, 'marketing'), mkt, { recursive: true });
  copyFileSync(path.join(ROOT, 'docs/codecanyon/item-description.html'), path.join(mkt, 'item-description.html'));
  copyFileSync(path.join(ROOT, 'docs/codecanyon/listing.md'), path.join(mkt, 'listing.md'));
  execFileSync('zip', ['-qr', '-X', path.join(REL, `${NAME}-previews.zip`), 'screenshots', 'frames'], { cwd: mkt });
}
const mb = (f) => `${(statSync(f).size / 1048576).toFixed(1)} MB`;
console.log(`${path.relative(ROOT, mainZip)}  ${mb(mainZip)}`);

if (!args.has('--skip-verify')) {
  step('Verify a clean install from the ZIP');
  const t = mkdtempSync(path.join(os.tmpdir(), 'rf-release-'));
  execFileSync('unzip', ['-q', mainZip, '-d', t]);
  const dir = path.join(t, NAME);
  const env = { ...process.env, REELFORGE_NO_OPEN: '1' };
  execFileSync('./install.sh', ['--yes'], { cwd: dir, stdio: 'inherit', env });
  execFileSync('./reelforge', ['validate', 'examples/season1/ep01', '--no-measure'], { cwd: dir, stdio: 'inherit', env });
  execFileSync('./reelforge', ['render', 'fixtures/mini', '--fast', '--workers', '2'], { cwd: dir, stdio: 'inherit', env });
  if (!args.has('--skip-assets')) {
    step('Demo video for the item page');
    execFileSync('./reelforge', ['render', 'examples/season1/ep02', '--silent', '--no-measure'], { cwd: dir, stdio: 'inherit', env });
    copyFileSync(path.join(dir, 'examples/season1/ep02/out/ep02.share.mp4'), path.join(mkt, 'demo.mp4'));
  }
  rmSync(t, { recursive: true, force: true });
}
rmSync(path.join(REL, 'stage'), { recursive: true, force: true });
step('Done');
for (const f of readdirSync(REL)) console.log(`  release/${f}${f.endsWith('.zip') ? `  ${mb(path.join(REL, f))}` : ''}`);
