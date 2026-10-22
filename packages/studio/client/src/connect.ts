/** Connect AI page: copy-paste setup for every client, generated from connect-clients.ts. */
import { CLIENTS, type ClientDef, type ConnectConfig } from './connect-clients.js';

interface ConnectInfo {
  version: string;
  root: string;
  mcpUrl: string;
  apiUrl: string;
  openapiUrl: string;
  cardUrl: string;
  stdio: { command: string; args: string[] };
  tokenRequired: boolean;
  token?: string;
  tokenFile?: string;
  skills: { name: string; description: string }[];
  skillsDir: string | null;
  llms: boolean;
  llmsFull: boolean;
}

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

let info: ConnectInfo;
let current = CLIENTS[0].id;
let variant: 'stdio' | 'http' = 'stdio';
let tokenShown = false;

function toast(msg: string, kind: 'ok' | 'err' | '' = ''): void {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 8000 : 3000);
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied', 'ok');
  } catch {
    toast('Copy failed: select the text and copy it by hand', 'err');
  }
}

const authHeaders = (): Record<string, string> =>
  info.tokenRequired && info.token ? { authorization: `Bearer ${info.token}` } : {};

function config(): ConnectConfig {
  const sets = $<HTMLSelectElement>('#toolsets').value;
  const filtered = sets !== 'all';
  return {
    command: info.stdio.command,
    args: [...info.stdio.args, ...(filtered ? ['--toolsets', sets] : [])],
    url: filtered ? `${info.mcpUrl}?toolsets=${sets}` : info.mcpUrl,
    apiUrl: info.apiUrl,
    openapiUrl: filtered ? `${info.openapiUrl}?toolsets=${sets}` : info.openapiUrl,
    token: info.tokenRequired ? (info.token ?? '<token>') : undefined,
  };
}

const row = (k: string, v: string, copyable = true) =>
  `<dt>${esc(k)}</dt><dd><code>${esc(v)}</code>${copyable ? `<button class="btn sm ghost" data-copy="${esc(v)}" aria-label="Copy ${esc(k)}">Copy</button>` : ''}</dd>`;

function renderEndpoints(): void {
  const token = !info.tokenRequired
    ? `<dt>Token</dt><dd><span class="dim">Not required: the server listens on this computer only. Set REELFORGE_REQUIRE_TOKEN=1 to require one.</span></dd>`
    : info.token
      ? `<dt>Token</dt><dd><code class="secret">${esc(tokenShown ? info.token : '•'.repeat(24))}</code><button class="btn sm ghost" id="revealBtn">${tokenShown ? 'Hide' : 'Show'}</button><button class="btn sm ghost" data-copy="${esc(info.token)}" aria-label="Copy token">Copy</button><span class="dim small block">Required on /mcp and /api/v1 as <code>Authorization: Bearer …</code>. Stored in ${esc(info.tokenFile ?? '')}</span></dd>`
      : `<dt>Token</dt><dd><span class="dim">Required. Read it from ${esc(info.tokenFile ?? 'the token file')} on the computer running ReelForge.</span></dd>`;
  $('#kv').innerHTML = [
    row('MCP (HTTP)', info.mcpUrl),
    row('REST API', info.apiUrl),
    row('OpenAPI', info.openapiUrl),
    row('Server card', info.cardUrl),
    row('MCP (stdio)', [info.stdio.command, ...info.stdio.args].join(' ')),
    token,
  ].join('');
}

function renderClients(): void {
  $('#clients').innerHTML = CLIENTS.map(
    (c) =>
      `<button role="tab" class="client${c.id === current ? ' on' : ''}" data-client="${c.id}" aria-selected="${c.id === current}">${esc(c.name)}</button>`,
  ).join('');
}

