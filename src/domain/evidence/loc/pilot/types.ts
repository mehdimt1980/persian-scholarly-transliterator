/**
 * Domain types for Phase 7G Track B: Library of Congress Evidence Feasibility Pilot.
 *
 * Core Scholarly Principles:
 *   1. Bibliographic Entity Evidence Yield ≠ Lexical Coverage Improvement.
 *   2. Romanized title ≠ independently validated romanization for each constituent word.
 *   3. No automatic word-level dictionary extraction from multiword titles.
 *   4. Cataloging provenance ≠ IJMES authority (ALA-LC is distinct from IJMES).
 *   5. Scheme verification: distinguish SOURCE_EXPLICIT vs UNVERIFIED_INFERRED vs UNKNOWN.
 */

import type { LexicalEntityType, RomanizationScheme } from '../../types';
import type { LinkageStatus } from '../types';

export type TitleMatchClassification =
  | 'EXACT_PERSIAN_TITLE_MATCH'
  | 'NORMALIZATION_EQUIVALENT_TITLE_MATCH'
  | 'PARTIAL_TITLE_MATCH'
  | 'PERSON_OR_ENTITY_MATCH'
  | 'NO_CONFIRMED_MATCH'
  | 'AMBIGUOUS_RECORD_MATCH';

export type SchemeVerificationStatus =
  | 'SOURCE_EXPLICIT'
  | 'UNVERIFIED_INFERRED'
  | 'UNKNOWN';

export interface LocPilotTitleCase {
  rank: number;
  caseId: string;
  sourceId: string;
  sourceTitle: string;
  normalizedTitle: string;
  workType: string;
  publicationYear?: number;
  unresolvedLexicalMisses: string[];
  selectionHash: string;
}

export interface LocPilotQueryOutcome {
  pilotCase: LocPilotTitleCase;
  queryAttempted: string;
  retrievalStatus: 'SUCCESS' | 'NO_RECORDS_FOUND' | 'HTTP_ERROR' | 'OFFLINE_SIMULATED';
  recordsRetrievedCount: number;
  persianLanguageRecordsCount: number;
  recordsWithField880Count: number;
  valid880LinkagesCount: number;
  rejectedOrAmbiguousLinkagesCount: number;
  matchClassification: TitleMatchClassification;
  matchedRecordDetails?: LocMatchedRecordDetail[];
}

export interface LocMatchedRecordDetail {
  lccn: string;
  recordUri: string;
  marcField: string;
  linkageStatus: LinkageStatus;
  persianObserved: string;
  latinObserved: string;
  entityType: LexicalEntityType;
  observedScheme: RomanizationScheme;
  schemeVerificationStatus: SchemeVerificationStatus;
  isExactTitleMatch: boolean;
  isPartialTitleMatch: boolean;
  isPersonalNameMatch: boolean;
  novelEvidenceYieldNotes: string;
}

export interface LocPilotAggregateMetrics {
  pilotTitlesSelected: number;
  queriesAttempted: number;
  successfulResponses: number;
  recordsRetrieved: number;
  persianLanguageRecords: number;
  recordsContainingField880: number;
  valid880Linkages: number;
  ambiguousOrInvalidLinkages: number;
  recordsWithUsableTitlePairs: number;
  recordsWithUsablePersonalNamePairs: number;
  exactTitleMatches: number;
  partialTitleMatches: number;
  sourceSchemeUnverifiedCases: number;
  structurallyValidNonComparableRecords: number;
  genuinelyNovelEvidenceObservations: number;
  lexicalTransliterationCoverageDelta: 'UNDETERMINED';
}

export interface LocPilotReport {
  reportVersion: string;
  generatedAt: string;
  pilotVersion: string;
  pilotSelectionSha256: string;
  corpusManifestSha256: string;
  pilotCasesCount: number;
  metrics: LocPilotAggregateMetrics;
  limitations: {
    workTypeMismatch: string;
    wordLevelAlignmentLimitation: string;
    catalogingSchemeLimitation: string;
    apiRateLimitLimitation: string;
  };
  queryOutcomesSample: LocPilotQueryOutcome[];
  governance: {
    zeroAutomaticDictionaryExtraction: true;
    zeroAuthorityPromotion: true;
    heldOutCorpusUntouched: true;
  };
}
