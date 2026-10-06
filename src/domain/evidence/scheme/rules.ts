/**
 * Source-cited rule registry for scholarly romanization scheme interpretation and IJMES policy verification.
 *
 * Core scholarly invariant:
 *   Rules must derive strictly from official published standards (ALA-LC 2012 table,
 *   IJMES transliteration guide/chart) and explicit Persian orthographic facts.
 *   No ad-hoc strings, no benchmark-fitting, no AI.
 */

import { IJMESPolicyDefinition, SchemeInterpretationRule } from './types';

export const SCHEME_RULESET_VERSION = '1.0.0';

/**
 * Registry of verified, auditable scholarly scheme transformation rules.
 */
export const SCHEME_INTERPRETATION_RULES: Readonly<Record<string, SchemeInterpretationRule>> = {
  ALA_LC_TO_IJMES_AYN: {
    id: 'ALA_LC_TO_IJMES_AYN',
    sourceScheme: 'ALA_LC',
    targetScheme: 'IJMES',
    kind: 'SYMBOL_EQUIVALENCE',
    description:
      'Maps ALA-LC ʿayn symbol (modifier letter turned comma U+02BB "ʻ") to standard IJMES ʿayn (modifier letter reversed comma U+02BF "ʿ").',
    sourceReferences: [
      {
        authority: 'LIBRARY_OF_CONGRESS',
        documentTitle: 'ALA-LC Romanization Tables: Persian',
        versionOrDate: '2012',
        sectionOrTable: 'Letters of the Alphabet: ‘Ayn (ع)',
        url: 'https://www.loc.gov/catdir/cpso/romanization/persian.pdf'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Consonants: ʿayn (ع)',
        url: 'https://www.cambridge.org/core/journals/international-journal-of-middle-east-studies/information/author-resources'
      }
    ]
  },

  ALA_LC_TO_IJMES_LEXICAL_HAMZA: {
    id: 'ALA_LC_TO_IJMES_LEXICAL_HAMZA',
    sourceScheme: 'ALA_LC',
    targetScheme: 'IJMES',
    kind: 'SYMBOL_EQUIVALENCE',
    description:
      'Maps ALA-LC medial/final lexical hamza symbol (modifier letter apostrophe U+02BC "ʼ") to standard IJMES hamza (modifier letter right half ring U+02BE "ʾ"). Excludes initial hamza, izāfat, and indefinite markers.',
    sourceReferences: [
      {
        authority: 'LIBRARY_OF_CONGRESS',
        documentTitle: 'ALA-LC Romanization Tables: Persian',
        versionOrDate: '2012',
        sectionOrTable: 'Letters of the Alphabet: Hamzah (ء)',
        url: 'https://www.loc.gov/catdir/cpso/romanization/persian.pdf'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Consonants: hamzah (ء)',
        url: 'https://www.cambridge.org/core/journals/international-journal-of-middle-east-studies/information/author-resources'
      }
    ]
  },

  ALA_LC_TO_IJMES_DAD: {
    id: 'ALA_LC_TO_IJMES_DAD',
    sourceScheme: 'ALA_LC',
    targetScheme: 'IJMES',
    kind: 'CHARACTER_MAPPING',
    description:
      'Maps ALA-LC Persian ḍād / z̤ād representation (z with combining diaeresis below U+0324 "z̤" / "Z̤") to standard IJMES z-dot-above (U+017C "ż" / U+017B "Ż").',
    sourceReferences: [
      {
        authority: 'LIBRARY_OF_CONGRESS',
        documentTitle: 'ALA-LC Romanization Tables: Persian',
        versionOrDate: '2012',
        sectionOrTable: 'Letters of the Alphabet: Z̤ād (ض)',
        url: 'https://www.loc.gov/catdir/cpso/romanization/persian.pdf'
      },
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Consonants: żād (ض)',
        url: 'https://www.cambridge.org/core/journals/international-journal-of-middle-east-studies/information/author-resources'
      }
    ]
  }
};

/**
 * Official IJMES target standard policy definitions cited for policy auditing.
 */