function renderRecipe(): void {
  const c: ClientDef = CLIENTS.find((x) => x.id === current)!;
  if (!c[variant]) variant = c.stdio ? 'stdio' : 'http';
  const r = c[variant]!;
  const code = r.code(config());
  const tabs = (['stdio', 'http'] as const)
    .map((v) => {
      const label = v === 'stdio' ? 'stdio' : c.id === 'openai' ? 'REST / OpenAPI' : 'HTTP';
      return c[v]
        ? `<button class="seg${v === variant ? ' on' : ''}" data-variant="${v}" aria-pressed="${v === variant}">${label}</button>`
        : '';
    })
    .join('');
  $('#recipe').innerHTML = `
    <div class="recipe-head">
      <div class="segs">${tabs}</div>
      ${c.docs ? `<a href="${esc(c.docs)}" target="_blank" rel="noopener noreferrer" class="small">${esc(c.name)} docs ↗</a>` : ''}
    </div>
    <p class="where"><span class="dim">Where:</span> ${esc(r.where)}</p>
    <div class="code"><pre><code>${esc(code)}</code></pre><button class="btn sm" data-copy-code>Copy</button></div>
    ${r.note ? `<p class="dim small">${esc(r.note)}</p>` : ''}
    ${variant === 'http' && c.id !== 'openai' ? '<p class="dim small">HTTP works while <code>reelforge studio</code> is running.</p>' : ''}
    ${c.limits ? `<p class="dim small">${esc(c.limits)}</p>` : ''}`;
  $('#recipe').dataset.code = code;
}

function renderGuides(): void {
  const skills = info.skills.length
    ? `<ul class="skills">${info.skills.map((s) => `<li><b>${esc(s.name)}</b><span class="dim">${esc(s.description)}</span></li>`).join('')}</ul>
       <p class="dim small">Folder: <code>${esc(info.skillsDir ?? '')}</code>. Models read them with the <code>get_guide</code> tool; clients that support Agent Skills can load the folder directly.</p>`
    : `<p class="dim">No skills/ folder yet. Models can call <code>get_guide</code> once it exists; until then they read AGENTS.md (the <code>reelforge://docs/ai-agents</code> resource).</p>`;
  const links = [
    info.llms ? '<a href="/llms.txt" target="_blank" rel="noopener">/llms.txt</a>' : '',
    info.llmsFull ? '<a href="/llms-full.txt" target="_blank" rel="noopener">/llms-full.txt</a>' : '',
    '<a href="/.well-known/mcp.json" target="_blank" rel="noopener">/.well-known/mcp.json</a>',
  ].filter(Boolean);
  $('#guides').innerHTML = `${skills}<p class="links">${links.join('<span class="dim"> · </span>')}</p>`;
}

async function test(): Promise<void> {
  const out = $('#testOut');
  out.className = 'test';
  out.textContent = 'Testing…';
  try {
    const h = await fetch('/api/v1/health', { headers: authHeaders() });
    if (!h.ok)
      throw new Error(
        `health: ${h.status} ${((await h.json().catch(() => ({}))) as { error?: string }).error ?? ''}`,
      );
    const t = await fetch('/api/v1/tools', { headers: authHeaders() });
    if (!t.ok) throw new Error(`tools: ${t.status}`);
    const tools = ((await t.json()) as { tools: { name: string }[] }).tools;
    out.className = 'test ok';
    out.textContent = `Connected: ReelForge ${info.version}, ${tools.length} tools (${tools
      .slice(0, 4)
      .map((x) => x.name)
      .join(', ')}, …).`;
  } catch (e) {
    out.className = 'test err';
    out.textContent = `Failed: ${(e as Error).message}`;
  }
}

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const copyBtn = t.closest<HTMLElement>('[data-copy]');
  if (copyBtn) return void copy(copyBtn.dataset.copy!);
  if (t.closest('[data-copy-code]')) return void copy($('#recipe').dataset.code ?? '');
  const client = t.closest<HTMLElement>('[data-client]');
  if (client) {
    current = client.dataset.client!;
    renderClients();
    renderRecipe();
    return;
  }
  const v = t.closest<HTMLElement>('[data-variant]');
  if (v) {
    variant = v.dataset.variant as 'stdio' | 'http';
    renderRecipe();
    return;
  }
  if (t.id === 'revealBtn') {
    tokenShown = !tokenShown;
    renderEndpoints();
  }
});
$('#toolsets').addEventListener('change', renderRecipe);
$('#testBtn').addEventListener('click', () => void test());

async function boot(): Promise<void> {
  try {
    const res = await fetch('/api/connect');
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    info = (await res.json()) as ConnectInfo;
  } catch (e) {
    toast(`Cannot reach ReelForge: ${(e as Error).message}`, 'err');
    return;
  }
  $('#version').textContent = `v${info.version}`;
  const wanted = location.hash.slice(1);
  if (CLIENTS.some((c) => c.id === wanted)) current = wanted;
  renderEndpoints();
  renderClients();
  renderRecipe();
  renderGuides();
}
void boot();
