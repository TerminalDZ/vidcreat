/** ReelForge project dashboard: every episode at a glance, with the whole workflow one click away. */

interface OutputFile {
  kind: 'master' | 'share' | 'part' | 'sheet' | 'srt' | 'publish' | 'cover';
  file: string;
  size: number;
  mtime: number;
}
interface Episode {
  key: string;
  group: 'episodes' | 'examples';
  id: string;
  title: string;
  series: string;
  episode: number;
  preset: string;
  lines: number;
  scenes: number;
  duration: number;
  cues: { marked: number; draft: boolean } | null;
  voice: { file: string; duration: number } | null;
  issues: { errors: number; warnings: number; first?: string };
  outputs: OutputFile[];
  updated: number;
}
interface Job {
  id: number;
  key: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  phase: string;
  done: number;
  total: number;
  fps?: number;
  eta?: number;
  message?: string;
  issues?: { rule: string; message: string }[];
}
interface Project {
  root: string;
  name: string;
  version: string;
  presets: string[];
  docs: boolean;
  episodes: Episode[];
  job: Job | null;
}
interface Issue {
  rule: string;
  level: 'error' | 'warn' | 'info';
  message: string;
  hint?: string;
  file?: string;
  line?: number;
  col?: number;
  time?: number;
}

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
let project: Project | null = null;
let job: Job | null = null;
const thumbVersion = new Map<string, number>();

// ------------------------------------------------------------------ helpers
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmtDur = (s: number) =>
  s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '—';
const fmtSize = (b: number) =>
  b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
const PHASES: Record<string, string> = {
  validate: 'Validating',
  frames: 'Rendering frames',
  concat: 'Joining segments',
  audio: 'Mastering audio',
  master: 'Encoding master',
  share: 'Encoding share file',
  extras: 'Captions & sheet',
  done: 'Done',
};

function toast(msg: string, kind: 'ok' | 'err' | '' = ''): void {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 8000 : 4000);
}

async function api<T = unknown>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined && method === 'POST' ? 'GET' : method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `${res.status} ${res.statusText}`);
  return data;
}

const fileUrl = (ep: Episode, f: string) =>
  `/files?ep=${encodeURIComponent(ep.key)}&f=${encodeURIComponent(f)}`;

// ------------------------------------------------------------------ rendering
async function refresh(): Promise<void> {
  try {
    project = await api<Project>('/api/project');
  } catch (e) {
    toast(`Cannot reach ReelForge: ${(e as Error).message}`, 'err');
    return;
  }
  job = project.job ?? job;
  $('#version').textContent = `v${project.version}`;
  $('#project').textContent = project.root;
  $('#docsLink').hidden = !project.docs;
  const mine = project.episodes.filter((e) => e.group === 'episodes');
  const ex = project.episodes.filter((e) => e.group === 'examples');
  $('#hero').hidden = mine.length > 0;
  $('#countMine').textContent = mine.length ? `${mine.length} episode${mine.length === 1 ? '' : 's'}` : '';
  renderGrid($('#mine'), mine, 'No episodes yet. Create one to get started.');
  $('#examplesHead').hidden = ex.length === 0;
  renderGrid($('#examples'), ex, '');
  const sel = $<HTMLSelectElement>('#presetSel');
  if (!sel.options.length)
    sel.innerHTML = project.presets.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
}

function renderGrid(host: HTMLElement, eps: Episode[], empty: string): void {
  if (!eps.length) {
    host.innerHTML = empty ? `<div class="empty">${esc(empty)}</div>` : '';
    return;
  }
  const existing = new Map([...host.querySelectorAll<HTMLElement>('.card')].map((c) => [c.dataset.key!, c]));
  host.replaceChildren(
    ...eps.map((ep) => {
      const card = existing.get(ep.key) ?? document.createElement('article');
      fillCard(card, ep);
      return card;
    }),
  );
}

