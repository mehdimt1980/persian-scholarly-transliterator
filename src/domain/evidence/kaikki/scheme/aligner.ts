/**
 * Script-aware alignment and transduction layer for Wiktionary Persian romanization (Phase 7B).
 *
 * Core scholarly invariant:
 *   Transduction combines Persian script orthography (for exact consonant identity,
 *   ʿayn/hamza restoration, and long-vowel letter anchor points) with external romanization
 *   vocalization evidence under verified source profiles.
 *   NEVER perform blind Latin-to-Latin string replacement.
 */

import { PERSIAN_CONSONANT_MAPPINGS } from '../../../../data/ijmes-mappings';
import type { KaikkiSchemeInterpretationBlocker, WiktionaryPersianRomanizationProfile } from './types';

export type WiktionaryAlignmentRole =
  | 'CONSONANT'
  | 'SHORT_VOWEL'
  | 'LONG_VOWEL'
  | 'DIPHTHONG'
  | 'CARRIER_OR_DIACRITIC';

export interface WiktionaryAlignmentSlot {
  persianSpan: [number, number];
  persianGraphemes: string;
  sourceSpan: [number, number];
  sourceUnit: string;
  targetUnit: string;
  appliedRuleId: string;
  role: WiktionaryAlignmentRole;
}

export interface WiktionaryAlignmentResult {
  success: boolean;
  targetHypothesis: string | null;
  appliedRuleIds: string[];
  blockers: KaikkiSchemeInterpretationBlocker[];
  trace?: WiktionaryAlignmentSlot[];
}

/**
 * Strict source-backed consonant compatibility lookup.
 * Binds each Persian grapheme to allowable Roman representations in Wiktionary.
 */
const PERSIAN_TO_ROMAN_CONSONANT_COMPATIBILITY: Record<string, string[]> = {
  // S-class
  س: ['s'],
  ص: ['s', 'ṣ'],
  ث: ['s', 's̱', 'th'],

  // Z-class
  ز: ['z'],
  ض: ['z', 'ż', 'ḍ'],
  ظ: ['z', 'ẓ'],
  ذ: ['z', 'ẕ', 'dh'],

  // H-class
  ه: ['h'],
  ح: ['h', 'ḥ'],

  // T-class
  ت: ['t'],
  ط: ['t', 'ṭ'],

  // Velar/Uvular
  ق: ['q', 'gh', 'ġ', 'ğ'],
  غ: ['gh', 'ġ', 'ğ', 'q'],
  خ: ['kh', 'x'],
  ک: ['k'],
  گ: ['g'],

  // Coronal / Palatal
  ش: ['sh', 'š'],
  چ: ['ch', 'č'],
  ژ: ['zh', 'ž'],
  ج: ['j', 'dj'],

  // Standard labials, liquids, nasals
  ب: ['b'],
  پ: ['p'],
  ف: ['f'],
  د: ['d'],
  ر: ['r'],
  ل: ['l'],
  م: ['m'],
  ن: ['n'],

  // Semivowels
  و: ['v', 'w'],
  ی: ['y', 'j']
};

/**
 * Match and consume an allowed Roman consonant sequence for a given Persian consonant.
 * Returns the number of characters consumed from romanization, or 0 if incompatible.
 */
function matchCompatibleRomanConsonant(pChar: string, rStr: string, rIdx: number): number {
  const allowed = PERSIAN_TO_ROMAN_CONSONANT_COMPATIBILITY[pChar];
  if (!allowed) {
    return 0;
  }

  // Check multi-character matches first (e.g. 'sh', 'kh', 'ch', 'zh', 'gh')
  for (const token of allowed) {
    if (token.length > 1 && rStr.startsWith(token, rIdx)) {
      return token.length;
    }
  }

  // Single-character matches
  for (const token of allowed) {
    if (token.length === 1 && rStr.startsWith(token, rIdx)) {
      return 1;
    }
  }

  return 0;
}

/**
 * Align Persian script string with external Romanization string and generate IJMES hypothesis.
 */
