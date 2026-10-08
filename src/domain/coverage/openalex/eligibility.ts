/**
 * Persian script eligibility filter for OpenAlex scholarly titles.
 *
 * Core Scholarly Invariants:
 *   - OpenAlex language=fa is only an acquisition prefilter.
 *   - Every accepted title must independently pass Persian-script validation.
 *   - Conservative validation: DO NOT require Persian-specific characters (پ چ ژ گ).
 *   - Must NOT import engine, lexicon, fallback repositories, or candidate modules.
 */

import { normalizePersian } from '../../normalization';

export type EligibilityRejectionReason =
  | 'EMPTY_TITLE'
  | 'NOT_LANGUAGE_FA'
  | 'INSUFFICIENT_ARABIC_SCRIPT'
  | 'FEWER_THAN_TWO_PERSIAN_TOKENS'
  | 'PRIMARY_LATIN_METADATA'
  | 'ONLY_PUNCTUATION_OR_NUMBERS'
  | 'DUPLICATE_NORMALIZED_TITLE';

export interface TitleEligibilityResult {
  eligible: boolean;
  rejectionReason?: EligibilityRejectionReason;
  normalizedTitle: string;
  persianTokenCount: number;
  arabicLetterCount: number;
  latinLetterCount: number;
}

const ARABIC_SCRIPT_LETTER = /^(?=\p{Script=Arabic}$)\p{L}$/u;
const LATIN_LETTER = /^(?=\p{Script=Latin}$)\p{L}$/u;
const COMBINING_MARK = /^\p{M}$/u;
const ZWNJ = '\u200c';

function countScripts(text: string): { arabicLetters: number; latinLetters: number } {
  let arabicLetters = 0;
  let latinLetters = 0;
  for (const char of text) {
    if (ARABIC_SCRIPT_LETTER.test(char)) {
      arabicLetters += 1;
    } else if (LATIN_LETTER.test(char)) {
      latinLetters += 1;
    }
  }
  return { arabicLetters, latinLetters };
}

function countPersianLexicalTokens(normalizedText: string): number {
  let count = 0;
  let inWord = false;
  let wordArabicLetters = 0;

  for (let i = 0; i < normalizedText.length; i++) {
    const char = normalizedText[i];
    const isArabic = ARABIC_SCRIPT_LETTER.test(char);
    const isMark = COMBINING_MARK.test(char) || char === ZWNJ;

    if (isArabic || isMark) {
      inWord = true;
      if (isArabic) wordArabicLetters += 1;
    } else {
      if (inWord) {
        if (wordArabicLetters > 0) {
          count += 1;
        }
        inWord = false;
        wordArabicLetters = 0;
      }
    }
  }

  if (inWord && wordArabicLetters > 0) {
    count += 1;
  }

  return count;
}

export function evaluateTitleEligibility(
  rawTitle: string | undefined | null,
  language: string | undefined | null,
  seenNormalizedTitles?: Set<string>
): TitleEligibilityResult {
  if (!rawTitle || typeof rawTitle !== 'string' || rawTitle.trim().length === 0) {
    return {
      eligible: false,
      rejectionReason: 'EMPTY_TITLE',
      normalizedTitle: '',
      persianTokenCount: 0,
      arabicLetterCount: 0,
      latinLetterCount: 0
    };
  }

  if (language !== 'fa') {
    return {
      eligible: false,
      rejectionReason: 'NOT_LANGUAGE_FA',
      normalizedTitle: rawTitle.trim(),
      persianTokenCount: 0,
      arabicLetterCount: 0,
      latinLetterCount: 0
    };
  }

  const normalized = normalizePersian(rawTitle.trim()).normalizedInput.trim();
  const { arabicLetters, latinLetters } = countScripts(normalized);
  const latinLetterCount = latinLetters;
  const persianTokenCount = countPersianLexicalTokens(normalized);

  if (arabicLetters === 0) {
    return {
      eligible: false,
      rejectionReason: 'ONLY_PUNCTUATION_OR_NUMBERS',
      normalizedTitle: normalized,
      persianTokenCount: 0,
      arabicLetterCount: 0,
      latinLetterCount
    };
  }

  if (latinLetters >= arabicLetters || latinLetters > arabicLetters * 0.5) {
    return {
      eligible: false,
      rejectionReason: 'PRIMARY_LATIN_METADATA',
      normalizedTitle: normalized,
      persianTokenCount,
      arabicLetterCount: arabicLetters,
      latinLetterCount
    };
  }

  if (arabicLetters < 4) {
    return {
      eligible: false,
      rejectionReason: 'INSUFFICIENT_ARABIC_SCRIPT',
      normalizedTitle: normalized,
      persianTokenCount,
      arabicLetterCount: arabicLetters,
      latinLetterCount
    };
  }

  if (persianTokenCount < 2) {
    return {
      eligible: false,
      rejectionReason: 'FEWER_THAN_TWO_PERSIAN_TOKENS',
      normalizedTitle: normalized,
      persianTokenCount,
      arabicLetterCount: arabicLetters,
      latinLetterCount
    };
  }

  if (seenNormalizedTitles && seenNormalizedTitles.has(normalized)) {
    return {
      eligible: false,
      rejectionReason: 'DUPLICATE_NORMALIZED_TITLE',
      normalizedTitle: normalized,
      persianTokenCount,
      arabicLetterCount: arabicLetters,
      latinLetterCount
    };
  }

  return {
    eligible: true,
    normalizedTitle: normalized,
    persianTokenCount,
    arabicLetterCount: arabicLetters,
    latinLetterCount
  };
}
