/**
 * Comprehensive test fixtures for Phase 7E Profile Recovery & Metadata Enrichment.
 */

import { extractKaikkiObservations } from '../extractor';
import type { KaikkiRawEntry, KaikkiExtractedObservation } from '../types';

export interface ProfileRecoveryFixture {
  name: string;
  description: string;
  rawEntry: KaikkiRawEntry;
  observations: KaikkiExtractedObservation[];
}

function makeFixture(name: string, description: string, rawEntry: KaikkiRawEntry): ProfileRecoveryFixture {
  return {
    name,
    description,
    rawEntry,
    observations: extractKaikkiObservations(rawEntry)
  };
}

export const FIXTURE_EXPLICIT_IRANIAN: ProfileRecoveryFixture = makeFixture(
  'explicit-iranian',
  'Explicit Iranian profile tag on form',
  {
    word: 'کتاب',
    pos: 'noun',
    forms: [
      {
        form: 'ketâb',
        tags: ['romanization', 'Iranian-Persian']
      }
    ]
  }
);

export const FIXTURE_EXPLICIT_CLASSICAL: ProfileRecoveryFixture = makeFixture(
  'explicit-classical',
  'Explicit Classical profile tag on form',
  {
    word: 'کتاب',
    pos: 'noun',
    forms: [
      {
        form: 'kitāb',
        tags: ['romanization', 'Classical-Persian']
      }
    ]
  }
);

export const FIXTURE_STRUCTURAL_TEMPLATE_LINK: ProfileRecoveryFixture = makeFixture(
  'structural-template-link',
  'Observation linked to explicit template argument in head_templates',
  {
    word: 'دانشگاه',
    pos: 'noun',
    head_templates: [
      {
        name: 'fa-noun',
        args: {
          cls: 'dānišgāh',
          ira: 'dânešgâh'
        }
      }
    ],
    forms: [
      {
        form: 'dānišgāh',
        tags: ['romanization']
      },
      {
        form: 'dânešgâh',
        tags: ['romanization']
      }
    ]
  }
);

export const FIXTURE_PAIRED_IMAM: ProfileRecoveryFixture = makeFixture(
  'paired-imam',
  'Paired Classical imām (i+ā) and Iranian emâm (e+â) on same Persian record',
  {
    word: 'امام',
    pos: 'noun',
    forms: [
      {
        form: 'imām',
        tags: ['romanization']
      },
      {
        form: 'emâm',
        tags: ['romanization']
      }
    ]
  }
);

export const FIXTURE_PAIRED_JEHAD: ProfileRecoveryFixture = makeFixture(
  'paired-jehad',
  'Paired Classical jihād and Iranian jehâd',
  {
    word: 'جهاد',
    pos: 'noun',
    forms: [
      {
        form: 'jihād',
        tags: ['romanization']
      },
      {
        form: 'jehâd',
        tags: ['romanization']
      }
    ]
  }
);

export const FIXTURE_SINGLE_TYPOGRAPHIC_MARKER_ONLY: ProfileRecoveryFixture = makeFixture(
  'single-marker-only',
  'Single isolated observation with â (prohibited from heuristic standalone recovery)',
  {
    word: 'آب',
    pos: 'noun',
    forms: [
      {
        form: 'âb',
        tags: ['romanization']
      }
    ]
  }
);

export const FIXTURE_TWO_UNRELATED_ROMANIZATIONS: ProfileRecoveryFixture = makeFixture(
  'two-unrelated-roms',
  'Two romanizations with different consonantal skeleton or incompatible alignment',
  {
    word: 'سر',
    pos: 'noun',
    forms: [
      {
        form: 'sar',
        tags: ['romanization']
      },
      {
        form: 'sirr',
        tags: ['romanization']
      }
    ]
  }
);