export function alignAndTransduceWiktionary(params: {
  persianForm: string;
  observedRomanization: string;
  sourceProfile: WiktionaryPersianRomanizationProfile;
}): WiktionaryAlignmentResult {
  const { persianForm, observedRomanization, sourceProfile } = params;

  if (sourceProfile === 'UNCLASSIFIED') {
    return {
      success: false,
      targetHypothesis: null,
      appliedRuleIds: [],
      blockers: [
        {
          kind: 'UNCLASSIFIED_WIKTIONARY_PROFILE',
          reason: 'Source romanization lacks explicit variety/dialect tags (cannot assume Classical or Iranian safely).'
        }
      ]
    };
  }

  if (sourceProfile === 'CONFLICTING') {
    return {
      success: false,
      targetHypothesis: null,
      appliedRuleIds: [],
      blockers: [
        {
          kind: 'CONFLICTING_WIKTIONARY_PROFILE',
          reason: 'Source romanization carries conflicting variety tags (e.g. both Classical and Iranian).'
        }
      ]
    };
  }

  const pChars = [...persianForm.normalize('NFC').replace(/[\u200c\u200d]/g, '')];
  const rStr = observedRomanization.normalize('NFC').toLowerCase().trim();

  // Check unsupported symbols
  if (rStr.includes('ē') || rStr.includes('ō')) {
    return {
      success: false,
      targetHypothesis: null,
      appliedRuleIds: [],
      blockers: [
        {
          kind: 'UNSUPPORTED_WIKTIONARY_SYMBOL',
          reason: 'Majhūl vowels (ē, ō) have no unambiguous deterministic standard IJMES mapping in this phase.'
        }
      ]
    };
  }

  // Check final heh ambiguity
  if (persianForm.endsWith('ه') || persianForm.endsWith('ۀ')) {
    if (rStr.endsWith('e') || rStr.endsWith('a')) {
      return {
        success: false,
        targetHypothesis: null,
        appliedRuleIds: [],
        blockers: [
          {
            kind: 'AMBIGUOUS_FINAL_HEH',
            reason: 'Silent final heh vowel rendering (-e/-a) is morphologically sensitive and blocked from automatic conversion.'
          }
        ]
      };
    }
  }

  let pIdx = 0;
  let rIdx = 0;
  let targetOutput = '';
  const appliedRules = new Set<string>();
  const trace: WiktionaryAlignmentSlot[] = [];

  while (pIdx < pChars.length && rIdx < rStr.length) {
    const pChar = pChars[pIdx];

    // Case 1: Initial Alif Madda (آ)
    if (pChar === 'آ') {
      const romChar = rStr[rIdx];
      if (romChar === 'â' || romChar === 'ā' || romChar === 'a') {
        const rule =
          sourceProfile === 'IRANIAN'
            ? 'WIKT_IRANIAN_LONG_A_TO_IJMES_A_MACRON'
            : 'WIKT_CLASSICAL_LONG_A';
        targetOutput += 'ā';
        appliedRules.add(rule);
        trace.push({
          persianSpan: [pIdx, pIdx + 1],
          persianGraphemes: 'آ',
          sourceSpan: [rIdx, rIdx + 1],
          sourceUnit: romChar,
          targetUnit: 'ā',
          appliedRuleId: rule,
          role: 'LONG_VOWEL'
        });
        pIdx += 1;
        rIdx += 1;
        continue;
      }
      return failAlignment(persianForm, observedRomanization, sourceProfile);
    }

    // Case 2: Word-initial Alif acting as vowel carrier
    if (pIdx === 0 && pChar === 'ا') {
      const nextPChar = pChars[1];

      // Initial Alif + Ya (ای)
      if (nextPChar === 'ی') {
        if (rStr.startsWith('ī', rIdx) || rStr.startsWith('i', rIdx)) {
          const rule =
            sourceProfile === 'IRANIAN'
              ? 'WIKT_IRANIAN_LONG_I_TO_IJMES_I_MACRON'
              : 'WIKT_CLASSICAL_LONG_I';
          const srcUnit = rStr[rIdx];
          targetOutput += 'ī';
          appliedRules.add(rule);
          trace.push({
            persianSpan: [0, 2],
            persianGraphemes: 'ای',
            sourceSpan: [rIdx, rIdx + 1],
            sourceUnit: srcUnit,
            targetUnit: 'ī',
            appliedRuleId: rule,
            role: 'LONG_VOWEL'
          });
          pIdx += 2;
          rIdx += 1;
          continue;
        }
        if (sourceProfile === 'IRANIAN' && rStr.startsWith('ey', rIdx)) {
          const rule = 'WIKT_IRANIAN_DIPHTHONG_EY_TO_AY';
          targetOutput += 'ay';
          appliedRules.add(rule);
          trace.push({
            persianSpan: [0, 2],
            persianGraphemes: 'ای',
            sourceSpan: [rIdx, rIdx + 2],
            sourceUnit: 'ey',
            targetUnit: 'ay',
            appliedRuleId: rule,
            role: 'DIPHTHONG'
          });
          pIdx += 2;
          rIdx += 2;
          continue;
        }
        if (sourceProfile === 'CLASSICAL_DARI' && rStr.startsWith('ay', rIdx)) {
          const rule = 'WIKT_CLASSICAL_DIPHTHONG_AY';
          targetOutput += 'ay';
          appliedRules.add(rule);
          trace.push({
            persianSpan: [0, 2],
            persianGraphemes: 'ای',
            sourceSpan: [rIdx, rIdx + 2],
            sourceUnit: 'ay',
            targetUnit: 'ay',
            appliedRuleId: rule,
            role: 'DIPHTHONG'
          });
          pIdx += 2;
          rIdx += 2;
          continue;
        }
      }

      // Initial Alif + Vav (او)
      if (nextPChar === 'و') {
        if (rStr.startsWith('ū', rIdx) || rStr.startsWith('u', rIdx)) {
          const rule =
            sourceProfile === 'IRANIAN'
              ? 'WIKT_IRANIAN_LONG_U_TO_IJMES_U_MACRON'
              : 'WIKT_CLASSICAL_LONG_U';
          const srcUnit = rStr[rIdx];
          targetOutput += 'ū';
          appliedRules.add(rule);
          trace.push({
            persianSpan: [0, 2],
            persianGraphemes: 'او',
            sourceSpan: [rIdx, rIdx + 1],
            sourceUnit: srcUnit,
            targetUnit: 'ū',
            appliedRuleId: rule,
            role: 'LONG_VOWEL'
          });
          pIdx += 2;
          rIdx += 1;
          continue;
        }
        if (sourceProfile === 'IRANIAN' && rStr.startsWith('ow', rIdx)) {
          const rule = 'WIKT_IRANIAN_DIPHTHONG_OW_TO_AW';
          targetOutput += 'aw';
          appliedRules.add(rule);
          trace.push({
            persianSpan: [0, 2],
            persianGraphemes: 'او',
            sourceSpan: [rIdx, rIdx + 2],
            sourceUnit: 'ow',
            targetUnit: 'aw',
            appliedRuleId: rule,
            role: 'DIPHTHONG'
          });
          pIdx += 2;
          rIdx += 2;
          continue;
        }
        if (sourceProfile === 'CLASSICAL_DARI' && rStr.startsWith('aw', rIdx)) {
          const rule = 'WIKT_CLASSICAL_DIPHTHONG_AW';
          targetOutput += 'aw';
          appliedRules.add(rule);
          trace.push({
            persianSpan: [0, 2],
            persianGraphemes: 'او',
            sourceSpan: [rIdx, rIdx + 2],
            sourceUnit: 'aw',
            targetUnit: 'aw',
            appliedRuleId: rule,
            role: 'DIPHTHONG'
          });
          pIdx += 2;
          rIdx += 2;
          continue;
        }
      }

      // Initial Alif with short vowel (a, e/i, o/u)
      const romChar = rStr[rIdx];
      if (sourceProfile === 'IRANIAN') {
        if (romChar === 'a') {
          const rule = 'WIKT_IRANIAN_SHORT_A';
          targetOutput += 'a';
          appliedRules.add(rule);
          trace.push({
            persianSpan: [0, 1],
            persianGraphemes: 'ا',
            sourceSpan: [rIdx, rIdx + 1],
            sourceUnit: 'a',
            targetUnit: 'a',
            appliedRuleId: rule,
            role: 'SHORT_VOWEL'
          });
          pIdx += 1;
          rIdx += 1;
          continue;
        }
        if (romChar === 'e') {
          const rule = 'WIKT_IRANIAN_SHORT_E_TO_IJMES_I';
          targetOutput += 'i';
          appliedRules.add(rule);
          trace.push({
            persianSpan: [0, 1],
            persianGraphemes: 'ا',
            sourceSpan: [rIdx, rIdx + 1],
            sourceUnit: 'e',
            targetUnit: 'i',
            appliedRuleId: rule,
            role: 'SHORT_VOWEL'
          });
          pIdx += 1;
          rIdx += 1;
          continue;
        }
        if (romChar === 'o') {
          const rule = 'WIKT_IRANIAN_SHORT_O_TO_IJMES_U';
          targetOutput += 'u';
          appliedRules.add(rule);
          trace.push({
            persianSpan: [0, 1],
            persianGraphemes: 'ا',
            sourceSpan: [rIdx, rIdx + 1],
            sourceUnit: 'o',
            targetUnit: 'u',
            appliedRuleId: rule,
            role: 'SHORT_VOWEL'
          });
          pIdx += 1;
          rIdx += 1;
          continue;
        }
        // Iranian i/u without ی/و are disallowed as short vowels
        return failAlignment(persianForm, observedRomanization, sourceProfile);
      }

      if (sourceProfile === 'CLASSICAL_DARI') {
        if (romChar === 'a') {
          const rule = 'WIKT_CLASSICAL_SHORT_A';
          targetOutput += 'a';
          appliedRules.add(rule);
          trace.push({
            persianSpan: [0, 1],
            persianGraphemes: 'ا',
            sourceSpan: [rIdx, rIdx + 1],
            sourceUnit: 'a',
            targetUnit: 'a',
            appliedRuleId: rule,
            role: 'SHORT_VOWEL'
          });
          pIdx += 1;
          rIdx += 1;
          continue;
        }
        if (romChar === 'i') {
          const rule = 'WIKT_CLASSICAL_SHORT_I';
          targetOutput += 'i';
          appliedRules.add(rule);
          trace.push({
            persianSpan: [0, 1],
            persianGraphemes: 'ا',
            sourceSpan: [rIdx, rIdx + 1],
            sourceUnit: 'i',
            targetUnit: 'i',
            appliedRuleId: rule,
            role: 'SHORT_VOWEL'
          });
          pIdx += 1;
          rIdx += 1;
          continue;
        }
        if (romChar === 'u') {
          const rule = 'WIKT_CLASSICAL_SHORT_U';
          targetOutput += 'u';
          appliedRules.add(rule);
          trace.push({
            persianSpan: [0, 1],
            persianGraphemes: 'ا',
            sourceSpan: [rIdx, rIdx + 1],
            sourceUnit: 'u',
            targetUnit: 'u',
            appliedRuleId: rule,
            role: 'SHORT_VOWEL'
          });
          pIdx += 1;
          rIdx += 1;
          continue;
        }
        return failAlignment(persianForm, observedRomanization, sourceProfile);
      }
    }

    // Case 3: Persian 'ع' (Ayn)
    if (pChar === 'ع') {
      const rule = 'WIKT_SCRIPT_AYN_RECONSTRUCTION';
      targetOutput += 'ʿ';
      appliedRules.add(rule);
      const currentPIdx = pIdx;
      pIdx += 1;
      let apostropheLen = 0;
      if (rStr[rIdx] === "'" || rStr[rIdx] === '‘' || rStr[rIdx] === 'ʿ' || rStr[rIdx] === '’') {
        apostropheLen = 1;
        rIdx += 1;
      }
      trace.push({
        persianSpan: [currentPIdx, currentPIdx + 1],
        persianGraphemes: 'ع',
        sourceSpan: [rIdx - apostropheLen, rIdx],
        sourceUnit: apostropheLen > 0 ? rStr[rIdx - 1] : '',
        targetUnit: 'ʿ',
        appliedRuleId: rule,
        role: 'CONSONANT'
      });

      // Check for short vowel following ʿayn
      if (rIdx < rStr.length) {
        const nextPChar = pChars[pIdx];
        const currentVowel = rStr[rIdx];
        const isNotCarrier =
          !(nextPChar === 'ا' && (currentVowel === 'a' || currentVowel === 'â' || currentVowel === 'ā')) &&
          !(nextPChar === 'ی' && (currentVowel === 'i' || currentVowel === 'ī' || rStr.startsWith('ey', rIdx) || rStr.startsWith('ay', rIdx))) &&
          !(nextPChar === 'و' && (currentVowel === 'u' || currentVowel === 'ū' || rStr.startsWith('ow', rIdx) || rStr.startsWith('aw', rIdx)));

        if (isNotCarrier) {
          if (sourceProfile === 'IRANIAN') {
            if (currentVowel === 'o') {
              const vRule = 'WIKT_IRANIAN_SHORT_O_TO_IJMES_U';
              targetOutput += 'u';
              appliedRules.add(vRule);
              trace.push({
                persianSpan: [currentPIdx, currentPIdx + 1],
                persianGraphemes: 'ع',
                sourceSpan: [rIdx, rIdx + 1],
                sourceUnit: 'o',
                targetUnit: 'u',
                appliedRuleId: vRule,
                role: 'SHORT_VOWEL'
              });
              rIdx += 1;
            } else if (currentVowel === 'e') {
              const vRule = 'WIKT_IRANIAN_SHORT_E_TO_IJMES_I';
              targetOutput += 'i';
              appliedRules.add(vRule);
              trace.push({
                persianSpan: [currentPIdx, currentPIdx + 1],
                persianGraphemes: 'ع',
                sourceSpan: [rIdx, rIdx + 1],
                sourceUnit: 'e',
                targetUnit: 'i',
                appliedRuleId: vRule,
                role: 'SHORT_VOWEL'
              });
              rIdx += 1;
            } else if (currentVowel === 'a') {
              const vRule = 'WIKT_IRANIAN_SHORT_A';
              targetOutput += 'a';
              appliedRules.add(vRule);
              trace.push({
                persianSpan: [currentPIdx, currentPIdx + 1],
                persianGraphemes: 'ع',
                sourceSpan: [rIdx, rIdx + 1],
                sourceUnit: 'a',
                targetUnit: 'a',
                appliedRuleId: vRule,
                role: 'SHORT_VOWEL'
              });
              rIdx += 1;
            }
          } else if (sourceProfile === 'CLASSICAL_DARI') {
            if (currentVowel === 'u') {
              const vRule = 'WIKT_CLASSICAL_SHORT_U';
              targetOutput += 'u';
              appliedRules.add(vRule);
              trace.push({
                persianSpan: [currentPIdx, currentPIdx + 1],
                persianGraphemes: 'ع',
                sourceSpan: [rIdx, rIdx + 1],
                sourceUnit: 'u',
                targetUnit: 'u',
                appliedRuleId: vRule,
                role: 'SHORT_VOWEL'
              });
              rIdx += 1;
            } else if (currentVowel === 'i') {
              const vRule = 'WIKT_CLASSICAL_SHORT_I';
              targetOutput += 'i';
              appliedRules.add(vRule);
              trace.push({
                persianSpan: [currentPIdx, currentPIdx + 1],
                persianGraphemes: 'ع',
                sourceSpan: [rIdx, rIdx + 1],
                sourceUnit: 'i',
                targetUnit: 'i',
                appliedRuleId: vRule,
                role: 'SHORT_VOWEL'
              });
              rIdx += 1;
            } else if (currentVowel === 'a') {
              const vRule = 'WIKT_CLASSICAL_SHORT_A';
              targetOutput += 'a';
              appliedRules.add(vRule);
              trace.push({
                persianSpan: [currentPIdx, currentPIdx + 1],
                persianGraphemes: 'ع',
                sourceSpan: [rIdx, rIdx + 1],
                sourceUnit: 'a',
                targetUnit: 'a',
                appliedRuleId: vRule,
                role: 'SHORT_VOWEL'
              });
              rIdx += 1;
            }
          }
        }
      }
      continue;
    }

    // Case 4: Persian Hamza letters (ء, أ, إ, ؤ, ئ)
    if (['ء', 'أ', 'إ', 'ؤ', 'ئ'].includes(pChar)) {
      const rule = 'WIKT_SCRIPT_HAMZA_RECONSTRUCTION';
      targetOutput += 'ʾ';
      appliedRules.add(rule);
      const currentPIdx = pIdx;
      pIdx += 1;
      let apostropheLen = 0;
      if (rStr[rIdx] === "'" || rStr[rIdx] === '’' || rStr[rIdx] === 'ʾ') {
        apostropheLen = 1;
        rIdx += 1;
      }
      trace.push({
        persianSpan: [currentPIdx, currentPIdx + 1],
        persianGraphemes: pChar,
        sourceSpan: [rIdx - apostropheLen, rIdx],
        sourceUnit: apostropheLen > 0 ? rStr[rIdx - 1] : '',
        targetUnit: 'ʾ',
        appliedRuleId: rule,
        role: 'CONSONANT'
      });

      // Check for short vowel following hamza
      if (rIdx < rStr.length) {
        const nextPChar = pChars[pIdx];
        const currentVowel = rStr[rIdx];
        const isNotCarrier =
          !(nextPChar === 'ا' && (currentVowel === 'a' || currentVowel === 'â' || currentVowel === 'ā')) &&
          !(nextPChar === 'ی' && (currentVowel === 'i' || currentVowel === 'ī' || rStr.startsWith('ey', rIdx) || rStr.startsWith('ay', rIdx))) &&
          !(nextPChar === 'و' && (currentVowel === 'u' || currentVowel === 'ū' || rStr.startsWith('ow', rIdx) || rStr.startsWith('aw', rIdx)));

        if (isNotCarrier) {
          if (sourceProfile === 'IRANIAN') {
            if (currentVowel === 'o') {
              const vRule = 'WIKT_IRANIAN_SHORT_O_TO_IJMES_U';
              targetOutput += 'u';
              appliedRules.add(vRule);
              trace.push({
                persianSpan: [currentPIdx, currentPIdx + 1],
                persianGraphemes: pChar,
                sourceSpan: [rIdx, rIdx + 1],
                sourceUnit: 'o',
                targetUnit: 'u',
                appliedRuleId: vRule,
                role: 'SHORT_VOWEL'
              });
              rIdx += 1;
            } else if (currentVowel === 'e') {
              const vRule = 'WIKT_IRANIAN_SHORT_E_TO_IJMES_I';
              targetOutput += 'i';
              appliedRules.add(vRule);
              trace.push({
                persianSpan: [currentPIdx, currentPIdx + 1],
                persianGraphemes: pChar,
                sourceSpan: [rIdx, rIdx + 1],
                sourceUnit: 'e',
                targetUnit: 'i',
                appliedRuleId: vRule,
                role: 'SHORT_VOWEL'
              });
              rIdx += 1;
            } else if (currentVowel === 'a') {
              const vRule = 'WIKT_IRANIAN_SHORT_A';
              targetOutput += 'a';
              appliedRules.add(vRule);
              trace.push({
                persianSpan: [currentPIdx, currentPIdx + 1],
                persianGraphemes: pChar,
                sourceSpan: [rIdx, rIdx + 1],
                sourceUnit: 'a',
                targetUnit: 'a',
                appliedRuleId: vRule,
                role: 'SHORT_VOWEL'
              });
              rIdx += 1;
            }
          } else if (sourceProfile === 'CLASSICAL_DARI') {
            if (currentVowel === 'u') {
              const vRule = 'WIKT_CLASSICAL_SHORT_U';
              targetOutput += 'u';
              appliedRules.add(vRule);
              trace.push({
                persianSpan: [currentPIdx, currentPIdx + 1],
                persianGraphemes: pChar,
                sourceSpan: [rIdx, rIdx + 1],
                sourceUnit: 'u',
                targetUnit: 'u',
                appliedRuleId: vRule,
                role: 'SHORT_VOWEL'
              });
              rIdx += 1;
            } else if (currentVowel === 'i') {
              const vRule = 'WIKT_CLASSICAL_SHORT_I';
              targetOutput += 'i';
              appliedRules.add(vRule);
              trace.push({
                persianSpan: [currentPIdx, currentPIdx + 1],
                persianGraphemes: pChar,
                sourceSpan: [rIdx, rIdx + 1],
                sourceUnit: 'i',
                targetUnit: 'i',
                appliedRuleId: vRule,
                role: 'SHORT_VOWEL'
              });
              rIdx += 1;
            } else if (currentVowel === 'a') {
              const vRule = 'WIKT_CLASSICAL_SHORT_A';
              targetOutput += 'a';
              appliedRules.add(vRule);
              trace.push({
                persianSpan: [currentPIdx, currentPIdx + 1],
                persianGraphemes: pChar,
                sourceSpan: [rIdx, rIdx + 1],
                sourceUnit: 'a',
                targetUnit: 'a',
                appliedRuleId: vRule,
                role: 'SHORT_VOWEL'
              });
              rIdx += 1;
            }
          }
        }
      }
      continue;
    }

    // Case 5: Long vowel letter 'ا' (Alif)
    if (pChar === 'ا') {
      const romChar = rStr[rIdx];
      if (romChar === 'â' || romChar === 'ā' || romChar === 'a') {
        const rule =
          sourceProfile === 'IRANIAN'
            ? 'WIKT_IRANIAN_LONG_A_TO_IJMES_A_MACRON'
            : 'WIKT_CLASSICAL_LONG_A';
        targetOutput += 'ā';
        appliedRules.add(rule);
        trace.push({
          persianSpan: [pIdx, pIdx + 1],
          persianGraphemes: 'ا',
          sourceSpan: [rIdx, rIdx + 1],
          sourceUnit: romChar,
          targetUnit: 'ā',
          appliedRuleId: rule,
          role: 'LONG_VOWEL'
        });
        pIdx += 1;
        rIdx += 1;
        continue;
      }
      return failAlignment(persianForm, observedRomanization, sourceProfile);
    }

    // Case 6: Persian 'و' (Vav as long vowel ū, diphthong aw, or consonant v/w)
    if (pChar === 'و') {
      // Diphthong check
      if (sourceProfile === 'IRANIAN' && rStr.startsWith('ow', rIdx)) {
        const rule = 'WIKT_IRANIAN_DIPHTHONG_OW_TO_AW';
        targetOutput += 'aw';
        appliedRules.add(rule);
        trace.push({
          persianSpan: [pIdx, pIdx + 1],
          persianGraphemes: 'و',
          sourceSpan: [rIdx, rIdx + 2],
          sourceUnit: 'ow',
          targetUnit: 'aw',
          appliedRuleId: rule,
          role: 'DIPHTHONG'
        });
        pIdx += 1;
        rIdx += 2;
        continue;
      }
      if (sourceProfile === 'CLASSICAL_DARI' && rStr.startsWith('aw', rIdx)) {
        const rule = 'WIKT_CLASSICAL_DIPHTHONG_AW';
        targetOutput += 'aw';
        appliedRules.add(rule);
        trace.push({
          persianSpan: [pIdx, pIdx + 1],
          persianGraphemes: 'و',
          sourceSpan: [rIdx, rIdx + 2],
          sourceUnit: 'aw',
          targetUnit: 'aw',
          appliedRuleId: rule,
          role: 'DIPHTHONG'
        });
        pIdx += 1;
        rIdx += 2;
        continue;
      }

      // Long vowel check
      const romChar = rStr[rIdx];
      if (romChar === 'ū' || (romChar === 'u' && sourceProfile === 'IRANIAN')) {
        const rule =
          sourceProfile === 'IRANIAN'
            ? 'WIKT_IRANIAN_LONG_U_TO_IJMES_U_MACRON'
            : 'WIKT_CLASSICAL_LONG_U';
        targetOutput += 'ū';
        appliedRules.add(rule);
        trace.push({
          persianSpan: [pIdx, pIdx + 1],
          persianGraphemes: 'و',
          sourceSpan: [rIdx, rIdx + 1],
          sourceUnit: romChar,
          targetUnit: 'ū',
          appliedRuleId: rule,
          role: 'LONG_VOWEL'
        });
        pIdx += 1;
        rIdx += 1;
        continue;
      }

      if (romChar === 'u' && sourceProfile === 'CLASSICAL_DARI') {
        const rule = 'WIKT_CLASSICAL_LONG_U';
        targetOutput += 'ū';
        appliedRules.add(rule);
        trace.push({
          persianSpan: [pIdx, pIdx + 1],
          persianGraphemes: 'و',
          sourceSpan: [rIdx, rIdx + 1],
          sourceUnit: 'u',
          targetUnit: 'ū',
          appliedRuleId: rule,
          role: 'LONG_VOWEL'
        });
        pIdx += 1;
        rIdx += 1;
        continue;
      }

      // Consonant check (v / w)
      if (romChar === 'v' || romChar === 'w') {
        const rule = 'WIKT_SCRIPT_CONSONANT_RECONSTRUCTION';
        targetOutput += romChar;
        appliedRules.add(rule);
        trace.push({
          persianSpan: [pIdx, pIdx + 1],
          persianGraphemes: 'و',
          sourceSpan: [rIdx, rIdx + 1],
          sourceUnit: romChar,
          targetUnit: romChar,
          appliedRuleId: rule,
          role: 'CONSONANT'
        });
        pIdx += 1;
        rIdx += 1;
        continue;
      }

      return failAlignment(persianForm, observedRomanization, sourceProfile);
    }

    // Case 7: Persian 'ی' (Ya as long vowel ī, diphthong ay, or consonant y)
    if (pChar === 'ی') {
      // Diphthong check
      if (sourceProfile === 'IRANIAN' && rStr.startsWith('ey', rIdx)) {
        const rule = 'WIKT_IRANIAN_DIPHTHONG_EY_TO_AY';
        targetOutput += 'ay';
        appliedRules.add(rule);
        trace.push({
          persianSpan: [pIdx, pIdx + 1],
          persianGraphemes: 'ی',
          sourceSpan: [rIdx, rIdx + 2],
          sourceUnit: 'ey',
          targetUnit: 'ay',
          appliedRuleId: rule,
          role: 'DIPHTHONG'
        });
        pIdx += 1;
        rIdx += 2;
        continue;
      }
      if (sourceProfile === 'CLASSICAL_DARI' && rStr.startsWith('ay', rIdx)) {
        const rule = 'WIKT_CLASSICAL_DIPHTHONG_AY';
        targetOutput += 'ay';
        appliedRules.add(rule);
        trace.push({
          persianSpan: [pIdx, pIdx + 1],
          persianGraphemes: 'ی',
          sourceSpan: [rIdx, rIdx + 2],
          sourceUnit: 'ay',
          targetUnit: 'ay',
          appliedRuleId: rule,
          role: 'DIPHTHONG'
        });
        pIdx += 1;
        rIdx += 2;
        continue;
      }

      // Long vowel check
      const romChar = rStr[rIdx];
      if (romChar === 'ī' || (romChar === 'i' && sourceProfile === 'IRANIAN')) {
        const rule =
          sourceProfile === 'IRANIAN'
            ? 'WIKT_IRANIAN_LONG_I_TO_IJMES_I_MACRON'
            : 'WIKT_CLASSICAL_LONG_I';
        targetOutput += 'ī';
        appliedRules.add(rule);
        trace.push({
          persianSpan: [pIdx, pIdx + 1],
          persianGraphemes: 'ی',
          sourceSpan: [rIdx, rIdx + 1],
          sourceUnit: romChar,
          targetUnit: 'ī',
          appliedRuleId: rule,
          role: 'LONG_VOWEL'
        });
        pIdx += 1;
        rIdx += 1;
        continue;
      }

      if (romChar === 'i' && sourceProfile === 'CLASSICAL_DARI') {
        const rule = 'WIKT_CLASSICAL_LONG_I';
        targetOutput += 'ī';
        appliedRules.add(rule);
        trace.push({
          persianSpan: [pIdx, pIdx + 1],
          persianGraphemes: 'ی',
          sourceSpan: [rIdx, rIdx + 1],
          sourceUnit: 'i',
          targetUnit: 'ī',
          appliedRuleId: rule,
          role: 'LONG_VOWEL'
        });
        pIdx += 1;
        rIdx += 1;
        continue;
      }

      // Consonant check (y / j)
      if (romChar === 'y' || romChar === 'j') {
        const rule = 'WIKT_SCRIPT_CONSONANT_RECONSTRUCTION';
        targetOutput += 'y';
        appliedRules.add(rule);
        trace.push({
          persianSpan: [pIdx, pIdx + 1],
          persianGraphemes: 'ی',
          sourceSpan: [rIdx, rIdx + 1],
          sourceUnit: romChar,
          targetUnit: 'y',
          appliedRuleId: rule,
          role: 'CONSONANT'
        });
        pIdx += 1;
        rIdx += 1;
        continue;
      }

      return failAlignment(persianForm, observedRomanization, sourceProfile);
    }

    // Case 8: Standard Persian Consonant (with bidirectional compatibility check)
    const ijmesConsonant = PERSIAN_CONSONANT_MAPPINGS[pChar];
    if (ijmesConsonant) {
      const consumedLen = matchCompatibleRomanConsonant(pChar, rStr, rIdx);
      if (consumedLen === 0) {
        // Incompatible Roman consonant for this Persian script letter
        return failAlignment(persianForm, observedRomanization, sourceProfile);
      }

      const cRule = 'WIKT_SCRIPT_CONSONANT_RECONSTRUCTION';
      targetOutput += ijmesConsonant;
      appliedRules.add(cRule);
      const currentPIdx = pIdx;
      const currentRIdx = rIdx;
      pIdx += 1;
      rIdx += consumedLen;
      trace.push({
        persianSpan: [currentPIdx, currentPIdx + 1],
        persianGraphemes: pChar,
        sourceSpan: [currentRIdx, currentRIdx + consumedLen],
        sourceUnit: rStr.slice(currentRIdx, currentRIdx + consumedLen),
        targetUnit: ijmesConsonant,
        appliedRuleId: cRule,
        role: 'CONSONANT'
      });

      // Check for short vowel following this consonant in romanization
      if (rIdx < rStr.length) {
        const nextPChar = pChars[pIdx];
        const currentVowel = rStr[rIdx];

        // Ensure this short vowel is NOT a carrier for the next Persian long vowel or diphthong letter
        const isNotCarrier =
          !(nextPChar === 'ا' && (currentVowel === 'a' || currentVowel === 'â' || currentVowel === 'ā')) &&
          !(nextPChar === 'ی' && (currentVowel === 'i' || currentVowel === 'ī' || rStr.startsWith('ey', rIdx) || rStr.startsWith('ay', rIdx))) &&
          !(nextPChar === 'و' && (currentVowel === 'u' || currentVowel === 'ū' || rStr.startsWith('ow', rIdx) || rStr.startsWith('aw', rIdx)));

        if (isNotCarrier) {
          if (sourceProfile === 'IRANIAN') {
            if (currentVowel === 'o') {
              const vRule = 'WIKT_IRANIAN_SHORT_O_TO_IJMES_U';
              targetOutput += 'u';
              appliedRules.add(vRule);
              trace.push({
                persianSpan: [currentPIdx, currentPIdx + 1],
                persianGraphemes: pChar,
                sourceSpan: [rIdx, rIdx + 1],
                sourceUnit: 'o',
                targetUnit: 'u',
                appliedRuleId: vRule,
                role: 'SHORT_VOWEL'
              });
              rIdx += 1;
            } else if (currentVowel === 'e') {
              const vRule = 'WIKT_IRANIAN_SHORT_E_TO_IJMES_I';
              targetOutput += 'i';
              appliedRules.add(vRule);
              trace.push({
                persianSpan: [currentPIdx, currentPIdx + 1],
                persianGraphemes: pChar,
                sourceSpan: [rIdx, rIdx + 1],
                sourceUnit: 'e',
                targetUnit: 'i',
                appliedRuleId: vRule,
                role: 'SHORT_VOWEL'
              });
              rIdx += 1;
            } else if (currentVowel === 'a') {
              const vRule = 'WIKT_IRANIAN_SHORT_A';
              targetOutput += 'a';
              appliedRules.add(vRule);
              trace.push({
                persianSpan: [currentPIdx, currentPIdx + 1],
                persianGraphemes: pChar,
                sourceSpan: [rIdx, rIdx + 1],
                sourceUnit: 'a',
                targetUnit: 'a',
                appliedRuleId: vRule,
                role: 'SHORT_VOWEL'
              });
              rIdx += 1;
            } else if (currentVowel === 'i' || currentVowel === 'u') {
              // Iranian unanchored i / u are disallowed as short vowels
              return failAlignment(persianForm, observedRomanization, sourceProfile);
            }
          } else if (sourceProfile === 'CLASSICAL_DARI') {
            if (currentVowel === 'u') {
              const vRule = 'WIKT_CLASSICAL_SHORT_U';
              targetOutput += 'u';
              appliedRules.add(vRule);
              trace.push({
                persianSpan: [currentPIdx, currentPIdx + 1],
                persianGraphemes: pChar,
                sourceSpan: [rIdx, rIdx + 1],
                sourceUnit: 'u',
                targetUnit: 'u',
                appliedRuleId: vRule,
                role: 'SHORT_VOWEL'
              });
              rIdx += 1;
            } else if (currentVowel === 'i') {
              const vRule = 'WIKT_CLASSICAL_SHORT_I';
              targetOutput += 'i';
              appliedRules.add(vRule);
              trace.push({
                persianSpan: [currentPIdx, currentPIdx + 1],
                persianGraphemes: pChar,
                sourceSpan: [rIdx, rIdx + 1],
                sourceUnit: 'i',
                targetUnit: 'i',
                appliedRuleId: vRule,
                role: 'SHORT_VOWEL'
              });
              rIdx += 1;
            } else if (currentVowel === 'a') {
              const vRule = 'WIKT_CLASSICAL_SHORT_A';
              targetOutput += 'a';
              appliedRules.add(vRule);
              trace.push({
                persianSpan: [currentPIdx, currentPIdx + 1],
                persianGraphemes: pChar,
                sourceSpan: [rIdx, rIdx + 1],
                sourceUnit: 'a',
                targetUnit: 'a',
                appliedRuleId: vRule,
                role: 'SHORT_VOWEL'
              });
              rIdx += 1;
            }
          }
        }
      }
      continue;
    }

    // Unmatched character: break
    break;
  }

  // Check if both strings were fully consumed
  if (pIdx === pChars.length && rIdx === rStr.length) {
    return {
      success: true,
      targetHypothesis: targetOutput,
      appliedRuleIds: Array.from(appliedRules).sort(),
      blockers: [],
      trace
    };
  }

  return failAlignment(persianForm, observedRomanization, sourceProfile);
}

