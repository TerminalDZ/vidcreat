// Builds CodeCanyon marketing assets into marketing/:
//   thumbnail.png (80×80), inline-preview.jpg (590×300), cover-1920x1080.jpg,
//   screenshots/*.jpg (preview images), frames/*.jpg (full-resolution example frames).
// Requires `pnpm build` and docs/screenshots (node scripts/screenshots.mjs).
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'marketing');
const { launchBrowser } = await import(path.join(ROOT, 'packages/renderer/dist/index.js'));
const { RUNTIME_DIR } = await import(path.join(ROOT, 'packages/runtime/dist/index.js'));
const CLI = path.join(ROOT, 'packages/cli/bin/reelforge.js');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'rf-mkt-'));

/** Example frames used across the marketing images: [episode, time, name]. */
const FRAMES = [
  ['ep02', '18', 'lost-update'],
  ['ep06', '36', 'the-trap'],
  ['ep08', '42', 'double-entry-ledger'],
  ['ep04', '54', 'quote'],
  ['ep09', '48', 'circuit-breaker'],
  ['ep01', '12', 'duplicate-charge'],
  ['ep07', '24', 'message-queue'],
  ['ep03', '30', 'token-bucket'],
];

rmSync(OUT, { recursive: true, force: true });
for (const d of ['screenshots', 'frames']) mkdirSync(path.join(OUT, d), { recursive: true });
const work = path.join(tmp, 'page');
mkdirSync(work);
cpSync(path.join(RUNTIME_DIR, 'fonts'), path.join(work, 'fonts'), { recursive: true });

for (const [ep, t, name] of FRAMES) {
  const dir = path.join(tmp, 'snap', name);
  execFileSync(process.execPath, [CLI, 'snap', path.join(ROOT, 'examples/season1', ep), t, '--out', dir, '--json'], { stdio: 'ignore' });
  const png = readdirSync(dir).find((f) => f.endsWith('.png'));
  copyFileSync(path.join(dir, png), path.join(work, `${name}.png`));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(dir, png), '-q:v', '2', path.join(OUT, 'frames', `${name}.jpg`)]);
}

const css = `
@import url('fonts/fonts.css');
*{box-sizing:border-box;margin:0}
body{background:#07080c;color:#eef1f7;font-family:'Space Grotesk','Cairo',sans-serif;overflow:hidden}
.glow{position:absolute;inset:0;background:radial-gradient(60% 80% at 20% 30%,rgba(184,255,60,.16),transparent 70%),radial-gradient(50% 70% at 85% 70%,rgba(85,220,255,.13),transparent 70%)}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:40px 40px;-webkit-mask-image:radial-gradient(70% 70% at 50% 50%,#000,transparent)}
.logo{display:flex;align-items:center;gap:.35em;font-weight:800;letter-spacing:-.01em}
.mark{display:inline-block;border-radius:.22em;background:#b8ff3c;box-shadow:0 0 .6em #b8ff3c}
.lime{color:#b8ff3c}.cyan{color:#55dcff}
.phone{position:absolute;border-radius:22px;overflow:hidden;border:3px solid #2a2f3d;box-shadow:0 30px 80px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.05)}
.phone img{display:block;width:100%;height:100%;object-fit:cover}
.chip{display:inline-block;border:1px solid rgba(184,255,60,.4);color:#b8ff3c;border-radius:999px;font-family:'JetBrains Mono',monospace;font-weight:600}
.mono{font-family:'JetBrains Mono',monospace}`;

