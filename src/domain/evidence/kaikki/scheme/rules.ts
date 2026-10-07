/**
 * Source-cited rule registry for Wiktionary Persian source-scheme interpretation into IJMES (Phase 7B).
 *
 * Dual-Source Citations:
 *   - English Wiktionary: About Persian (https://en.wiktionary.org/wiki/Wiktionary:About_Persian)
 *   - Cambridge IJMES Transliteration Guide & Chart (https://www.cambridge.org/core/journals/international-journal-of-middle-east-studies/information/instructions-contributors)
 */

import type { WiktionaryPersianRuleDefinition } from './types';

export const WIKT_INTERPRETATION_RULESET_VERSION = '1.0.0';
export const WIKT_INTERPRETER_VERSION = '1.0.0';
export const WIKT_AGGREGATOR_VERSION = '1.0.0';

export const WIKTIONARY_SCHEME_RULES: Readonly<Record<string, WiktionaryPersianRuleDefinition>> = {
  WIKT_SCRIPT_CONSONANT_RECONSTRUCTION: {
    id: 'WIKT_SCRIPT_CONSONANT_RECONSTRUCTION',
    sourceProfile: 'ALL',
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    kind: 'CHARACTER_MAPPING',
    phenomenon: 'Persian script consonantal identity restoration',
    sourceSymbol: 'Persian grapheme',
    interpretation: 'IJMES consonant standard symbol',
    description:
      'Reconstructs scholarly consonant distinctions (ح/ḥ, ص/ṣ, ض/ż, ط/ṭ, ظ/ẓ, خ/kh, غ/gh, ش/sh, چ/ch, ژ/zh) directly from Persian script orthography, resolving Iranian phonological collapses.',
    sourceReferences: [
      {
        authority: 'WIKTIONARY',
        documentTitle: 'Wiktionary:About Persian — Consonants',
        versionOrDate: 'Current (en.wiktionary.org)',
        sectionOrTable: 'Transliteration: Consonants',
        url: 'https://en.wiktionary.org/wiki/Wiktionary:About_Persian#Consonants'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Consonants'
      }
    ]
  },

  WIKT_SCRIPT_AYN_RECONSTRUCTION: {
    id: 'WIKT_SCRIPT_AYN_RECONSTRUCTION',
    sourceProfile: 'ALL',
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    kind: 'CHARACTER_MAPPING',
    phenomenon: 'Ayn restoration from Persian script',
    sourceSymbol: 'ع',
    interpretation: 'ʿ (U+02BF)',
    description:
      'Restores IJMES ʿayn symbol (ʿ) from the Persian letter ‘ayn (ع), resolving omitted or apostrophe representations in Iranian romanization.',
    sourceReferences: [
      {
        authority: 'WIKTIONARY',
        documentTitle: 'Wiktionary:About Persian — Consonants',
        versionOrDate: 'Current (en.wiktionary.org)',
        sectionOrTable: 'ʿayn (ع)',
        url: 'https://en.wiktionary.org/wiki/Wiktionary:About_Persian#Consonants'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Consonants: ʿayn (ع)'
      }
    ]
  },

  WIKT_SCRIPT_HAMZA_RECONSTRUCTION: {
    id: 'WIKT_SCRIPT_HAMZA_RECONSTRUCTION',
    sourceProfile: 'ALL',
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    kind: 'CHARACTER_MAPPING',
    phenomenon: 'Hamzah restoration from Persian script',
    sourceSymbol: 'ء, ؤ, ئ, أ',
    interpretation: 'ʾ (U+02BE)',
    description:
      'Restores IJMES hamzah symbol (ʾ) from Persian script hamza letters.',
    sourceReferences: [
      {
        authority: 'WIKTIONARY',
        documentTitle: 'Wiktionary:About Persian — Consonants',
        versionOrDate: 'Current (en.wiktionary.org)',
        sectionOrTable: 'hamze (ء)',
        url: 'https://en.wiktionary.org/wiki/Wiktionary:About_Persian#Consonants'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Consonants: hamzah (ء)'
      }
    ]
  },

  WIKT_CLASSICAL_SHORT_A: {
    id: 'WIKT_CLASSICAL_SHORT_A',
    sourceProfile: 'CLASSICAL_DARI',
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    kind: 'SYMBOL_EQUIVALENCE',
    phenomenon: 'Classical short vowel fatḥah',
    sourceSymbol: 'a',
    interpretation: 'a',
    description: 'Maps Classical/Dari short vowel "a" to IJMES short "a".',
    sourceReferences: [
      {
        authority: 'WIKTIONARY',
        documentTitle: 'Wiktionary:About Persian — Classical Persian Vowels',
        versionOrDate: 'Current (en.wiktionary.org)',
        sectionOrTable: 'Short Vowels: a',
        url: 'https://en.wiktionary.org/wiki/Wiktionary:About_Persian#Vowels'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Short Vowels: fatḥah (a)'
      }
    ]
  },

  WIKT_CLASSICAL_SHORT_I: {
    id: 'WIKT_CLASSICAL_SHORT_I',
    sourceProfile: 'CLASSICAL_DARI',
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    kind: 'SYMBOL_EQUIVALENCE',
    phenomenon: 'Classical short vowel kasrah',
    sourceSymbol: 'i',
    interpretation: 'i',
    description: 'Maps Classical/Dari short vowel "i" to IJMES short "i".',
    sourceReferences: [
      {
        authority: 'WIKTIONARY',
        documentTitle: 'Wiktionary:About Persian — Classical Persian Vowels',
        versionOrDate: 'Current (en.wiktionary.org)',
        sectionOrTable: 'Short Vowels: i',
        url: 'https://en.wiktionary.org/wiki/Wiktionary:About_Persian#Vowels'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Short Vowels: kasrah (i)'
      }
    ]
  },

  WIKT_CLASSICAL_SHORT_U: {
    id: 'WIKT_CLASSICAL_SHORT_U',
    sourceProfile: 'CLASSICAL_DARI',
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    kind: 'SYMBOL_EQUIVALENCE',
    phenomenon: 'Classical short vowel ḍammah',
    sourceSymbol: 'u',
    interpretation: 'u',
    description: 'Maps Classical/Dari short vowel "u" to IJMES short "u".',
    sourceReferences: [
      {
        authority: 'WIKTIONARY',
        documentTitle: 'Wiktionary:About Persian — Classical Persian Vowels',
        versionOrDate: 'Current (en.wiktionary.org)',
        sectionOrTable: 'Short Vowels: u',
        url: 'https://en.wiktionary.org/wiki/Wiktionary:About_Persian#Vowels'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Short Vowels: ḍammah (u)'
      }
    ]
  },

  WIKT_CLASSICAL_LONG_A: {
    id: 'WIKT_CLASSICAL_LONG_A',
    sourceProfile: 'CLASSICAL_DARI',
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    kind: 'SYMBOL_EQUIVALENCE',
    phenomenon: 'Classical long vowel alif',
    sourceSymbol: 'ā',
    interpretation: 'ā',
    description: 'Maps Classical/Dari long "ā" to IJMES long "ā".',
    sourceReferences: [
      {
        authority: 'WIKTIONARY',
        documentTitle: 'Wiktionary:About Persian — Classical Persian Vowels',
        versionOrDate: 'Current (en.wiktionary.org)',
        sectionOrTable: 'Long Vowels: ā',
        url: 'https://en.wiktionary.org/wiki/Wiktionary:About_Persian#Vowels'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Long Vowels: alif (ā)'
      }
    ]
  },

  WIKT_CLASSICAL_LONG_I: {
    id: 'WIKT_CLASSICAL_LONG_I',
    sourceProfile: 'CLASSICAL_DARI',
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    kind: 'SYMBOL_EQUIVALENCE',
    phenomenon: 'Classical long vowel yā',
    sourceSymbol: 'ī',
    interpretation: 'ī',
    description: 'Maps Classical/Dari long "ī" to IJMES long "ī".',
    sourceReferences: [
      {
        authority: 'WIKTIONARY',
        documentTitle: 'Wiktionary:About Persian — Classical Persian Vowels',
        versionOrDate: 'Current (en.wiktionary.org)',
        sectionOrTable: 'Long Vowels: ī',
        url: 'https://en.wiktionary.org/wiki/Wiktionary:About_Persian#Vowels'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Long Vowels: yā (ī)'
      }
    ]
  },

  WIKT_CLASSICAL_LONG_U: {
    id: 'WIKT_CLASSICAL_LONG_U',
    sourceProfile: 'CLASSICAL_DARI',
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    kind: 'SYMBOL_EQUIVALENCE',
    phenomenon: 'Classical long vowel vāv',
    sourceSymbol: 'ū',
    interpretation: 'ū',
    description: 'Maps Classical/Dari long "ū" to IJMES long "ū".',
    sourceReferences: [
      {
        authority: 'WIKTIONARY',
        documentTitle: 'Wiktionary:About Persian — Classical Persian Vowels',
        versionOrDate: 'Current (en.wiktionary.org)',
        sectionOrTable: 'Long Vowels: ū',
        url: 'https://en.wiktionary.org/wiki/Wiktionary:About_Persian#Vowels'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Long Vowels: vāv (ū)'
      }
    ]
  },

  WIKT_CLASSICAL_DIPHTHONG_AW: {
    id: 'WIKT_CLASSICAL_DIPHTHONG_AW',
    sourceProfile: 'CLASSICAL_DARI',
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    kind: 'SYMBOL_EQUIVALENCE',
    phenomenon: 'Classical diphthong aw',
    sourceSymbol: 'aw',
    interpretation: 'aw',
    description: 'Maps Classical/Dari diphthong "aw" aligned with Persian "و" to standard scholarly IJMES diphthong "aw".',
    sourceReferences: [
      {
        authority: 'WIKTIONARY',
        documentTitle: 'Wiktionary:About Persian — Classical Persian Diphthongs',
        versionOrDate: 'Current (en.wiktionary.org)',
        sectionOrTable: 'Diphthongs: aw',
        url: 'https://en.wiktionary.org/wiki/Wiktionary:About_Persian#Diphthongs'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Diphthongs: aw'
      }
    ]
  },

  WIKT_CLASSICAL_DIPHTHONG_AY: {
    id: 'WIKT_CLASSICAL_DIPHTHONG_AY',
    sourceProfile: 'CLASSICAL_DARI',
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    kind: 'SYMBOL_EQUIVALENCE',
    phenomenon: 'Classical diphthong ay',
    sourceSymbol: 'ay',
    interpretation: 'ay',
    description: 'Maps Classical/Dari diphthong "ay" aligned with Persian "ی" to standard scholarly IJMES diphthong "ay".',
    sourceReferences: [
      {
        authority: 'WIKTIONARY',
        documentTitle: 'Wiktionary:About Persian — Classical Persian Diphthongs',
        versionOrDate: 'Current (en.wiktionary.org)',
        sectionOrTable: 'Diphthongs: ay',
        url: 'https://en.wiktionary.org/wiki/Wiktionary:About_Persian#Diphthongs'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Diphthongs: ay'
      }
    ]
  },

  WIKT_IRANIAN_SHORT_A: {
    id: 'WIKT_IRANIAN_SHORT_A',
    sourceProfile: 'IRANIAN',
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    kind: 'SYMBOL_EQUIVALENCE',
    phenomenon: 'Iranian short vowel a',
    sourceSymbol: 'a',
    interpretation: 'a',
    description: 'Maps modern Iranian short "a" to IJMES scholarly short "a".',
    sourceReferences: [
      {
        authority: 'WIKTIONARY',
        documentTitle: 'Wiktionary:About Persian — Iranian Persian Vowels',
        versionOrDate: 'Current (en.wiktionary.org)',
        sectionOrTable: 'Short Vowels: a',
        url: 'https://en.wiktionary.org/wiki/Wiktionary:About_Persian#Vowels'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Short Vowels: fatḥah (a)'
      }
    ]
  },

  WIKT_IRANIAN_SHORT_E_TO_IJMES_I: {
    id: 'WIKT_IRANIAN_SHORT_E_TO_IJMES_I',
    sourceProfile: 'IRANIAN',
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    kind: 'CHARACTER_MAPPING',
    phenomenon: 'Iranian short e mapping to scholarly short i',
    sourceSymbol: 'e',
    interpretation: 'i',
    description:
      'Maps modern Iranian phonological short "e" to standard Persian scholarly IJMES short "i" (kasrah).',
    sourceReferences: [
      {
        authority: 'WIKTIONARY',
        documentTitle: 'Wiktionary:About Persian — Iranian Persian Vowels',
        versionOrDate: 'Current (en.wiktionary.org)',
        sectionOrTable: 'Short Vowels: e',
        url: 'https://en.wiktionary.org/wiki/Wiktionary:About_Persian#Vowels'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Short Vowels: kasrah (i)'
      }
    ]
  },

  WIKT_IRANIAN_SHORT_O_TO_IJMES_U: {
    id: 'WIKT_IRANIAN_SHORT_O_TO_IJMES_U',
    sourceProfile: 'IRANIAN',
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    kind: 'CHARACTER_MAPPING',
    phenomenon: 'Iranian short o mapping to scholarly short u',
    sourceSymbol: 'o',
    interpretation: 'u',
    description:
      'Maps modern Iranian phonological short "o" to standard Persian scholarly IJMES short "u" (ḍammah).',
    sourceReferences: [
      {
        authority: 'WIKTIONARY',
        documentTitle: 'Wiktionary:About Persian — Iranian Persian Vowels',
        versionOrDate: 'Current (en.wiktionary.org)',
        sectionOrTable: 'Short Vowels: o',
        url: 'https://en.wiktionary.org/wiki/Wiktionary:About_Persian#Vowels'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Short Vowels: ḍammah (u)'
      }
    ]
  },

  WIKT_IRANIAN_LONG_A_TO_IJMES_A_MACRON: {
    id: 'WIKT_IRANIAN_LONG_A_TO_IJMES_A_MACRON',
    sourceProfile: 'IRANIAN',
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    kind: 'CHARACTER_MAPPING',
    phenomenon: 'Iranian long â mapping to scholarly ā',
    sourceSymbol: 'â',
    interpretation: 'ā',
    description:
      'Maps modern Iranian circumflex long vowel "â" to standard scholarly IJMES long "ā" (alif).',
    sourceReferences: [
      {
        authority: 'WIKTIONARY',
        documentTitle: 'Wiktionary:About Persian — Iranian Persian Vowels',
        versionOrDate: 'Current (en.wiktionary.org)',
        sectionOrTable: 'Long Vowels: â',
        url: 'https://en.wiktionary.org/wiki/Wiktionary:About_Persian#Vowels'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Long Vowels: alif (ā)'
      }
    ]
  },

  WIKT_IRANIAN_LONG_I_TO_IJMES_I_MACRON: {
    id: 'WIKT_IRANIAN_LONG_I_TO_IJMES_I_MACRON',
    sourceProfile: 'IRANIAN',
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    kind: 'CHARACTER_MAPPING',
    phenomenon: 'Iranian long i aligned with Persian ya mapping to scholarly ī',
    sourceSymbol: 'i (with Persian ی)',
    interpretation: 'ī',
    description:
      'Maps modern Iranian long vowel "i" aligned with Persian script letter "ی" to standard scholarly IJMES long "ī".',
    sourceReferences: [
      {
        authority: 'WIKTIONARY',
        documentTitle: 'Wiktionary:About Persian — Iranian Persian Vowels',
        versionOrDate: 'Current (en.wiktionary.org)',
        sectionOrTable: 'Long Vowels: i',
        url: 'https://en.wiktionary.org/wiki/Wiktionary:About_Persian#Vowels'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Long Vowels: yā (ī)'
      }
    ]
  },

  WIKT_IRANIAN_LONG_U_TO_IJMES_U_MACRON: {
    id: 'WIKT_IRANIAN_LONG_U_TO_IJMES_U_MACRON',
    sourceProfile: 'IRANIAN',
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    kind: 'CHARACTER_MAPPING',
    phenomenon: 'Iranian long u aligned with Persian vav mapping to scholarly ū',
    sourceSymbol: 'u (with Persian و)',
    interpretation: 'ū',
    description:
      'Maps modern Iranian long vowel "u" aligned with Persian script letter "و" to standard scholarly IJMES long "ū".',
    sourceReferences: [
      {
        authority: 'WIKTIONARY',
        documentTitle: 'Wiktionary:About Persian — Iranian Persian Vowels',
        versionOrDate: 'Current (en.wiktionary.org)',
        sectionOrTable: 'Long Vowels: u',
        url: 'https://en.wiktionary.org/wiki/Wiktionary:About_Persian#Vowels'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Long Vowels: vāv (ū)'
      }
    ]
  },

  WIKT_IRANIAN_DIPHTHONG_OW_TO_AW: {
    id: 'WIKT_IRANIAN_DIPHTHONG_OW_TO_AW',
    sourceProfile: 'IRANIAN',
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    kind: 'CHARACTER_MAPPING',
    phenomenon: 'Iranian diphthong ow mapping to scholarly aw',
    sourceSymbol: 'ow',
    interpretation: 'aw',
    description:
      'Maps modern Iranian diphthong "ow" aligned with Persian "و" to standard scholarly IJMES diphthong "aw".',
    sourceReferences: [
      {
        authority: 'WIKTIONARY',
        documentTitle: 'Wiktionary:About Persian — Iranian Persian Diphthongs',
        versionOrDate: 'Current (en.wiktionary.org)',
        sectionOrTable: 'Diphthongs: ow',
        url: 'https://en.wiktionary.org/wiki/Wiktionary:About_Persian#Diphthongs'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Diphthongs: aw'
      }
    ]
  },

  WIKT_IRANIAN_DIPHTHONG_EY_TO_AY: {
    id: 'WIKT_IRANIAN_DIPHTHONG_EY_TO_AY',
    sourceProfile: 'IRANIAN',
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    kind: 'CHARACTER_MAPPING',
    phenomenon: 'Iranian diphthong ey mapping to scholarly ay',
    sourceSymbol: 'ey',
    interpretation: 'ay',
    description:
      'Maps modern Iranian diphthong "ey" aligned with Persian "ی" to standard scholarly IJMES diphthong "ay".',
    sourceReferences: [
      {
        authority: 'WIKTIONARY',
        documentTitle: 'Wiktionary:About Persian — Iranian Persian Diphthongs',
        versionOrDate: 'Current (en.wiktionary.org)',
        sectionOrTable: 'Diphthongs: ey',
        url: 'https://en.wiktionary.org/wiki/Wiktionary:About_Persian#Diphthongs'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Diphthongs: ay'
      }
    ]
  }
};
