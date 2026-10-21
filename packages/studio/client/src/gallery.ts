/** Dashboard gallery: components (with golden-frame previews), themes (token previews) and industry packs. */
import { GROUPS } from './component-groups.js';
import { snippetYaml } from './gallery-snippet.js';
import { COMPONENT_ICON, icon } from './icons.js';

interface Component {
  name: string;
  description: string;
  size: { w: number; h: number };
  enter: string;
  layer: 'base' | 'overlay';
  fill: boolean;
  endpoints: string[];
  scene: string | null;
}
interface JsonSchema {
  type?: string | string[];
  description?: string;
  default?: unknown;
  enum?: unknown[];
  const?: unknown;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  minimum?: number;
  maximum?: number;
}
interface Theme {
  name: string;
  source: 'project' | 'builtin';
  mode: 'dark' | 'light';
  colors: Record<string, string>;
  fonts: { display: string; mono: string; arabic: string };
  captions: { active: string; english: string };
  contrast: {
    min: number;
    pass: boolean;
    checks: number;
    failures: { token: string; against: string; ratio: number }[];
  };
  errors: string[];
}
type Lang = 'en' | 'ar';
type Loc = { en: string; ar: string };
interface Pack {
  id: string;
  name: Loc;
  description: Loc;
  theme: string;
  templates: {
    id: string;
    title: Loc;
    description: Loc;
    languages: string[];
    slots: { name: string; label: string; type: string; help?: string }[];
  }[];
}
type Tab = 'components' | 'themes' | 'packs';
const TABS: Tab[] = ['components', 'themes', 'packs'];

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** Descriptions use **accent** and `code` markup. */
const richText = (s: string) => esc(s.replace(/\*\*/g, '')).replace(/`([^`]+)`/g, '<code>$1</code>');

let components: Component[] = [];
let themes: Theme[] | null = null;
let packs: Pack[] | null = null;
let lang: Lang = 'en';
let fontsLoaded = false;

function toast(msg: string, kind: 'ok' | 'err' | '' = ''): void {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 8000 : 3000);
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `${res.status} ${res.statusText}`);
  return data;
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied', 'ok');
  } catch {
    toast('Copy failed: select the text and copy it by hand', 'err');
  }
}

// ------------------------------------------------------------------ tabs
function setTab(t: Tab, focus = false): void {
  for (const id of TABS) {
    const b = $(`#tab-${id}`);
    b.setAttribute('aria-selected', String(id === t));
    b.tabIndex = id === t ? 0 : -1;
    $(`#panel-${id}`).hidden = id !== t;
  }
  if (focus) $(`#tab-${t}`).focus();
  if (location.hash.slice(1) !== t) history.replaceState(null, '', t === 'components' ? '#' : `#${t}`);
  if (t === 'themes') void loadThemes();
  if (t === 'packs') void loadPacks();
}

$('.gtabs').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
  if (b) setTab(b.dataset.tab as Tab);
});
$('.gtabs').addEventListener('keydown', (e) => {
  const current = TABS.findIndex((t) => $(`#tab-${t}`).getAttribute('aria-selected') === 'true');
  const next =
    e.key === 'ArrowRight'
      ? (current + 1) % TABS.length
      : e.key === 'ArrowLeft'
        ? (current + TABS.length - 1) % TABS.length
        : e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? TABS.length - 1
            : -1;
  if (next < 0) return;
  e.preventDefault();
  setTab(TABS[next], true);
});

// ------------------------------------------------------------------ components
function card(c: Component): string {
  const shot = c.scene
    ? `<img src="/gallery/frames/${encodeURIComponent(c.scene)}.png" alt="" loading="lazy" decoding="async" />`
    : '';
  const meta = [
    `${c.size.w}×${c.size.h}`,
    c.fill ? 'fills the stage' : c.endpoints.length ? 'placed by endpoints' : '',
    c.layer === 'overlay' ? 'overlay' : '',
  ].filter(Boolean);
  return `<button class="ccard" data-comp="${esc(c.name)}" aria-haspopup="dialog">
    <span class="shot${c.scene ? '' : ' none'}">${shot}<span class="ph">${icon(COMPONENT_ICON[c.name] ?? 'box', 40)}</span></span>
    <span class="cbody">
      <span class="cname">${icon(COMPONENT_ICON[c.name] ?? 'box', 16)}<b>${esc(c.name)}</b></span>
      <span class="cdesc">${richText(c.description)}</span>
      <span class="chips">${meta.map((m) => `<span class="chip">${esc(m)}</span>`).join('')}</span>
    </span>
  </button>`;
}