const pages = {
  'inline-preview': {
    w: 590,
    h: 300,
    body: `<div class="glow"></div><div class="grid"></div>
    <div style="position:absolute;left:30px;top:34px;width:300px">
      <div class="logo" style="font-size:31px"><span class="mark" style="width:18px;height:18px"></span>ReelForge</div>
      <div style="margin-top:14px;font-size:19px;font-weight:700;line-height:1.2">Voice + YAML → <span class="lime">finished</span> vertical explainer videos</div>
      <div style="margin-top:12px;font-size:11.5px;color:#a3aabb;line-height:1.5">Animated diagrams, typing code, word-by-word Arabic captions, sound effects &amp; platform-ready MP4s. Offline. No AI.</div>
      <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:6px">
        <span class="chip" style="font-size:9.5px;padding:3px 8px">TikTok</span><span class="chip" style="font-size:9.5px;padding:3px 8px">Reels</span><span class="chip" style="font-size:9.5px;padding:3px 8px">Shorts</span><span class="chip" style="font-size:9.5px;padding:3px 8px">21 components</span>
      </div>
    </div>
    <div class="phone" style="left:340px;top:52px;width:110px;height:196px;transform:rotate(-7deg);border-radius:16px"><img src="lost-update.png"></div>
    <div class="phone" style="left:450px;top:60px;width:106px;height:188px;transform:rotate(6deg);border-radius:16px;border-color:#3a4156"><img src="the-trap.png"></div>
    <div class="phone" style="left:393px;top:28px;width:130px;height:231px;z-index:2;border-radius:18px;border-color:#b8ff3c66"><img src="double-entry-ledger.png"></div>`,
  },
  thumbnail: {
    w: 80,
    h: 80,
    body: `<div style="position:absolute;inset:0;border-radius:18px;background:radial-gradient(80% 80% at 30% 20%,rgba(184,255,60,.35),transparent 70%),#07080c"></div>
    <svg viewBox="0 0 80 80" width="80" height="80" style="position:absolute;inset:0"><rect x="23" y="12" width="34" height="56" rx="8" fill="none" stroke="#b8ff3c" stroke-width="5"/><path d="M35 30 L49 40 L35 50 Z" fill="#b8ff3c"/></svg>`,
  },
  'cover-1920x1080': {
    w: 1920,
    h: 1080,
    body: `<div class="glow"></div><div class="grid" style="background-size:80px 80px"></div>
    <div style="position:absolute;left:110px;top:170px;width:820px">
      <div class="logo" style="font-size:84px"><span class="mark" style="width:46px;height:46px"></span>ReelForge</div>
      <div style="margin-top:36px;font-size:56px;font-weight:700;line-height:1.12">Voice + YAML →<br><span class="lime">finished</span> vertical explainer videos</div>
      <div style="margin-top:30px;font-size:25px;color:#a3aabb;line-height:1.55;max-width:760px">Animated diagrams, code that types itself, word-by-word Arabic &amp; English captions, sound effects, mastered audio and platform-ready MP4s for TikTok, Reels and Shorts. Offline. No AI. No subscription.</div>
      <div style="margin-top:40px;display:flex;gap:14px;flex-wrap:wrap">
        <span class="chip" style="font-size:20px;padding:8px 18px">21 animated components</span>
        <span class="chip" style="font-size:20px;padding:8px 18px">Live preview</span>
        <span class="chip" style="font-size:20px;padding:8px 18px">Windows · macOS · Linux</span>
      </div>
    </div>
    <div class="phone" style="left:1040px;top:150px;width:330px;height:587px;transform:rotate(-7deg)"><img src="the-trap.png"></div>
    <div class="phone" style="left:1480px;top:230px;width:330px;height:587px;transform:rotate(6deg)"><img src="circuit-breaker.png"></div>
    <div class="phone" style="left:1250px;top:190px;width:350px;height:622px;z-index:2;border-color:#b8ff3c66"><img src="lost-update.png"></div>`,
  },
};

const browser = await launchBrowser();
for (const [name, p] of Object.entries(pages)) {
  const html = path.join(work, `${name}.html`);
  writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>${css} body{width:${p.w}px;height:${p.h}px;position:relative}</style></head><body>${p.body}</body></html>`);
  const page = await browser.newPage({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: 1 });
  await page.goto(`file://${html}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const isThumb = name === 'thumbnail';
  await page.screenshot({ path: path.join(OUT, `${name}.${isThumb ? 'png' : 'jpg'}`), type: isThumb ? 'png' : 'jpeg', quality: isThumb ? undefined : 92, omitBackground: isThumb });
  await page.close();
}
await browser.close();

// Preview screenshots (ordered for the item page)
const ORDER = ['00-dashboard', '25-dashboard-render-progress', '03-studio-preview-safe-zones', '01-studio-cue-marker', '09-component-gallery', '10-episode-ep01', '17-episode-ep08', '26-dashboard-player', '08-studio-lint-panel', '06-studio-yaml-error-overlay', '21-cli-validate', '20-cli-doctor'];
const shots = path.join(ROOT, 'docs/screenshots');
const avail = readdirSync(shots);
ORDER.forEach((base, i) => {
  const f = avail.find((x) => x.startsWith(base));
  if (!f) return;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(shots, f), '-q:v', '3', path.join(OUT, 'screenshots', `${String(i + 1).padStart(2, '0')}-${base.replace(/^\d+-/, '')}.jpg`)]);
});
rmSync(tmp, { recursive: true, force: true });
console.log('marketing assets written to marketing/');
