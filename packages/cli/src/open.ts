/** Opens a URL in the default browser (best effort, no shell string building). */
import { spawn } from 'node:child_process';

export function openBrowser(url: string): void {
  if (process.env.REELFORGE_NO_OPEN || process.env.CI) return;
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url]]
        : ['xdg-open', [url]];
  try {
    const p = spawn(cmd, args as string[], { stdio: 'ignore', detached: true, windowsHide: true });
    p.on('error', () => undefined);
    p.unref();
  } catch {
    /* no browser available: the URL is printed anyway */
  }
}
