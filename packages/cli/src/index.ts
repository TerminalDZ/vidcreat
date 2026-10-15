/** `reelforge` command-line interface (SRS §4.1, FR-CLI-1…8). */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Command, InvalidArgumentError, Option } from 'commander';
import {
  compileEpisode,
  draftCues,
  episodeJsonSchema,
  episodePaths,
  episodeTemplate,
  INSTALL_ROOT,
  projectRoot,
  resolveEpisode,
  resolveTime,
  writeCues,
  type EpisodePaths,
  type Issue,
  type Timeline,
} from '@reelforge/core';
import {
  everyTimes,
  measureTimeline,
  RenderError,
  renderEpisode,
  runDoctor,
  snapFrames,
  type Progress,
} from '@reelforge/renderer';
import { startStudio } from '@reelforge/studio';
import { ffmpegDecode } from './decode.js';
import { openBrowser } from './open.js';
import { bar, c, endStatus, fmtDur, formatIssue, statusLine, summary } from './term.js';

const VERSION = '1.0.0';

interface Globals {
  verbose?: boolean;
  json?: boolean;
  root?: string;
}

class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

const num = (name: string) => (v: string) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new InvalidArgumentError(`${name} must be a number`);
  return n;
};
const posInt = (name: string) => (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new InvalidArgumentError(`${name} must be a positive integer`);
  return n;
};
const timeArg = (v: string) => {
  const n = Number(v.replace(/s$/, ''));
  if (!Number.isFinite(n) || n < 0) throw new InvalidArgumentError('expected seconds, e.g. 12.5 or 12.5s');
  return n;
};

function globals(cmd: Command): Globals {
  return cmd.optsWithGlobals() as Globals;
}

function episode(arg: string, g: Globals): EpisodePaths {
  const root = projectRoot(g.root);
  const p = resolveEpisode(arg, root);
  if (!p) {
    throw new CliError(
      `Episode "${arg}" not found (looked in ${path.join(root, 'episodes', arg)}, ${path.resolve(root, arg)} and examples/).\n` +
        `Create it with \`reelforge new ${arg}\`, or pass a path to a folder containing episode.yaml.`,
      1,
    );
  }
  return p;
}

const out = (g: Globals, data: unknown, human: () => void) => {
  if (g.json) process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  else human();
};

function printIssues(issues: Issue[], g: Globals): void {
  const shown = g.verbose ? issues : issues.filter((i) => i.level !== 'info');
  for (const i of shown) console.error(formatIssue(i));
  const hidden = issues.length - shown.length;
  if (hidden) console.error(c.dim(`(${hidden} info message(s) hidden; use --verbose)`));
}

// ------------------------------------------------------------------ commands

async function cmdNew(id: string, o: { series?: string; episode?: number }, g: Globals) {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id))
    throw new CliError('Episode id must be a slug (letters, digits, "-" and "_")', 2);
  const root = projectRoot(g.root);
  const dir = path.join(root, 'episodes', id);
  if (existsSync(path.join(dir, 'episode.yaml')))
    throw new CliError(`${path.relative(process.cwd(), dir)}/episode.yaml already exists`);
  mkdirSync(path.join(dir, 'assets'), { recursive: true });
  writeFileSync(
    path.join(dir, 'episode.yaml'),
    episodeTemplate(id, { series: o.series, episode: o.episode }),
  );
  const schemaFile = path.join(root, 'schema', 'episode.schema.json');
  if (!existsSync(schemaFile)) {
    mkdirSync(path.dirname(schemaFile), { recursive: true });
    writeFileSync(schemaFile, `${JSON.stringify(episodeJsonSchema(), null, 2)}\n`);
  }
  out(g, { ok: true, dir }, () => {
    console.log(`${c.green('✓')} created ${path.relative(process.cwd(), dir) || dir}/episode.yaml`);
    console.log(
      c.dim(`next: write the script, record voice.wav into that folder, then \`reelforge cue ${id}\``),
    );
  });
}

