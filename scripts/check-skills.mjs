// Checks the Agent Skills in skills/: each <name>/SKILL.md has YAML frontmatter whose `name` matches
// the folder and whose `description` is at most 300 characters, every relative Markdown link exists,
// and every ```yaml block holding `scenes:` or `use:` parses.
//   node scripts/check-skills.mjs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// `yaml` is a dependency of @reelforge/core, not of the workspace root.
const { parse, parseDocument } = createRequire(path.join(ROOT, 'packages/core/package.json'))('yaml');

const SKILLS = path.join(ROOT, 'skills');
const MAX_DESCRIPTION = 300;
const errors = [];
const fail = (file, msg) => errors.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}: ${msg}`);

function checkMarkdown(file, text) {
  const lines = text.split(/\r?\n/);
  // YAML blocks
  let inBlock = false;
  let lang = '';
  let start = 0;
  let body = [];
  lines.forEach((line, i) => {
    const fence = line.match(/^\s*```(\S*)/);
    if (!fence) {
      if (inBlock) body.push(line);
      return;
    }
    if (!inBlock) {
      inBlock = true;
      lang = fence[1].toLowerCase();
      start = i + 1;
      body = [];
      return;
    }
    inBlock = false;
    const src = body.join('\n');
    if ((lang === 'yaml' || lang === 'yml') && /^\s*(-\s+)?(scenes:|use:)|[{,]\s*use:/m.test(src)) {
      const doc = parseDocument(src);
      if (doc.errors.length)
        fail(file, `YAML block at line ${start} does not parse: ${doc.errors[0].message.split('\n')[0]}`);
    }
  });
  if (inBlock) fail(file, `unclosed code block starting at line ${start}`);
  // Relative links, outside code
  const prose = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  for (const m of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1].split('#')[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    if (!existsSync(path.resolve(path.dirname(file), decodeURIComponent(target))))
      fail(file, `broken link: ${m[1]}`);
  }
}

if (!existsSync(SKILLS)) {
  console.error('✗ skills/ not found');
  process.exit(1);
}
let count = 0;
for (const name of readdirSync(SKILLS).sort()) {
  const dir = path.join(SKILLS, name);
  if (!statSync(dir).isDirectory()) continue;
  const file = path.join(dir, 'SKILL.md');
  if (!existsSync(file)) {
    fail(dir, 'missing SKILL.md');
    continue;
  }
  count++;
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) {
    fail(file, 'missing YAML frontmatter (--- name / description ---)');
    continue;
  }
  let meta;
  try {
    meta = parse(m[1]) ?? {};
  } catch (e) {
    fail(file, `frontmatter does not parse: ${e.message.split('\n')[0]}`);
    continue;
  }
  if (meta.name !== name) fail(file, `frontmatter name "${meta.name}" does not match the folder "${name}"`);
  if (typeof meta.description !== 'string' || !meta.description.trim()) fail(file, 'missing description');
  else if (meta.description.trim().length > MAX_DESCRIPTION)
    fail(file, `description is ${meta.description.trim().length} characters (max ${MAX_DESCRIPTION})`);
  checkMarkdown(file, text);
  const refs = path.join(dir, 'references');
  if (existsSync(refs))
    for (const f of readdirSync(refs).filter((x) => x.endsWith('.md')))
      checkMarkdown(path.join(refs, f), readFileSync(path.join(refs, f), 'utf8'));
}

if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  console.error(`${errors.length} problem(s) in skills/`);
  process.exit(1);
}
console.log(`✓ ${count} skill(s) OK`);
