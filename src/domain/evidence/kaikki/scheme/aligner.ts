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

export interface WiktionaryAlignmentResult {
  success: boolean;
  targetHypothesis: string | null;
  appliedRuleIds: string[];
  blockers: KaikkiSchemeInterpretationBlocker[];
}

/**
 * Multi-character and diacritic consonants supported in Wiktionary Romanization.
 */
const ROMAN_CONSONANT_MAP: Record<string, string> = {
  // Digraphs
  sh: 'sh',
  kh: 'kh',
  ch: 'ch',
  zh: 'zh',
  gh: 'gh',
  // Special characters
  š: 'sh',
  x: 'kh',
  č: 'ch',
  ž: 'zh',
  ġ: 'gh',
  ğ: 'gh',
  q: 'q',
  // Single standard consonants
  b: 'b',
  p: 'p',
  t: 't',
  s: 's',
  j: 'j',
  h: 'h',
  d: 'd',
  z: 'z',
  r: 'r',
  f: 'f',
  k: 'k',
  g: 'g',
  l: 'l',
  m: 'm',
  n: 'n',
  v: 'v',
  w: 'w',
  y: 'y',
  "'": 'ʾ',
  '’': 'ʾ',
  '‘': 'ʿ',
  'ʿ': 'ʿ',
  'ʾ': 'ʾ'
};

/**
 * Assess whether a character is a short vowel in Classical/Dari or Iranian romanization.
 */
