// Regenerates docs/screenshots/* (documentation + marketing). Requires `pnpm build`, ffmpeg and Chromium.
// Usage: node scripts/screenshots.mjs [--only dashboard|editor|episodes|cli]
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { startHub, startStudio } = await import(path.join(ROOT, 'packages/studio/dist/server/index.js'));
const { episodePaths } = await import(path.join(ROOT, 'packages/core/dist/index.js'));
const { launchBrowser } = await import(path.join(ROOT, 'packages/renderer/dist/index.js'));
const OUT = path.join(ROOT, 'docs/screenshots');
mkdirSync(OUT, { recursive: true });
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined;
const want = (k) => !only || only === k;
const CLI = path.join(ROOT, 'packages/cli/bin/reelforge.js');
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name), type: 'jpeg', quality: 88 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Copies an example episode and gives it a synthetic test voice so waveforms are visible. */
function withVoice(src, dest) {
  cpSync(src, dest, { recursive: true, filter: (s) => !s.includes(`${path.sep}out`) });
  const cues = JSON.parse(readFileSync(path.join(dest, 'cues.json'), 'utf8'));
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/make-test-voice.mjs'), path.join(dest, 'voice.wav'), String(cues.audio.duration), Object.values(cues.cues).join(',')]);
  // the synthetic voice now matches the cues: mark them as real ones
  delete cues.draft;
  writeFileSync(path.join(dest, 'cues.json'), JSON.stringify(cues, null, 2));
}

const browser = await launchBrowser();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'rf-shots-'));

if (want('dashboard')) {
  const root = path.join(tmp, 'project');
  cpSync(path.join(ROOT, 'examples'), path.join(root, 'examples'), { recursive: true, filter: (s) => !s.includes(`${path.sep}out`) });
  withVoice(path.join(ROOT, 'examples/season1/ep01'), path.join(root, 'episodes/ep01'));
  withVoice(path.join(ROOT, 'examples/season1/ep03'), path.join(root, 'episodes/ep03'));
  cpSync(path.join(ROOT, 'examples/season1/ep05'), path.join(root, 'episodes/ep05'), { recursive: true, filter: (s) => !s.includes(`${path.sep}out`) });
  rmSync(path.join(root, 'episodes/ep05/cues.json'));
  // a finished render for the outputs row and the player
  execFileSync(process.execPath, [CLI, 'render', path.join(root, 'episodes/ep01'), '--fast', '--from', '0', '--to', '1', '--no-measure', '--root', root]);
  execFileSync(process.execPath, [CLI, 'render', path.join(root, 'episodes/ep03'), '--fast', '--no-measure', '--root', root], { stdio: 'ignore' });
  const hub = await startHub({ root, port: 0 });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(hub.url);
  await page.waitForSelector('.card');
  await page.waitForFunction(() => document.querySelectorAll('.thumb.loading').length === 0, null, { timeout: 120000 });
  await shot(page, '00-dashboard.jpg');
  // validation dialog
  await page.click('.card[data-key="episodes/ep01"] [data-act="validate"]');
  await page.waitForSelector('#issuesDlg[open]');
  await sleep(300);
  await shot(page, '23-dashboard-validate.jpg');
  await page.click('#issuesDlg [data-close]');
  // render dialog + live progress
  await page.click('.card[data-key="episodes/ep01"] [data-act="render"]');
  await page.waitForSelector('#renderDlg[open]');
  await shot(page, '24-dashboard-render-options.jpg');
  await page.click('#renderForm button[value="ok"]');
  await page.waitForFunction(() => /fps/.test(document.querySelector('.card[data-key="episodes/ep01"] .progress')?.textContent ?? ''), null, { timeout: 120000 });
  await sleep(4000);
  await shot(page, '25-dashboard-render-progress.jpg');
  await page.click('.card[data-key="episodes/ep01"] [data-act="cancel"]');
  await sleep(1500);
  // player
  await page.click('.card[data-key="episodes/ep03"] [data-kind="share"]');
  await page.waitForSelector('#playerDlg[open]');
  await page.evaluate(() => {
    const v = document.querySelector('#player');
    v.pause();
    v.currentTime = 12;
  });
  await sleep(1500);
  await shot(page, '26-dashboard-player.jpg');
  await page.close();
  await hub.close();
}

