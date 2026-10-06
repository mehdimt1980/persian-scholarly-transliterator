import { containsArabicScript } from '../../bibliography/scriptDetection';
import { MarcRecord } from './types';

/**
 * Extract discrete 3-letter MARC21 language codes from a subfield value.
 * Handles both single 3-letter codes ('per') and contiguous MARC 041 sequences ('pereng').
 */
export function extractMarcLanguageCodes(value: string): string[] {
  if (!value || typeof value !== 'string') return [];
  const clean = value.trim().toLowerCase().replace(/[^a-z]/g, '');
  const codes: string[] = [];

  for (let i = 0; i < clean.length; i += 3) {
    const code = clean.substring(i, i + 3);
    if (code.length === 3) {
      codes.push(code);
    }
  }

  return codes;
}

/**
 * Check whether a MARC record exhibits affirmative Persian language content evidence.
 *
 * MARC language semantics:
 *   1. Strong content-language evidence:
 *      - 008/35-37 = 'per'
 *      - 041$a = 'per' (Primary text / content language)
 *      - 041$d = 'per' (Sung or spoken soundtrack / content language)
 *   2. Supporting / subsidiary language evidence (NOT sufficient by itself):
 *      - 041$e = 'per' (Language of librettos)
 *      - 041$j = 'per' (Language of subtitles / captions)
 *      - 041$h = 'per' (Language of original work before translation)
 *   3. Field 546$a (Language Note):
 *      - Direct statements of primary content (e.g. "Persian") are accepted only if 008/041 is not contradictory.
 *      - Notes indicating translations ("Translated from Persian") are strictly rejected.
 *   4. Ambiguous/mixed records lacking strong affirmative Persian content codes fail closed.
 */
export function hasPersianLanguageEvidence(record: MarcRecord): boolean {
  // 1. Inspect fixed-field 008 (bytes 35-37)
  let lang008: string | undefined;
  const cf008 = record.controlFields.find((cf) => cf.tag === '008')?.value;
  if (cf008 && cf008.length >= 38) {
    lang008 = cf008.substring(35, 38).trim().toLowerCase();
  } else if (record.language) {
    lang008 = record.language.trim().toLowerCase();
  }

  // Strong content languages from 041 ($a = text/primary, $d = spoken/sung/soundtrack)
  const strong041Languages = new Set<string>();

  for (const df of record.dataFields) {
    if (df.tag === '041') {
      for (const sf of df.subfields) {
        if (sf.code === 'a' || sf.code === 'd') {
          const codes = extractMarcLanguageCodes(sf.value);
          for (const c of codes) strong041Languages.add(c);
        }
      }
    }
  }

  // 1. Strong 041 content language evidence:
  if (strong041Languages.has('per')) {
    return true;
  }

  // If 041 explicitly specifies non-Persian strong content languages (e.g. 'ara', 'eng') without 'per',
  // the content is definitively non-Persian even if 008 or subsidiary 041 codes mention Persian.
  if (strong041Languages.size > 0 && !strong041Languages.has('per')) {
    return false;
  }

  // 2. Fixed-field 008 evidence:
  if (lang008 === 'per') {
    return true;
  }

  // If 008 explicitly specifies a known non-Persian language (e.g. 'ara', 'eng', 'ota', 'urd'),
  // subsidiary codes ($e, $j, $h) cannot override this to establish Persian content.
  if (lang008 && lang008 !== 'mul' && lang008 !== 'und' && lang008 !== 'zxx' && lang008 !== '   ') {
    return false;
  }

  // 3. Fallback: Inspect field 546 (Language Note) strictly
  for (const df of record.dataFields) {
    if (df.tag === '546') {
      for (const sf of df.subfields) {
        if (sf.code === 'a') {
          const val = sf.value.trim().toLowerCase();
          // Exclude translation, subtitle, or libretto notes
          if (
            val.includes('translated from') ||
            val.includes('translation of') ||
            val.includes('tarjamah') ||
            val.includes('subtitles') ||
            val.includes('libretto')
          ) {
            continue;
          }
          // Accept affirmative direct statements
          if (
            val === 'persian.' ||
            val === 'persian' ||
            val === 'in persian.' ||
            val === 'in persian' ||
            val === 'farsi.' ||
            val === 'farsi' ||
            val === 'فارسی'
          ) {
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
 * Invariants:
 *   - Alternate field (880) must contain Arabic/Persian script letters or vocalization marks.
 *   - Regular field must contain Latin romanization characters.
 *   - Alternate scripts in Cyrillic, Hebrew, CJK, etc. are rejected.
 *   - Pairs where both sides are Arabic or both sides are Latin are rejected.
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

  // If no regular field was supplied (e.g. occurrence 00 unlinked representation)
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