function fillCard(card: HTMLElement, ep: Episode): void {
  card.className = 'card';
  card.dataset.key = ep.key;
  const total = ep.lines;
  const marked = ep.cues?.marked ?? 0;
  const cueChip = !ep.cues
    ? `<span class="chip warn" title="Mark when each sentence starts">no cues</span>`
    : ep.cues.draft
      ? `<span class="chip warn" title="Estimated cues: mark real ones after recording">draft cues</span>`
      : `<span class="chip ${marked >= total ? 'ok' : 'warn'}">cues ${marked}/${total}</span>`;
  const voiceChip = ep.voice
    ? `<span class="chip ok" title="${esc(ep.voice.file)}">voice ${fmtDur(ep.voice.duration)}</span>`
    : `<span class="chip warn">no voice</span>`;
  const issueChip = ep.issues.errors
    ? `<span class="chip err" title="${esc(ep.issues.first ?? '')}">${ep.issues.errors} error${ep.issues.errors > 1 ? 's' : ''}</span>`
    : ep.issues.warnings
      ? `<span class="chip warn">${ep.issues.warnings} warning${ep.issues.warnings > 1 ? 's' : ''}</span>`
      : `<span class="chip ok">valid</span>`;
  const outs = ep.outputs
    .map((o) => {
      const label = {
        master: 'Master',
        share: 'Share',
        part: 'Part',
        sheet: 'Contact sheet',
        srt: 'Captions',
        publish: 'publish.md',
        cover: 'Cover',
      }[o.kind];
      return `<a data-out="${esc(o.file)}" data-kind="${o.kind}" title="${fmtSize(o.size)}">${label}</a>`;
    })
    .join('');
  const v = thumbVersion.get(ep.key) ?? ep.updated;
  const running = job && job.key === ep.key && job.status === 'running';
  card.innerHTML = `
    <div class="thumb loading" style="background-image:url('/api/thumb?ep=${encodeURIComponent(ep.key)}&v=${v}')"></div>
    <div class="body">
      <div class="title"><b dir="auto">${esc(ep.title)}</b><span class="id mono">${esc(ep.id)}</span></div>
      <div class="meta">${esc(ep.series || 'No series')} · EP ${ep.episode} · ${esc(ep.preset)} · ${ep.lines} lines · ${ep.scenes} scenes · ${fmtDur(ep.duration)}</div>
      <div class="chips">${voiceChip}${cueChip}${issueChip}</div>
      ${outs ? `<div class="outputs">${outs}</div>` : ''}
      <div class="job"></div>
      <div class="actions-row">
        <button class="btn sm" data-act="voice" title="Upload or replace the voice recording">Upload voice</button>
        <button class="btn sm" data-act="cue" title="Open the cue marker">Mark cues</button>
        <button class="btn sm" data-act="dev" title="Live preview with hot reload">Preview</button>
        <button class="btn sm" data-act="validate">Validate</button>
        <button class="btn sm primary" data-act="render" ${running ? 'disabled' : ''}>Render</button>
        <button class="btn sm ghost" data-act="folder" title="Open the episode folder">Folder</button>
      </div>
    </div>`;
  const thumb = card.querySelector<HTMLElement>('.thumb')!;
  const img = new Image();
  img.onload = img.onerror = () => thumb.classList.remove('loading');
  img.src = `/api/thumb?ep=${encodeURIComponent(ep.key)}&v=${v}`;
  if (!ep.cues && ep.lines) {
    const b = document.createElement('button');
    b.className = 'btn sm ghost';
    b.dataset.act = 'draft';
    b.title = 'Estimate cues from the text so you can preview before recording';
    b.textContent = 'Draft cues';
    card.querySelector('.actions-row')!.append(b);
  }
  paintJob(card);
}

function paintJob(card: HTMLElement): void {
  const slot = card.querySelector<HTMLElement>('.job');
  if (!slot) return;
  if (!job || job.key !== card.dataset.key) {
    slot.innerHTML = '';
    return;
  }
  if (job.status === 'running') {
    const pct = job.total ? Math.min(100, (job.done / job.total) * 100) : 0;
    const extra =
      job.phase === 'frames' && job.fps
        ? `${job.done}/${job.total} · ${job.fps.toFixed(1)} fps · ETA ${fmtDur(job.eta ?? 0)}`
        : `${Math.round(pct)}%`;
    slot.innerHTML = `<div class="progress"><div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="line"><span>${PHASES[job.phase] ?? esc(job.phase)}…</span><span>${extra} <button class="btn sm danger" data-act="cancel">Cancel</button></span></div></div>`;
  } else {
    const cls = job.status === 'done' ? 'ok' : job.status === 'cancelled' ? '' : 'err';
    const issues = (job.issues ?? []).map((i) => `<br>${esc(i.rule)} ${esc(i.message)}`).join('');
    slot.innerHTML = `<div class="result ${cls}">${job.status === 'done' ? '✓' : job.status === 'cancelled' ? '■' : '✗'} ${esc(job.message ?? job.status)}${issues}</div>`;
  }
}

// ------------------------------------------------------------------ actions
let currentEp: Episode | null = null;
const epOf = (el: HTMLElement) =>
  project?.episodes.find((e) => e.key === el.closest<HTMLElement>('.card')?.dataset.key) ?? null;

