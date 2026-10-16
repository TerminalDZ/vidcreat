/** Typing schedule for `code` (must match core's codeSchedule used for SFX). */
export function codeScheduleRt(lines: { text: string; at?: number }[], cps: number, enterEnd: number) {
  const out: { start: number; end: number }[] = [];
  let cursor = enterEnd;
  for (const line of lines) {
    const start = typeof line.at === 'number' ? line.at : cursor;
    const end = start + [...line.text].length / cps;
    out.push({ start, end });
    cursor = end;
  }
  return out;
}