if (want('editor')) {
  const root = path.join(tmp, 'studio');
  const ep = path.join(root, 'ep02');
  withVoice(path.join(ROOT, 'examples/season1/ep02'), ep);
  const st = await startStudio({ paths: episodePaths(ep, root), mode: 'edit', port: 0 });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
  await page.goto(st.url);
  await page.waitForSelector('.trow.el');
  await page.waitForFunction(() => document.querySelector('.tl-wave') && window.reelforgeStudio);
  await sleep(1500);
  const seek = (t) => page.evaluate((x) => window.reelforgeStudio.seek(x), t);
  const selectLayer = async (id) => {
    await page.locator('.trow.el', { hasText: id }).first().click();
    await sleep(500);
  };
  // 01 · overview: an element selected, inspector, timeline
  await selectLayer('lanes');
  await seek(15.5);
  await sleep(700);
  await shot(page, '01-editor-overview.jpg');
  // 02 · dragging with smart guides (released, then undone)
  const box = await page.evaluate(() => {
    const r = [...document.querySelectorAll('#overlay rect')].find((x) => x.getAttribute('stroke') === '#55dcff')?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  });
  if (box) {
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 30, box.y + 12, { steps: 8 });
    await page.mouse.move(box.x + 2, box.y + 0.5, { steps: 8 });
    await sleep(300);
    await shot(page, '02-editor-drag-guides.jpg');
    await page.mouse.up();
    await sleep(900);
    await page.keyboard.press('Control+z');
    await sleep(3800); // let the undo toast fade
  }
  // 03 · retiming a clip on the timeline (badge + snap line), released and undone
  await selectLayer('lost');
  await page.keyboard.press('=');
  await page.keyboard.press('=');
  await sleep(300);
  await page.evaluate(() => {
    const c = document.querySelector('.clip.el.sel');
    c?.scrollIntoView({ inline: 'center', block: 'nearest' });
  });
  await sleep(300);
  const clip = await page.locator('.clip.el.sel').boundingBox();
  if (clip) {
    await page.mouse.move(clip.x + clip.width / 2, clip.y + clip.height / 2);
    await page.mouse.down();
    await page.mouse.move(clip.x + clip.width / 2 - 60, clip.y + clip.height / 2, { steps: 10 });
    await sleep(300);
    await shot(page, '03-editor-timeline.jpg');
    await page.mouse.move(clip.x + clip.width / 2, clip.y + clip.height / 2, { steps: 4 });
    await page.mouse.up();
    await sleep(900);
  }
  // 04 · insert panel
  await page.click('[data-tab="insert"]');
  await sleep(400);
  await shot(page, '04-editor-insert.jpg');
  // 05 · command palette
  await page.keyboard.press('Control+k');
  await page.keyboard.type('ins');
  await sleep(300);
  await shot(page, '05-editor-palette.jpg');
  await page.keyboard.press('Escape');
  // 06 · shortcuts
  await page.keyboard.press('?');
  await sleep(300);
  await shot(page, '06-editor-shortcuts.jpg');
  await page.keyboard.press('Escape');
  // 07 · cues mode
  await page.keyboard.press('Alt+2');
  await seek(9.2);
  await sleep(600);
  await shot(page, '07-editor-cues.jpg');
  // 08 · word mode
  await page.locator('#lines li[data-id="l3"]').click();
  await page.keyboard.press('w');
  await sleep(300);
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await sleep(500);
  await shot(page, '08-editor-cues-word-mode.jpg');
  await page.keyboard.press('Escape');
  // 10 · YAML error banner
  await page.keyboard.press('Alt+1');
  const y = path.join(ep, 'episode.yaml');
  const orig = readFileSync(y, 'utf8');
  writeFileSync(y, orig.replace(/\n {2}- id: (\w+)\n {4}at:/, '\n  - id: $1\n    att:'));
  await sleep(1500);
  await shot(page, '10-editor-yaml-error.jpg');
  writeFileSync(y, orig);
  await sleep(1500);
  // 11 · script tab + line inspector
  await page.click('[data-tab="script"]');
  await sleep(300);
  await page.locator('.script-list li').nth(6).locator('.lhead').click();
  await sleep(700);
  await shot(page, '11-editor-script.jpg');
  await page.click('[data-tab="layers"]');
  // 12 · render dialog
  await page.click('#renderBtn');
  await sleep(400);
  await shot(page, '12-editor-render.jpg');
  await page.keyboard.press('Escape');
  await page.close();
  await st.close();
  // 09 · review mode on a seeded overlap bug
  const lint = path.join(tmp, 'lint', 'v08');
  cpSync(path.join(ROOT, 'fixtures/lint/v08-overlap'), lint, { recursive: true });
  const st2 = await startStudio({ paths: episodePaths(lint, path.join(tmp, 'lint')), mode: 'dev', port: 0 });
  const p2 = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
  await p2.goto(st2.url);
  await p2.waitForSelector('#issues li');
  await sleep(1500);
  await p2.keyboard.press('e');
  await p2.locator('#issues li', { hasText: 'V-8' }).first().click();
  await p2.evaluate(() => window.reelforgeStudio.seek(1.5));
  await sleep(600);
  await shot(p2, '09-editor-review.jpg');
  await p2.close();
  await st2.close();
}

