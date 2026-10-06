import { containsArabicScript } from '../../bibliography/scriptDetection';
import { MarcRecord } from './types';

/**
 * Check whether a MARC record exhibits positive Persian language evidence.
 *
 * Invariants:
 *   - Inspects fixed-field 008 (positions 35-37) for 'per'.
 *   - Inspects datafield 041 (subfields a, d, e, h, j) for 'per'.
 *   - Inspects 546$a for explicit 'Persian' or 'Farsi' indication.
 *   - Conservative: records with zero Persian language evidence are rejected.
 */
export function hasPersianLanguageEvidence(record: MarcRecord): boolean {
  // 1. Check direct record language (derived from 008)
  if (record.language === 'per') {
    return true;
  }

  // 2. Check controlfield 008 directly
  const cf008 = record.controlFields.find((cf) => cf.tag === '008')?.value;
  if (cf008 && cf008.length >= 38) {
    const lang008 = cf008.substring(35, 38).trim().toLowerCase();
    if (lang008 === 'per') return true;
  }

  // 3. Check field 041
  for (const df of record.dataFields) {
    if (df.tag === '041') {
      for (const sf of df.subfields) {
        if (['a', 'd', 'e', 'h', 'j'].includes(sf.code)) {
          const code = sf.value.trim().toLowerCase();
          if (code === 'per' || code.includes('per')) return true;
        }
      }
    }
  }

  // 4. Check field 546 (Language Note)
  for (const df of record.dataFields) {
    if (df.tag === '546') {
      for (const sf of df.subfields) {
        if (sf.code === 'a') {
          const val = sf.value.trim().toLowerCase();
          if (val.includes('persian') || val.includes('farsi') || val.includes('فارسی')) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Validates script direction and content of a linked field pair.
 *
 * Returns:
 *   - { valid: true, persian: string, roman: string | null } if legitimate pair
 *   - { valid: false, reason: string } if non-Persian script, both Latin, both Arabic, etc.
 */
export function classifyPairScript(
  regularValue: string | undefined,
  alternateValue: string
): { valid: true; persian: string; roman: string | null } | { valid: false; reason: string } {
  const altHasArabic = containsArabicScript(alternateValue);

  // If alternate field does NOT contain Arabic script (e.g. Cyrillic, Hebrew, CJK, or Latin)
  if (!altHasArabic) {
    return {
      valid: false,
      reason: 'Alternate graphic field 880 does not contain Arabic/Persian script.'
    };
  }

  // If no regular field was supplied (e.g. occurrence 00 or orphan 880)
  if (regularValue === undefined || regularValue.trim() === '') {
    return {
      valid: true,
      persian: alternateValue,
      roman: null
    };
  }

  const regHasArabic = containsArabicScript(regularValue);

  // If regular field ALSO contains Arabic script (both sides Arabic)
  if (regHasArabic) {
    return {
      valid: false,
      reason: 'Both regular and alternate fields contain Arabic script; no Latin romanization.'
    };
  }

  // Check that regular field contains Latin letters
  const hasLatinLetters = /[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/.test(regularValue);
  if (!hasLatinLetters) {
    return {
      valid: false,
      reason: 'Regular field contains no Latin romanization characters.'
    };
  }

  return {
    valid: true,
    persian: alternateValue,
    roman: regularValue
  };
}