function failAlignment(
  persianForm: string,
  observedRomanization: string,
  sourceProfile: WiktionaryPersianRomanizationProfile
): WiktionaryAlignmentResult {
  return {
    success: false,
    targetHypothesis: null,
    appliedRuleIds: [],
    blockers: [
      {
        kind: 'SOURCE_SCRIPT_ALIGNMENT_FAILED',
        reason: `Failed to align Persian script ("${persianForm}") with romanization ("${observedRomanization}") under profile ${sourceProfile}.`
      }
    ]
  };
}

export function alignPersianScriptWithWiktionary(
  persianForm: string,
  observedRomanization: string,
  sourceProfile: WiktionaryPersianRomanizationProfile
): {
  success: boolean;
  ijmesHypothesis: string | null;
  targetHypothesis: string | null;
  appliedRuleIds: string[];
  blockers: KaikkiSchemeInterpretationBlocker[];
  blockerKind?: string;
} {
  const result = alignAndTransduceWiktionary({ persianForm, observedRomanization, sourceProfile });
  return {
    success: result.success,
    ijmesHypothesis: result.targetHypothesis,
    targetHypothesis: result.targetHypothesis,
    appliedRuleIds: result.appliedRuleIds,
    blockers: result.blockers,
    blockerKind: result.blockers.length > 0 ? result.blockers[0].kind : undefined
  };
}
