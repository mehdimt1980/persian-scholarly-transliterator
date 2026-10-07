/**
 * Lexical evidence and linguistic metadata extractor for Kaikki / Wiktextract Persian records.
 *
 * Core invariant:
 *   Extracts exact raw observations and linguistic metadata into immutable LexicalEvidence.
 *   NEVER rewrites or normalizes romanization into IJMES at acquisition time.
 *   NEVER automatically promotes or creates authoritative readings.
 */

import { normalizePersian } from '../../normalization';
import { generateEvidenceId } from '../candidate';
import type { LexicalEvidence } from '../types';
import type {
  KaikkiEvidenceMetadata,
  KaikkiExtractedObservation,
  KaikkiIpaObservation,
  KaikkiLemmaRelation,
  KaikkiLemmaStatus,
  KaikkiRawEntry,
  KaikkiRomanizationObservation
} from './types';

export const KAIKKI_SOURCE_ID = 'KAIKKI_ENWIKTIONARY_FA';
export const KAIKKI_EXTRACTOR_VERSION = '1.1.0';

export interface KaikkiExtractorOptions {
  now?: () => string;
}

/**
 * Construct deterministic and semantic source record identifier from stable upstream fields.
 * Includes etymology number and head number when present to disambiguate multiple entries.
 */
export function buildKaikkiSourceRecordId(entry: KaikkiRawEntry): string {
  const parts: string[] = [
    entry.word,
    entry.lang_code ?? 'fa',
    entry.pos ?? 'entry'
  ];

  if (entry.etymology_number !== undefined && String(entry.etymology_number).trim() !== '') {
    parts.push(`etym:${String(entry.etymology_number).trim()}`);
  }

  if (entry.head_nr !== undefined) {
    parts.push(`head:${entry.head_nr}`);
  }

  return parts.join('#');
}

/**
 * Determine lemma vs non-lemma status and extract lemma relation from Wiktextract senses.
 */
export function determineLemmaStatus(entry: KaikkiRawEntry): {
  lemmaStatus: KaikkiLemmaStatus;
  lemmaRelation?: KaikkiLemmaRelation;
} {
  const pos = entry.pos?.toLowerCase();

  // Check senses for form_of or alt_of relationships
  if (entry.senses && entry.senses.length > 0) {
    for (const sense of entry.senses) {
      if (sense.form_of && sense.form_of.length > 0 && sense.form_of[0].word) {
        return {
          lemmaStatus: 'NON_LEMMA_FORM',
          lemmaRelation: {
            kind: 'FORM_OF',
            lemma: sense.form_of[0].word,
            tags: sense.tags
          }
        };
      }

      if (sense.alt_of && sense.alt_of.length > 0 && sense.alt_of[0].word) {
        return {
          lemmaStatus: 'NON_LEMMA_FORM',
          lemmaRelation: {
            kind: 'ALT_OF',
            lemma: sense.alt_of[0].word,
            tags: sense.tags
          }
        };
      }

      if (sense.tags && (sense.tags.includes('form-of') || sense.tags.includes('inflection'))) {
        return {
          lemmaStatus: 'NON_LEMMA_FORM'
        };
      }
    }
  }

  // Check known inflected/non-lemma POS tags
  const nonLemmaPos = new Set([
    'verb_form',
    'noun_form',
    'adj_form',
    'pron_form',
    'participle',
    'infl_verb'
  ]);
  if (pos && nonLemmaPos.has(pos)) {
    return { lemmaStatus: 'NON_LEMMA_FORM' };
  }

  // Standard lexical POS tags
  const standardLemmaPos = new Set([
    'noun',
    'verb',
    'adj',
    'adv',
    'name',
    'propn',
    'pron',
    'num',
    'prep',
    'conj',
    'interj',
    'particle',
    'affix',
    'prefix',
    'suffix'
  ]);
  if (pos && standardLemmaPos.has(pos)) {
    return { lemmaStatus: 'LEMMA' };
  }

  return { lemmaStatus: 'UNKNOWN_LEMMA_STATUS' };
}

/**
 * Extract IPA pronunciation observations from entry sounds.
 */
export function extractIpaObservations(entry: KaikkiRawEntry): KaikkiIpaObservation[] {
  if (!entry.sounds || entry.sounds.length === 0) {
    return [];
  }

  const observations: KaikkiIpaObservation[] = [];
  for (const sound of entry.sounds) {
    if (sound.ipa && typeof sound.ipa === 'string' && sound.ipa.trim().length > 0) {
      observations.push({
        ipa: sound.ipa.trim(),
        tags: sound.tags ? [...sound.tags] : [],
        note: sound.note
      });
    }
  }
  return observations;
}

/**
 * Collect dialect, variety, and register tags across sounds, forms, and senses.
 */
export function collectVarietyTags(entry: KaikkiRawEntry): string[] {
  const tagsSet = new Set<string>();

  if (entry.sounds) {
    for (const sound of entry.sounds) {
      if (sound.tags) {
        for (const t of sound.tags) tagsSet.add(t);
      }
    }
  }

  if (entry.forms) {
    for (const form of entry.forms) {
      if (form.tags) {
        for (const t of form.tags) tagsSet.add(t);
      }
    }
  }

  if (entry.senses) {
    for (const sense of entry.senses) {
      if (sense.tags) {
        for (const t of sense.tags) tagsSet.add(t);
      }
    }
  }

  return Array.from(tagsSet).sort();
}

/**
 * Extract rich romanization observations with stable source indices and individual tag arrays.
 */
