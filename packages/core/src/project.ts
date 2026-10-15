/** File-system layout: project root, episode folders, built-in themes and presets. */
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root of the ReelForge installation (holds the built-in themes/ and presets/). */
export const INSTALL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const BUILTIN_THEMES = path.join(INSTALL_ROOT, 'themes');
export const BUILTIN_PRESETS = path.join(INSTALL_ROOT, 'presets');

export interface EpisodePaths {
  id: string;
  dir: string;
  root: string;
  yaml: string;
  cues: string;
  out: string;
  assets: string;
}

/** Project root: --root flag, REELFORGE_ROOT, or the current directory (12-Factor). */
export function projectRoot(flag?: string): string {
  return path.resolve(flag ?? process.env.REELFORGE_ROOT ?? process.cwd());
}

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

/**
 * Resolves an episode argument: `<root>/episodes/<id>`, then `<id>` as a path
 * (absolute or relative to the root / cwd), then `<root>/examples/**` (season folders).
 */
export function resolveEpisode(arg: string, root = projectRoot()): EpisodePaths | undefined {
  const candidates = [
    path.join(root, 'episodes', arg),
    path.resolve(root, arg),
    path.resolve(arg),
    path.join(root, 'examples', arg),
    path.join(root, 'examples', 'season1', arg),
  ];
  const dir = candidates.find((c) => isDir(c) && existsSync(path.join(c, 'episode.yaml')));
  if (!dir) return undefined;
  return episodePaths(dir, root);
}

export function episodePaths(dir: string, root = projectRoot()): EpisodePaths {
  return {
    id: path.basename(dir),
    dir,
    root,
    yaml: path.join(dir, 'episode.yaml'),
    cues: path.join(dir, 'cues.json'),
    out: path.join(dir, 'out'),
    assets: path.join(dir, 'assets'),
  };
}

/** Finds a named resource (`<name>.<kind>.yaml`) in the project, then in the installation. */
export function findResource(kind: 'theme' | 'preset', name: string, root: string, episodeDir: string): string | undefined {
  if (name.includes('/') || name.includes('\\') || name.endsWith('.yaml')) {
    const p = path.resolve(episodeDir, name);
    return existsSync(p) ? p : undefined;
  }
  const dirs = kind === 'theme' ? [path.join(root, 'themes'), BUILTIN_THEMES] : [path.join(root, 'presets'), BUILTIN_PRESETS];
  for (const d of dirs) {
    const p = path.join(d, `${name}.${kind}.yaml`);
    if (existsSync(p)) return p;
  }
  return undefined;
}

export function listResources(kind: 'theme' | 'preset', root: string): string[] {
  const dirs = kind === 'theme' ? [path.join(root, 'themes'), BUILTIN_THEMES] : [path.join(root, 'presets'), BUILTIN_PRESETS];
  const names = new Set<string>();
  for (const d of dirs) {
    if (!isDir(d)) continue;
    for (const f of readdirSync(d)) {
      const m = f.match(new RegExp(`^(.+)\\.${kind}\\.yaml$`));
      if (m) names.add(m[1]);
    }
  }
  return [...names].sort();
}
