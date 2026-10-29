// Builds the offline documentation: documentation/index.html + documentation/assets/, one file that
// opens straight from disk (file://) with every chapter in English and in Arabic and a language switch.
// Sources: the pages of the documentation site (docs/guide, docs/reference, docs/authoring.md and their
// Arabic versions under docs/ar), the same Markdown that `pnpm docs:site` builds, plus CHANGELOG.md
// through the changelog pages. The full site for the dashboard is built by scripts/build-docs-site.mjs.
// Usage: node scripts/build-docs.mjs   (run `pnpm docs:gen` first for fresh reference pages)
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs');
const out = path.join(root, 'documentation');
const REPO_URL = 'https://github.com/TerminalDZ/vidcreat';
const DOCS_URL = 'https://terminaldz.github.io/vidcreat';
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const posix = (p) => p.split(path.sep).join('/');

const PACKS = [
  'healthcare',
  'real-estate',
  'ports-logistics',
  'education',
  'finance',
  'food',
  'retail',
  'government',
  'tourism',
  'manufacturing',
  'events-ngo',
  'tech',
];

/** Chapters in reading order, one source per language; `title` replaces the source's first H1. */
const CHAPTERS = [
  { en: 'docs/guide/introduction.md', ar: 'docs/ar/guide/introduction.md' },
  { en: 'docs/guide/installation.md', ar: 'docs/ar/guide/installation.md' },
  { en: 'docs/guide/quick-start.md', ar: 'docs/ar/guide/quick-start.md' },
  { en: 'docs/guide/templates-and-packs.md', ar: 'docs/ar/guide/templates-and-packs.md' },
  { en: 'docs/guide/tutorials/index.md', ar: 'docs/ar/guide/tutorials/index.md' },
  ...PACKS.map((p) => ({ en: `docs/guide/tutorials/${p}.md`, ar: `docs/ar/guide/tutorials/${p}.md` })),
  { en: 'docs/guide/dashboard.md', ar: 'docs/ar/guide/dashboard.md' },
  { en: 'docs/guide/editor.md', ar: 'docs/ar/guide/editor.md' },
  { en: 'docs/guide/timing.md', ar: 'docs/ar/guide/timing.md' },
  { en: 'docs/authoring.md', ar: 'docs/ar/authoring.md', title: { en: 'Writing episodes' } },
  { en: 'docs/guide/themes.md', ar: 'docs/ar/guide/themes.md' },
  { en: 'docs/guide/rendering.md', ar: 'docs/ar/guide/rendering.md' },
  { en: 'docs/guide/command-line.md', ar: 'docs/ar/guide/command-line.md' },
  { en: 'docs/guide/ai.md', ar: 'docs/ar/guide/ai.md' },
  { en: 'docs/reference/ai-clients.md', ar: 'docs/ar/reference/ai-clients.md' },
  { en: 'docs/reference/mcp-tools.md', ar: 'docs/ar/reference/mcp-tools.md' },
  { en: 'docs/reference/episode-format.md', ar: 'docs/ar/reference/episode-format.md' },
  { en: 'docs/reference/components.md', ar: 'docs/ar/reference/components.md' },
  { en: 'docs/reference/cli.md', ar: 'docs/ar/reference/cli.md' },
  { en: 'docs/reference/packs.md', ar: 'docs/ar/reference/packs.md' },
  { en: 'docs/architecture.md', ar: 'docs/architecture-ar.md' },
  { en: 'docs/guide/adr.md', ar: 'docs/ar/guide/adr.md' },
  { en: 'docs/guide/contributing.md', ar: 'docs/ar/guide/contributing.md' },
  { en: 'docs/guide/faq.md', ar: 'docs/ar/guide/faq.md' },
  { en: 'docs/guide/changelog.md', ar: 'docs/ar/guide/changelog.md' },
  { en: 'docs/guide/license.md', ar: 'docs/ar/guide/license.md' },
];

