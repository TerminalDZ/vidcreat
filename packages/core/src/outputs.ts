/** Text outputs: SRT captions and publish.md (SRS FR-REN-7). */
import type { EpisodeSpec } from './schema/episode.js';
import type { Timeline } from './types.js';

function srtTime(t: number): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

const RLE = '‫';
const PDF = '‬';

/** SRT from caption chunks. RTL chunks are wrapped in an RTL embedding so players lay them out correctly. */
export function toSrt(tl: Timeline, range?: { from: number; to: number }): string {
  const from = range?.from ?? 0;
  const to = range?.to ?? tl.duration;
  const blocks: string[] = [];
  for (const c of tl.captions) {
    if (c.end <= from || c.start >= to) continue;
    const text = c.text.replaceAll('\u00A0', ' ');
    blocks.push(
      `${blocks.length + 1}\n${srtTime(Math.max(c.start, from) - from)} --> ${srtTime(Math.min(c.end, to) - from)}\n${c.dir === 'rtl' ? `${RLE}${text}${PDF}` : text}\n`,
    );
  }
  return blocks.join('\n');
}

export function toPublishMd(
  spec: EpisodeSpec,
  tl: Timeline,
  files: { share?: string; master?: string } = {},
): string {
  const p = spec.meta.publish ?? { hashtags: [] };
  const lines: string[] = [];
  const title = [spec.meta.series, `EP${String(spec.meta.episode).padStart(2, '0')}`, spec.meta.title]
    .filter(Boolean)
    .join(' · ');
  lines.push(`# ${title}`, '');
  lines.push(
    `- Duration: ${tl.duration.toFixed(1)} s · ${tl.preset.label} preset · ${tl.width}×${tl.height} @ ${tl.fps} fps`,
  );
  if (files.share) lines.push(`- Upload file: \`${files.share}\``);
  if (files.master) lines.push(`- Master: \`${files.master}\``);
  lines.push('');
  if (p.cover) lines.push('## Cover text', '', p.cover, '');
  const caption = [p.caption?.trim(), p.hashtags.length ? p.hashtags.join(' ') : '']
    .filter(Boolean)
    .join('\n\n');
  if (caption) lines.push('## Caption', '', '```text', caption, '```', '');
  if (p.pinned) lines.push('## Pinned comment', '', '```text', p.pinned.trim(), '```', '');
  if (tl.chapters.length) {
    lines.push('## Chapters', '');
    for (const ch of tl.chapters) {
      const m = Math.floor(ch.t / 60);
      const s = Math.floor(ch.t % 60);
      lines.push(`- ${m}:${String(s).padStart(2, '0')} ${ch.label}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
