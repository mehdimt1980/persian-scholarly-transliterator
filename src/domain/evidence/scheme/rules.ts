/**
 * Source-cited rule registry for scholarly romanization scheme interpretation.
 *
 * Core scholarly invariant:
 *   Rules must derive strictly from official published standards (ALA-LC 2012 table,
 *   IJMES transliteration guide/chart) and explicit Persian orthographic facts.
 *   No ad-hoc strings, no benchmark-fitting, no AI.
 */

import { SchemeInterpretationRule } from './types';

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
      'Maps ALA-LC ʿayn symbol (modifier letter turned comma U+02BB "ʻ" or catalog single quotes) to standard IJMES ʿayn (modifier letter reversed comma U+02BF "ʿ").',
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
      'Maps ALA-LC medial lexical hamza symbol (modifier letter apostrophe U+02BC "ʼ") to standard IJMES hamza (modifier letter right half ring U+02BE "ʾ"). Excludes structural izāfat or indefinite markers.',
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