document.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  if (t.dataset.close !== undefined) return void (t.closest('dialog') as HTMLDialogElement).close();
  const out = t.closest<HTMLElement>('[data-out]');
  if (out) {
    const ep = epOf(out);
    if (ep) openOutput(ep, out.dataset.out!, out.dataset.kind as OutputFile['kind']);
    return;
  }
  const btn = t.closest<HTMLElement>('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act!;
  if (act === 'new-hero') return openNew();
  const ep = epOf(btn);
  if (!ep) return;
  currentEp = ep;
  try {
    switch (act) {
      case 'cue':
      case 'dev': {
        const win = window.open('about:blank', '_blank');
        const { url } = await api<{ url: string }>('/api/studio', { ep: ep.key, mode: act });
        if (win) win.location.href = url;
        else location.href = url;
        break;
      }
      case 'validate':
        await showValidation(ep, btn);
        break;
      case 'render':
        openRender(ep);
        break;
      case 'cancel':
        await api('/api/render/cancel', {});
        break;
      case 'folder':
        await api('/api/reveal', { ep: ep.key });
        toast(`Opened ${ep.key}`);
        break;
      case 'voice':
        $<HTMLInputElement>('#voiceInput').click();
        break;
      case 'draft':
        await api('/api/cues/draft', { ep: ep.key });
        toast('Draft cues created. Mark real cues after recording.', 'ok');
        await refresh();
        break;
    }
  } catch (err) {
    toast((err as Error).message, 'err');
  }
});

function openOutput(ep: Episode, file: string, kind: OutputFile['kind']): void {
  const url = fileUrl(ep, file);
  if (kind === 'master' || kind === 'share' || kind === 'part') {
    const v = $<HTMLVideoElement>('#player');
    v.poster = `/api/thumb?ep=${encodeURIComponent(ep.key)}`;
    v.src = url;
    $<HTMLAnchorElement>('#playerDownload').href = url;
    $<HTMLAnchorElement>('#playerDownload').download = file.split('/').pop()!;
    const dlg = $<HTMLDialogElement>('#playerDlg');
    dlg.showModal();
    dlg.addEventListener('close', () => v.pause(), { once: true });
    void v.play().catch(() => undefined);
  } else window.open(url, '_blank', 'noopener');
}

async function showValidation(ep: Episode, btn: HTMLElement): Promise<void> {
  btn.setAttribute('disabled', '');
  btn.textContent = 'Checking…';
  try {
    const { issues } = await api<{ issues: Issue[] }>('/api/validate', { ep: ep.key });
    $('#issuesTitle').textContent = ep.id;
    const list = $('#issuesList');
    list.innerHTML = issues.length
      ? issues
          .map((i) => {
            const loc = i.file
              ? `${i.file.split(/[\\/]/).pop()}${i.line ? `:${i.line}:${i.col ?? 1}` : ''}`
              : '';
            const when = i.time !== undefined ? ` · ${fmtDur(i.time)}` : '';
            return `<li class="${i.level}"><span class="rule">${esc(i.rule)}</span><span>${esc(i.message)}</span>${
              loc || when ? `<span class="loc mono">${esc(loc)}${when}</span>` : ''
            }${i.hint ? `<span class="hint">→ ${esc(i.hint)}</span>` : ''}</li>`;
          })
          .join('')
      : '<li><span class="rule" style="color:var(--lime)">✓</span><span>No issues. Ready to render.</span></li>';
    $<HTMLDialogElement>('#issuesDlg').showModal();
  } finally {
    btn.removeAttribute('disabled');
    btn.textContent = 'Validate';
  }
}

function openRender(ep: Episode): void {
  const f = $<HTMLFormElement>('#renderForm');
  $('#renderTitle').textContent = ep.id;
  (f.elements.namedItem('preset') as HTMLSelectElement).value = ep.preset;
  (f.elements.namedItem('silent') as HTMLInputElement).checked = !ep.voice;
  $<HTMLDialogElement>('#renderDlg').showModal();
}

$<HTMLDialogElement>('#renderDlg').addEventListener('close', async () => {
  const dlg = $<HTMLDialogElement>('#renderDlg');
  if (dlg.returnValue !== 'ok' || !currentEp) return;
  const f = $<HTMLFormElement>('#renderForm');
  const val = (n: string) => f.elements.namedItem(n) as HTMLInputElement;
  try {
    const r = await api<{ job: Job }>('/api/render', {
      ep: currentEp.key,
      options: {
        preset: val('preset').value,
        shareMb: Number(val('shareMb').value),
        sfx: val('sfx').checked,
        fast: val('fast').checked,
        silent: val('silent').checked,
      },
    });
    job = r.job;
    repaintJobs();
  } catch (e) {
    toast((e as Error).message, 'err');
  }
});

