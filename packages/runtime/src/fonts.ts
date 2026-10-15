/** Font readiness (FR-RT-2): every bundled face is loaded explicitly before the first frame. */
const PROBES: [string, string][] = [
  ["800 66px 'Cairo'", 'عربي'],
  ["800 66px 'Cairo'", 'Abc'],
  ["700 60px 'Space Grotesk'", 'Abc'],
  ["600 30px 'JetBrains Mono'", 'Abc'],
];

export async function loadFonts(): Promise<{ ok: boolean; missing: string[] }> {
  const fonts = document.fonts;
  if (!fonts?.load) return { ok: true, missing: [] };
  await Promise.all(PROBES.map(([spec, text]) => fonts.load(spec, text).catch(() => [])));
  await fonts.ready;
  const missing = PROBES.filter(([spec, text]) => !fonts.check(spec, text)).map(([spec]) => spec);
  return { ok: missing.length === 0, missing };
}