function isShortVowel(char: string): boolean {
  return ['a', 'e', 'o', 'u', 'i'].includes(char);
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

  while (pIdx < pChars.length && rIdx < rStr.length) {
    const pChar = pChars[pIdx];

    // Case 1: Initial Alif Madda (آ)
    if (pChar === 'آ') {
      const romChar = rStr[rIdx];
      if (romChar === 'â' || romChar === 'ā' || romChar === 'a') {
        targetOutput += 'ā';
        appliedRules.add(
          sourceProfile === 'IRANIAN'
            ? 'WIKT_IRANIAN_LONG_A_TO_IJMES_A_MACRON'
            : 'WIKT_CLASSICAL_LONG_A'
        );
        pIdx += 1;
        rIdx += 1;
        continue;
      }
    }

    // Case 2: Persian 'ع' (Ayn)
    if (pChar === 'ع') {
      targetOutput += 'ʿ';
      appliedRules.add('WIKT_SCRIPT_AYN_RECONSTRUCTION');
      pIdx += 1;
      // In Iranian Romanization, 'ع' is often omitted or written as '
      if (rStr[rIdx] === "'" || rStr[rIdx] === '‘' || rStr[rIdx] === 'ʿ' || rStr[rIdx] === '’') {
        rIdx += 1;
      }
      // Check for short vowel following ʿayn in romanization
      if (rIdx < rStr.length && isShortVowel(rStr[rIdx])) {
        const nextPChar = pChars[pIdx];
        const currentVowel = rStr[rIdx];
        if (
          !(nextPChar === 'ا' && (currentVowel === 'a' || currentVowel === 'â' || currentVowel === 'ā')) &&
          !(nextPChar === 'ی' && (currentVowel === 'i' || currentVowel === 'ī' || rStr.startsWith('ey', rIdx) || rStr.startsWith('ay', rIdx))) &&
          !(nextPChar === 'و' && (currentVowel === 'u' || currentVowel === 'ū' || rStr.startsWith('ow', rIdx) || rStr.startsWith('aw', rIdx)))
        ) {
          if (sourceProfile === 'IRANIAN') {
            if (currentVowel === 'o') {
              targetOutput += 'u';
              appliedRules.add('WIKT_IRANIAN_SHORT_O_TO_IJMES_U');
            } else if (currentVowel === 'e') {
              targetOutput += 'i';
              appliedRules.add('WIKT_IRANIAN_SHORT_E_TO_IJMES_I');
            } else if (currentVowel === 'a') {
              targetOutput += 'a';
              appliedRules.add('WIKT_IRANIAN_SHORT_A');
            } else if (currentVowel === 'u') {
              targetOutput += 'u';
              appliedRules.add('WIKT_IRANIAN_SHORT_O_TO_IJMES_U');
            } else if (currentVowel === 'i') {
              targetOutput += 'i';
              appliedRules.add('WIKT_IRANIAN_SHORT_E_TO_IJMES_I');
            }
          } else {
            if (currentVowel === 'u') {
              targetOutput += 'u';
              appliedRules.add('WIKT_CLASSICAL_SHORT_U');
            } else if (currentVowel === 'i') {
              targetOutput += 'i';
              appliedRules.add('WIKT_CLASSICAL_SHORT_I');
            } else if (currentVowel === 'a') {
              targetOutput += 'a';
              appliedRules.add('WIKT_CLASSICAL_SHORT_A');
            }
          }
          rIdx += 1;
        }
      }
      continue;
    }

    // Case 3: Persian Hamza letters (ء, أ, إ, ؤ, ئ)
    if (['ء', 'أ', 'إ', 'ؤ', 'ئ'].includes(pChar)) {
      targetOutput += 'ʾ';
      appliedRules.add('WIKT_SCRIPT_HAMZA_RECONSTRUCTION');
      pIdx += 1;
      if (rStr[rIdx] === "'" || rStr[rIdx] === '’' || rStr[rIdx] === 'ʾ') {
        rIdx += 1;
      }
      // Check for short vowel following hamza in romanization
      if (rIdx < rStr.length && isShortVowel(rStr[rIdx])) {
        const nextPChar = pChars[pIdx];
        const currentVowel = rStr[rIdx];
        if (
          !(nextPChar === 'ا' && (currentVowel === 'a' || currentVowel === 'â' || currentVowel === 'ā')) &&
          !(nextPChar === 'ی' && (currentVowel === 'i' || currentVowel === 'ī' || rStr.startsWith('ey', rIdx) || rStr.startsWith('ay', rIdx))) &&
          !(nextPChar === 'و' && (currentVowel === 'u' || currentVowel === 'ū' || rStr.startsWith('ow', rIdx) || rStr.startsWith('aw', rIdx)))
        ) {
          if (sourceProfile === 'IRANIAN') {
            if (currentVowel === 'o') {
              targetOutput += 'u';
              appliedRules.add('WIKT_IRANIAN_SHORT_O_TO_IJMES_U');
            } else if (currentVowel === 'e') {
              targetOutput += 'i';
              appliedRules.add('WIKT_IRANIAN_SHORT_E_TO_IJMES_I');
            } else if (currentVowel === 'a') {
              targetOutput += 'a';
              appliedRules.add('WIKT_IRANIAN_SHORT_A');
            }
          } else {
            if (currentVowel === 'u') {
              targetOutput += 'u';
              appliedRules.add('WIKT_CLASSICAL_SHORT_U');
            } else if (currentVowel === 'i') {
              targetOutput += 'i';
              appliedRules.add('WIKT_CLASSICAL_SHORT_I');
            } else if (currentVowel === 'a') {
              targetOutput += 'a';
              appliedRules.add('WIKT_CLASSICAL_SHORT_A');
            }
          }
          rIdx += 1;
        }
      }
      continue;
    }

    // Case 4: Long vowel letter 'ا' (Alif)
    if (pChar === 'ا') {
      // Check if preceded by a consonant that already took the vowel
      const romChar = rStr[rIdx];
      if (romChar === 'â' || romChar === 'ā' || romChar === 'a') {
        targetOutput += 'ā';
        appliedRules.add(
          sourceProfile === 'IRANIAN'
            ? 'WIKT_IRANIAN_LONG_A_TO_IJMES_A_MACRON'
            : 'WIKT_CLASSICAL_LONG_A'
        );
        pIdx += 1;
        rIdx += 1;
        continue;
      }
      // If initial alif acting as vowel carrier, consume alif and let next vowel be processed
      if (pIdx === 0) {
        pIdx += 1;
        continue;
      }
    }

    // Case 5: Persian 'و' (Vav as long vowel ū, diphthong aw, or consonant v/w)
    if (pChar === 'و') {
      // Check for diphthong ow / aw
      if (rStr.startsWith('ow', rIdx) || rStr.startsWith('aw', rIdx)) {
        targetOutput += 'aw';
        appliedRules.add('WIKT_IRANIAN_DIPHTHONG_OW_TO_AW');
        pIdx += 1;
        rIdx += 2;
        continue;
      }

      // Check for long vowel u / ū
      const romChar = rStr[rIdx];
      if (romChar === 'ū' || (romChar === 'u' && sourceProfile === 'IRANIAN')) {
        targetOutput += 'ū';
        appliedRules.add(
          sourceProfile === 'IRANIAN'
            ? 'WIKT_IRANIAN_LONG_U_TO_IJMES_U_MACRON'
            : 'WIKT_CLASSICAL_LONG_U'
        );
        pIdx += 1;
        rIdx += 1;
        continue;
      }

      if (romChar === 'u' && sourceProfile === 'CLASSICAL_DARI') {
        // In Classical, short u does not have a vav letter; if vav exists, it's ū
        targetOutput += 'ū';
        appliedRules.add('WIKT_CLASSICAL_LONG_U');
        pIdx += 1;
        rIdx += 1;
        continue;
      }

      // If followed by vowel in romanization, it's consonant v / w
      if (romChar === 'v' || romChar === 'w') {
        targetOutput += romChar;
        appliedRules.add('WIKT_SCRIPT_CONSONANT_RECONSTRUCTION');
        pIdx += 1;
        rIdx += 1;
        continue;
      }
    }

    // Case 6: Persian 'ی' (Ya as long vowel ī, diphthong ay, or consonant y)
    if (pChar === 'ی') {
      // Check for diphthong ey / ay
      if (rStr.startsWith('ey', rIdx) || rStr.startsWith('ay', rIdx)) {
        targetOutput += 'ay';
        appliedRules.add('WIKT_IRANIAN_DIPHTHONG_EY_TO_AY');
        pIdx += 1;
        rIdx += 2;
        continue;
      }

      // Check for long vowel i / ī
      const romChar = rStr[rIdx];
      if (romChar === 'ī' || (romChar === 'i' && sourceProfile === 'IRANIAN')) {
        targetOutput += 'ī';
        appliedRules.add(
          sourceProfile === 'IRANIAN'
            ? 'WIKT_IRANIAN_LONG_I_TO_IJMES_I_MACRON'
            : 'WIKT_CLASSICAL_LONG_I'
        );
        pIdx += 1;
        rIdx += 1;
        continue;
      }

      if (romChar === 'i' && sourceProfile === 'CLASSICAL_DARI') {
        targetOutput += 'ī';
        appliedRules.add('WIKT_CLASSICAL_LONG_I');
        pIdx += 1;
        rIdx += 1;
        continue;
      }

      if (romChar === 'y' || romChar === 'j') {
        targetOutput += 'y';
        appliedRules.add('WIKT_SCRIPT_CONSONANT_RECONSTRUCTION');
        pIdx += 1;
        rIdx += 1;
        continue;
      }
    }

    // Case 7: Standard Persian Consonant
    const ijmesConsonant = PERSIAN_CONSONANT_MAPPINGS[pChar];
    if (ijmesConsonant) {
      targetOutput += ijmesConsonant;
      appliedRules.add('WIKT_SCRIPT_CONSONANT_RECONSTRUCTION');
      pIdx += 1;

      // Consume matching roman consonant chunk (e.g. 'sh', 'kh', 'ch', 'zh', 'gh', 'q', 's', 'z', etc.)
      if (rStr.startsWith('sh', rIdx) || rStr.startsWith('kh', rIdx) || rStr.startsWith('ch', rIdx) || rStr.startsWith('zh', rIdx) || rStr.startsWith('gh', rIdx)) {
        rIdx += 2;
      } else if (rStr[rIdx] && (ROMAN_CONSONANT_MAP[rStr[rIdx]] || rStr[rIdx] === ijmesConsonant[0])) {
        rIdx += 1;
      }

      // Check for short vowel following this consonant in romanization
      if (rIdx < rStr.length && isShortVowel(rStr[rIdx])) {
        // Ensure this short vowel is NOT a long vowel carrier for the next Persian letter (e.g. 'i' for 'ی' or 'u' for 'و' or 'a' for 'ا')
        const nextPChar = pChars[pIdx];
        const currentVowel = rStr[rIdx];

        if (nextPChar === 'ا' && (currentVowel === 'a' || currentVowel === 'â' || currentVowel === 'ā')) {
          // Will be consumed by Alif handler in next iteration
          continue;
        }

        if (nextPChar === 'ی' && (currentVowel === 'i' || currentVowel === 'ī' || rStr.startsWith('ey', rIdx) || rStr.startsWith('ay', rIdx))) {
          // Will be consumed by Ya handler in next iteration
          continue;
        }

        if (nextPChar === 'و' && (currentVowel === 'u' || currentVowel === 'ū' || rStr.startsWith('ow', rIdx) || rStr.startsWith('aw', rIdx))) {
          // Will be consumed by Vav handler in next iteration
          continue;
        }

        // Short vowel transduction
        if (sourceProfile === 'IRANIAN') {
          if (currentVowel === 'o') {
            targetOutput += 'u';
            appliedRules.add('WIKT_IRANIAN_SHORT_O_TO_IJMES_U');
          } else if (currentVowel === 'e') {
            targetOutput += 'i';
            appliedRules.add('WIKT_IRANIAN_SHORT_E_TO_IJMES_I');
          } else if (currentVowel === 'a') {
            targetOutput += 'a';
            appliedRules.add('WIKT_IRANIAN_SHORT_A');
          } else if (currentVowel === 'u') {
            targetOutput += 'u';
            appliedRules.add('WIKT_IRANIAN_SHORT_O_TO_IJMES_U');
          } else if (currentVowel === 'i') {
            targetOutput += 'i';
            appliedRules.add('WIKT_IRANIAN_SHORT_E_TO_IJMES_I');
          }
        } else if (sourceProfile === 'CLASSICAL_DARI') {
          if (currentVowel === 'u') {
            targetOutput += 'u';
            appliedRules.add('WIKT_CLASSICAL_SHORT_U');
          } else if (currentVowel === 'i') {
            targetOutput += 'i';
            appliedRules.add('WIKT_CLASSICAL_SHORT_I');
          } else if (currentVowel === 'a') {
            targetOutput += 'a';
            appliedRules.add('WIKT_CLASSICAL_SHORT_A');
          }
        }
        rIdx += 1;
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
      blockers: []
    };
  }

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

