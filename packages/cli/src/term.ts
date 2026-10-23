/** Terminal output: colors (NO_COLOR aware), issue formatting, progress line. */
import path from 'node:path';
import type { Issue } from '@reelforge/core';

const useColor = () => !process.env.NO_COLOR && process.stderr.isTTY && process.env.TERM !== 'dumb';
const wrap = (code: number) => (s: string) => (useColor() ? `\x1b[${code}m${s}\x1b[0m` : s);
export const c = {
  red: wrap(31),
  green: wrap(32),
  yellow: wrap(33),
  blue: wrap(34),
  magenta: wrap(35),
  cyan: wrap(36),
  dim: wrap(2),
  bold: wrap(1),
};

export function formatIssue(i: Issue, cwd = process.cwd()): string {
  const file = i.file ? path.relative(cwd, i.file) || i.file : '';
  const where = file ? `${file}${i.line ? `:${i.line}:${i.col ?? 1}` : ''}` : '';
  const at = i.time !== undefined ? c.dim(` @${i.time.toFixed(2)}s`) : '';
  const lvl = i.level === 'error' ? c.red('error') : i.level === 'warn' ? c.yellow('warn ') : c.cyan('info ');
  const head = `${where ? `${c.bold(where)}  ` : ''}${lvl} ${c.dim(i.rule.padEnd(4))} ${i.message}${at}`;
  return i.hint ? `${head}\n        ${c.dim('→')} ${i.hint}` : head;
}

export function summary(issues: Issue[]): string {
  const n = (l: Issue['level']) => issues.filter((i) => i.level === l).length;
  const e = n('error');
  const w = n('warn');
  const parts = [`${e} error${e === 1 ? '' : 's'}`, `${w} warning${w === 1 ? '' : 's'}`, `${n('info')} info`];
  return e ? c.red(parts.join(', ')) : w ? c.yellow(parts.join(', ')) : c.green(parts.join(', '));
}

export const fmtDur = (sec: number): string => {
  if (!Number.isFinite(sec)) return '--:--';
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function bar(done: number, total: number, width = 24): string {
  const k = total > 0 ? Math.min(1, done / total) : 0;
  const n = Math.round(k * width);
  return `[${'#'.repeat(n)}${'-'.repeat(width - n)}] ${(k * 100).toFixed(0).padStart(3)}%`;
}

let lastLen = 0;
export function statusLine(text: string): void {
  if (!process.stderr.isTTY) return;
  const pad = Math.max(0, lastLen - text.length);
  process.stderr.write(`\r${text}${' '.repeat(pad)}`);
  lastLen = text.length;
}
export function endStatus(): void {
  if (process.stderr.isTTY && lastLen) process.stderr.write('\n');
  lastLen = 0;
}
