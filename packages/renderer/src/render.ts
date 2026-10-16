/** The full render pipeline (SRS §4.6, FR-REN-1…10). */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  compileEpisode,
  toPublishMd,
  toSrt,
  type CompileOptions,
  type EpisodePaths,
  type Issue,
  type Timeline,
} from '@reelforge/core';
import { mixAudio, writeSfx } from './audio.js';
import {
  AUDIO_KBPS_MASTER,
  checkCompliance,
  contactSheet,
  encodeMaster,
  encodeShare,
  MIN_SHARE_VIDEO_KBPS,
  type Compliance,
} from './encode.js';
import { countFrames, killAll, probeFfmpeg, run } from './ffmpeg.js';
import { measureTimeline } from './measure.js';
import { renderAll, splitRanges } from './workers.js';

export type Phase = 'validate' | 'frames' | 'concat' | 'audio' | 'master' | 'share' | 'extras' | 'done';

export interface Progress {
  phase: Phase;
  done: number;
  total: number;
  fps?: number;
  eta?: number;
  message?: string;
}

export interface RenderOptions {
  preset?: string;
  workers?: number;
  from?: number;
  to?: number;
  shareMb?: number;
  sfx?: boolean;
  lossless?: boolean;
  jpegQuality?: number;
  fast?: boolean;
  keepTmp?: boolean;
  silent?: boolean;
  skipShare?: boolean;
  measure?: boolean;
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
  onLog?: (msg: string) => void;
  compile?: CompileOptions;
}

export interface RenderResult {
  ok: boolean;
  issues: Issue[];
  outputs: { master?: string; share?: string; part?: string; srt?: string; sheet?: string; publish?: string };
  compliance: { master?: Compliance; share?: Compliance; part?: Compliance };
  frames: number;
  seconds: number;
  shareKbps?: number;
}

export class RenderError extends Error {
  constructor(
    message: string,
    readonly issues: Issue[] = [],
  ) {
    super(message);
  }
}

export const defaultWorkers = (): number =>
  Math.max(1, (os.availableParallelism?.() ?? os.cpus().length) - 1);