export function extractRawRomanizations(entry: KaikkiRawEntry): KaikkiRomanizationObservation[] {
  if (!entry.forms || entry.forms.length === 0) {
    return [];
  }

  const observations: KaikkiRomanizationObservation[] = [];
  for (let index = 0; index < entry.forms.length; index += 1) {
    const formObj = entry.forms[index];
    const isRomanization =
      (formObj.tags && formObj.tags.includes('romanization')) ||
      (typeof formObj.romanization === 'string' && formObj.romanization.trim().length > 0);

    if (isRomanization) {
      const rom = (formObj.form ?? formObj.romanization ?? '').trim();
      if (rom.length > 0) {
        observations.push({
          value: rom,
          sourceFormIndex: index,
          tags: formObj.tags ? [...formObj.tags] : [],
          rawTags: formObj.raw_tags ? [...formObj.raw_tags] : undefined,
          source: formObj.source,
          headNr: formObj.head_nr
        });
      }
    }
  }

  return observations;
}

/**
 * Extract LexicalEvidence observations and rich linguistic metadata from a raw Kaikki Persian entry.
 */
export function extractKaikkiObservations(
  entry: KaikkiRawEntry,
  options?: KaikkiExtractorOptions
): KaikkiExtractedObservation[] {
  const rawWord = entry.word;
  const normalized = normalizePersian(rawWord).normalizedInput;
  const retrievedAt = options?.now ? options.now() : new Date().toISOString();

  const { lemmaStatus, lemmaRelation } = determineLemmaStatus(entry);
  const ipaObservations = extractIpaObservations(entry);
  const varietyTags = collectVarietyTags(entry);

  const glosses: string[] = [];
  const sourceSenseIds: string[] = [];
  if (entry.senses) {
    for (const sense of entry.senses) {
      if (sense.id) sourceSenseIds.push(sense.id);
      if (Array.isArray(sense.senseid)) {
        for (const sid of sense.senseid) {
          if (typeof sid === 'string' && sid.trim()) sourceSenseIds.push(sid.trim());
        }
      }
      if (sense.glosses) {
        for (const g of sense.glosses) {
          if (typeof g === 'string' && g.trim()) glosses.push(g.trim());
        }
      }
    }
  }

  const sourceRecordId = buildKaikkiSourceRecordId(entry);
  const sourceUri = `https://en.wiktionary.org/wiki/${encodeURIComponent(rawWord)}`;
  const contextSnippet = glosses.length > 0 ? glosses[0] : null;

  const baseMetadata: Omit<KaikkiEvidenceMetadata, 'romanizationTags' | 'sourceFormIndex'> = {
    pos: entry.pos,
    etymologyNumber: entry.etymology_number,
    headNr: entry.head_nr,
    lemmaStatus,
    lemmaRelation,
    ipaObservations,
    varietyTags,
    sourceSenseIds,
    glosses,
    etymologyText: entry.etymology_text,
    rawSourceWord: rawWord,
    normalizedForm: normalized
  };

  const romanizationObs = extractRawRomanizations(entry);

  // If no romanization forms are present, create a single unromanized observation preserving metadata
  if (romanizationObs.length === 0) {
    const evidenceId = generateEvidenceId({
      sourceId: KAIKKI_SOURCE_ID,
      sourceRecordId,
      sourceField: null,
      persianForm: rawWord,
      observedRomanization: null,
      romanizationScheme: 'LOCAL'
    });

    const evidence: LexicalEvidence = {
      id: evidenceId,
      sourceType: 'LEXICOGRAPHIC_DATASET',
      sourceRecordId,
      sourceUri,
      sourceField: null,
      persianForm: rawWord,
      observedRomanization: null,
      romanizationScheme: 'LOCAL',
      entityType: 'WORD',
      context: contextSnippet,
      provenance: {
        sourceId: KAIKKI_SOURCE_ID,
        sourceTitle: 'Kaikki / English Wiktionary Persian',
        sourceOrganization: 'Kaikki.org / Wiktextract / Wikimedia Foundation',
        retrievalMethod: 'BULK_DATA',
        retrievedAt,
        extractorVersion: KAIKKI_EXTRACTOR_VERSION
      },
      status: 'OBSERVED'
    };

    return [
      {
        evidence,
        metadata: {
          ...baseMetadata,
          romanizationTags: [],
          sourceFormIndex: undefined
        },
        rawSourceWord: rawWord,
        normalizedForm: normalized
      }
    ];
  }

  // For every romanization observation, create a distinct LexicalEvidence record
  return romanizationObs.map((rom) => {
    const sourceField = `forms[${rom.sourceFormIndex}]`;
    const evidenceId = generateEvidenceId({
      sourceId: KAIKKI_SOURCE_ID,
      sourceRecordId,
      sourceField,
      persianForm: rawWord,
      observedRomanization: rom.value,
      romanizationScheme: 'LOCAL'
    });

    const evidence: LexicalEvidence = {
      id: evidenceId,
      sourceType: 'LEXICOGRAPHIC_DATASET',
      sourceRecordId,
      sourceUri,
      sourceField,
      persianForm: rawWord,
      observedRomanization: rom.value,
      romanizationScheme: 'LOCAL',
      entityType: 'WORD',
      context: contextSnippet,
      provenance: {
        sourceId: KAIKKI_SOURCE_ID,
        sourceTitle: 'Kaikki / English Wiktionary Persian',
        sourceOrganization: 'Kaikki.org / Wiktextract / Wikimedia Foundation',
        retrievalMethod: 'BULK_DATA',
        retrievedAt,
        extractorVersion: KAIKKI_EXTRACTOR_VERSION
      },
      status: 'OBSERVED'
    };

    return {
      evidence,
      metadata: {
        ...baseMetadata,
        romanizationTags: rom.tags,
        sourceFormIndex: rom.sourceFormIndex
      },
      rawSourceWord: rawWord,
      normalizedForm: normalized
    };
  });
}
