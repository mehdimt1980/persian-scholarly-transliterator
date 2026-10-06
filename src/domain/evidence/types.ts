/**
 * Domain types for source-neutral lexical evidence, candidate semantics,
 * and provenance-aware acquisition.
 *
 * Core scholarly invariant:
 *   EXTERNAL OBSERVATION ≠ LEXICAL CANDIDATE ≠ AUTHORITATIVE LEXICON ENTRY
 */

/**
 * Romanization scheme / standard of an observed external transliteration string.
 * This is an explicit first-class distinction from the internal IJMES canonical standard.
 */
export type RomanizationScheme =
  | 'ALA_LC'
  | 'IJMES'
  | 'IRANICA'
  | 'ISO'
  | 'DMG'
  | 'LOCAL'
  | 'UNKNOWN';

/**
 * Entity or lexical classification of observed evidence.
 */
export type LexicalEntityType =
  | 'WORD'
  | 'PHRASE'
  | 'PERSON'
  | 'PLACE'
  | 'ORGANIZATION'
  | 'WORK'
  | 'TITLE'
  | 'OTHER';

/**
 * Classification of external evidence source provider / format.
 */
export type LexicalEvidenceSourceType =
  | 'LIBRARY_CATALOG'
  | 'AUTHORITY_FILE'
  | 'SCHOLARLY_DICTIONARY'
  | 'ENCYCLOPEDIA'
  | 'BIBLIOGRAPHIC_RECORD'
  | 'ACADEMIC_GRAMMAR'
  | 'OTHER';

/**
 * Lifecycle status of an individual evidence observation.
 * Observations are immutable/append-only historical records.
 */
export type LexicalEvidenceStatus =
  | 'OBSERVED'
  | 'SUPERSEDED'
  | 'INVALIDATED';

/**
 * Method used to extract or retrieve evidence.
 */
export type EvidenceRetrievalMethod =
  | 'API'
  | 'BULK_DATA'
  | 'MANUAL'
  | 'CATALOG_EXPORT'
  | 'SCRAPE';

/**
 * Structured provenance metadata for an external observation.
 */
export interface LexicalEvidenceProvenance {
  /** Identifier of the external source, e.g. 'LOC', 'VIAF', 'BNF', 'GND', 'IRANICA', 'DEHKHODA' */
  sourceId: string;
  /** Full title or human-readable name of the source database or work */
  sourceTitle?: string;
  /** Organization or institution maintaining the source (e.g. 'Library of Congress', 'OCLC') */
  sourceOrganization?: string;
  /** Method by which the record was acquired */
  retrievalMethod: EvidenceRetrievalMethod;
  /** ISO 8601 timestamp of when the evidence was retrieved */
  retrievedAt: string;
  /** Version or identifier of the extractor/adapter software that parsed the record */
  extractorVersion?: string;
  /** Optional free-form notes or contextual remarks */
  notes?: string;
}

/**
 * Exact substring boundary indices [start, end) inside a parent text string.
 */
export interface TextSpan {
  start: number;
  end: number;
}

/**
 * Computational strategy used to align Persian and Roman lexical tokens.
 */
export type AlignmentStrategy = 'POSITIONAL_EQUAL_COUNT';

/**
 * Classification of an aligned lexical segment's candidate eligibility.
 * CONTEXT_BOUND segments contain attached grammatical markers (e.g. -i, al-) and cannot form standalone candidates.
 */
export type CandidateEligibility = 'ELIGIBLE' | 'CONTEXT_BOUND';

/**
 * Computational lineage and span metadata for a derived aligned lexical segment.
 */
export interface LexicalEvidenceDerivation {
  kind: 'ALIGNED_SEGMENT';
  /** ID of the parent LexicalEvidence record from which this segment was derived */
  parentEvidenceId: string;
  /** 0-based sequential index of this segment inside the parent observation */
  segmentIndex: number;
  /** Exact span [start, end) of the Persian segment inside parent.persianForm */
  persianSpan: TextSpan;
  /** Exact span [start, end) of the Romanized segment inside parent.observedRomanization */
  romanizationSpan: TextSpan;
  /** Alignment strategy used */
  alignmentStrategy: AlignmentStrategy;
  /** Whether this segment is eligible to form a candidate proposal */
  candidateEligibility: CandidateEligibility;
  /** Optional reason if the segment is excluded or context-bound */
  exclusionReason?: string;
  /** Version or identifier of the alignment engine software that derived this segment */
  alignerVersion?: string;
  /** ISO 8601 timestamp of when the alignment derivation occurred */
  derivedAt?: string;
}

