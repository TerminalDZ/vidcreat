/** Font readiness (FR-RT-2): every bundled face is loaded explicitly before the first frame. */
const PROBES: [string, string][] = [
  ["800 66px 'Cairo'", 'عربي'],
  ["800 66px 'Cairo'", 'Abc'],
  ["700 60px 'Space Grotesk'", 'Abc'],
  ["600 30px 'JetBrains Mono'", 'Abc'],
  // Theme pairings: every bundled family is ready whatever theme the timeline uses.
  ["700 60px 'Inter'", 'Abc'],
  ["700 60px 'Manrope'", 'Abc'],
  ["700 60px 'Playfair Display'", 'Abc'],
  ["700 66px 'Noto Kufi Arabic'", 'عربي'],
  ["700 66px 'Noto Kufi Arabic'", 'Abc'],
  ["700 66px 'Noto Naskh Arabic'", 'عربي'],
  ["700 66px 'Noto Naskh Arabic'", 'Abc'],
  ["700 66px 'Readex Pro'", 'عربي'],
  ["700 66px 'Readex Pro'", 'Abc'],
];

export async function loadFonts(): Promise<{ ok: boolean; missing: string[] }> {
  const fonts = document.fonts;
  if (!fonts?.load) return { ok: true, missing: [] };
  await Promise.all(PROBES.map(([spec, text]) => fonts.load(spec, text).catch(() => [])));
  await fonts.ready;
  const missing = PROBES.filter(([spec, text]) => !fonts.check(spec, text)).map(([spec]) => spec);
  return { ok: missing.length === 0, missing };
}