function renderComponents(): void {
  const q = $<HTMLInputElement>('#search').value.trim().toLowerCase();
  const grouped = new Set(GROUPS.flatMap(([, names]) => names));
  const groups: [string, string[]][] = [
    ...GROUPS,
    ['Other', components.map((c) => c.name).filter((n) => !grouped.has(n))],
  ];
  let shown = 0;
  const html = groups
    .map(([group, names]) => {
      const items = names
        .map((n) => components.find((c) => c.name === n))
        .filter((c): c is Component => Boolean(c))
        .filter((c) => !q || c.name.includes(q) || c.description.toLowerCase().includes(q));
      if (!items.length) return '';
      shown += items.length;
      return `<section class="cgroup"><div class="section-head"><h2>${esc(group)}</h2><span class="dim">${items.length}</span></div>
        <div class="cgrid">${items.map(card).join('')}</div></section>`;
    })
    .join('');
  $('#components').innerHTML =
    html || `<div class="empty">No component matches “${esc($<HTMLInputElement>('#search').value)}”.</div>`;
  $('#matchCount').textContent = q ? `${shown} of ${components.length}` : `${components.length} components`;
}

// Frames are optional (published installs may not ship them): fall back to the icon.
document.addEventListener(
  'error',
  (e) => {
    const img = e.target as HTMLElement;
    if (img instanceof HTMLImageElement && img.closest('.shot')) {
      img.closest('.shot')!.classList.add('none');
      img.remove();
    }
  },
  true,
);

function typeLabel(s: JsonSchema | undefined): string {
  if (!s) return 'any';
  if (s.enum) {
    const vals = s.enum.map((v) => JSON.stringify(v));
    return vals.length > 6 ? `${vals.slice(0, 6).join(' | ')} … (${vals.length} values)` : vals.join(' | ');
  }
  if (s.const !== undefined) return JSON.stringify(s.const);
  const alts = s.anyOf ?? s.oneOf;
  if (alts) return [...new Set(alts.map(typeLabel))].join(' | ');
  const t = Array.isArray(s.type) ? s.type.join(' | ') : s.type;
  if (t === 'array')
    return `${typeLabel(s.items).includes(' ') ? `(${typeLabel(s.items)})` : typeLabel(s.items)}[]`;
  const range =
    s.minimum !== undefined || s.maximum !== undefined ? ` ${s.minimum ?? ''}–${s.maximum ?? ''}` : '';
  return `${t ?? 'any'}${range}`;
}

function propsOf(s: JsonSchema): { properties: Record<string, JsonSchema>; required: string[] } {
  const parts = [s, ...(s.allOf ?? []), ...(s.anyOf ?? [])];
  return {
    properties: Object.assign({}, ...parts.map((p) => p.properties ?? {})) as Record<string, JsonSchema>,
    required: parts.flatMap((p) => p.required ?? []),
  };
}

