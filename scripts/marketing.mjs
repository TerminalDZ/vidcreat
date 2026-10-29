// Builds the marketing images: docs/public/cover.jpg (1920×1080; docs site, social preview) and the README
// images in docs/public/marketing/ (hero, industries, components, how it works, AI integration, Arabic,
// dashboard, editor). Everything comes from the project itself: real frames (`reelforge snap`), the golden
// component frames, live screenshots of the dashboard and editor, and the bundled OFL fonts.
// Requires `pnpm build`, ffmpeg and Chromium. Usage: node scripts/marketing.mjs
import { execFileSync, spawn } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'docs/public');
const OUT = path.join(PUBLIC, 'marketing');
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const { launchBrowser } = await load('packages/renderer/dist/index.js');
const { RUNTIME_DIR } = await load('packages/runtime/dist/index.js');
const { COMPONENT_NAMES, compileEpisode, episodePaths, listPacks } = await load(
  'packages/core/dist/index.js',
);
const { startStudio } = await load('packages/studio/dist/server/index.js');
const CLI = path.join(ROOT, 'packages/cli/bin/reelforge.js');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'rf-mkt-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const noOut = (s) => !s.includes(`${path.sep}out`);

// ------------------------------------------------------------------ facts read from the code
const COUNTS = {
  components: COMPONENT_NAMES.length,
  packs: listPacks().packs.length,
  themes: readdirSync(path.join(ROOT, 'themes')).filter((f) => f.endsWith('.theme.yaml')).length,
  examples: listPacks().packs.reduce((n, p) => n + p.examples.length, 0),
};
/** AI clients with a setup recipe on the Connect AI page (names only, as plain text). */
const CLIENT_NAMES = [
  ...readFileSync(path.join(ROOT, 'packages/studio/client/src/connect-clients.ts'), 'utf8').matchAll(
    /^ {4}name: '([^']+)'/gm,
  ),
].map((m) => m[1]);

mkdirSync(OUT, { recursive: true });
const work = path.join(tmp, 'page');
mkdirSync(work);
cpSync(path.join(RUNTIME_DIR, 'fonts'), path.join(work, 'fonts'), { recursive: true });

// ------------------------------------------------------------------ rendered frames
const pack = (p, ex) => path.join(ROOT, 'packs', p, 'examples', ex);
/** [file name, episode folder, scene id]: the frame is taken just before the scene ends, when everything has entered. */
const FRAMES = [
  ['health-en', pack('healthcare', 'first-visit-en'), 'care'],
  ['health-ar', pack('healthcare', 'first-visit-ar'), 'care'],
  ['port-ar', pack('ports-logistics', 'azur-container-ar'), 'journey'],
  ['estate-ar', pack('real-estate', 'maple-court-ar'), 'inside'],
  ['finance-ar', pack('finance', 'budget-split-ar'), 'split'],
  ['edu-en', pack('education', 'photosynthesis-en'), 'parts'],
  ['food-ar', pack('food', 'shakshuka-ar'), 'steps'],
  ['tech-en', pack('tech', 'rate-limiting-en'), 'arch'],
  ['tech-trap-en', pack('tech', 'rate-limiting-en'), 'trap'],
  ['tech-trap-ar', pack('tech', 'rate-limiting-ar'), 'trap'],
  ['factory-en', pack('manufacturing', 'bracket-line-en'), 'line'],
];
for (const [name, dir, scene, at] of FRAMES) {
  let t = at;
  if (scene) {
    const s = compileEpisode(episodePaths(dir, ROOT), { voice: null }).timeline.scenes.find(
      (x) => x.id === scene,
    );
    if (!s) throw new Error(`${dir}: no scene "${scene}"`);
    t = Number((s.end - 0.25).toFixed(2));
  }
  const out = path.join(tmp, 'snap', name);
  execFileSync(process.execPath, [CLI, 'snap', dir, String(t), '--out', out, '--json'], { stdio: 'ignore' });
  copyFileSync(
    path.join(
      out,
      readdirSync(out).find((f) => f.endsWith('.png')),
    ),
    path.join(work, `${name}.png`),
  );
}

