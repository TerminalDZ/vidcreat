// Builds the offline buyer documentation: documentation/index.html + documentation/assets/.
// Sources: docs/manual/*.md, docs/authoring.md, docs/components.md, CHANGELOG.md, docs/screenshots/*.
// Usage: node scripts/build-docs.mjs
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'documentation');
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const manual = (n) => `docs/manual/${n}`;

/** Chapters in reading order; `title` replaces the source's first H1. */
const CHAPTERS = [
  { src: manual('01-introduction.md') },
  { src: manual('02-installation.md') },
  { src: manual('03-quick-start.md') },
  { src: manual('04-dashboard.md') },
  { src: manual('05-recording-and-cues.md') },
  { src: manual('06-editor.md') },
  { src: 'docs/authoring.md', title: 'Writing episodes' },
  { src: 'docs/components.md', title: 'Component reference' },
  { src: manual('09-themes-presets.md') },
  { src: manual('10-rendering.md') },
  { src: manual('11-cli.md') },
  { src: manual('15-ai-agents.md') },
  { src: manual('12-troubleshooting.md') },
  { src: 'CHANGELOG.md', title: 'Changelog' },
  { src: manual('14-license.md') },
];

const slugs = new Set();
const slug = (text) => {
  const base =
    text
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-z]+;/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-') || 'section';
  let s = base;
  for (let i = 2; slugs.has(s); i++) s = `${base}-${i}`;
  slugs.add(s);
  return s;
};

