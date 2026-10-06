/**
 * Lexicon adapter and mapping utilities for Phase 5E promotion.
 *
 * Core invariants:
 *   1. Promoted readings have confidence: 1.0 (representing accepted project review state).
 *   2. Sources point back to Phase 5E governance lineage (decision, candidate, scheme analysis).
 *   3. Conservative category mapping: Only PERSON, PLACE, and ORGANIZATION map to proper-noun;
 *      general words/works/titles leave category undefined unless explicitly supported.
 *   4. Existing lexical entries preserve all existing readings and metadata without overwrite.
 */

import type { LexicalEntityType } from '../types';
import type {
  LexicalCategory,
  LexicalEntry,
  LexicalReading,
  ProperNameMetadata
} from '../../lexicon/types';
import type { CandidateAdjudicationDecision } from './types';

export interface MappedLexicalMetadata {
  category?: LexicalCategory;
  properName?: ProperNameMetadata;
}

/**
 * Perform conservative mapping of evidence entity types to lexicon category metadata
 * strictly for NEW entry creation.
 */
export function mapEntityTypeToLexicalMetadata(
  entityType?: LexicalEntityType
): MappedLexicalMetadata {
  if (entityType === 'PERSON') {
    return {
      category: 'proper-noun',
      properName: { type: 'PERSON' }
    };
  }
  if (entityType === 'PLACE') {
    return {
      category: 'proper-noun',
      properName: { type: 'PLACE' }
    };
  }
  if (entityType === 'ORGANIZATION') {
    return {
      category: 'proper-noun',
      properName: { type: 'INSTITUTION' }
    };
  }

  // Do not guess or infer noun for WORD, WORK, TITLE, OTHER
  return {
    category: undefined,
    properName: undefined
  };
}

/**
 * Construct a new reviewed LexicalReading from an accepted human adjudication decision.
 */
export function buildPromotedReading(params: {
  readingId: string;
  canonical: string;
  decision: CandidateAdjudicationDecision;
  category?: LexicalCategory;
  properName?: ProperNameMetadata;
}): LexicalReading {
  const { readingId, canonical, decision, category, properName } = params;

  return {
    id: readingId,
    canonical,
    // Note: confidence 1.0 represents accepted project-review authority, not a statistical probability estimate
    confidence: 1.0,
    source: 'Phase 5E human-adjudicated lexical promotion',
    sources: [
      {
        type: 'REVIEWED_PROJECT_ENTRY',
        citation: 'Phase 5E human-adjudicated lexical promotion',
        reference: `decision=${decision.id}; candidate=${decision.candidateId}; analysis=${decision.schemeAnalysisId}`
      }
    ],
    category,
    properName,
    notes: decision.rationale ? `Promoted review: ${decision.rationale}` : undefined
  };
}

/**
 * Construct a new LexicalEntry for a newly promoted Persian term.
 */
export function buildPromotedLexicalEntry(params: {
  entryId: string;
  readingId: string;
  persianSurface: string;
  normalizedPersian: string;
  canonical: string;
  decision: CandidateAdjudicationDecision;
  entityType?: LexicalEntityType;
}): LexicalEntry {
  const { entryId, readingId, persianSurface, normalizedPersian, canonical, decision, entityType } =
    params;

  const metadata = mapEntityTypeToLexicalMetadata(entityType);
  const reading = buildPromotedReading({
    readingId,
    canonical,
    decision,
    category: metadata.category,
    properName: metadata.properName
  });

  return {
    id: entryId,
    surface: persianSurface,
    normalized: normalizedPersian,
    category: metadata.category,
    properName: metadata.properName,
    readings: [reading],
    sources: [
      {
        type: 'REVIEWED_PROJECT_ENTRY',
        citation: 'Phase 5E human-adjudicated lexical promotion',
        reference: `decision=${decision.id}`
      }
    ]
  };
}