/**
 * Source-neutral domain representation for an observed lexical or phrase-level form.
 * Invariant: An observation is immutable historical evidence, never an authoritative entry.
 */
export interface LexicalEvidence {
  /** Unique deterministic identifier for the evidence observation */
  id: string;
  /** High-level category of the external source */
  sourceType: LexicalEvidenceSourceType;
  /** External identifier in the source system (e.g. MARC 001, LCCN, VIAF ID, GND ID) */
  sourceRecordId: string | null;
  /** Canonical URI or locator for the external record if available */
  sourceUri: string | null;
  /** Specific MARC tag, subfield, XML path, or schema property (e.g. '100$a', '245$a') */
  sourceField: string | null;
  /** The exact Persian script form as observed in the source (never normalized away) */
  persianForm: string;
  /** The exact romanization string as observed in the source, or null if unromanized */
  observedRomanization: string | null;
  /** Explicit romanization scheme of the observed string */
  romanizationScheme: RomanizationScheme;
  /** Lexical or named entity category */
  entityType: LexicalEntityType;
  /** Optional contextual snippet or parent title */
  context: string | null;
  /** Detailed retrieval provenance */
  provenance: LexicalEvidenceProvenance;
  /** Status of this observation */
  status: LexicalEvidenceStatus;
  /** Optional computational derivation metadata if this is an aligned sub-segment */
  derivation?: LexicalEvidenceDerivation;
}

/**
 * Lifecycle/adjudication status of a lexical candidate.
 * A candidate is a proposed entity constructed from evidence, still non-authoritative.
 */
export type LexicalCandidateStatus =
  | 'UNREVIEWED'
  | 'REVIEW_REQUIRED'
  | 'ACCEPTED'
  | 'REJECTED';

/**
 * Classification of observation relationship across evidence records.
 */
export type ConflictKind = 'CONFLICT_WITHIN_SCHEME' | 'VARIANT_ACROSS_SCHEMES';

/**
 * Record of a conflicting observation aggregated across evidence records.
 */
export interface ConflictingObservation {
  evidenceId: string;
  persianForm: string;
  observedRomanization: string | null;
  romanizationScheme: RomanizationScheme;
  conflictKind: ConflictKind;
  conflictReason: string;
}

/**
 * Derivation strategy and provenance for synthesizing a candidate from evidence.
 */
export interface CandidateDerivationProvenance {
  derivedAt: string;
  strategy:
    | 'SINGLE_EVIDENCE'
    | 'MULTI_EVIDENCE_SYNTHESIS'
    | 'ALIGNED_SEGMENT_SYNTHESIS'
    | 'MANUAL_DRAFT'
    | 'SCHOLARLY_HEURISTIC';
  notes?: string;
  synthesizerVersion?: string;
}

/**
 * Human adjudication decision recorded on a candidate.
 */
export interface CandidateAdjudicationRecord {
  decidedAt: string;
  adjudicator: string;
  disposition: 'ACCEPTED' | 'REJECTED';
  notes?: string;
}

/**
 * Domain representation of a lexical candidate constructed from one or more evidence records.
 * Invariant: Candidates are PROPOSED and NON-AUTHORITATIVE until explicitly promoted.
 */
export interface LexicalCandidate {
  /** Unique deterministic identifier for the candidate */
  id: string;
  /** The canonical Persian script form represented by this candidate */
  persianForm: string;
  /** Standard normalized form for lookup & grouping */
  normalizedForm: string;
  /** Proposed scholarly canonical transliteration, or null if unassigned/ambiguous */
  proposedCanonical: string | null;
  /** Target profile for proposed canonical */
  proposedProfile?: 'ijmes_full' | 'ijmes_title';
  /** Entity classification */
  entityType: LexicalEntityType;
  /** IDs of supporting LexicalEvidence records */
  evidenceIds: string[];
  /** Conflicting observations detected among supporting or co-indexed evidence */
  conflicts: ConflictingObservation[];
  /** Current candidate review lifecycle status */
  status: LexicalCandidateStatus;
  /** Provenance of how this candidate was synthesized */
  derivationProvenance: CandidateDerivationProvenance;
  /** Record of human adjudication if completed */
  adjudication?: CandidateAdjudicationRecord;
  /** Additional editorial notes */
  notes?: string;
}