const LANGS = {
  en: {
    dir: 'ltr',
    title: `ReelForge ${version} — Documentation`,
    ver: `Version ${version} · offline documentation · <a href="${DOCS_URL}/">online</a>`,
    search: 'Search the documentation…',
    contents: 'Contents',
    empty: 'No chapter matches your search.',
  },
  ar: {
    dir: 'rtl',
    title: `توثيق ReelForge ${version}`,
    ver: `الإصدار ${version} · توثيق يعمل دون اتصال · <a href="${DOCS_URL}/ar/">الموقع</a>`,
    search: 'ابحث في التوثيق…',
    contents: 'المحتويات',
    empty: 'لا يوجد فصل يطابق البحث.',
  },
};

/** Site pages that are not in the offline build link to the site; the rest goes to GitHub. */
const SITE_REWRITES = {
  'architecture-ar.md': 'ar/guide/architecture.md',
  'architecture.md': 'guide/architecture.md',
};
const NOT_SITE = /^(PRD\.md|SRS\.md|components\.md|manual\/|screenshots\/)|(^|\/)README\.md$/;

/** VitePress heading slugs, so `page.md#anchor` links written for the site resolve here too. */
const vpSlug = (s) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase();

const slugs = new Set();
/** A document-wide unique id; Arabic ids get an `ar-` prefix so both languages share one page. */
const slug = (text, lang) => {
  const base =
    (lang === 'ar' ? 'ar-' : '') +
    (text
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-z]+;/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-') || 'section');
  let s = base;
  for (let i = 2; slugs.has(s); i++) s = `${base}-${i}`;
  slugs.add(s);
  return s;
};

/** Source text without front matter, with `<!--@include: file{from,to}-->` resolved like VitePress does. */
function load(file) {
  const abs = path.join(root, file);
  if (!existsSync(abs)) throw new Error(`missing chapter: ${file}`);
  const strip = (t) => t.replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '');
  const include = (text, from) =>
    text.replace(/<!--\s*@include:\s*(.*?)\s*-->/g, (_, spec) => {
      const [, p, range] = spec.match(/^(.*?)(?:\{(\d*),(\d*)\})?$/);
      const inc = path.resolve(path.dirname(from), p);
      let body = strip(readFileSync(inc, 'utf8'));
      if (range !== undefined) {
        const [a, b] = spec.match(/\{(\d*),(\d*)\}$/).slice(1);
        const lines = body.split('\n');
        body = lines.slice(a ? Number(a) - 1 : 0, b ? Number(b) : lines.length).join('\n');
      }
      return include(body, inc);
    });
  return include(strip(readFileSync(abs, 'utf8')), abs);
}