export async function renderEpisode(paths: EpisodePaths, opts: RenderOptions = {}): Promise<RenderResult> {
  const t0 = Date.now();
  const log = opts.onLog ?? (() => undefined);
  const progress = opts.onProgress ?? (() => undefined);
  const signal = opts.signal;

  // ---- validate (also runs before render: F14)
  progress({ phase: 'validate', done: 0, total: 1 });
  const ff = probeFfmpeg();
  if (!ff.ok)
    throw new RenderError(
      `ffmpeg not found (${ff.error ?? 'unknown error'}). Run \`reelforge doctor\` for install steps.`,
    );
  if (!ff.encoders.libx264 || !ff.encoders.aac)
    throw new RenderError('ffmpeg lacks libx264 or aac encoders. Run `reelforge doctor`.');
  const res = compileEpisode(paths, { ...opts.compile, preset: opts.preset });
  const issues = [...res.issues];
  if (!res.timeline || !res.ok)
    throw new RenderError('Validation failed; fix the errors before rendering', issues);
  const tl: Timeline = res.timeline;
  const voiceFile = res.voice?.file;
  if (!voiceFile && !opts.silent) {
    throw new RenderError(
      `No voice recording found for ${paths.id}. Record ${res.spec?.audio.voice ?? 'voice.wav'}, or pass --silent.`,
      issues,
    );
  }
  const cacheDir = path.join(paths.out, '.cache');
  if (opts.measure !== false) {
    try {
      issues.push(...(await measureTimeline(tl, { cacheDir, assetsDir: paths.assets, file: paths.yaml })));
    } catch (e) {
      log(`measuring pass skipped: ${(e as Error).message.split('\n')[0]}`);
    }
  }
  progress({ phase: 'validate', done: 1, total: 1 });

  // ---- range
  const partial = opts.from !== undefined || opts.to !== undefined;
  const fromT = Math.max(0, opts.from ?? 0);
  const toT = Math.min(tl.duration, opts.to ?? tl.duration);
  if (toT <= fromT) throw new RenderError(`Empty range: --from ${fromT} --to ${toT}`);
  const f0 = Math.floor(fromT * tl.fps + 1e-6);
  const f1 = partial ? Math.ceil(toT * tl.fps - 1e-6) : tl.frames;
  const total = f1 - f0;
  const workers = Math.max(
    1,
    Math.floor(opts.workers ?? Number(process.env.REELFORGE_WORKERS ?? defaultWorkers())),
  );

  mkdirSync(paths.out, { recursive: true });
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`;
  const tmp = path.join(paths.out, '.tmp', runId);
  mkdirSync(tmp, { recursive: true });
  const id = tl.meta.id;
  const outputs: RenderResult['outputs'] = {};
  const written: string[] = [];
  let success = false;

  const onAbort = () => killAll();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    // ---- frames
    const ranges = splitRanges(f0, f1, workers, (i) =>
      path.join(tmp, `seg_${String(i).padStart(3, '0')}.mp4`),
    );
    log(`rendering ${total} frames (${(total / tl.fps).toFixed(1)} s) with ${ranges.length} worker(s)`);
    let done = 0;
    const tStart = Date.now();
    let lastEmit = 0;
    progress({ phase: 'frames', done: 0, total });
    await renderAll(ranges, {
      tl,
      assetsDir: paths.assets,
      format: opts.lossless ? 'png' : 'jpeg',
      quality: opts.jpegQuality ?? Number(process.env.REELFORGE_JPEG_QUALITY ?? 95),
      signal,
      onFrame: () => {
        done++;
        const now = Date.now();
        if (now - lastEmit > 250 || done === total) {
          lastEmit = now;
          const sec = (now - tStart) / 1000;
          const fps = done / Math.max(sec, 1e-3);
          progress({ phase: 'frames', done, total, fps, eta: (total - done) / Math.max(fps, 1e-3) });
        }
      },
      onRetry: (r, e) =>
        log(`worker ${r.index} crashed (${e.message.split('\n')[0]}); retrying frames ${r.from}–${r.to - 1}`),
    });
    if (signal?.aborted) throw new RenderError('Aborted');

    // ---- concat (stream copy) + frame-count check
    progress({ phase: 'concat', done: 0, total: 1 });
    const list = path.join(tmp, 'segments.txt');
    writeFileSync(list, ranges.map((r) => `file '${path.basename(r.file)}'`).join('\n') + '\n');
    const video = path.join(tmp, 'video.mp4');
    await run(
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        list,
        '-c',
        'copy',
        video,
      ],
      { signal },
    );
    const counted = await countFrames(video);
    if (counted !== total) throw new RenderError(`Frame count mismatch: expected ${total}, got ${counted}`);
    progress({ phase: 'concat', done: 1, total: 1 });

    // ---- audio
    progress({ phase: 'audio', done: 0, total: 1 });
    const sfxFile = path.join(tmp, 'sfx.wav');
    writeSfx(tl, sfxFile);
    const mix = path.join(tmp, 'mix.wav');
    await mixAudio({
      voice: voiceFile,
      sfx: sfxFile,
      out: mix,
      duration: tl.duration,
      sfxGainDb: tl.audio.sfxGainDb,
      duck: tl.audio.duck,
      withSfx: opts.sfx !== false && tl.sfx.length > 0,
      signal,
    });
    progress({ phase: 'audio', done: 1, total: 1 });

    const compliance: RenderResult['compliance'] = {};
    const segDur = total / tl.fps;
    const timeProgress = (phase: Phase) => (sec: number) =>
      progress({ phase, done: Math.min(sec, segDur), total: segDur });

    if (partial) {
      const part = path.join(paths.out, `${id}.part.mp4`);
      written.push(part);
      progress({ phase: 'master', done: 0, total: segDur });
      await encodeMaster({
        video,
        audio: mix,
        out: part,
        fps: tl.fps,
        duration: segDur,
        audioOffset: f0 / tl.fps,
        fast: true,
        signal,
        onTime: timeProgress('master'),
      });
      outputs.part = part;
      compliance.part = await checkCompliance(part, { fps: tl.fps });
    } else {
      // ---- master
      const master = path.join(paths.out, `${id}.master.mp4`);
      written.push(master);
      progress({ phase: 'master', done: 0, total: segDur });
      await encodeMaster({
        video,
        audio: mix,
        out: master,
        fps: tl.fps,
        duration: tl.duration,
        fast: opts.fast,
        signal,
        onTime: timeProgress('master'),
      });
      outputs.master = master;
      compliance.master = await checkCompliance(master, { fps: tl.fps });

      // ---- share
      let shareKbps: number | undefined;
      if (!opts.skipShare) {
        const share = path.join(paths.out, `${id}.share.mp4`);
        written.push(share);
        const shareMb = opts.shareMb ?? Number(process.env.REELFORGE_SHARE_SIZE ?? tl.preset.shareMb);
        progress({ phase: 'share', done: 0, total: segDur });
        // The share file never needs more bits than the master already uses (short clips).
        const masterVideoKbps =
          Math.floor((compliance.master!.info.size * 8) / 1000 / tl.duration) - AUDIO_KBPS_MASTER;
        let r = await encodeShare({
          maxKbps: Math.max(MIN_SHARE_VIDEO_KBPS, masterVideoKbps),
          video,
          audio: mix,
          out: share,
          fps: tl.fps,
          duration: tl.duration,
          shareMb,
          tmpDir: tmp,
          fast: opts.fast,
          signal,
          onTime: timeProgress('share'),
        });
        let c = await checkCompliance(share, { fps: tl.fps, maxBytes: shareMb * 1048576 });
        if (!c.ok && c.problems.some((p) => p.startsWith('size'))) {
          log(`share file over target; re-encoding at 90% bitrate`);
          r = await encodeShare({
            video,
            audio: mix,
            out: share,
            fps: tl.fps,
            duration: tl.duration,
            shareMb: shareMb * 0.9,
            tmpDir: tmp,
            fast: opts.fast,
            signal,
          });
          c = await checkCompliance(share, { fps: tl.fps, maxBytes: shareMb * 1048576 });
        }
        shareKbps = r.kbps;
        outputs.share = share;
        compliance.share = c;
      }

      // ---- extras: SRT, contact sheet, publish.md
      progress({ phase: 'extras', done: 0, total: 3 });
      const srt = path.join(paths.out, `${id}.srt`);
      writeFileSync(srt, toSrt(tl));
      outputs.srt = srt;
      const sheet = path.join(paths.out, `${id}.sheet.jpg`);
      written.push(sheet);
      await contactSheet(video, sheet, tl.frames, signal);
      outputs.sheet = sheet;
      const pub = path.join(paths.out, 'publish.md');
      writeFileSync(
        pub,
        toPublishMd(res.spec!, tl, {
          share: outputs.share ? path.relative(paths.dir, outputs.share) : undefined,
          master: path.relative(paths.dir, master),
        }),
      );
      outputs.publish = pub;
      progress({ phase: 'extras', done: 3, total: 3 });
      success = true;
      progress({ phase: 'done', done: 1, total: 1 });
      return finish(compliance, shareKbps);
    }
    success = true;
    progress({ phase: 'done', done: 1, total: 1 });
    return finish(compliance);

    function finish(compliance: RenderResult['compliance'], shareKbps?: number): RenderResult {
      const bad = Object.values(compliance).some((c) => c && !c.ok);
      return {
        ok: !bad,
        issues,
        outputs,
        compliance,
        frames: total,
        seconds: (Date.now() - t0) / 1000,
        shareKbps,
      };
    }
  } catch (e) {
    if (signal?.aborted) {
      for (const f of written) rmSync(f, { force: true });
      throw new RenderError('Render aborted; partial files removed', issues);
    }
    if (e instanceof RenderError) throw new RenderError(e.message, issues);
    throw e;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    if ((success || signal?.aborted || !opts.keepTmp) && existsSync(tmp)) {
      if (!opts.keepTmp || success) rmSync(tmp, { recursive: true, force: true });
    }
    const parent = path.join(paths.out, '.tmp');
    try {
      rmdirSync(parent);
    } catch {
      /* not empty or missing */
    }
  }
}