// Component gallery frames (golden, 540×960), grouped for the mosaic.
const gallery = path.join(ROOT, 'fixtures/golden/components');
const galleryScenes = new Map(
  compileEpisode(episodePaths(gallery, ROOT), { voice: null }).timeline.scenes.map((s) => [
    s.id,
    [...new Set(s.elements.map((e) => e.component))].filter(
      (c) => c !== 'label' && c !== 'icon' && c !== 'particles',
    ),
  ]),
);
const MOSAIC = [
  ['Text & code', ['text', 'code', 'quote', 'hits']],
  ['Diagrams & data', ['diagram', 'lanes', 'table', 'bucket']],
  ['Charts', ['bars', 'lines', 'donut', 'compare']],
  ['Structure', ['steps', 'org', 'funnel', 'matrix']],
  ['Places', ['map', 'route', 'floor_plan', 'containers']],
  ['Time, people & media', ['calendar', 'people', 'chat', 'vitals']],
];
for (const [, ids] of MOSAIC)
  for (const id of ids)
    copyFileSync(path.join(gallery, 'frames', `${id}.png`), path.join(work, `c-${id}.png`));

// ------------------------------------------------------------------ live screenshots
const freePort = (want) =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => (want ? freePort(0).then(resolve) : resolve(0)));
    s.listen(want, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });

/** Copies an example episode and gives it a synthetic test voice so waveforms are visible. */
function withVoice(src, dest) {
  cpSync(src, dest, { recursive: true, filter: noOut });
  const cues = JSON.parse(readFileSync(path.join(dest, 'cues.json'), 'utf8'));
  execFileSync(process.execPath, [
    path.join(ROOT, 'scripts/make-test-voice.mjs'),
    path.join(dest, 'voice.wav'),
    String(cues.audio.duration),
    Object.values(cues.cues).join(','),
  ]);
  delete cues.draft;
  writeFileSync(path.join(dest, 'cues.json'), JSON.stringify(cues, null, 2));
}

const browser = await launchBrowser();
/** Replaces local folder paths on the page with neutral ones before a screenshot. */
const scrub = (page, pairs) =>
  page.evaluate(
    (prefixes) => {
      const fix = (s) => {
        for (const [from, to] of prefixes) {
          for (let i = s.indexOf(from); i >= 0; i = s.indexOf(from)) {
            let j = i + from.length;
            while (j < s.length && /[\\/\w.-]/.test(s[j])) j++;
            s = s.slice(0, i) + to + s.slice(i + from.length, j).replace(/\\+/g, '/') + s.slice(j);
          }
        }
        return s;
      };
      const w = document.createTreeWalker(document.body, 4 /* NodeFilter.SHOW_TEXT */);
      for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeValue = fix(n.nodeValue);
      for (const el of document.querySelectorAll('input,textarea')) el.value = fix(el.value);
      for (const el of document.querySelectorAll('[title]')) el.title = fix(el.title);
    },
    pairs.flatMap(([from, to]) => [
      [from, to],
      [from.replaceAll('\\', '\\\\'), to],
    ]),
  );
const shoot = async (page, name) =>
  page.screenshot({ path: path.join(work, name), type: 'jpeg', quality: 92 });

// Editor: an element selected, inspector and word-synced timeline.
{
  const root = path.join(tmp, 'studio');
  const ep = path.join(root, 'ep02');
  withVoice(path.join(ROOT, 'examples/season1/ep02'), ep);
  const st = await startStudio({ paths: episodePaths(ep, root), mode: 'edit', port: 0 });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
  await page.goto(st.url);
  await page.waitForSelector('.trow.el');
  await page.waitForFunction(() => document.querySelector('.tl-wave') && window.reelforgeStudio);
  await sleep(1500);
  await page.locator('.trow.el', { hasText: 'lanes' }).first().click();
  await sleep(500);
  await page.evaluate(() => window.reelforgeStudio.seek(15.5));
  await sleep(800);
  await shoot(page, 'editor.jpg');
  await page.close();
  await st.close();
}