export const IJMES_TARGET_POLICY_REGISTRY: Readonly<Record<string, IJMESPolicyDefinition>> = {
  IJMES_POLICY_AYN: {
    policyId: 'IJMES_POLICY_AYN',
    character: 'ع',
    persianLetterName: 'ʿAyn',
    targetSymbol: 'ʿ',
    notes: 'Modifier letter reversed comma U+02BF',
    sourceReferences: [
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Consonants: ʿayn (ع)'
      }
    ]
  },
  IJMES_POLICY_HAMZAH: {
    policyId: 'IJMES_POLICY_HAMZAH',
    character: 'ء',
    persianLetterName: 'Hamzah',
    targetSymbol: 'ʾ',
    notes: 'Modifier letter right half ring U+02BE',
    sourceReferences: [
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Consonants: hamzah (ء)'
      }
    ]
  },
  IJMES_POLICY_DAD: {
    policyId: 'IJMES_POLICY_DAD',
    character: 'ض',
    persianLetterName: 'Żād / Ḍād',
    targetSymbol: 'ż',
    notes: 'Z with dot above U+017C',
    sourceReferences: [
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Consonants: żād (ض)'
      }
    ]
  },
  IJMES_POLICY_SAD: {
    policyId: 'IJMES_POLICY_SAD',
    character: 'ص',
    persianLetterName: 'Ṣād',
    targetSymbol: 'ṣ',
    notes: 'S with dot below U+1E63',
    sourceReferences: [
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Consonants: ṣād (ص)'
      }
    ]
  },
  IJMES_POLICY_TA: {
    policyId: 'IJMES_POLICY_TA',
    character: 'ط',
    persianLetterName: 'Ṭā',
    targetSymbol: 'ṭ',
    notes: 'T with dot below U+1E6D',
    sourceReferences: [
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Consonants: ṭā (ط)'
      }
    ]
  },
  IJMES_POLICY_ZA: {
    policyId: 'IJMES_POLICY_ZA',
    character: 'ظ',
    persianLetterName: 'Ẓā',
    targetSymbol: 'ẓ',
    notes: 'Z with dot below U+1E93',
    sourceReferences: [
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Consonants: ẓā (ظ)'
      }
    ]
  },
  IJMES_POLICY_HA: {
    policyId: 'IJMES_POLICY_HA',
    character: 'ح',
    persianLetterName: 'Ḥā',
    targetSymbol: 'ḥ',
    notes: 'H with dot below U+1E25',
    sourceReferences: [
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Consonants: ḥā (ح)'
      }
    ]
  },
  IJMES_POLICY_KHA: {
    policyId: 'IJMES_POLICY_KHA',
    character: 'خ',
    persianLetterName: 'Khā',
    targetSymbol: 'kh',
    notes: 'Digraph kh',
    sourceReferences: [
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Consonants: khā (خ)'
      }
    ]
  },
  IJMES_POLICY_GHAYN: {
    policyId: 'IJMES_POLICY_GHAYN',
    character: 'غ',
    persianLetterName: 'Ghayn',
    targetSymbol: 'gh',
    notes: 'Digraph gh',
    sourceReferences: [
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Consonants: ghayn (غ)'
      }
    ]
  },
  IJMES_POLICY_SHIN: {
    policyId: 'IJMES_POLICY_SHIN',
    character: 'ش',
    persianLetterName: 'Shīn',
    targetSymbol: 'sh',
    notes: 'Digraph sh',
    sourceReferences: [
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Consonants: shīn (ش)'
      }
    ]
  },
  IJMES_POLICY_CHIH: {
    policyId: 'IJMES_POLICY_CHIH',
    character: 'چ',
    persianLetterName: 'Chih',
    targetSymbol: 'ch',
    notes: 'Digraph ch',
    sourceReferences: [
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Consonants: chih (چ)'
      }
    ]
  },
  IJMES_POLICY_ZHIH: {
    policyId: 'IJMES_POLICY_ZHIH',
    character: 'ژ',
    persianLetterName: 'Zhih',
    targetSymbol: 'zh',
    notes: 'Digraph zh',
    sourceReferences: [
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Transliteration Chart: Persian',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Consonants: zhih (ژ)'
      }
    ]
  },
  IJMES_POLICY_TA_MARBUTA: {
    policyId: 'IJMES_POLICY_TA_MARBUTA',
    character: 'ة',
    persianLetterName: 'Tā marbūṭah',
    targetSymbol: 'ih',
    notes: 'Persian guide special rendering -ih',
    sourceReferences: [
      {
        authority: 'IJMES',
        documentTitle: 'IJMES Translation and Transliteration Guide',
        versionOrDate: 'Current (Cambridge)',
        sectionOrTable: 'Persian: Tā marbūṭah (-ih)'
      }
    ]
  }
};

/**
 * Lookup rule by ID.
 */
export function getSchemeRule(ruleId: string): SchemeInterpretationRule | undefined {
  return SCHEME_INTERPRETATION_RULES[ruleId];
}

/**
 * Return all registered scheme rules.
 */
export function getAllSchemeRules(): SchemeInterpretationRule[] {
  return Object.values(SCHEME_INTERPRETATION_RULES);
}

/**
 * Return all registered IJMES target policies for auditing.
 */
export function getAllTargetPolicies(): IJMESPolicyDefinition[] {
  return Object.values(IJMES_TARGET_POLICY_REGISTRY);
}
