// Fails when a tracked text file contains double-encoded UTF-8 ("mojibake"): UTF-8 bytes that were
// read as Windows-1252 and saved as UTF-8 again, e.g. "â€¦" for "…" or "Ø§Ù„" for "ال".
//   node scripts/check-mojibake.mjs          check (CI)
//   node scripts/check-mojibake.mjs --fix    repair in place (reverses the cp1252 round trip)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const BINARY = /\.(png|jpe?g|gif|ico|webp|wav|mp3|mp4|woff2?|ttf|otf|zip|tgz|rnnn|onnx|pdf|bin)$/i;
// Lead byte of a 2/3-byte UTF-8 sequence read as cp1252, followed by a continuation byte read the same way.
const PATTERNS = [
  /â€[\u0080-\u00BF\u2018-\u201E\u2020-\u2022\u2026\u2030\u2039\u203A\u20AC\u2122\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC]/,
  /â[†‡ˆ‰Š‹Œ][\u0080-\u00BF\u2018-\u203A\u20AC]/,
  /Ã[\u0080-\u00BF\u2018-\u203A\u20AC\u0152\u0153\u0160\u0161\u0178\u017D\u017E]/,
  /[ØÙ][\u0080-\u00BF\u2018-\u203A\u20AC\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u02C6\u02DC]/,
];
const CP1252 = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/** Re-encodes each mojibake run as cp1252 bytes and decodes them as UTF-8. */
function repair(text) {
  return text.replace(/[\u00C2-\u00F4][\u0080-\u00BF\u0152-\u02DC\u2013-\u2122]{1,3}/g, (run) => {
    const bytes = [];
    for (const ch of run) {
      const c = ch.codePointAt(0);
      const b = c < 0x100 ? c : CP1252[c];
      if (b === undefined) return run;
      bytes.push(b);
    }
    const out = Buffer.from(bytes).toString('utf8');
    return out.includes('\uFFFD') ? run : out;
  });
}

const fix = process.argv.includes('--fix');
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const bad = [];
for (const f of files) {
  if (BINARY.test(f) || f === 'scripts/check-mojibake.mjs') continue;
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  const lines = text.split('\n');
  const hits = lines.flatMap((l, i) => (PATTERNS.some((p) => p.test(l)) ? [i + 1] : []));
  if (!hits.length) continue;
  if (fix) {
    writeFileSync(f, repair(text));
    console.log(`fixed ${f}`);
  } else bad.push(`${f}:${hits.slice(0, 5).join(',')}`);
}
if (bad.length) {
  console.error(`Mojibake (double-encoded UTF-8) in:\n  ${bad.join('\n  ')}\nRun: node scripts/check-mojibake.mjs --fix`);
  process.exit(1);
}
if (!fix) console.log(`mojibake: ${files.length} files clean`);