$<HTMLInputElement>('#voiceInput').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !currentEp) return;
  const ep = currentEp;
  toast(`Uploading ${file.name} (${fmtSize(file.size)})…`);
  try {
    const res = await fetch(
      `/api/voice?ep=${encodeURIComponent(ep.key)}&name=${encodeURIComponent(file.name)}`,
      {
        method: 'PUT',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      },
    );
    const data = (await res.json()) as { error?: string; duration?: number };
    if (!res.ok) throw new Error(data.error ?? res.statusText);
    toast(`Voice saved (${fmtDur(data.duration ?? 0)}). Next: mark cues.`, 'ok');
    await refresh();
  } catch (err) {
    toast(`Upload failed: ${(err as Error).message}`, 'err');
  }
});

function openNew(): void {
  $('#newErr').textContent = '';
  $<HTMLFormElement>('#newForm').reset();
  const next = (project?.episodes.filter((e) => e.group === 'episodes').length ?? 0) + 1;
  const f = $<HTMLFormElement>('#newForm');
  (f.elements.namedItem('id') as HTMLInputElement).value = `ep${String(next).padStart(2, '0')}`;
  (f.elements.namedItem('episode') as HTMLInputElement).value = String(next);
  $<HTMLDialogElement>('#newDlg').showModal();
}
$('#newBtn').addEventListener('click', openNew);

$<HTMLFormElement>('#newForm').addEventListener('submit', async (e) => {
  const sub = (e as SubmitEvent).submitter as HTMLButtonElement | null;
  if (sub?.value !== 'ok') return;
  e.preventDefault();
  const f = e.target as HTMLFormElement;
  const val = (n: string) => (f.elements.namedItem(n) as HTMLInputElement).value;
  try {
    const r = await api<{ key: string }>('/api/episodes', {
      id: val('id'),
      title: val('title'),
      series: val('series'),
      episode: Number(val('episode')),
    });
    $<HTMLDialogElement>('#newDlg').close();
    toast(`Created ${r.key}. Edit episode.yaml, then preview.`, 'ok');
    await refresh();
  } catch (err) {
    $('#newErr').textContent = (err as Error).message;
  }
});

// ------------------------------------------------------------------ environment check
async function checkHealth(): Promise<void> {
  const pill = $('#health');
  try {
    const { checks } = await api<{ checks: { name: string; ok: boolean; detail: string; fix?: string }[] }>(
      '/api/doctor',
    );
    const bad = checks.filter((c) => !c.ok);
    pill.className = `pill ${bad.length ? 'bad' : 'ok'}`;
    pill.textContent = bad.length
      ? `⚠ ${bad.length} setup issue${bad.length > 1 ? 's' : ''}`
      : '● Ready to render';
    $('#doctorList').innerHTML = checks
      .map(
        (c) =>
          `<li><span class="st ${c.ok ? 'ok' : 'bad'}">${c.ok ? '✓' : '✗'}</span><span>${esc(c.name)} <span class="dim small">${esc(c.detail)}</span></span>${
            !c.ok && c.fix ? `<span class="fix">Fix: ${esc(c.fix)}</span>` : ''
          }</li>`,
      )
      .join('');
    if (bad.length) $<HTMLDialogElement>('#doctorDlg').showModal();
  } catch {
    pill.className = 'pill bad';
    pill.textContent = 'check failed';
  }
}
$('#health').addEventListener('click', () => $<HTMLDialogElement>('#doctorDlg').showModal());

// ------------------------------------------------------------------ live updates
function repaintJobs(): void {
  document.querySelectorAll<HTMLElement>('.card').forEach((c) => {
    paintJob(c);
    const r = c.querySelector<HTMLButtonElement>('[data-act="render"]');
    if (r) r.disabled = Boolean(job && job.status === 'running' && job.key === c.dataset.key);
  });
}

function connect(): void {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data as string) as { type: string; job?: Job };
    if (msg.type === 'job' && msg.job) {
      const finished = job?.status === 'running' && msg.job.status !== 'running' && job.id === msg.job.id;
      job = msg.job;
      repaintJobs();
      if (finished) {
        toast(
          `${job.key}: ${job.message ?? job.status}`,
          job.status === 'done' ? 'ok' : job.status === 'cancelled' ? '' : 'err',
        );
        thumbVersion.set(job.key, Date.now());
      }
    } else if (msg.type === 'project') void refresh();
  };
  ws.onclose = () => setTimeout(connect, 1500);
}

window.addEventListener('focus', () => void refresh());
void refresh().then(checkHealth);
connect();
