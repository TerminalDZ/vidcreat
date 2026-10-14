/** Text utilities for mixed Arabic / Latin scripts. */

export const ARABIC_RE = /[؀-ۿ]/;
export const LATIN_RE = /[A-Za-z]/;
export const TATWEEL = '\u0640';
export const NBSP = '\u00A0';
/** Punctuation ignored for word weighting and matching (SRS §5.2). */
const PUNCT_RE = /[،؟؛.,?!:;"'“”«»()[\]{}…\-–—]/g;
const DIACRITICS_RE = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;

export const hasArabic = (s: string): boolean => ARABIC_RE.test(s);
export const hasLatin = (s: string): boolean => LATIN_RE.test(s);

/** Splits a script line into words on whitespace. */
export function splitWords(text: string): string[] {
  return text.trim().split(/\s+/u).filter(Boolean);
}

/** Letters used for word-timing weights: punctuation and tatweel do not count. */
export function letterCount(word: string): number {
  return [...word.replace(PUNCT_RE, '').replace(DIACRITICS_RE, '').replaceAll(TATWEEL, '')].length;
}

const LATIN_VOWEL_GROUPS = /[aeiouyàâäéèêëîïôöùûü]+/g;
const ARABIC_LONG_VOWELS = /[اوىيآ]/g;
const ARABIC_LETTER = /[\u0621-\u064A\u0671-\u06D3]/g;

/**
 * Rough spoken length of a word in syllables (≥ 1), used to place words inside a line.
 * Latin: vowel groups, minus a silent final "e". Arabic script hides short vowels, so it counts
 * consonants as syllable nuclei and adds long vowels. Digits are read as about one syllable each.
 */
export function syllableCount(word: string): number {
  const w = word.replace(PUNCT_RE, '').replace(DIACRITICS_RE, '').replaceAll(TATWEEL, '').toLowerCase();
  let n = 0;
  const latin = w.replace(/[^a-zà-ü]/g, '');
  if (latin) {
    let v = (latin.match(LATIN_VOWEL_GROUPS) ?? []).length;
    if (v > 1 && /[^aeiouy]e$/.test(latin)) v--;
    n += Math.max(1, v);
  }
  const letters = (w.match(ARABIC_LETTER) ?? []).length;
  if (letters) {
    const long = (w.match(ARABIC_LONG_VOWELS) ?? []).length;
    n += Math.max(1, Math.round((letters - long) * 0.55 + long * 0.45));
  }
  n += (w.match(/[0-9٠-٩]/g) ?? []).length;
  return Math.max(1, n);
}

/** Normalized form used to match `l7:'word'` references. */
export function normalizeWord(word: string): string {
  return word
    .replace(PUNCT_RE, '')
    .replace(DIACRITICS_RE, '')
    .replaceAll(TATWEEL, '')
    .replace(/[أإآ]/g, 'ا')
    .toLowerCase();
}

/** Direction of a piece of text: rtl when it contains Arabic script (SRS §9.2 rule 5). */
export const textDir = (s: string): 'rtl' | 'ltr' => (hasArabic(s) ? 'rtl' : 'ltr');
