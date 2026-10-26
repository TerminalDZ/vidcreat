/** CLI smoke tests (FR-CLI-1…8): exit codes, --json, new/cue --draft/validate/snap/schema/doctor. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './helpers.js';

const BIN = path.join(ROOT, 'packages/cli/bin/reelforge.js');
const run = (args: string[], cwd = ROOT) => {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', REELFORGE_NO_OPEN: '1' },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

describe('reelforge CLI', () => {
  it('prints help and version; usage errors exit 2', () => {
    expect(run(['--help']).out).toMatch(/new.*cue.*dev.*validate.*render.*snap.*doctor/s);
    expect(run(['--version']).out.trim()).toBe('1.0.0');
    expect(run(['render']).code).toBe(2);
    expect(run(['render', 'x', '--workers', 'zero']).code).toBe(2);
  });

  it('creates, drafts, validates and snaps a new episode', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'rf-cli-'));
    expect(run(['new', 'ep10', '--series', 'TEST', '--root', root]).code).toBe(0);
    expect(existsSync(path.join(root, 'episodes/ep10/episode.yaml'))).toBe(true);
    expect(existsSync(path.join(root, 'schema/episode.schema.json'))).toBe(true);
    expect(run(['new', 'ep10', '--root', root]).code).toBe(1);
    const missing = run(['validate', 'ep10', '--root', root, '--no-measure', '--json']);
    expect(missing.code).toBe(1);
    expect(JSON.parse(missing.out).issues.some((i: { rule: string }) => i.rule === 'V-3')).toBe(true);
    expect(run(['cue', 'ep10', '--draft', '--root', root]).code).toBe(0);
    const v = run(['validate', 'ep10', '--root', root, '--json']);
    expect(v.code).toBe(0);
    expect(JSON.parse(v.out).ok).toBe(true);
    expect(run(['validate', 'ep10', '--root', root, '--strict', '--no-measure']).code).toBe(1); // V-4 warning: no voice
    const s = run(['snap', 'ep10', '0.5', 'l2', "l3:'Idempotency'", '--root', root, '--json']);
    expect(s.code).toBe(0);
    const res = JSON.parse(s.out) as { frames: string[]; sheet: string };
    expect(res.frames).toHaveLength(3);
    expect(readFileSync(res.sheet).subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(run(['snap', 'ep10', 'l99', '--root', root]).code).toBe(2);
    // v1.1: cover image and theme generator
    expect(run(['snap', 'ep10', 'l2', '--cover', '--root', root]).code).toBe(0);
    expect(existsSync(path.join(root, 'episodes/ep10/out/ep10.cover.png'))).toBe(true);
    expect(run(['snap', 'ep10', 'l1', 'l2', '--cover', '--root', root]).code).toBe(2);
    expect(run(['theme', 'new', 'ocean', '--accent', '#3cc8ff', '--root', root]).code).toBe(0);
    expect(readFileSync(path.join(root, 'themes/ocean.theme.yaml'), 'utf8')).toMatch(/lime: '#3cc8ff'/);
    expect(run(['theme', 'new', 'bad', '--accent', 'blue', '--root', root]).code).toBe(2);
    const light = ['theme', 'new', 'clinic', '--accent', '#00a884', '--mode', 'light'];
    expect(run([...light, '--font', 'Noto Kufi Arabic', '--root', root]).code).toBe(0);
    const clinic = readFileSync(path.join(root, 'themes/clinic.theme.yaml'), 'utf8');
    expect(clinic).toMatch(/mode: light/);
    expect(clinic).toMatch(/arabic: 'Noto Kufi Arabic'/);
    expect(run(['theme', 'new', 'bad', '--accent', '#00a884', '--mode', 'dim', '--root', root]).code).toBe(2);
    expect(run(['theme', 'new', 'bad', '--accent', '#00a884', '--font', 'Comic', '--root', root]).code).toBe(
      2,
    );
    expect(run(['render', '--root', root]).code).toBe(2);
  });

  it('lists packs and creates an episode from a template with slots', () => {
    const list = run(['packs', '--json']);
    expect(list.code).toBe(0);
    const packs = JSON.parse(list.out).packs as { id: string; templates: { id: string }[] }[];
    expect(packs.find((p) => p.id === 'healthcare')?.templates.map((t) => t.id)).toContain('patient-journey');
    const root = mkdtempSync(path.join(os.tmpdir(), 'rf-cli-pack-'));
    const args = ['new', 'clinic', '--pack', 'healthcare', '--template', 'patient-journey', '--lang', 'ar'];
    const r = run([
      ...args,
      '--slot',
      'org=Saint Ann’s Clinic',
      '--slot',
      'wait=12',
      '--root',
      root,
      '--json',
    ]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ ok: true, template: 'patient-journey', slots: { wait: 12 } });
    const yaml = readFileSync(path.join(root, 'episodes/clinic/episode.yaml'), 'utf8');
    expect(yaml).toMatch(/lang: ar-EG/);
    expect(yaml).toContain('Saint Ann’s Clinic');
    expect(existsSync(path.join(root, 'episodes/clinic/cues.json'))).toBe(true);
    expect(run(['validate', 'clinic', '--root', root, '--no-measure', '--json']).code).toBe(0);
    expect(run(['new', 'x', '--pack', 'healthcare', '--slot', 'wait=-5', '--root', root]).code).toBe(2);
    expect(run(['new', 'x', '--pack', 'nope', '--root', root]).code).toBe(2);
    expect(run(['new', 'x', '--template', 'patient-journey', '--root', root]).code).toBe(2);
  });

  it('reports unknown episodes and writes the JSON schema', () => {
    const r = run(['validate', 'does-not-exist']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/reelforge new does-not-exist/);
    const out = path.join(mkdtempSync(path.join(os.tmpdir(), 'rf-')), 's.json');
    expect(run(['schema', '--out', out]).code).toBe(0);
    expect(JSON.parse(readFileSync(out, 'utf8')).title).toMatch(/episode/);
  });

  it('doctor passes in CI', () => {
    const d = run(['doctor', '--json']);
    expect(JSON.parse(d.out).checks.length).toBeGreaterThanOrEqual(5);
    expect(d.code).toBe(0);
  });
});