// Dashboard (`reelforge studio`) on a project with industry episodes: grid, template dialog, Connect AI.
{
  const root = path.join(tmp, 'project');
  const eps = [
    ['healthcare', 'first-visit-en'],
    ['finance', 'budget-split-ar'],
    ['ports-logistics', 'azur-container-en'],
    ['real-estate', 'maple-court-en'],
    ['tech', 'rate-limiting-en'],
    ['food', 'shakshuka-ar'],
    ['education', 'photosynthesis-en'],
    ['retail', 'bluebell-pickup-ar'],
  ];
  for (const [p, ex] of eps)
    cpSync(pack(p, ex), path.join(root, 'episodes', ex), { recursive: true, filter: noOut });
  const port = await freePort(4310);
  const hub = spawn(process.execPath, [CLI, 'studio', '--port', String(port), '--no-open', '--root', root], {
    cwd: root,
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; ; i++) {
      try {
        if ((await fetch(url)).ok) break;
      } catch {
        if (i > 120) throw new Error('reelforge studio did not start');
      }
      await sleep(500);
    }
    const paths = [
      [root, '~/my-videos'],
      [ROOT, '~/reelforge'],
    ];
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const thumbsReady = () =>
      page.waitForFunction(
        () =>
          document.querySelectorAll('.card').length > 0 &&
          document.querySelectorAll('.thumb.loading').length === 0,
        null,
        { timeout: 300000 },
      );
    await page.goto(`${url}/?template=healthcare/patient-journey`);
    await page.waitForSelector('#newDlg[open] #slotFields input');
    await thumbsReady();
    await sleep(600);
    await scrub(page, paths);
    await shoot(page, 'dashboard-template.jpg');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${url}/connect`);
    await page.waitForSelector('#clients [role="tab"]');
    await page.waitForFunction(() => document.querySelector('#kv')?.children.length > 0);
    await sleep(800);
    await scrub(page, paths);
    await shoot(page, 'connect.jpg');
    await page.close();
  } finally {
    hub.kill();
  }
}

// ------------------------------------------------------------------ page styles and parts
const css = `
@import url('fonts/fonts.css');
*{box-sizing:border-box;margin:0;padding:0}
body{background:#07080c;color:#eef1f7;font-family:'Space Grotesk','Cairo',sans-serif;overflow:hidden;position:relative}
.ar{font-family:'Cairo',sans-serif}
.glow{position:absolute;inset:0;background:radial-gradient(55% 75% at 18% 25%,rgba(184,255,60,.14),transparent 70%),radial-gradient(50% 70% at 88% 75%,rgba(85,220,255,.12),transparent 70%)}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:48px 48px;-webkit-mask-image:radial-gradient(75% 75% at 50% 50%,#000,transparent)}
.abs{position:absolute}
.logo{display:flex;align-items:center;gap:.35em;font-weight:800;letter-spacing:-.01em}
.mark{display:inline-block;width:.55em;height:.55em;border-radius:.13em;background:#b8ff3c;box-shadow:0 0 .5em rgba(184,255,60,.8)}
.lime{color:#b8ff3c}.cyan{color:#55dcff}.amber{color:#ffb238}.dim{color:#9aa2b4}.faint{color:#6c7386}
.mono{font-family:'JetBrains Mono',monospace}
.eyebrow{font-family:'JetBrains Mono',monospace;font-size:15px;letter-spacing:.16em;text-transform:uppercase;color:#b8ff3c}
h1{font-size:46px;font-weight:700;letter-spacing:-.015em;line-height:1.1}
.sub{font-size:20px;color:#a3aabb;line-height:1.5}
.chips{display:flex;gap:10px;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(184,255,60,.38);background:rgba(184,255,60,.06);color:#d9ff9a;border-radius:999px;font-family:'JetBrains Mono',monospace;font-weight:600;font-size:16px;padding:7px 15px;white-space:nowrap}
.chip b{color:#b8ff3c}
.chip.cy{border-color:rgba(85,220,255,.38);background:rgba(85,220,255,.06);color:#bdf0ff}
.phone{position:relative;border-radius:30px;padding:9px;background:linear-gradient(160deg,#2c3240,#151922);box-shadow:0 26px 70px rgba(0,0,0,.65),inset 0 0 0 1px rgba(255,255,255,.08)}
.phone .screen{border-radius:22px;overflow:hidden;aspect-ratio:9/16;background:#000}
.phone img{display:block;width:100%;height:100%;object-fit:cover}
.win{border-radius:14px;overflow:hidden;border:1px solid #2e3546;box-shadow:0 34px 100px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.04);background:#11141b}
.win .bar{height:34px;display:flex;align-items:center;gap:8px;padding:0 14px;background:#161a23;border-bottom:1px solid #232937;font-family:'JetBrains Mono',monospace;font-size:13px;color:#7d8496}
.win .bar i{width:11px;height:11px;border-radius:50%;background:#ff5f57;flex:none}.win .bar i+i{background:#febc2e}.win .bar i+i+i{background:#28c840}
.win .bar span{margin-left:12px}
.win img{display:block;width:100%}
.tag{display:inline-flex;align-items:center;gap:8px;height:30px;font-size:17px;font-weight:600;color:#eef1f7}
.lang{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;letter-spacing:.06em;border-radius:6px;padding:3px 7px;background:rgba(184,255,60,.14);color:#b8ff3c}
.lang.ar{background:rgba(85,220,255,.14);color:#55dcff;font-family:'Cairo',sans-serif;font-size:13px;line-height:16px;padding:3px 8px}
.card{border:1px solid #262c3a;background:linear-gradient(180deg,rgba(22,26,35,.92),rgba(14,17,24,.92));border-radius:16px}
`;
const bg = '<div class="glow"></div><div class="grid"></div>';
const phone = (src, w, extra = '') =>
  `<div class="phone" style="width:${w}px;${extra}"><div class="screen"><img src="${src}"></div></div>`;
const win = (src, w, title, extra = '') =>
  `<div class="win" style="width:${w}px;${extra}"><div class="bar"><i></i><i></i><i></i><span>${title}</span></div><img src="${src}"></div>`;
const chips = () => `<div class="chips">
  <span class="chip"><b>${COUNTS.components}</b> components</span>
  <span class="chip"><b>${COUNTS.packs}</b> industry packs</span>
  <span class="chip"><b>${COUNTS.themes}</b> themes</span>
  <span class="chip cy">English &amp; <span class="ar">العربية</span></span>
  <span class="chip cy">MCP + REST</span></div>`;
const logo = (size) =>
  `<div class="logo" style="font-size:${size}px"><span class="mark"></span>ReelForge</div>`;

// ------------------------------------------------------------------ pages
/** Social cover: headline on the left, the editor window on the right with a rendered phone frame in front. */
function cover(w, h) {
  const k = w / 2340;
  const px = (n) => `${Math.round(n * k)}px`;
  const ed = { x: 1000, y: 200, w: 1150 };
  const chip = (t) => `<span class="chip" style="font-size:${px(26)};padding:${px(9)} ${px(22)}">${t}</span>`;
  return {
    w,
    h,
    body: `${bg}
    <div class="abs" style="left:${px(130)};top:${px(150)};width:${px(800)}">
      <div class="logo" style="font-size:${px(104)}"><span class="mark"></span>ReelForge</div>
      <div style="margin-top:${px(44)};font-size:${px(74)};font-weight:700;line-height:1.08">Your voice →<br><span class="lime">finished</span> vertical explainer videos</div>
      <div style="margin-top:${px(36)};font-size:${px(31)};color:#a3aabb;line-height:1.5">Design on a real canvas, time everything to your spoken words, render platform-ready MP4s with word-by-word English &amp; Arabic captions. Open source, runs on your computer.</div>
      <div style="margin-top:${px(48)};display:flex;gap:${px(16)};flex-wrap:wrap">
        ${chip('Visual editor')}${chip(`${COUNTS.components} components`)}${chip(`${COUNTS.packs} industry packs`)}${chip('AI-ready (MCP)')}
      </div>
    </div>
    <div class="win abs" style="left:${px(ed.x)};top:${px(ed.y)};width:${px(ed.w)}"><div class="bar"><i></i><i></i><i></i></div><img src="editor.jpg"></div>
    <div class="abs" style="left:${px(1920)};top:${px(700)}">${phone('health-en.png', Math.round(290 * k))}</div>
    <div class="mono abs" style="left:${px(130)};bottom:${px(70)};font-size:${px(27)};color:#7d8496">Windows · macOS · Linux &nbsp;·&nbsp; <span class="lime">master.mp4</span> · share.mp4 · .srt · publish.md</div>`,
  };
}

const hero = {
  w: 1600,
  h: 800,
  body: `${bg}
  <div class="abs" style="left:80px;top:96px;width:610px">
    ${logo(64)}
    <div style="margin-top:30px;font-size:46px;font-weight:700;line-height:1.1;letter-spacing:-.015em">A voice recording + one YAML file → a <span class="lime">finished vertical video</span></div>
    <div class="sub" style="margin-top:22px">1080×1920 explainers for TikTok, Reels and Shorts: animated charts, diagrams and word-by-word captions, timed to the words you say. Visual editor, local rendering, open source.</div>
    <div style="margin-top:32px">${chips()}</div>
    <div class="mono faint" style="margin-top:34px;font-size:15px">Windows · macOS · Linux &nbsp;·&nbsp; Apache-2.0</div>
  </div>
  ${win('editor.jpg', 800, 'reelforge edit ep02', 'position:absolute;left:740px;top:140px')}
  <div class="abs" style="left:1330px;top:330px">${phone('health-en.png', 230)}</div>`,
};

const packName = (id) =>
  listPacks()
    .packs.find((p) => p.id === id)
    .name.en.replace('&', '&amp;');
const INDUSTRIES = [
  ['health-en.png', 'healthcare', 'EN'],
  ['port-ar.png', 'ports-logistics', 'AR'],
  ['finance-ar.png', 'finance', 'AR'],
  ['edu-en.png', 'education', 'EN'],
  ['estate-ar.png', 'real-estate', 'AR'],
  ['tech-en.png', 'tech', 'EN'],
  ['food-ar.png', 'food', 'AR'],
  ['factory-en.png', 'manufacturing', 'EN'],
];
const langTag = (l) => (l === 'AR' ? '<span class="lang ar">عربي</span>' : '<span class="lang">EN</span>');
const industries = {
  w: 1600,
  h: 1500,
  body: `${bg}
  <div class="abs" style="left:0;right:0;top:56px;text-align:center">
    <div class="eyebrow">Made for every industry</div>
    <h1 style="margin-top:12px">${COUNTS.packs} industry packs, every example in English and Arabic</h1>
    <div class="sub" style="margin-top:12px">Templates with a few slots to fill and ${COUNTS.examples} complete example episodes. All organizations are fictional.</div>
  </div>
  <div class="abs" style="left:110px;right:110px;top:250px;display:grid;grid-template-columns:repeat(4,1fr);gap:34px 60px;justify-items:center">
    ${INDUSTRIES.map(([src, id, l]) => `<div style="display:flex;flex-direction:column;align-items:center;gap:14px"><div class="tag">${packName(id)} ${langTag(l)}</div>${phone(src, 300)}</div>`).join('')}
  </div>`,
};

const tile = (id) => {
  // Crop the 540×960 frame to the stage band (canvas y 270–1270), where the components live.
  const W = 228;
  const k = W / 540;
  return `<div class="tile"><div class="crop" style="width:${W}px;height:${Math.round(520 * k)}px"><img src="c-${id}.png" style="width:${W}px;margin-top:-${Math.round(125 * k)}px"></div><div class="cname mono">${galleryScenes.get(id).join(' · ')}</div></div>`;
};
const components = {
  w: 1600,
  h: 1340,
  body: `${bg}
  <style>.tile{display:flex;flex-direction:column;gap:7px}.crop{overflow:hidden;border-radius:12px;border:1px solid #262c3a;box-shadow:0 12px 30px rgba(0,0,0,.45)}.crop img{display:block}
  .cname{font-size:13px;color:#a9b0c0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:228px}
  .col h3{font-size:18px;font-weight:700;margin-bottom:12px;padding-bottom:9px;border-bottom:2px solid #b8ff3c}</style>
  <div class="abs" style="left:0;right:0;top:50px;text-align:center">
    <div class="eyebrow">Components</div>
    <h1 style="margin-top:12px">${COUNTS.components} animated components, strict schemas</h1>
    <div class="sub" style="margin-top:12px">Text, diagrams, charts, structures, maps, schedules, people, media and screens. Every one shown here is a real frame.</div>
  </div>
  <div class="abs" style="left:66px;right:66px;top:240px;display:grid;grid-template-columns:repeat(6,1fr);gap:20px">
    ${MOSAIC.map(([title, ids]) => `<div class="col"><h3>${title}</h3><div style="display:flex;flex-direction:column;gap:16px">${ids.map(tile).join('')}</div></div>`).join('')}
  </div>`,
};

// A deterministic waveform for the voice card.
const wave = Array.from({ length: 46 }, (_, i) => {
  const a = Math.abs(Math.sin(i * 0.9) * 0.6 + Math.sin(i * 0.37) * 0.4);
  const h = 6 + Math.round(a * 40);
  return `<rect x="${i * 6}" y="${26 - h / 2}" width="3.4" height="${h}" rx="1.7" fill="#55dcff" opacity="${i % 9 < 6 ? 1 : 0.45}"/>`;
}).join('');
const arrow = (x, y) =>
  `<svg class="abs" style="left:${x}px;top:${y}px" width="56" height="24" viewBox="0 0 56 24"><path d="M2 12h44" stroke="#b8ff3c" stroke-width="2.5" stroke-dasharray="5 5"/><path d="M42 4l10 8-10 8" fill="none" stroke="#b8ff3c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const step = (n, title) =>
  `<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px"><span class="mono" style="width:30px;height:30px;border-radius:50%;background:#b8ff3c;color:#07080c;display:grid;place-items:center;font-weight:800;font-size:15px">${n}</span><span style="font-size:22px;font-weight:700">${title}</span></div>`;
const item = (t, s) =>
  `<div style="padding:11px 14px;border-radius:10px;background:rgba(255,255,255,.035);border:1px solid #232937"><div style="font-size:17px;font-weight:600">${t}</div>${s ? `<div class="dim" style="font-size:14px;margin-top:3px">${s}</div>` : ''}</div>`;
const how = {
  w: 1600,
  h: 720,
  body: `${bg}
  <div class="abs" style="left:0;right:0;top:46px;text-align:center">
    <div class="eyebrow">How it works</div>
    <h1 style="margin-top:12px">From your voice to a published reel</h1>
  </div>
  <div class="abs card" style="left:50px;top:180px;width:380px;height:480px;padding:24px">
    ${step(1, 'Write and record')}
    <div style="padding:12px 14px;border-radius:10px;background:rgba(85,220,255,.06);border:1px solid rgba(85,220,255,.28)">
      <div class="mono cyan" style="font-size:14px;margin-bottom:8px">voice.wav</div>
      <svg width="300" height="52" viewBox="0 0 280 52" preserveAspectRatio="none">${wave}</svg>
    </div>
    <pre class="mono" style="margin-top:14px;padding:12px 14px;border-radius:10px;background:#0b0d12;border:1px solid #232937;font-size:13px;line-height:1.55;color:#c9cfdb"><span class="faint"># episode.yaml</span>
<span class="cyan">script</span>:
  - text: <span class="amber">'Your API got flooded.'</span>
<span class="cyan">scenes</span>:
  - at: l1
    elements:
      - use: <span class="lime">title</span>
        enter: { at: <span class="amber">"l1:'flooded'"</span> }</pre>
    <div class="dim" style="font-size:14px;margin-top:12px;line-height:1.45">Each element enters on the word that names it.</div>
  </div>
  ${arrow(437, 408)}
  <div class="abs card" style="left:500px;top:180px;width:340px;height:480px;padding:24px">
    ${step(2, 'Design and time')}
    <div style="display:flex;flex-direction:column;gap:10px">
      ${item('Visual editor', 'canvas, layers, inspector, word-snapping timeline')}
      ${item('AI client', 'MCP (stdio or HTTP) or REST + OpenAPI')}
      ${item('Cue alignment', 'lines and words from voice.wav, offline')}
      ${item('Validation', 'layout, safe zones, overflow, reading speed')}
    </div>
  </div>
  ${arrow(847, 408)}
  <div class="abs card" style="left:910px;top:180px;width:300px;height:480px;padding:24px">
    ${step(3, 'Render')}
    <div style="display:flex;flex-direction:column;gap:10px">
      ${item('On your computer', 'Chromium frames, FFmpeg encoding')}
      ${item('Deterministic', 'pure render(t): same inputs, same frames')}
      ${item('Platform presets', 'TikTok, Reels and Shorts safe zones')}
    </div>
  </div>
  ${arrow(1217, 408)}
  <div class="abs card" style="left:1280px;top:180px;width:260px;height:480px;padding:24px">
    ${step(4, 'Publish')}
    <div style="display:flex;flex-direction:column;gap:10px" class="mono">
      ${['master.mp4', 'share.mp4', 'captions .srt', 'publish.md', 'contact sheet'].map((f, i) => `<div style="padding:10px 12px;border-radius:10px;border:1px solid ${i === 0 ? 'rgba(184,255,60,.5)' : '#232937'};background:${i === 0 ? 'rgba(184,255,60,.07)' : 'rgba(255,255,255,.035)'};font-size:15px;color:${i === 0 ? '#b8ff3c' : '#d6dbe6'}">${f}</div>`).join('')}
    </div>
    <div class="dim" style="font-size:14px;margin-top:14px;line-height:1.45">publish.md holds the cover text, caption, hashtags and pinned comment.</div>
  </div>`,
};

const transport = (title, cmd, note) =>
  `<div class="card" style="padding:16px 18px"><div style="font-size:19px;font-weight:700">${title}</div><div class="mono lime" style="font-size:15px;margin-top:8px">${cmd}</div><div class="dim" style="font-size:14px;margin-top:6px">${note}</div></div>`;
const ai = {
  w: 1600,
  h: 840,
  body: `${bg}
  <div class="abs" style="left:70px;top:70px;width:520px">
    <div class="eyebrow">AI integration</div>
    <h1 style="margin-top:12px">One tool registry, three ways in</h1>
    <div class="sub" style="margin-top:12px;font-size:18px">Assistants create episodes from templates, edit scenes, validate, look at preview frames and render.</div>
    <div style="display:flex;flex-direction:column;gap:12px;margin-top:24px">
      ${transport('MCP over stdio', '$ reelforge mcp', 'the client starts ReelForge')}
      ${transport('MCP over HTTP', 'http://127.0.0.1:4310/mcp', 'served by the dashboard while it runs')}
      ${transport('REST + OpenAPI', '/api/v1/openapi.json', 'for any model with function calling')}
    </div>
    <div class="mono dim" style="font-size:14px;margin-top:18px">toolsets: <span class="lime">basic</span> · <span class="lime">design</span> · <span class="lime">render</span> · <span class="lime">all</span></div>
    <div class="dim" style="font-size:14px;margin-top:14px;line-height:1.6">Copy-paste setup for ${CLIENT_NAMES.join(', ')}.</div>
  </div>
  ${win('connect.jpg', 900, '127.0.0.1:4310/connect', 'position:absolute;left:640px;top:96px')}`,
};

const twin = (en, ar, label) => `<div style="display:flex;flex-direction:column;align-items:center;gap:14px">
  <div class="tag" style="height:34px">${label}</div>
  <div style="display:flex;gap:26px">
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px">${phone(en, 300)}<span class="lang">EN · left to right</span></div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px">${phone(ar, 300)}<span class="lang ar">عربي · من اليمين إلى اليسار</span></div>
  </div></div>`;
const arabic = {
  w: 1600,
  h: 930,
  body: `${bg}
  <div class="abs" style="left:0;right:0;top:48px;text-align:center">
    <div class="eyebrow">Arabic and right-to-left</div>
    <h1 style="margin-top:12px">Arabic is first-class · <span class="ar lime" style="font-weight:700">العربية لغة أساسية</span></h1>
    <div class="sub" style="margin-top:12px">Right-to-left captions with word-by-word highlight, English terms kept in order inside Arabic sentences, bundled Arabic fonts.</div>
  </div>
  <div class="abs" style="left:0;right:0;top:230px;display:flex;justify-content:center;gap:90px">
    ${twin('health-en.png', 'health-ar.png', 'Healthcare · the same template in both languages')}
    ${twin('tech-trap-en.png', 'tech-trap-ar.png', 'Software · English terms inside Arabic sentences')}
  </div>`,
};

const framed = (src, title, w, h, imgW, eyebrow, head) => ({
  w,
  h,
  body: `${bg}
  <div class="abs" style="left:0;right:0;top:42px;text-align:center"><div class="eyebrow">${eyebrow}</div><div style="margin-top:10px;font-size:32px;font-weight:700">${head}</div></div>
  ${win(src, imgW, title, `position:absolute;left:${(w - imgW) / 2}px;top:150px`)}`,
});

const pages = {
  cover: [PUBLIC, cover(1920, 1080)],
  hero: [OUT, hero],
  industries: [OUT, industries],
  components: [OUT, components],
  'how-it-works': [OUT, how],
  'ai-integration': [OUT, ai],
  arabic: [OUT, arabic],
  dashboard: [
    OUT,
    framed(
      'dashboard-template.jpg',
      '127.0.0.1:4310 · New episode from a template',
      1600,
      1080,
      1400,
      'Dashboard',
      'Episodes, recordings, templates and renders in one place',
    ),
  ],
  editor: [
    OUT,
    framed(
      'editor.jpg',
      'reelforge edit ep02',
      1600,
      1100,
      1440,
      'Visual editor',
      'Canvas, layers, inspector and a timeline that snaps to your words',
    ),
  ],
};

for (const [name, [dir, p]] of Object.entries(pages)) {
  const html = path.join(work, `${name}.html`);
  writeFileSync(
    html,
    `<!doctype html><html><head><meta charset="utf-8"><style>${css} body{width:${p.w}px;height:${p.h}px}</style></head><body>${p.body}</body></html>`,
  );
  const page = await browser.newPage({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(html).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const file = path.join(dir, `${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
  await page.close();
  console.log(
    `${path.relative(ROOT, file).split(path.sep).join('/')}  ${p.w}×${p.h}  ${Math.round(statSync(file).size / 1024)} KB`,
  );
}
await browser.close();
rmSync(tmp, { recursive: true, force: true });