const nav = [];
const sections = [];
for (const ch of CHAPTERS) {
  let md = read(ch.src);
  if (ch.title) md = md.replace(/^# .*$/m, `# ${ch.title}`);
  // links between the source markdown files become in-page anchors
  md = md
    .replace(/\]\((?:\.\.\/)?(?:docs\/)?components\.md\)/g, '](#component-reference)')
    .replace(/\]\((?:\.\.\/)?(?:docs\/)?authoring\.md\)/g, '](#writing-episodes)')
    .replace(/\]\(docs\/adr\)/g, '](#)');
  const renderer = new marked.Renderer();
  let chapterId = '';
  renderer.heading = ({ tokens, depth }) => {
    const html = marked.Parser.parseInline(tokens);
    const id = slug(html);
    if (depth === 1) {
      chapterId = id;
      nav.push({ id, title: html, children: [] });
    } else if (depth === 2) nav[nav.length - 1]?.children.push({ id, title: html });
    return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${html}</h${depth}>\n`;
  };
  renderer.table = function (t) {
    return `<div class="table">${marked.Renderer.prototype.table.call(this, t)}</div>`;
  };
  renderer.image = ({ href, text }) => `<figure><img src="${href}" alt="${text}" loading="lazy"><figcaption>${text}</figcaption></figure>`;
  const html = marked.parse(md, { renderer, gfm: true });
  sections.push(`<section class="chapter" id="ch-${chapterId}">${html}</section>`);
}

// assets
rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, 'assets'), { recursive: true });
const shots = path.join(root, 'docs/screenshots');
for (const f of readdirSync(shots)) if (/\.(png|jpe?g)$/i.test(f)) copyFileSync(path.join(shots, f), path.join(out, 'assets', f));
const missing = [...sections.join('').matchAll(/src="(assets\/[^"]+)"/g)].map((m) => m[1]).filter((p) => !existsSync(path.join(out, p)));
if (missing.length) throw new Error(`missing images: ${missing.join(', ')}`);

const navHtml = nav
  .map(
    (c) =>
      `<li><a href="#${c.id}">${c.title}</a>${c.children.length ? `<ul>${c.children.map((s) => `<li><a href="#${s.id}">${s.title}</a></li>`).join('')}</ul>` : ''}</li>`,
  )
  .join('');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ReelForge ${version} — Documentation</title>
<style>
:root{--bg:#07080c;--panel:#0d0f15;--card:#10131b;--line:#222735;--ink:#e8ebf2;--dim:#8a91a3;--lime:#b8ff3c;--cyan:#55dcff;--red:#ff4a5c;--amber:#ffb238}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:20px}
body{margin:0;background:var(--bg);color:var(--ink);font:15.5px/1.65 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
a{color:var(--cyan);text-decoration:none}a:hover{text-decoration:underline}
aside{position:fixed;inset:0 auto 0 0;width:290px;overflow:auto;background:var(--panel);border-right:1px solid var(--line);padding:22px 18px 40px}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:19px;margin-bottom:4px}
.brand i{width:14px;height:14px;border-radius:4px;background:var(--lime);box-shadow:0 0 14px var(--lime)}
.ver{color:var(--dim);font-size:12.5px;margin:0 0 16px}
#q{width:100%;height:36px;border-radius:9px;border:1px solid var(--line);background:#0a0c12;color:var(--ink);padding:0 10px;font:inherit;font-size:14px;margin-bottom:14px}
aside ul{list-style:none;margin:0;padding:0}aside>nav>ul>li{margin:2px 0}
aside a{display:block;color:#c9cfdb;padding:4px 8px;border-radius:7px;font-size:14px}
aside>nav>ul>li>a{font-weight:650;color:var(--ink)}
aside li ul a{padding-left:20px;font-size:13px;color:var(--dim)}
aside a:hover,aside a.on{background:#161a24;text-decoration:none;color:var(--ink)}
main{margin-left:290px;max-width:1040px;padding:34px 56px 120px}
.chapter{padding-bottom:28px;border-bottom:1px solid var(--line);margin-bottom:36px}
h1{font-size:34px;line-height:1.2;margin:10px 0 18px;letter-spacing:-.01em}
h2{font-size:23px;margin:34px 0 12px}h3{font-size:18px;margin:26px 0 10px}
h1,h2,h3{position:relative}.anchor{position:absolute;left:-22px;color:var(--line);opacity:0}h1:hover .anchor,h2:hover .anchor,h3:hover .anchor{opacity:1}
p,li{color:#d3d8e3}strong{color:#fff}
code{font-family:ui-monospace,'JetBrains Mono',SFMono-Regular,Menlo,Consolas,monospace;font-size:.88em;background:#161a24;border:1px solid var(--line);border-radius:6px;padding:1px 6px}
pre{background:#0b0d13;border:1px solid var(--line);border-radius:12px;padding:16px 18px;overflow:auto}pre code{background:none;border:0;padding:0;font-size:13.5px;line-height:1.55}
.table{overflow:auto;margin:14px 0}table{border-collapse:collapse;width:100%;font-size:14px}
th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}th{color:var(--dim);font-weight:650;font-size:12.5px;text-transform:uppercase;letter-spacing:.06em}
blockquote{margin:16px 0;padding:10px 16px;border-left:4px solid var(--amber);background:rgba(255,178,56,.07);border-radius:0 10px 10px 0}blockquote p{margin:4px 0}
figure{margin:18px 0}figure img{max-width:100%;border-radius:12px;border:1px solid var(--line);display:block}figcaption{color:var(--dim);font-size:13px;margin-top:6px}
.hide{display:none}
@media (max-width:900px){aside{position:static;width:auto;border-right:0;border-bottom:1px solid var(--line)}main{margin:0;padding:24px 18px 80px}}
@media print{aside{display:none}main{margin:0}body{background:#fff;color:#000}}
</style>
</head>
<body>
<aside>
  <div class="brand"><i></i>ReelForge</div>
  <p class="ver">Version ${version} · offline documentation</p>
  <input id="q" type="search" placeholder="Search the documentation…" aria-label="Search">
  <nav><ul>${navHtml}</ul></nav>
</aside>
<main>${sections.join('\n')}</main>
<script>
const q=document.getElementById('q');const secs=[...document.querySelectorAll('.chapter')];
q.addEventListener('input',()=>{const v=q.value.trim().toLowerCase();secs.forEach(s=>s.classList.toggle('hide',v&&!s.textContent.toLowerCase().includes(v)));});
const links=[...document.querySelectorAll('aside a')];const obs=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){links.forEach(a=>a.classList.toggle('on',a.getAttribute('href')==='#'+e.target.id));}})},{rootMargin:'0px 0px -75% 0px'});
document.querySelectorAll('h1[id],h2[id]').forEach(h=>obs.observe(h));
</script>
</body>
</html>
`;
writeFileSync(path.join(out, 'index.html'), page);
console.log(`documentation/index.html: ${nav.length} chapters, ${nav.reduce((n, c) => n + c.children.length, 0)} sections`);