async function cmdCue(
  id: string,
  o: { draft?: boolean; port?: number; open?: boolean; preset?: string },
  g: Globals,
) {
  const p = episode(id, g);
  if (o.draft) {
    const r = compileEpisode(p, { draftCues: true, decode: ffmpegDecode });
    if (!r.script.length) throw new CliError('The script has no lines yet');
    if (existsSync(p.cues))
      throw new CliError(`${p.cues} already exists; delete it first to regenerate draft cues`);
    const d = draftCues(r.script, r.spec?.audio.voice);
    if (r.voice) {
      // scale the estimate to the real recording length
      const k = r.voice.duration / d.audio.duration;
      for (const key of Object.keys(d.cues)) d.cues[key] = Math.round(d.cues[key] * k * 1000) / 1000;
      d.audio.duration = Math.round(r.voice.duration * 1000) / 1000;
    }
    writeCues(p.cues, d);
    out(g, { ok: true, file: p.cues, cues: d.cues }, () =>
      console.log(
        `${c.green('✓')} wrote draft cues to ${path.relative(process.cwd(), p.cues)} (estimated; mark real ones with \`reelforge cue ${id}\`)`,
      ),
    );
    return;
  }
  await serve(p, 'cue', o, g);
}

async function serve(
  p: EpisodePaths,
  mode: 'cue' | 'dev',
  o: { port?: number; open?: boolean; preset?: string },
  g: Globals,
) {
  const studio = await startStudio({
    paths: p,
    mode,
    port: o.port,
    preset: o.preset,
    decode: ffmpegDecode,
    measure:
      mode === 'dev'
        ? (tl: Timeline) =>
            measureTimeline(tl, { cacheDir: path.join(p.out, '.cache'), assetsDir: p.assets, file: p.yaml })
        : undefined,
    log: (m) => g.verbose && console.error(c.dim(m)),
  });
  out(g, { url: studio.url }, () => {
    console.log(
      `${c.green('●')} ReelForge Studio (${mode === 'cue' ? 'cue marker' : 'preview'}) for ${c.bold(p.id)}`,
    );
    console.log(`  ${c.cyan(studio.url)}`);
    console.log(
      c.dim('  listening on 127.0.0.1 only · press ? in the studio for shortcuts · Ctrl+C to stop'),
    );
  });
  if (o.open !== false) openBrowser(studio.url);
  await new Promise<void>((resolve) => {
    const stop = () => {
      void studio.close().then(resolve);
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}

async function cmdValidate(
  id: string,
  o: { strict?: boolean; measure?: boolean; preset?: string },
  g: Globals,
) {
  const p = episode(id, g);
  const r = compileEpisode(p, { preset: o.preset, decode: ffmpegDecode });
  const issues = [...r.issues];
  let measured = false;
  if (r.timeline && o.measure !== false && !issues.some((i) => i.level === 'error' && i.rule === 'V-1')) {
    try {
      issues.push(
        ...(await measureTimeline(r.timeline, {
          cacheDir: path.join(p.out, '.cache'),
          assetsDir: p.assets,
          file: p.yaml,
        })),
      );
      measured = true;
    } catch (e) {
      issues.push({
        rule: 'V-9',
        level: 'info',
        message: `Skipped headless checks V-9/V-10: ${(e as Error).message.split('\n')[0]}`,
        hint: 'Run `reelforge doctor`',
      });
    }
  }
  const errors = issues.filter((i) => i.level === 'error').length;
  const warns = issues.filter((i) => i.level === 'warn').length;
  const failed = errors > 0 || (o.strict && warns > 0);
  out(g, { ok: !failed, episode: p.id, measured, issues }, () => {
    printIssues(issues, g);
    const tl = r.timeline;
    const info = tl
      ? c.dim(
          ` · ${tl.duration.toFixed(1)} s · ${tl.scenes.length} scenes · ${tl.scenes.reduce((n, s) => n + s.elements.length, 0)} elements · ${tl.captions.length} captions`,
        )
      : '';
    console.error(`${failed ? c.red('✗') : c.green('✓')} ${p.id}: ${summary(issues)}${info}`);
  });
  if (failed) process.exitCode = 1;
}

interface RenderFlags {
  preset?: string;
  workers?: number;
  from?: number;
  to?: number;
  shareSize?: number;
  sfx?: boolean;
  lossless?: boolean;
  fast?: boolean;
  keepTmp?: boolean;
  silent?: boolean;
  share?: boolean;
  measure?: boolean;
}

async function cmdRender(id: string, o: RenderFlags, g: Globals) {
  const p = episode(id, g);
  const ac = new AbortController();
  const onSig = () => {
    if (ac.signal.aborted) process.exit(130);
    endStatus();
    console.error(c.yellow('\naborting… (press Ctrl+C again to force)'));
    ac.abort();
  };
  process.on('SIGINT', onSig);
  process.on('SIGTERM', onSig);
  const labels: Record<string, string> = {
    validate: 'validate',
    frames: 'frames  ',
    concat: 'concat  ',
    audio: 'audio   ',
    master: 'master  ',
    share: 'share   ',
    extras: 'extras  ',
  };
  let lastPhase = '';
  const onProgress = (pr: Progress) => {
    if (g.json) {
      process.stdout.write(`${JSON.stringify({ event: 'progress', ...pr })}\n`);
      return;
    }
    if (pr.phase === 'done') return endStatus();
    if (pr.phase !== lastPhase) {
      if (lastPhase) endStatus();
      lastPhase = pr.phase;
      if (!process.stderr.isTTY) console.error(`${labels[pr.phase] ?? pr.phase}…`);
    }
    const extra =
      pr.phase === 'frames'
        ? ` ${pr.done}/${pr.total} · ${(pr.fps ?? 0).toFixed(1)} fps · ETA ${fmtDur(pr.eta ?? NaN)}`
        : '';
    statusLine(`${c.cyan(labels[pr.phase] ?? pr.phase)} ${bar(pr.done, pr.total)}${extra}`);
  };
  try {
    const r = await renderEpisode(p, {
      preset: o.preset,
      workers: o.workers,
      from: o.from,
      to: o.to,
      shareMb: o.shareSize,
      sfx: o.sfx,
      lossless: o.lossless,
      fast: o.fast,
      keepTmp: o.keepTmp,
      silent: o.silent,
      skipShare: o.share === false,
      measure: o.measure,
      signal: ac.signal,
      onProgress,
      onLog: (m) => {
        if (g.json) process.stdout.write(`${JSON.stringify({ event: 'log', message: m })}\n`);
        else if (g.verbose) {
          endStatus();
          console.error(c.dim(m));
        }
      },
      compile: { decode: ffmpegDecode },
    });
    endStatus();
    out(g, { event: 'result', ...r }, () => {
      printIssues(
        r.issues.filter((i) => i.level !== 'info'),
        g,
      );
      const rel = (f?: string) => (f ? path.relative(process.cwd(), f) : '');
      for (const [k, f] of Object.entries(r.outputs)) {
        const comp = r.compliance[k as keyof typeof r.compliance];
        const mark = comp ? (comp.ok ? c.green('✓') : c.red('✗')) : c.green('✓');
        const size = comp ? c.dim(` ${(comp.info.size / 1048576).toFixed(2)} MB`) : '';
        console.error(`${mark} ${k.padEnd(7)} ${rel(f)}${size}`);
        if (comp && !comp.ok) for (const pb of comp.problems) console.error(`     ${c.red(pb)}`);
      }
      console.error(
        c.dim(
          `${r.frames} frames in ${fmtDur(r.seconds)}${r.shareKbps ? ` · share video ${r.shareKbps} kb/s` : ''}`,
        ),
      );
    });
    if (!r.ok) process.exitCode = 1;
  } catch (e) {
    endStatus();
    if (e instanceof RenderError) {
      if (g.json)
        process.stdout.write(`${JSON.stringify({ event: 'error', message: e.message, issues: e.issues })}\n`);
      else {
        printIssues(e.issues, g);
        console.error(c.red(`✗ ${e.message}`));
      }
      process.exitCode = ac.signal.aborted ? 130 : 1;
      return;
    }
    throw e;
  } finally {
    process.off('SIGINT', onSig);
    process.off('SIGTERM', onSig);
  }
}

async function cmdSnap(
  id: string,
  times: string[],
  o: { every?: number; out?: string; preset?: string },
  g: Globals,
) {
  const p = episode(id, g);
  const r = compileEpisode(p, { draftCues: true, preset: o.preset, decode: ffmpegDecode });
  if (!r.timeline || r.issues.some((i) => i.level === 'error' && (i.rule === 'V-1' || i.rule === 'V-13'))) {
    printIssues(r.issues, g);
    throw new CliError('Cannot snap: the episode does not compile');
  }
  const tl = r.timeline;
  let ts: number[];
  if (o.every) ts = everyTimes(tl.duration, o.every);
  else if (times.length) {
    const lines = new Map(
      tl.script.map((l) => [
        l.id,
        {
          id: l.id,
          start: l.start,
          next: l.end,
          words: l.words.map((w) => ({ ...w, norm: normalize(w.text) })),
        },
      ]),
    );
    ts = times.map((x) => {
      try {
        return resolveTime(/^\d+(\.\d+)?$/.test(x) ? `${x}s` : x, { lines, duration: tl.duration });
      } catch (e) {
        throw new CliError(`Invalid time "${x}": ${(e as Error).message}`, 2);
      }
    });
  } else throw new CliError('Give times (e.g. `reelforge snap ep01 0 l7 12.5s`) or --every <seconds>', 2);
  const dir = o.out ? path.resolve(o.out) : path.join(p.out, 'snaps');
  const res = await snapFrames(tl, ts, dir, { assetsDir: p.assets });
  out(g, res, () => {
    for (const f of res.frames) console.log(`${c.green('✓')} ${path.relative(process.cwd(), f)}`);
    if (res.sheet)
      console.log(`${c.green('✓')} ${path.relative(process.cwd(), res.sheet)} ${c.dim('(contact sheet)')}`);
  });
}

function normalize(w: string): string {
  return w
    .replace(/[،؟؛.,?!:;"'“”«»()[\]{}…\-–—]/g, '')
    .replace(/[ً-ٰٟ]/g, '')
    .replaceAll('ـ', '')
    .replace(/[أإآ]/g, 'ا')
    .toLowerCase();
}

async function cmdDoctor(o: { fix?: boolean }, g: Globals) {
  let checks = await runDoctor();
  if (o.fix && checks.some((x) => !x.ok && x.name.startsWith('Playwright'))) {
    const require = createRequire(import.meta.url);
    const cli = path.join(
      path.dirname(
        require.resolve('playwright/package.json', {
          paths: [path.dirname(require.resolve('@reelforge/renderer'))],
        }),
      ),
      'cli.js',
    );
    console.error(c.cyan('installing the pinned Chromium (npx playwright install chromium)…'));
    spawnSync(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit' });
    checks = await runDoctor();
  }
  const ok = checks.every((x) => x.ok);
  out(g, { ok, checks, platform: process.platform, installRoot: INSTALL_ROOT }, () => {
    for (const x of checks) {
      console.log(`${x.ok ? c.green('✓') : c.red('✗')} ${x.name.padEnd(52)} ${c.dim(x.detail)}`);
      if (!x.ok && x.fix) console.log(`    ${c.yellow('fix:')} ${x.fix}`);
    }
    console.log(
      ok
        ? c.green('\nAll checks passed. Ready to render.')
        : c.red('\nSome checks failed (see fixes above).'),
    );
  });
  if (!ok) process.exitCode = 1;
}

async function cmdSchema(o: { out?: string }, g: Globals) {
  const file = path.resolve(o.out ?? path.join(projectRoot(g.root), 'schema', 'episode.schema.json'));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(episodeJsonSchema(), null, 2)}\n`);
  out(g, { ok: true, file }, () =>
    console.log(`${c.green('✓')} wrote ${path.relative(process.cwd(), file)}`),
  );
}

// ------------------------------------------------------------------ program

export function buildProgram(): Command {
  const program = new Command();
  program.exitOverride(); // inherited by subcommands: usage errors become exit code 2
  program
    .name('reelforge')
    .description('Voice + YAML → finished vertical explainer videos. Offline, deterministic, no AI.')
    .version(VERSION)
    .option('--verbose', 'more output (info messages, logs)')
    .option('--json', 'machine-readable JSON output')
    .addOption(new Option('--root <dir>', 'project root (default: $REELFORGE_ROOT or the current directory)'))
    .showHelpAfterError('(add --help for usage)');

  program
    .command('new')
    .description('create episodes/<id>/episode.yaml from a commented template')
    .argument('<id>', 'episode id (slug)')
    .option('--series <name>', 'series name shown in the header')
    .option('--episode <n>', 'episode number', posInt('--episode'))
    .action((id, o, cmd) => cmdNew(id, o, globals(cmd)));

  program
    .command('cue')
    .description('open the studio in cue-marker mode (writes cues.json)')
    .argument('<id>', 'episode id or path')
    .option('--draft', 'write estimated cues instead (preview before recording)')
    .option('--port <port>', 'port (default 4317 or $REELFORGE_PORT)', posInt('--port'))
    .option('--preset <name>', 'override meta.preset')
    .option('--no-open', 'do not open the browser')
    .action((id, o, cmd) => cmdCue(id, o, globals(cmd)));

  program
    .command('dev')
    .description('open the studio in live-preview mode with hot reload')
    .argument('<id>', 'episode id or path')
    .option('--port <port>', 'port (default 4317 or $REELFORGE_PORT)', posInt('--port'))
    .option('--preset <name>', 'override meta.preset')
    .option('--no-open', 'do not open the browser')
    .action((id, o, cmd) => serve(episode(id, globals(cmd)), 'dev', o, globals(cmd)));

  program
    .command('validate')
    .description('check schema, cues, timing, layout, safe zones and text overflow')
    .argument('<id>', 'episode id or path')
    .option('--strict', 'fail on warnings too')
    .option('--preset <name>', 'override meta.preset')
    .option('--no-measure', 'skip the headless V-9/V-10 checks')
    .action((id, o, cmd) => cmdValidate(id, o, globals(cmd)));

  program
    .command('render')
    .description('render master + share MP4, SRT, contact sheet and publish.md')
    .argument('<id>', 'episode id or path')
    .option('--preset <name>', 'tiktok | reels | shorts (default: meta.preset, $REELFORGE_PRESET)')
    .option(
      '--workers <n>',
      'parallel Chromium workers (default: CPU cores − 1, $REELFORGE_WORKERS)',
      posInt('--workers'),
    )
    .option('--from <t>', 'partial render start (seconds) → <id>.part.mp4', timeArg)
    .option('--to <t>', 'partial render end (seconds)', timeArg)
    .option(
      '--share-size <MB>',
      'share file size cap (default 28, $REELFORGE_SHARE_SIZE)',
      num('--share-size'),
    )
    .option('--no-sfx', 'render without sound effects')
    .option('--no-share', 'skip the share file')
    .option('--lossless', 'capture PNG frames instead of JPEG')
    .option('--fast', 'faster master/share encoding (preset medium)')
    .option('--silent', 'allow rendering without a voice recording')
    .option('--keep-tmp', 'keep out/.tmp/<run-id>/ on failure')
    .option('--no-measure', 'skip the headless V-9/V-10 checks')
    .action((id, o, cmd) => cmdRender(id, o, globals(cmd)));

  program
    .command('snap')
    .description('write PNG frames at times (seconds or time expressions) and a contact sheet')
    .argument('<id>', 'episode id or path')
    .argument('[times...]', 'times: 12.5, 12.5s, l7, "l7:\'word\'", l7.end+0.2')
    .option('--every <seconds>', 'one frame every N seconds', num('--every'))
    .option('--out <dir>', 'output folder (default out/snaps)')
    .option('--preset <name>', 'override meta.preset')
    .action((id, times, o, cmd) => cmdSnap(id, times, o, globals(cmd)));

  program
    .command('doctor')
    .description('check Node, ffmpeg, Chromium and fonts; print install steps')
    .option('--fix', 'install the pinned Chromium if missing')
    .action((o, cmd) => cmdDoctor(o, globals(cmd)));

  program
    .command('schema')
    .description('write the episode JSON Schema (editor autocompletion)')
    .option('--out <file>', 'output file (default schema/episode.schema.json)')
    .action((o, cmd) => cmdSchema(o, globals(cmd)));

  return program;
}

export async function main(argv: string[]): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
  } catch (e) {
    const err = e as { code?: string; exitCode?: number; message: string };
    if (typeof err.code === 'string' && err.code.startsWith('commander.')) {
      process.exitCode = err.code === 'commander.helpDisplayed' || err.code === 'commander.version' ? 0 : 2;
      return;
    }
    if (e instanceof CliError) {
      console.error(c.red(`✗ ${e.message}`));
      process.exitCode = e.exitCode;
      return;
    }
    console.error(c.red(`✗ ${(e as Error).message}`));
    if (process.env.REELFORGE_DEBUG) console.error((e as Error).stack);
    process.exitCode = 1;
  }
}

export { episodePaths };
