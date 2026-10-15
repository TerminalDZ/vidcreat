/** Deterministic frame capture through the DevTools protocol (FR-REN-2). */
import type { CDPSession, Page } from 'playwright';

export interface Capturer {
  frame(t: number): Promise<Buffer>;
}

export async function createCapturer(page: Page, opts: { format: 'jpeg' | 'png'; quality: number }): Promise<Capturer> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  return {
    async frame(t: number) {
      await page.evaluate((tt) => window.reelforge.render(tt), t);
      const res = (await cdp.send('Page.captureScreenshot', {
        format: opts.format,
        quality: opts.format === 'jpeg' ? opts.quality : undefined,
        captureBeyondViewport: false,
        fromSurface: true,
        optimizeForSpeed: true,
      })) as { data: string };
      return Buffer.from(res.data, 'base64');
    },
  };
}