if (want('episodes')) {
  const sheet = (src, name, args) => {
    const dir = path.join(tmp, 'snaps', name);
    execFileSync(process.execPath, [CLI, 'snap', src, ...args, '--out', dir, '--json'], { stdio: 'ignore' });
    const file = execFileSync('sh', ['-c', `ls "${dir}"/*.snap-sheet.jpg`]).toString().trim();
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-q:v', '4', path.join(OUT, name)]);
  };
  sheet(path.join(ROOT, 'fixtures/golden/components'), '13-component-gallery.jpg', ['2.8', '5.8', '8.8', '11.8', '14.8', '17.8', '20.8', '23.8', '26.8', '29.8', '32.8', '35.8', '38.8']);
  for (let i = 1; i <= 9; i++) sheet(path.join(ROOT, `examples/season1/ep0${i}`), `episode-ep0${i}.jpg`, ['--every', '6']);
  for (const i of [1, 2]) sheet(path.join(ROOT, `examples/season1-arabic/ep0${i}`), `episode-arabic-ep0${i}.jpg`, ['--every', '6']);
}

if (want('cli')) {
  const run = (args) => {
    try {
      return execFileSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }
  };
  const runAll = (args) => {
    const r = execFileSync('sh', ['-c', `NO_COLOR=1 node "${CLI}" ${args} 2>&1 || true`], { cwd: ROOT, encoding: 'utf8' });
    return r;
  };
  const blocks = {
    '19-cli-help': `$ reelforge --help\n${run(['--help'])}`,
    '20-cli-doctor': `$ reelforge doctor\n${runAll('doctor')}`,
    '21-cli-validate': `$ reelforge validate examples/season1/ep04\n${runAll('validate examples/season1/ep04')}\n$ reelforge validate fixtures/lint/v01-unknown-key\n${runAll('validate fixtures/lint/v01-unknown-key --no-measure')}\n$ reelforge validate fixtures/lint/v08-overlap\n${runAll('validate fixtures/lint/v08-overlap --no-measure')}`,
  };
  const mcpTools = execFileSync('sh', ['-c', `printf '%s\\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node "${CLI}" mcp 2>/dev/null`], { cwd: ROOT, encoding: 'utf8' });
  const list = JSON.parse(mcpTools.trim().split('\n')[1]).result.tools;
  blocks['27-cli-mcp'] = `$ reelforge mcp   # started by your AI assistant\n${list.map((t) => `✓ ${t.name.padEnd(22)} ${t.title}`).join('\n')}`;
  const mini = path.join(tmp, 'cli', 'mini');
  cpSync(path.join(ROOT, 'fixtures/mini'), mini, { recursive: true, filter: (s) => !s.includes(`${path.sep}out`) });
  blocks['22-cli-render'] = `$ reelforge render mini --workers 3\n${execFileSync('sh', ['-c', `NO_COLOR=1 node "${CLI}" render "${mini}" --workers 3 2>&1 | grep -v '…$'`], { encoding: 'utf8' }).replaceAll(path.dirname(mini) + '/', '')}`;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const color = (line) => {
    let l = esc(line);
    if (l.startsWith('$ ')) return `<span class="p">$</span> <b>${l.slice(2)}</b>`;
    return l
      .replace(/(✓)/g, '<span class="g">$1</span>')
      .replace(/(✗)/g, '<span class="r">$1</span>')
      .replace(/\b(error)\b/g, '<span class="r">$1</span>')
      .replace(/\b(warn)\b/g, '<span class="y">$1</span>')
      .replace(/^(\s+→ .*)$/g, '<span class="d">$1</span>')
      .replace(/^(\S+\.yaml:\d+:\d+)/, '<span class="w">$1</span>');
  };
  for (const [name, text] of Object.entries(blocks)) {
    const clean = text.replaceAll(ROOT + '/', '').replaceAll(tmp, '/tmp').trimEnd();
    const html = `<html><head><style>body{margin:0;background:#0b0d12;padding:28px;font:15px/1.55 ui-monospace,monospace;color:#d8dde8}
    .win{background:#10131b;border:1px solid #222735;border-radius:12px;overflow:hidden;width:1180px}
    .bar{height:34px;display:flex;align-items:center;gap:8px;padding:0 14px;background:#161a24;border-bottom:1px solid #222735}
    .bar i{width:12px;height:12px;border-radius:50%;background:#ff4a5c}.bar i+i{background:#ffb238}.bar i+i+i{background:#b8ff3c}.bar span{margin-left:10px;color:#7d8496;font-size:13px}
    pre{margin:0;padding:18px 20px;white-space:pre-wrap;font:inherit}.p,.g{color:#b8ff3c}.r{color:#ff4a5c}.y{color:#ffb238}.d{color:#7d8496}.w{color:#eef1f7;font-weight:700}b{color:#fff}</style></head>
    <body><div class="win"><div class="bar"><i></i><i></i><i></i><span>reelforge — terminal</span></div><pre>${clean.split('\n').map(color).join('\n')}</pre></div></body></html>`;
    const page = await browser.newPage({ viewport: { width: 1240, height: 400 } });
    await page.setContent(html);
    await (await page.$('.win')).screenshot({ path: path.join(OUT, `${name}.png`) });
    await page.close();
  }
}

await browser.close();
rmSync(tmp, { recursive: true, force: true });
console.log('screenshots written to docs/screenshots');