/** `{#id}` (VitePress) or a trailing `<a id="id"></a>` (works on GitHub too, e.g. the architecture guides). */
const CUSTOM_ID = /\s*(?:\{#([\w-]+)\}|<a id="([\w-]+)"><\/a>)\s*$/;
const plain = (md) => md.replace(/[`*_]/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

// Pass 1: every heading's id, and a map from the anchors the site uses to those ids.
const chapters = CHAPTERS.flatMap((ch, index) =>
  Object.keys(LANGS).map((lang) => {
    const src = ch[lang];
    let md = load(src);
    if (ch.title?.[lang]) md = md.replace(/^# .*$/m, `# ${ch.title[lang]}`);
    const headings = [];
    const anchors = new Map();
    const walk = (tokens) => {
      for (const t of tokens) {
        if (t.type === 'heading') {
          const m = t.text.match(CUSTOM_ID);
          const custom = m?.[1] ?? m?.[2];
          const text = t.text.replace(CUSTOM_ID, '');
          const html = marked.parseInline(text);
          const id = slug(custom ?? html, lang);
          headings.push({ id, html, depth: t.depth });
          const local = custom ?? vpSlug(plain(text));
          if (!anchors.has(local)) anchors.set(local, id);
        }
        if (t.tokens && t.type !== 'heading') walk(t.tokens);
        if (t.items) walk(t.items);
      }
    };
    walk(marked.lexer(md));
    const id = headings[0]?.id ?? slug(src, lang);
    return { index, lang, src, abs: path.join(root, src), md, headings, anchors, id };
  }),
);
const byFile = new Map(chapters.map((c) => [c.abs, c]));
// The Arabic architecture page is published at ar/guide/architecture (see SITE_REWRITES).
for (const [from, to] of Object.entries(SITE_REWRITES)) {
  const c = byFile.get(path.join(docs, from));
  if (c) byFile.set(path.join(docs, to), c);
}

const assets = new Map();
const asset = (abs) => {
  const rel = posix(path.relative(docs, abs))
    .replace(/^screenshots\//, '')
    .replace(/^public\//, '');
  assets.set(`assets/${rel}`, abs);
  return `assets/${rel}`;
};

/** Pixel size of a PNG or JPEG, so the page reserves the space and anchors land where they should. */
function imageSize(file) {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length - 9; ) {
      if (b[i] !== 0xff) return undefined;
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m))
        return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return undefined;
}

function linkHref(href, ch) {
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
  const [p, frag] = href.split('#');
  if (!p) return `#${ch.anchors.get(frag) ?? frag}`;
  const abs = p.startsWith('/')
    ? path.join(docs, p)
    : path.resolve(path.dirname(ch.abs), decodeURIComponent(p));
  const target =
    byFile.get(abs) ??
    byFile.get(`${abs}.md`) ??
    byFile.get(abs.replace(/\.html$/, '.md')) ??
    byFile.get(path.join(abs, 'index.md'));
  if (target) return `#${(frag && target.anchors.get(frag)) || target.id}`;
  const rel = posix(path.relative(docs, abs));
  const isDir = p.endsWith('/') || (existsSync(abs) && statSync(abs).isDirectory());
  if (!rel.startsWith('..') && !isDir && rel.endsWith('.md') && !NOT_SITE.test(rel)) {
    const page = (SITE_REWRITES[rel] ?? rel).replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '.html');
    return `${DOCS_URL}/${page}${frag ? `#${frag}` : ''}`;
  }
  return `${REPO_URL}/${isDir ? 'tree' : 'blob'}/main/${posix(path.relative(root, abs))}${frag ? `#${frag}` : ''}`;
}

// Pass 2: render each language into its own navigation and sections.
const built = Object.fromEntries(Object.keys(LANGS).map((l) => [l, { nav: [], sections: [] }]));
for (const ch of chapters) {
  const { nav, sections } = built[ch.lang];
  const renderer = new marked.Renderer();
  let n = 0;
  renderer.heading = () => {
    const h = n++;
    const { id, html, depth } = ch.headings[h];
    if (depth === 1) nav.push({ id, title: html, children: [] });
    else if (depth === 2) nav[nav.length - 1]?.children.push({ id, title: html });
    return `<h${depth} id="${id}" data-h="${h}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${html}</h${depth}>\n`;
  };
  renderer.table = function (t) {
    return `<div class="table">${marked.Renderer.prototype.table.call(this, t)}</div>`;
  };
  renderer.link = function (t) {
    return marked.Renderer.prototype.link.call(this, { ...t, href: linkHref(t.href, ch) });
  };
  renderer.image = ({ href, text }) => {
    const abs = href.startsWith('/')
      ? path.join(docs, 'public', href)
      : path.resolve(path.dirname(ch.abs), href);
    if (!existsSync(abs)) throw new Error(`${ch.src}: missing image ${href}`);
    const cls = href.includes('/components/') ? ' class="frame"' : '';
    const size = imageSize(abs);
    const dims = size ? ` width="${size.w}" height="${size.h}"` : '';
    return `<figure><img src="${asset(abs)}" alt="${text}"${cls}${dims} loading="lazy"><figcaption>${text}</figcaption></figure>`;
  };
  const html = marked.parse(ch.md, { renderer, gfm: true });
  sections.push(`<section class="chapter" id="ch-${ch.id}" data-ch="${ch.index}">${html}</section>`);
}

