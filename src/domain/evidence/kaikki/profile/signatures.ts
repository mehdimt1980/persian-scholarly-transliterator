/**
 * Official Wiktionary Persian Source Profile Signatures (Phase 7E).
 *
 * Defines the phonological/orthographic distinctions between Iranian Persian
 * and Classical Persian / Dari romanization conventions on English Wiktionary.
 *
 * References:
 *   - Wiktionary:About Persian (Romanization conventions)
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
    sourceReference: 'Wiktionary:About Persian'
  },
  {
    id: 'SIG_IRA_SHORT_E_KASRA',
    profile: 'IRANIAN',
    phenomenon: 'Short E for kasra',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'e',
    pairedCounterpart: 'i',
    description: 'Wiktionary Iranian romanization uses e for short /e/ (kasra/ezafe)',
    sourceReference: 'Wiktionary:About Persian'
  },
  {
    id: 'SIG_IRA_SHORT_O_ZAMMA',
    profile: 'IRANIAN',
    phenomenon: 'Short O for zamma/damma',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'o',
    pairedCounterpart: 'u',
    description: 'Wiktionary Iranian romanization uses o for short /o/ (zamma)',
    sourceReference: 'Wiktionary:About Persian'
  },
  {
    id: 'SIG_IRA_DIPHTHONG_EY',
    profile: 'IRANIAN',
    phenomenon: 'Diphthong ey',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'ey',
    pairedCounterpart: 'ay',
    description: 'Wiktionary Iranian romanization uses ey for /ej/',
    sourceReference: 'Wiktionary:About Persian'
  },
  {
    id: 'SIG_IRA_DIPHTHONG_OW',
    profile: 'IRANIAN',
    phenomenon: 'Diphthong ow',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'ow',
    pairedCounterpart: 'aw',
    description: 'Wiktionary Iranian romanization uses ow for /ow/',
    sourceReference: 'Wiktionary:About Persian'
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
    sourceReference: 'Wiktionary:About Persian'
  },
  {
    id: 'SIG_CLS_SHORT_I_KASRA',
    profile: 'CLASSICAL_DARI',
    phenomenon: 'Short I for kasra',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'i',
    pairedCounterpart: 'e',
    description: 'Wiktionary Classical/Dari romanization uses i for short /i/ (kasra/izafat)',
    sourceReference: 'Wiktionary:About Persian'
  },
  {
    id: 'SIG_CLS_SHORT_U_ZAMMA',
    profile: 'CLASSICAL_DARI',
    phenomenon: 'Short U for zamma/damma',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'u',
    pairedCounterpart: 'o',
    description: 'Wiktionary Classical/Dari romanization uses u for short /u/ (zamma)',
    sourceReference: 'Wiktionary:About Persian'
  },
  {
    id: 'SIG_CLS_LONG_I_MACRON',
    profile: 'CLASSICAL_DARI',
    phenomenon: 'Long I with macron (ī)',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'ī',
    pairedCounterpart: 'i',
    description: 'Wiktionary Classical/Dari romanization uses ī for long /iː/ (ya-yi ma\'ruf)',
    sourceReference: 'Wiktionary:About Persian'
  },
  {
    id: 'SIG_CLS_LONG_U_MACRON',
    profile: 'CLASSICAL_DARI',
    phenomenon: 'Long U with macron (ū)',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'ū',
    pairedCounterpart: 'u',
    description: 'Wiktionary Classical/Dari romanization uses ū for long /uː/ (waw-i ma\'ruf)',
    sourceReference: 'Wiktionary:About Persian'
  },
  {
    id: 'SIG_CLS_MAJHUL_E_MACRON',
    profile: 'CLASSICAL_DARI',
    phenomenon: 'Long E with macron (ē)',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'ē',
    pairedCounterpart: 'i',
    description: 'Wiktionary Classical/Dari romanization uses ē for majhul /eː/ (ya-yi majhul)',
    sourceReference: 'Wiktionary:About Persian'
  },
  {
    id: 'SIG_CLS_MAJHUL_O_MACRON',
    profile: 'CLASSICAL_DARI',
    phenomenon: 'Long O with macron (ō)',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'ō',
    pairedCounterpart: 'u',
    description: 'Wiktionary Classical/Dari romanization uses ō for majhul /oː/ (waw-i majhul)',
    sourceReference: 'Wiktionary:About Persian'
  },
  {
    id: 'SIG_CLS_DIPHTHONG_AY',
    profile: 'CLASSICAL_DARI',
    phenomenon: 'Diphthong ay / ai',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'ay',
    pairedCounterpart: 'ey',
    description: 'Wiktionary Classical/Dari romanization uses ay for /aj/',
    sourceReference: 'Wiktionary:About Persian'
  },
  {
    id: 'SIG_CLS_DIPHTHONG_AW',
    profile: 'CLASSICAL_DARI',
    phenomenon: 'Diphthong aw / au',
    category: 'PROFILE_DISCRIMINATIVE',
    sourceVowelOrDiphthong: 'aw',
    pairedCounterpart: 'ow',
    description: 'Wiktionary Classical/Dari romanization uses aw for /aw/',
    sourceReference: 'Wiktionary:About Persian'
  }
];

export const DISCRIMINATIVE_IRANIAN_VOWELS = new Set(['â', 'e', 'o', 'ey', 'ow']);
export const DISCRIMINATIVE_CLASSICAL_VOWELS = new Set(['ā', 'ī', 'ū', 'ē', 'ō', 'ay', 'aw', 'ai', 'au']);

/**
 * Shared non-discriminative symbols (e.g. short 'a' for fathah exists in both).
 */
export const SHARED_NON_DISCRIMINATIVE_VOWELS = new Set(['a']);