function propsTable(schema: JsonSchema): string {
  const { properties, required } = propsOf(schema);
  const described = Object.values(properties).some((p) => p.description);
  const rows = Object.entries(properties).map(([name, p]) => {
    const def = p.default !== undefined ? JSON.stringify(p.default) : '';
    return `<tr><td><code>${esc(name)}</code>${required.includes(name) ? ' <span class="req">required</span>' : ''}</td>
      <td class="type">${esc(typeLabel(p))}</td>
      <td>${def ? `<code>${esc(def.length > 48 ? `${def.slice(0, 47)}…` : def)}</code>` : ''}</td>
      ${described ? `<td class="dim">${esc(p.description ?? '')}</td>` : ''}</tr>`;
  });
  return rows.length
    ? `<div class="tablewrap"><table class="props"><thead><tr><th>Prop</th><th>Type</th><th>Default</th>${described ? '<th>Description</th>' : ''}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
    : '<p class="dim">This component has no props.</p>';
}

async function openComponent(name: string): Promise<void> {
  const c = components.find((x) => x.name === name);
  if (!c) return;
  const dlg = $<HTMLDialogElement>('#compDlg');
  $('#compTitle').innerHTML = `${icon(COMPONENT_ICON[c.name] ?? 'box', 20)}<span>${esc(c.name)}</span>`;
  const yaml = snippetYaml(c);
  $('#compBody').innerHTML = `
    <div class="dgrid">
      ${c.scene ? `<img class="frame" src="/gallery/frames/${encodeURIComponent(c.scene)}.png" alt="Gallery scene “${esc(c.scene)}” showing ${esc(c.name)}" />` : ''}
      <div class="dmain">
        <p>${richText(c.description)}</p>
        <dl class="kv">
          <dt>Default size</dt><dd>${c.size.w} × ${c.size.h}</dd>
          <dt>Layer</dt><dd>${c.layer}${c.fill ? ' · fills the stage' : ''}${c.endpoints.length ? ` · endpoints: ${c.endpoints.map(esc).join(', ')}` : ''}</dd>
          <dt>Enter</dt><dd><code>${esc(c.enter)}</code></dd>
          ${c.scene ? `<dt>Gallery scene</dt><dd><code>${esc(c.scene)}</code></dd>` : ''}
        </dl>
        <div class="snip-head"><h4>YAML snippet</h4><button class="btn sm primary" id="copySnippet">Copy YAML snippet</button></div>
        <div class="code"><pre><code>${esc(yaml)}</code></pre></div>
        <p class="dim small">Paste it under a scene's <code>elements:</code> and change <code>enter.at</code> to the word that names it.</p>
        <h4>Props</h4>
        <div id="propsTable"><p class="dim">Loading…</p></div>
      </div>
    </div>`;
  $('#copySnippet').addEventListener('click', () => void copy(yaml));
  if (!dlg.open) dlg.showModal();
  try {
    const full = await getJson<{ schema: JsonSchema }>(`/api/gallery/components/${encodeURIComponent(name)}`);
    if (dlg.open) $('#propsTable').innerHTML = propsTable(full.schema);
  } catch (e) {
    $('#propsTable').innerHTML = `<p class="err">${esc((e as Error).message)}</p>`;
  }
}

$('#components').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-comp]');
  if (b) void openComponent(b.dataset.comp!);
});
$('#search').addEventListener('input', renderComponents);
$('#search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $<HTMLElement>('#components .ccard')?.click();
});
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('[data-close]')) (t.closest('dialog') as HTMLDialogElement).close();
});
// Click on the backdrop closes the dialog.
$('#compDlg').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) $<HTMLDialogElement>('#compDlg').close();
});

// ------------------------------------------------------------------ themes
const cssColor = (c: string | undefined) =>
  c && /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/-]+\)|[a-z]+)$/i.test(c) ? c : 'transparent';
const cssFont = (f: string) => (/^[\w -]+$/.test(f) ? `'${f}'` : 'system-ui');
const ACCENTS = ['lime', 'cyan', 'red', 'amber', 'violet'];

function themeCard(t: Theme): string {
  const c = t.colors;
  const vars = [
    `--t-bg:${cssColor(c.bg)}`,
    `--t-card:${cssColor(c.card)}`,
    `--t-ink:${cssColor(c.ink)}`,
    `--t-dim:${cssColor(c.dim)}`,
    `--t-line:${cssColor(c.line)}`,
    `--t-accent:${cssColor(c.lime)}`,
    `--t-active:${cssColor(t.captions.active)}`,
    `--t-english:${cssColor(t.captions.english)}`,
    `--t-display:${cssFont(t.fonts.display)}`,
    `--t-mono:${cssFont(t.fonts.mono)}`,
    `--t-arabic:${cssFont(t.fonts.arabic)}`,
  ].join(';');
  const f = t.contrast.failures;
  const contrast = t.contrast.pass
    ? `<span class="chip ok" title="${t.contrast.checks} text/surface pairs checked">✓ AA</span><span class="dim small">min ${t.contrast.min.toFixed(2)}:1</span>`
    : `<span class="chip err" title="${esc(f.map((x) => `${x.token} on ${x.against}: ${x.ratio}:1`).join('\n'))}">✗ ${f.length} below 4.5:1</span><span class="dim small">min ${t.contrast.min.toFixed(2)}:1 (${esc(f[0].token.replace('colors.', ''))} on ${esc(f[0].against)})</span>`;
  return `<article class="tcard" data-theme="${esc(t.name)}">
    <div class="tprev" style="${esc(vars)}" aria-hidden="true">
      <span class="tp-label">01 · ${esc(t.name.toUpperCase())}</span>
      <span class="tp-title">Rate <em>limiting</em></span>
      <span class="tp-card">
        <span class="tp-row"><span class="tp-dot"></span><b>API gateway</b><span class="tp-sub">120 req/s</span></span>
        <span class="tp-ar" lang="ar" dir="rtl">الـ cache بيرد أسرع</span>
      </span>
      <span class="tp-swatches">${ACCENTS.map((a) => `<i style="background:${cssColor(c[a])}" title="${a}"></i>`).join('')}</span>
      <span class="tp-caption">Captions <em class="act">follow</em> the <em class="en">voice</em></span>
    </div>
    <div class="tinfo">
      <div class="tname"><b>${esc(t.name)}</b><span class="chip mode-${t.mode}">${t.mode}</span>${t.source === 'project' ? '<span class="chip">project</span>' : ''}</div>
      <div class="dim small">${esc(t.fonts.display)} · ${esc(t.fonts.mono)} · ${esc(t.fonts.arabic)}</div>
      <div class="tcontrast">${contrast}</div>
      ${t.errors.length ? `<div class="err small">${esc(t.errors[0])}</div>` : ''}
    </div>
  </article>`;
}

async function loadThemes(): Promise<void> {
  if (!fontsLoaded) {
    fontsLoaded = true;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/gallery/fonts/fonts.css';
    document.head.append(link);
  }
  if (themes) return;
  try {
    themes = await getJson<Theme[]>('/api/gallery/themes');
  } catch (e) {
    themes = null;
    $('#themes').innerHTML = `<div class="empty">Themes are unavailable: ${esc((e as Error).message)}</div>`;
    return;
  }
  $('#countThemes').textContent = String(themes.length);
  $('#themes').innerHTML = themes.map(themeCard).join('');
}

// ------------------------------------------------------------------ packs
function renderPacks(): void {
  if (!packs) return;
  const host = $('#packs');
  host.dir = lang === 'ar' ? 'rtl' : 'ltr';
  host.lang = lang;
  const use = lang === 'ar' ? 'استخدم هذا القالب' : 'Use this template';
  host.innerHTML = packs
    .map(
      (p) => `<article class="panel pack" data-pack="${esc(p.id)}">
      <div class="pack-head"><h2>${esc(p.name[lang])}</h2><span class="chip" dir="ltr">${esc(p.id)}</span><span class="chip" dir="ltr">theme: ${esc(p.theme)}</span></div>
      <p class="pack-desc">${esc(p.description[lang])}</p>
      <ul class="tpls">${p.templates
        .map((t) => {
          const l = t.languages.includes(lang) ? lang : (t.languages[0] ?? lang);
          const href = `/?template=${encodeURIComponent(p.id)}/${encodeURIComponent(t.id)}&lang=${l}`;
          return `<li class="tpl" data-template="${esc(t.id)}">
            <div class="tpl-head"><b>${esc(t.title[lang])}</b><span class="langs" dir="ltr">${t.languages.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</span></div>
            <p class="dim small">${esc(t.description[lang])}</p>
            <div class="slots-list" dir="ltr">${t.slots.map((s) => `<span class="chip" title="${esc(s.help ?? s.type)}">${esc(s.label)}</span>`).join('')}</div>
            <a class="btn sm primary" data-use href="${esc(href)}">${use}</a>
          </li>`;
        })
        .join('')}</ul>
    </article>`,
    )
    .join('');
}

async function loadPacks(): Promise<void> {
  if (packs) return;
  try {
    packs = (await getJson<{ packs: Pack[] }>('/api/packs')).packs;
  } catch (e) {
    $('#packs').innerHTML = `<div class="empty">Packs are unavailable: ${esc((e as Error).message)}</div>`;
    return;
  }
  $('#countPacks').textContent = String(packs.length);
  renderPacks();
}

document.querySelector('#panel-packs .segs')!.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-lang]');
  if (!b) return;
  lang = b.dataset.lang === 'ar' ? 'ar' : 'en';
  document.querySelectorAll<HTMLElement>('#panel-packs [data-lang]').forEach((x) => {
    x.classList.toggle('on', x === b);
    x.setAttribute('aria-pressed', String(x === b));
  });
  renderPacks();
});

// ------------------------------------------------------------------ boot
async function boot(): Promise<void> {
  const wanted = location.hash.slice(1) as Tab;
  setTab(TABS.includes(wanted) ? wanted : 'components');
  try {
    components = await getJson<Component[]>('/api/gallery/components');
  } catch (e) {
    toast(`Cannot reach ReelForge: ${(e as Error).message}`, 'err');
    return;
  }
  $('#countComponents').textContent = String(components.length);
  renderComponents();
}
void boot();
