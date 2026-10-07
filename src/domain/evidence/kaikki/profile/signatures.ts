/**
 * Official Wiktionary Persian Source Profile Signatures (Phase 7E Hardened).
 *
 * Defines the phonological/orthographic distinctions between Iranian Persian
 * and Classical Persian / Dari romanization conventions on English Wiktionary.
 *
 * References:
 *   - Classical: https://en.wiktionary.org/wiki/Wiktionary:Persian_transliteration/Classical
 *   - Iranian: https://en.wiktionary.org/wiki/Wiktionary:Persian_transliteration/Iranian
 *   - Module:fa-translit (Wiktionary Lua transliteration engine)
 */

import type { WiktionarySourceProfileSignature } from './types';

export const WIKTIONARY_PROFILE_SIGNATURES: WiktionarySourceProfileSignature[] = [
  // 1. Iranian Distinctive Vowels & Diphthongs
  {
    id: 'SIG_IRA_LONG_A_CIRCUMFLEX',
    profile: 'IRANIAN',
    phenomenon: 'Long A with circumflex (â)',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'â',
    pairedCounterpart: 'ā',
    description: 'Wiktionary Iranian romanization uses â for long /ɒː/ / /ɑː/',
    sourceReference: 'https://en.wiktionary.org/wiki/Wiktionary:Persian_transliteration/Iranian'
  },
  {
    id: 'SIG_IRA_SHORT_E_KASRA',
    profile: 'IRANIAN',
    phenomenon: 'Short E for kasra',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'e',
    pairedCounterpart: 'i',
    description: 'Wiktionary Iranian romanization uses e for short /e/ (kasra/ezafe)',
    sourceReference: 'https://en.wiktionary.org/wiki/Wiktionary:Persian_transliteration/Iranian'
  },
  {
    id: 'SIG_IRA_SHORT_O_ZAMMA',
    profile: 'IRANIAN',
    phenomenon: 'Short O for zamma/damma',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'o',
    pairedCounterpart: 'u',
    description: 'Wiktionary Iranian romanization uses o for short /o/ (zamma)',
    sourceReference: 'https://en.wiktionary.org/wiki/Wiktionary:Persian_transliteration/Iranian'
  },
  {
    id: 'SIG_IRA_DIPHTHONG_EY',
    profile: 'IRANIAN',
    phenomenon: 'Diphthong ey',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'ey',
    pairedCounterpart: 'ay',
    description: 'Wiktionary Iranian romanization uses ey for /ej/',
    sourceReference: 'https://en.wiktionary.org/wiki/Wiktionary:Persian_transliteration/Iranian'
  },
  {
    id: 'SIG_IRA_DIPHTHONG_OW',
    profile: 'IRANIAN',
    phenomenon: 'Diphthong ow',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'ow',
    pairedCounterpart: 'aw',
    description: 'Wiktionary Iranian romanization uses ow for /ow/',
    sourceReference: 'https://en.wiktionary.org/wiki/Wiktionary:Persian_transliteration/Iranian'
  },

  // 2. Classical / Dari Distinctive Vowels & Diphthongs
  {
    id: 'SIG_CLS_LONG_A_MACRON',
    profile: 'CLASSICAL_DARI',
    phenomenon: 'Long A with macron (ā)',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'ā',
    pairedCounterpart: 'â',
    description: 'Wiktionary Classical/Dari romanization uses ā for long /aː/',
    sourceReference: 'https://en.wiktionary.org/wiki/Wiktionary:Persian_transliteration/Classical'
  },
  {
    id: 'SIG_CLS_SHORT_I_KASRA',
    profile: 'CLASSICAL_DARI',
    phenomenon: 'Short I for kasra',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'i',
    pairedCounterpart: 'e',
    description: 'Wiktionary Classical/Dari romanization uses i for short /i/ (kasra/izafat)',
    sourceReference: 'https://en.wiktionary.org/wiki/Wiktionary:Persian_transliteration/Classical'
  },
  {
    id: 'SIG_CLS_SHORT_U_ZAMMA',
    profile: 'CLASSICAL_DARI',
    phenomenon: 'Short U for zamma/damma',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'u',
    pairedCounterpart: 'o',
    description: 'Wiktionary Classical/Dari romanization uses u for short /u/ (zamma)',
    sourceReference: 'https://en.wiktionary.org/wiki/Wiktionary:Persian_transliteration/Classical'
  },
  {
    id: 'SIG_CLS_LONG_I_MACRON',
    profile: 'CLASSICAL_DARI',
    phenomenon: 'Long I with macron (ī)',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'ī',
    pairedCounterpart: 'i',
    description: "Wiktionary Classical/Dari romanization uses ī for long /iː/ (ya-yi ma'ruf)",
    sourceReference: 'https://en.wiktionary.org/wiki/Wiktionary:Persian_transliteration/Classical'
  },
  {
    id: 'SIG_CLS_LONG_U_MACRON',
    profile: 'CLASSICAL_DARI',
    phenomenon: 'Long U with macron (ū)',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'ū',
    pairedCounterpart: 'u',
    description: "Wiktionary Classical/Dari romanization uses ū for long /uː/ (waw-i ma'ruf)",
    sourceReference: 'https://en.wiktionary.org/wiki/Wiktionary:Persian_transliteration/Classical'
  },
  {
    id: 'SIG_CLS_MAJHUL_E_MACRON',
    profile: 'CLASSICAL_DARI',
    phenomenon: 'Long E with macron (ē)',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'ē',
    pairedCounterpart: 'i',
    description: 'Wiktionary Classical/Dari romanization uses ē for majhul /eː/ (ya-yi majhul), merged to Iranian /i/',
    sourceReference: 'https://en.wiktionary.org/wiki/Wiktionary:Persian_transliteration/Classical'
  },
  {
    id: 'SIG_CLS_MAJHUL_O_MACRON',
    profile: 'CLASSICAL_DARI',
    phenomenon: 'Long O with macron (ō)',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'ō',
    pairedCounterpart: 'u',
    description: 'Wiktionary Classical/Dari romanization uses ō for majhul /oː/ (waw-i majhul), merged to Iranian /u/',
    sourceReference: 'https://en.wiktionary.org/wiki/Wiktionary:Persian_transliteration/Classical'
  },
  {
    id: 'SIG_CLS_DIPHTHONG_AY',
    profile: 'CLASSICAL_DARI',
    phenomenon: 'Diphthong ay',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'ay',
    pairedCounterpart: 'ey',
    description: 'Wiktionary Classical/Dari romanization uses ay for /aj/',
    sourceReference: 'https://en.wiktionary.org/wiki/Wiktionary:Persian_transliteration/Classical'
  },
  {
    id: 'SIG_CLS_DIPHTHONG_AW',
    profile: 'CLASSICAL_DARI',
    phenomenon: 'Diphthong aw',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'aw',
    pairedCounterpart: 'ow',
    description: 'Wiktionary Classical/Dari romanization uses aw for /aw/',
    sourceReference: 'https://en.wiktionary.org/wiki/Wiktionary:Persian_transliteration/Classical'
  }
];

