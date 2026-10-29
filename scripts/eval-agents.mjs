// Agent eval harness: runs one authoring task per industry against a model through the real tool
// registry (the same tools MCP and REST serve) and scores the episode each run produces.
//
//   node scripts/eval-agents.mjs --mock                     scripted model, offline (CI)
//   node scripts/eval-agents.mjs --base-url http://127.0.0.1:11434/v1 --model qwen2.5:7b
//   node scripts/eval-agents.mjs --base-url https://api.openai.com/v1 --model gpt-4o-mini --api-key $KEY
//
// Options: --tasks healthcare,finance   --toolsets basic|design|all (default basic)   --max-turns 14
//          --render (also render the first second of each episode)   --json   --out results.md
// The endpoint must speak OpenAI-compatible Chat Completions with tool calling. Needs `pnpm build`.
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { compileEpisode, episodePaths } from '../packages/core/dist/index.js';
import {
  callTool,
  createToolHost,
  describeTool,
  parseToolsets,
  selectTools,
} from '../packages/studio/dist/server/index.js';

const { values: o } = parseArgs({
  options: {
    mock: { type: 'boolean', default: false },
    'base-url': { type: 'string', default: process.env.REELFORGE_LLM_BASE_URL },
    model: { type: 'string', default: process.env.REELFORGE_LLM_MODEL },
    'api-key': { type: 'string', default: process.env.REELFORGE_LLM_API_KEY },
    tasks: { type: 'string' },
    toolsets: { type: 'string', default: 'basic' },
    'max-turns': { type: 'string', default: '14' },
    render: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    out: { type: 'string' },
  },
});

/** One task per industry pack. The "Industry:" line is a hint any model can use with list_templates. */
export const TASKS = [
  [
    'healthcare',
    'en',
    'A 45-second video for Northwind Hospital introducing its new outpatient clinic and how to book a visit.',
  ],
  [
    'real-estate',
    'ar',
    'فيديو قصير لشركة Cedar Homes يعرض شقة جديدة: المساحة، عدد الغرف، والسعر، وكيفية حجز زيارة.',
  ],
  [
    'ports-logistics',
    'en',
    'Explain how a container moves through the Port of Azur, from ship to truck, with a few numbers.',
  ],
  [
    'education',
    'en',
    'Introduce the spring enrollment at Maple Ridge College: three steps to apply and the deadline.',
  ],
  [
    'finance',
    'en',
    'For Harbor Credit Union: explain what an emergency fund is and how much people usually save (information only).',
  ],
  ['food', 'ar', 'فيديو لمطعم Olive & Thyme يقدم طبق الأسبوع وسعره وساعات العمل.'],
  [
    'retail',
    'en',
    'Announce a weekend sale at Brightside Market with the discount, three featured items and the dates.',
  ],
  ['government', 'en', 'Explain how residents of Riverton can renew an ID card online in four steps.'],
  [
    'tourism',
    'en',
    'Promote a two-day itinerary at the Seabreeze Hotel: what to see on day one and day two.',
  ],
  [
    'manufacturing',
    'en',
    'Show how the Northfield plant cut defects: before and after numbers and the three changes made.',
  ],
  [
    'events-ngo',
    'ar',
    'فيديو لجمعية Green Steps يدعو للتطوع في يوم تنظيف الشاطئ: المكان والتاريخ وكيفية التسجيل.',
  ],
  ['tech', 'en', 'Explain rate limiting with a token bucket for backend developers.'],
].map(([industry, lang, brief]) => ({ industry, lang, brief, id: `eval-${industry}` }));

const SYSTEM = `You make short vertical explainer videos with the ReelForge tools.
Work in small steps and use the tools; do not ask questions. Recommended path:
1) list_templates for the industry, 2) create_from_template with an episode id, the language and slot values that fit the brief,
3) validate_episode and fix every error with the tools, 4) reply "DONE" with a one-line summary.
Keep on-screen texts short. Use fictional organization names only.`;

const taskPrompt = (t) =>
  `Industry: ${t.industry}\nLanguage: ${t.lang}\nEpisode id: ${t.id}\nBrief: ${t.brief}`;