// assets
rmSync(path.join(out, 'index.html'), { force: true });
rmSync(path.join(out, 'assets'), { recursive: true, force: true });
mkdirSync(path.join(out, 'assets'), { recursive: true });
for (const [rel, abs] of [...assets].sort(([a], [b]) => a.localeCompare(b))) {
  mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
  copyFileSync(abs, path.join(out, rel));
}

// The Arabic font is embedded: browsers do not load fonts from file:// URLs next to the page.
const require = createRequire(import.meta.url);
const fontFile = path.join(
  path.dirname(require.resolve('@fontsource-variable/readex-pro/package.json')),
  'files',
  'readex-pro-arabic-wght-normal.woff2',
);
const font = readFileSync(fontFile).toString('base64');
const ARABIC_RANGE =
  'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC';

const navHtml = (nav) =>
  nav
    .map(
      (c) =>
        `<li><a href="#${c.id}">${c.title}</a>${c.children.length ? `<ul>${c.children.map((s) => `<li><a href="#${s.id}">${s.title}</a></li>`).join('')}</ul>` : ''}</li>`,
    )
    .join('');

const docHtml = (lang) => {
  const L = LANGS[lang];
  const { nav, sections } = built[lang];
  return `<div class="doc" id="doc-${lang}" lang="${lang}" dir="${L.dir}"${lang === 'en' ? '' : ' hidden'}>
<aside>
  <div class="top">
    <div class="brand"><i></i>ReelForge</div>
    <div class="switch" role="group" aria-label="Language / اللغة">
      <button type="button" data-lang="en" lang="en" dir="ltr" aria-pressed="${lang === 'en'}">EN</button>
      <button type="button" data-lang="ar" lang="ar" dir="rtl" aria-pressed="${lang === 'ar'}">العربية</button>
    </div>
  </div>
  <p class="ver">${L.ver}</p>
  <input class="q" type="search" placeholder="${L.search}" aria-label="${L.search}">
  <details class="toc" open><summary>${L.contents}</summary><nav><ul>${navHtml(nav)}</ul></nav></details>
</aside>
<main>${sections.join('\n')}<p class="empty" hidden>${L.empty}</p></main>
</div>`;
};

