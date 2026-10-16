// Builds CodeCanyon marketing assets into marketing/:
//   thumbnail.png (80×80), inline-preview.jpg (590×300), cover-2340x1560.jpg (3:2 cover image), cover-1920x1080.jpg,
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

// The editor screenshot is the hero of the covers.
copyFileSync(path.join(ROOT, 'docs/screenshots/01-editor-overview.jpg'), path.join(work, 'editor.jpg'));

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
.mono{font-family:'JetBrains Mono',monospace}
.win{position:absolute;border-radius:16px;overflow:hidden;border:1px solid #2e3546;box-shadow:0 40px 120px rgba(0,0,0,.75),0 0 0 1px rgba(255,255,255,.04);background:#11141b}
.win .bar{height:34px;display:flex;align-items:center;gap:8px;padding:0 14px;background:#161a23;border-bottom:1px solid #232937}
.win .bar i{width:11px;height:11px;border-radius:50%;background:#ff5f57}.win .bar i+i{background:#febc2e}.win .bar i+i+i{background:#28c840}
.win img{display:block;width:100%}`;

/** Cover: headline on the left, the editor window on the right with a rendered phone frame in front. */
function cover(w, h) {
  const k = w / 2340;
  const px = (n) => `${Math.round(n * k)}px`;
  const ed = { x: 1000, y: 230, w: 1150 };
  const edH = (ed.w * 1000) / 1680 + 34;
  const top = h / k > 1300 ? 0 : -150; // 16:9 is shorter
  return {
    w,
    h,
    body: `<div class="glow"></div><div class="grid" style="background-size:${px(96)} ${px(96)}"></div>
    <div style="position:absolute;left:${px(130)};top:${px(300 + top)};width:${px(800)}">
      <div class="logo" style="font-size:${px(104)}"><span class="mark" style="width:${px(56)};height:${px(56)}"></span>ReelForge</div>
      <div style="margin-top:${px(44)};font-size:${px(74)};font-weight:700;line-height:1.08">Your voice →<br><span class="lime">finished</span> vertical explainer videos</div>
      <div style="margin-top:${px(36)};font-size:${px(31)};color:#a3aabb;line-height:1.5">Design on a real canvas, time everything to your spoken words on the timeline, render platform-ready MP4s with word-by-word English &amp; Arabic captions. Offline. No subscription.</div>
      <div style="margin-top:${px(48)};display:flex;gap:${px(16)};flex-wrap:wrap">
        <span class="chip" style="font-size:${px(26)};padding:${px(9)} ${px(22)}">Visual editor</span>
        <span class="chip" style="font-size:${px(26)};padding:${px(9)} ${px(22)}">21 components</span>
        <span class="chip" style="font-size:${px(26)};padding:${px(9)} ${px(22)}">AI-ready (MCP)</span>
      </div>
    </div>
    <div class="win" style="left:${px(ed.x)};top:${px(ed.y + top)};width:${px(ed.w)};height:${px(edH)}"><div class="bar" style="height:${px(34)}"><i></i><i></i><i></i></div><img src="editor.jpg"></div>
    <div class="phone" style="left:${px(1930)};top:${px(600 + top)};width:${px(310)};height:${px(551)};border-color:#b8ff3c66;border-radius:${px(26)}"><img src="lost-update.png"></div>
    <div class="mono" style="position:absolute;left:${px(130)};bottom:${px(h / k > 1300 ? 140 : 70)};font-size:${px(27)};color:#7d8496">Windows · macOS · Linux &nbsp;·&nbsp; <span class="lime">master.mp4</span> · share.mp4 · .srt · publish.md</div>`,
  };
}

const pages = {
  'inline-preview': {
    w: 590,
    h: 300,
    body: `<div class="glow"></div><div class="grid"></div>
    <div style="position:absolute;left:30px;top:34px;width:300px">
      <div class="logo" style="font-size:31px"><span class="mark" style="width:18px;height:18px"></span>ReelForge</div>
      <div style="margin-top:14px;font-size:19px;font-weight:700;line-height:1.2">Your voice → <span class="lime">finished</span> vertical explainer videos</div>
      <div style="margin-top:12px;font-size:11.5px;color:#a3aabb;line-height:1.5">Visual editor, 21 animated components, word-by-word English &amp; Arabic captions, sound &amp; platform-ready MP4s.</div>
      <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:6px">
        <span class="chip" style="font-size:9.5px;padding:3px 8px">Visual editor</span><span class="chip" style="font-size:9.5px;padding:3px 8px">Timed to words</span><span class="chip" style="font-size:9.5px;padding:3px 8px">AI-ready (MCP)</span>
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
  'cover-2340x1560': cover(2340, 1560),
  'cover-1920x1080': cover(1920, 1080),
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
const ORDER = [
  '01-editor-overview',
  '02-editor-drag-guides',
  '03-editor-timeline',
  '00-dashboard',
  '04-editor-insert',
  '05-editor-palette',
  '11-editor-script',
  '07-editor-cues',
  '09-editor-review',
  '13-component-gallery',
  'episode-ep01',
  'episode-ep08',
  'episode-arabic-ep01',
  '25-dashboard-render-progress',
  '26-dashboard-player',
  '06-editor-shortcuts',
  '27-cli-mcp',
  '21-cli-validate',
];
const shots = path.join(ROOT, 'docs/screenshots');
const avail = readdirSync(shots);
ORDER.forEach((base, i) => {
  const f = avail.find((x) => x.startsWith(base));
  if (!f) return;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(shots, f), '-q:v', '3', path.join(OUT, 'screenshots', `${String(i + 1).padStart(2, '0')}-${base.replace(/^\d+-/, '')}.jpg`)]);
});
rmSync(tmp, { recursive: true, force: true });
console.log('marketing assets written to marketing/');