/** The scripted model used offline: follows the recommended path from the conversation so far. */
function mockReply(messages) {
  const user = messages.find((m) => m.role === 'user').content;
  const field = (k) => user.match(new RegExp(`^${k}: (.+)$`, 'm'))?.[1].trim();
  const done = messages.filter((m) => m.role === 'tool').map((m) => m.name);
  const last = [...messages].reverse().find((m) => m.role === 'tool');
  const call = (name, args) => ({
    role: 'assistant',
    content: null,
    tool_calls: [
      { id: `c${messages.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } },
    ],
  });
  if (!done.includes('list_templates'))
    return call('list_templates', { pack: field('Industry'), lang: field('Language') });
  if (!done.includes('create_from_template')) {
    const template = last.content.match(/^\s+([a-z0-9-]+): /m)?.[1];
    return call('create_from_template', {
      id: field('Episode id'),
      pack: field('Industry'),
      template,
      lang: field('Language'),
    });
  }
  if (!done.includes('validate_episode')) return call('validate_episode', { episode: field('Episode id') });
  return { role: 'assistant', content: 'DONE: created from the industry template and validated.' };
}

async function startMock() {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      const { messages } = JSON.parse(body);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: mockReply(messages), finish_reason: 'stop' }] }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

async function chat(base, model, key, messages, tools) {
  const r = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', temperature: 0.2 }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return (await r.json()).choices[0].message;
}

/** Checks on the produced episode. Each is pass/fail; the score is the share passed. */
async function score(root, task) {
  const dir = path.join(root, 'episodes', task.id);
  const ep = readdirSync(path.join(root, 'episodes')).includes(task.id) ? dir : undefined;
  const checks = { created: Boolean(ep) };
  if (!ep) return checks;
  const r = compileEpisode(episodePaths(dir, root), { draftCues: true, voice: null });
  const has = (rule) => r.issues.some((i) => i.rule === rule && i.level !== 'info');
  checks.valid = !r.issues.some((i) => i.level === 'error');
  checks.noOverlaps = !has('V-8');
  checks.safeZones = !has('V-7') && !has('V-6');
  checks.language = (r.spec?.meta.lang ?? '').startsWith(task.lang);
  const tl = r.timeline;
  checks.linesCovered = Boolean(
    tl &&
      tl.script.every((l) =>
        tl.scenes.some(
          (s) =>
            s.elements.some((e) => e.enter.t >= l.start - 0.05 && e.enter.t < l.end) ||
            Math.abs(s.start - l.start) < 0.05,
        ),
      ),
  );
  if (o.render && checks.valid) {
    const { renderEpisode } = await import('../packages/renderer/dist/index.js');
    try {
      const out = await renderEpisode(episodePaths(dir, root), {
        silent: true,
        fast: true,
        from: 0,
        to: 1,
        measure: false,
        workers: 1,
      });
      checks.renders = Boolean(out.outputs.part);
    } catch {
      checks.renders = false;
    }
  }
  return checks;
}

const mock = o.mock || !o['base-url'];
const srv = mock ? await startMock() : undefined;
const base = srv?.url ?? o['base-url'];
const model = mock ? 'mock' : o.model;
if (!model) throw new Error('--model is required with --base-url');
const tools = selectTools(parseToolsets(o.toolsets)).map(describeTool);
const fnTools = tools.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.inputSchema },
}));
const want = o.tasks?.split(',');
const results = [];
for (const task of TASKS.filter((t) => !want || want.includes(t.industry))) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'rf-eval-'));
  const host = createToolHost({ root });
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: taskPrompt(task) },
  ];
  const t0 = performance.now();
  let turns = 0;
  let calls = 0;
  let toolErrors = 0;
  let error;
  try {
    for (; turns < Number(o['max-turns']); turns++) {
      const msg = await chat(base, model, o['api-key'], messages, fnTools);
      messages.push({
        role: 'assistant',
        content: msg.content ?? null,
        ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
      });
      if (!msg.tool_calls?.length) break;
      for (const c of msg.tool_calls) {
        calls++;
        const tool = tools.find((t) => t.name === c.function.name);
        let content;
        if (!tool) {
          toolErrors++;
          content = `Unknown tool ${c.function.name}`;
        } else {
          let args = {};
          try {
            args = JSON.parse(c.function.arguments || '{}');
          } catch {
            /* the tool reports the missing arguments */
          }
          const res = await callTool(
            selectTools('all').find((t) => t.name === tool.name),
            args,
            { ...host, progress: () => undefined },
          );
          if (res.isError) toolErrors++;
          content = res.content
            .filter((x) => x.type === 'text')
            .map((x) => x.text)
            .join('\n')
            .slice(0, 12_000);
        }
        messages.push({ role: 'tool', tool_call_id: c.id, name: c.function.name, content });
      }
    }
  } catch (e) {
    error = e.message;
  }
  await host.close();
  const checks = await score(root, task);
  const vals = Object.values(checks);
  results.push({
    industry: task.industry,
    lang: task.lang,
    score: Math.round((vals.filter(Boolean).length / vals.length) * 100),
    checks,
    turns: turns + 1,
    calls,
    toolErrors,
    seconds: Math.round((performance.now() - t0) / 100) / 10,
    ...(error ? { error } : {}),
  });
  if (!o.json) {
    const r = results.at(-1);
    const failed = Object.entries(checks)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    console.log(
      `${task.industry.padEnd(16)} ${String(r.score).padStart(3)}%  ${r.calls} calls, ${r.toolErrors} tool errors, ${r.seconds}s${failed.length ? `  failed: ${failed.join(', ')}` : ''}${error ? `  error: ${error}` : ''}`,
    );
  }
}
srv?.close();

const avg = Math.round(results.reduce((s, r) => s + r.score, 0) / Math.max(1, results.length));
const md = [
  `| Model | Toolsets | Industry | Lang | Score | Calls | Tool errors | Time (s) |`,
  `| ----- | -------- | -------- | ---- | ----- | ----- | ----------- | -------- |`,
  ...results.map(
    (r) =>
      `| ${model} | ${o.toolsets} | ${r.industry} | ${r.lang} | ${r.score}% | ${r.calls} | ${r.toolErrors} | ${r.seconds} |`,
  ),
  `| **${model}** | ${o.toolsets} | **all** | | **${avg}%** | | | |`,
].join('\n');
if (o.out) writeFileSync(o.out, `${md}\n`);
if (o.json) console.log(JSON.stringify({ model, toolsets: o.toolsets, average: avg, results }, null, 2));
else console.log(`\naverage ${avg}% over ${results.length} task(s)`);
if (mock && avg < 100) process.exit(1);