const page = `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${LANGS.en.title}</title>
<style>
@font-face{font-family:'Readex Pro';font-style:normal;font-display:swap;font-weight:160 700;src:url(data:font/woff2;base64,${font}) format('woff2');unicode-range:${ARABIC_RANGE}}
:root{--bg:#07080c;--panel:#0d0f15;--card:#10131b;--line:#222735;--ink:#e8ebf2;--dim:#8a91a3;--lime:#b8ff3c;--cyan:#55dcff;--red:#ff4a5c;--amber:#ffb238;--aside:290px}
*{box-sizing:border-box}html{scroll-padding-top:20px}
body{margin:0;background:var(--bg);color:var(--ink);font:15.5px/1.65 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
[hidden]{display:none!important}
.doc[lang=ar]{font-family:'Readex Pro',system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif}
.doc[lang=ar] p,.doc[lang=ar] li{line-height:1.9}
a{color:var(--cyan);text-decoration:none}a:hover{text-decoration:underline}
aside{position:fixed;inset-block:0;inset-inline-start:0;width:var(--aside);overflow:auto;background:var(--panel);border-inline-end:1px solid var(--line);padding:20px 18px 40px}
.top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:19px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.brand i{width:14px;height:14px;border-radius:4px;background:var(--lime);box-shadow:0 0 14px var(--lime)}
.switch{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden;flex:none}
.switch button{appearance:none;border:0;background:transparent;color:var(--dim);font:600 13px/1 system-ui,sans-serif;padding:7px 10px;cursor:pointer}
.switch button[lang=ar]{font-family:'Readex Pro',system-ui,sans-serif}
.switch button[aria-pressed=true]{background:var(--lime);color:#0a0c10}
.switch button:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}
.ver{color:var(--dim);font-size:12.5px;margin:6px 0 14px}.ver a{display:inline;padding:0;font-size:inherit;color:var(--cyan)}
.q{width:100%;height:36px;border-radius:9px;border:1px solid var(--line);background:#0a0c12;color:var(--ink);padding:0 10px;font:inherit;font-size:14px;margin-bottom:14px}
.toc summary{display:none}
aside ul{list-style:none;margin:0;padding:0}aside nav>ul>li{margin:2px 0}
aside a{display:block;color:#c9cfdb;padding:4px 8px;border-radius:7px;font-size:14px}
aside nav>ul>li>a{font-weight:650;color:var(--ink)}
aside li ul a{padding-inline-start:20px;font-size:13px;color:var(--dim)}
aside a:hover,aside a.on{background:#161a24;text-decoration:none;color:var(--ink)}
main{margin-inline-start:var(--aside);max-width:1040px;padding:34px 56px 120px;overflow-wrap:break-word}main a{overflow-wrap:anywhere}
.chapter{padding-bottom:28px;border-bottom:1px solid var(--line);margin-bottom:36px}
h1{font-size:34px;line-height:1.25;margin:10px 0 18px;letter-spacing:-.01em}
h2{font-size:23px;margin:34px 0 12px}h3{font-size:18px;margin:26px 0 10px}
h1,h2,h3{position:relative}.anchor{position:absolute;inset-inline-start:-22px;color:var(--line);opacity:0}h1:hover .anchor,h2:hover .anchor,h3:hover .anchor{opacity:1}
p,li{color:#d3d8e3}strong{color:#fff}
code{font-family:ui-monospace,'JetBrains Mono',SFMono-Regular,Menlo,Consolas,monospace;font-size:.88em;background:#161a24;border:1px solid var(--line);border-radius:6px;padding:1px 6px}
[dir=rtl] :not(pre)>code{direction:ltr;unicode-bidi:isolate;display:inline-block;max-width:100%;overflow-x:auto;white-space:nowrap;vertical-align:bottom}
pre{background:#0b0d13;border:1px solid var(--line);border-radius:12px;padding:16px 18px;overflow:auto;direction:ltr;text-align:left}pre code{background:none;border:0;padding:0;font-size:13.5px;line-height:1.55}
.table{overflow:auto;margin:14px 0}table{border-collapse:collapse;width:100%;font-size:14px}
th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:start;vertical-align:top}th{color:var(--dim);font-weight:650;font-size:12.5px;text-transform:uppercase;letter-spacing:.06em}
[dir=rtl] th{letter-spacing:0}
blockquote{margin:16px 0;padding:10px 16px;border-inline-start:4px solid var(--amber);background:rgba(255,178,56,.07);border-radius:0 10px 10px 0}blockquote p{margin:4px 0}
[dir=rtl] blockquote{border-radius:10px 0 0 10px}
figure{margin:18px 0}figure img{max-width:100%;height:auto;border-radius:12px;border:1px solid var(--line);display:block}figure img.frame{width:216px}figcaption{color:var(--dim);font-size:13px;margin-top:6px}
.hide{display:none}.empty{color:var(--dim)}
@media (max-width:900px){
  html{scroll-padding-top:150px}
  aside{position:sticky;top:0;z-index:2;width:auto;max-height:100vh;border-inline-end:0;border-bottom:1px solid var(--line);padding:10px 14px}
  .ver{display:none}.q{margin:8px 0 4px;height:34px}
  .toc summary{display:block;cursor:pointer;color:var(--ink);font-weight:650;padding:4px 0}
  .toc[open] nav{max-height:60vh;overflow:auto;padding-top:6px}
  main{margin:0;padding:24px 18px 80px}
  h1{font-size:28px}h2{font-size:21px}
  .anchor{display:none}
}
@media print{aside{display:none}main{margin:0}body{background:#fff;color:#000}.doc[hidden]{display:none}}
</style>
</head>
<body>
${docHtml('en')}
${docHtml('ar')}
<script>
(() => {
  const TITLES = ${JSON.stringify(Object.fromEntries(Object.entries(LANGS).map(([k, v]) => [k, v.title])))};
  const docs = { en: document.getElementById('doc-en'), ar: document.getElementById('doc-ar') };
  const narrow = matchMedia('(max-width: 900px)');
  const arabicFont = document.fonts.load('16px "Readex Pro"', 'ع').catch(() => {});
  let lang = 'en';
  const store = (v) => { try { localStorage.setItem('reelforge-docs-lang', v); } catch {} };
  const stored = () => { try { return localStorage.getItem('reelforge-docs-lang'); } catch { return null; } };

  /** The chapter and heading at the top of the reading area, to find their counterpart. */
  function position() {
    const hs = [...docs[lang].querySelectorAll('h1[id],h2[id],h3[id]')];
    let cur = null;
    for (const h of hs) { if (h.getBoundingClientRect().top <= 160) cur = h; else break; }
    if (!cur) return null;
    return { ch: cur.closest('.chapter').dataset.ch, h: cur.dataset.h };
  }
  function show(next, target) {
    lang = next;
    for (const [k, el] of Object.entries(docs)) el.hidden = k !== next;
    document.documentElement.lang = next;
    document.documentElement.dir = docs[next].dir;
    document.title = TITLES[next];
    for (const b of document.querySelectorAll('.switch button')) b.setAttribute('aria-pressed', String(b.dataset.lang === next));
    if (target) {
      target.scrollIntoView({ behavior: 'instant' });
      history.replaceState(null, '', '#' + target.id);
      // The Arabic font swaps in after the first layout; keep the reader on the same heading.
      arabicFont.then(() => target.scrollIntoView({ behavior: 'instant' }));
    }
    else if (!location.hash) scrollTo(0, 0);
  }
  function switchTo(next) {
    if (next === lang) return;
    const pos = position();
    store(next);
    let target = null;
    if (pos) {
      const ch = docs[next].querySelector('.chapter[data-ch="' + pos.ch + '"]');
      target = (ch && ch.querySelector('[data-h="' + pos.h + '"]')) || ch;
      if (target && target.classList.contains('chapter')) target = target.querySelector('h1') || target;
    }
    show(next, target);
  }
  for (const b of document.querySelectorAll('.switch button')) b.addEventListener('click', () => switchTo(b.dataset.lang));

  // Open on the language of a linked heading, else the last choice.
  const hashEl = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  const start = hashEl ? hashEl.closest('.doc').lang : stored() === 'ar' ? 'ar' : 'en';
  show(start, null);
  if (hashEl) hashEl.scrollIntoView({ behavior: 'instant' });
  addEventListener('hashchange', () => {
    const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    const d = el && el.closest('.doc');
    if (d && d.lang !== lang) { store(d.lang); show(d.lang, el); }
  });

  for (const [k, doc] of Object.entries(docs)) {
    const q = doc.querySelector('.q');
    const secs = [...doc.querySelectorAll('.chapter')];
    const empty = doc.querySelector('.empty');
    q.addEventListener('input', () => {
      const v = q.value.trim().toLowerCase();
      let shown = 0;
      for (const s of secs) { const hit = !v || s.textContent.toLowerCase().includes(v); s.classList.toggle('hide', !hit); shown += hit; }
      empty.hidden = shown > 0;
    });
    const toc = doc.querySelector('.toc');
    const sync = () => { toc.open = !narrow.matches; };
    sync(); narrow.addEventListener('change', sync);
    const links = [...doc.querySelectorAll('aside nav a')];
    links.forEach((a) => a.addEventListener('click', () => { if (narrow.matches) toc.open = false; }));
    const obs = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id));
    }, { rootMargin: '0px 0px -75% 0px' });
    doc.querySelectorAll('h1[id],h2[id]').forEach((h) => obs.observe(h));
  }
})();
</script>
</body>
</html>
`;
writeFileSync(path.join(out, 'index.html'), page);
const count = (l) =>
  `${built[l].nav.length} chapters, ${built[l].nav.reduce((n, c) => n + c.children.length, 0)} sections`;
console.log(`documentation/index.html: en ${count('en')}; ar ${count('ar')}; ${assets.size} images`);