export const DISCRIMINATIVE_IRANIAN_VOWELS = new Set(['â', 'e', 'o', 'ey', 'ow']);
export const DISCRIMINATIVE_CLASSICAL_VOWELS = new Set(['ā', 'ī', 'ū', 'ē', 'ō', 'ay', 'aw']);

/**
 * Shared non-discriminative symbols (e.g. short 'a' for fathah exists in both).
 */
export const SHARED_NON_DISCRIMINATIVE_VOWELS = new Set(['a']);

export interface ProfileSlotCorrespondence {
  signatureId: string;
  phenomenon: string;
  isDiscriminative: boolean;
  classicalUnit: string;
  iranianUnit: string;
}

/**
 * Strict policy lookup for position-aligned slot correspondences.
 */
export function matchAlignedSlotCorrespondence(
  classicalUnit: string,
  iranianUnit: string
): ProfileSlotCorrespondence | null {
  const c = classicalUnit.normalize('NFC').toLowerCase();
  const i = iranianUnit.normalize('NFC').toLowerCase();

  // Discriminative correspondences
  if (c === 'ā' && i === 'â') {
    return {
      signatureId: 'SIG_PAIR_LONG_A',
      phenomenon: 'Long A (ā ↔ â)',
      isDiscriminative: true,
      classicalUnit: c,
      iranianUnit: i
    };
  }
  if (c === 'i' && i === 'e') {
    return {
      signatureId: 'SIG_PAIR_SHORT_KASRA',
      phenomenon: 'Kasra (i ↔ e)',
      isDiscriminative: true,
      classicalUnit: c,
      iranianUnit: i
    };
  }
  if (c === 'u' && i === 'o') {
    return {
      signatureId: 'SIG_PAIR_SHORT_ZAMMA',
      phenomenon: 'Zamma (u ↔ o)',
      isDiscriminative: true,
      classicalUnit: c,
      iranianUnit: i
    };
  }
  if (c === 'ī' && i === 'i') {
    return {
      signatureId: 'SIG_PAIR_LONG_I',
      phenomenon: 'Long I (ī ↔ i)',
      isDiscriminative: true,
      classicalUnit: c,
      iranianUnit: i
    };
  }
  if (c === 'ū' && i === 'u') {
    return {
      signatureId: 'SIG_PAIR_LONG_U',
      phenomenon: 'Long U (ū ↔ u)',
      isDiscriminative: true,
      classicalUnit: c,
      iranianUnit: i
    };
  }
  if (c === 'ē' && i === 'i') {
    return {
      signatureId: 'SIG_PAIR_MAJHUL_E_TO_I',
      phenomenon: 'Majhul E (ē ↔ i)',
      isDiscriminative: true,
      classicalUnit: c,
      iranianUnit: i
    };
  }
  if (c === 'ō' && i === 'u') {
    return {
      signatureId: 'SIG_PAIR_MAJHUL_O_TO_U',
      phenomenon: 'Majhul O (ō ↔ u)',
      isDiscriminative: true,
      classicalUnit: c,
      iranianUnit: i
    };
  }
  if (c === 'ay' && i === 'ey') {
    return {
      signatureId: 'SIG_PAIR_DIPHTHONG_AY_EY',
      phenomenon: 'Diphthong (ay ↔ ey)',
      isDiscriminative: true,
      classicalUnit: c,
      iranianUnit: i
    };
  }
  if (c === 'aw' && i === 'ow') {
    return {
      signatureId: 'SIG_PAIR_DIPHTHONG_AW_OW',
      phenomenon: 'Diphthong (aw ↔ ow)',
      isDiscriminative: true,
      classicalUnit: c,
      iranianUnit: i
    };
  }

  // Compatible non-discriminative correspondences (e.g. shared fathah 'a')
  if (c === 'a' && i === 'a') {
    return {
      signatureId: 'SIG_SHARED_FATHAH_A',
      phenomenon: 'Shared Fathah (a ↔ a)',
      isDiscriminative: false,
      classicalUnit: c,
      iranianUnit: i
    };
  }

  return null;
}

/**
 * Verified Structural Profile Rules Registry.
 *
 * For Phase 7E: Tier B structural recovery architecture is fully implemented,
 * but the production registry remains empty until exact template argument semantics
 * (e.g. distinguishing transliteration strings from dialect selectors) are source-verified.
 */
export const VERIFIED_STRUCTURAL_PROFILE_RULES: import('./types').VerifiedStructuralProfileRule[] = [];

