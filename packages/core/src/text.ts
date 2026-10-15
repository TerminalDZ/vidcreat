/** Text utilities for mixed Arabic / Latin scripts. */

export const ARABIC_RE = /[؀-ۿ]/;
export const LATIN_RE = /[A-Za-z]/;
export const TATWEEL = 'ـ';
export const NBSP = ' ';
/** Punctuation ignored for word weighting and matching (SRS §5.2). */
const PUNCT_RE = /[،؟؛.,?!:;"'“”«»()[\]{}…\-–—]/g;
const DIACRITICS_RE = /[ً-ٰٟۖ-ۭ]/g;

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
