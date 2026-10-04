export type AcquisitionReviewStatus =
  | 'PENDING_HUMAN_REVIEW'
  | 'REJECTED';

export type AcquisitionCategory =
  | 'TERM'
  | 'LEGAL_TERM'
  | 'RELIGIOUS_TERM'
  | 'PERSON'
  | 'PLACE'
  | 'INSTITUTION'
  | 'BOOK_TITLE'
  | 'ARTICLE_TITLE'
  | 'COMPOUND'
  | 'MORPHOLOGY'
  | 'IZAFAT'
  | 'AMBIGUITY'
  | 'MIXED_SCRIPT'
  | 'OTHER';

export type ProposedProfile =
  | 'ijmes_full'
  | 'ijmes_title';

export type AcquisitionSourceKind =
  | 'CAMBRIDGE_IJMES'
  | 'ENCYCLOPAEDIA_IRANICA'
  | 'OPENALEX'
  | 'CROSSREF'
  | 'LIBRARY_CATALOG'
  | 'AUTHORITY_FILE'
  | 'ACADEMIC_DICTIONARY'
  | 'PEER_REVIEWED_PUBLICATION'
  | 'CRITICAL_EDITION'
  | 'OTHER_SCHOLARLY';

export type EvidenceRole =
  | 'SOURCE_TEXT'
  | 'IDENTITY'
  | 'READING'
  | 'BIBLIOGRAPHIC_METADATA'
  | 'RENDERING_POLICY';

export type RomanizationSystem =
  | 'IRANICA'
  | 'ALA_LC'
  | 'IJMES'
  | 'PUBLISHER_SUPPLIED'
  | 'UNKNOWN';

export type IndependenceClass =
  | 'FULLY_EXTERNAL'
  | 'EXTERNAL_SOURCE_PROJECT_TOPIC_OVERLAP'
  | 'REJECT_CIRCULAR';

export interface AcquisitionSource {
  kind: AcquisitionSourceKind;
  title: string;
  url?: string;
  citation?: string;
  locator?: string;
  externalId?: string;
  accessedAt: string;
  evidenceRole: EvidenceRole;
  observedRomanization?: string;
  romanizationSystem?: RomanizationSystem;
}

export interface WorkMetadata {
  authorDisplay?: string;
  publicationYear?: number;
  doi?: string;
  openAlexId?: string;
  catalogId?: string;
}

export interface EntityMetadata {
  authorityId?: string;
  englishLabel?: string;
  entityType?: 'PERSON' | 'PLACE' | 'INSTITUTION';
}

export interface ExternalCorpusCandidate {
  id: string;
  sourceText: string;
  proposedProfile: ProposedProfile;
  category: AcquisitionCategory;
  reviewStatus: 'PENDING_HUMAN_REVIEW';
  independenceClass: IndependenceClass;
  sources: AcquisitionSource[];
  tags?: string[];
  acquisitionNotes?: string;
  workMetadata?: WorkMetadata;
  entityMetadata?: EntityMetadata;
}

export interface AcquisitionManifest {
  id: string;
  version: string;
  status: 'PENDING_HUMAN_REVIEW';
  sourcePolicy: 'INDEPENDENT_EXTERNAL';
  candidateFile: string;
  acquiredAt: string;
  description: string;
}

export interface AcquisitionCorpusData {
  manifest: AcquisitionManifest;
  candidates: ExternalCorpusCandidate[];
}

export interface DuplicateFinding {
  type: 'EXACT_SURFACE' | 'NORMALIZED_SURFACE' | 'WORK_IDENTIFIER' | 'ENTITY_IDENTIFIER' | 'DUPLICATE_ID';
  candidateId: string;
  duplicateOfId: string;
  detail: string;
  permittedWithDistinctEvidence: boolean;
}

export interface DeduplicationResult {
  totalChecked: number;
  uniqueIds: number;
  duplicateFindings: DuplicateFinding[];
  hasBlockingDuplicates: boolean;
}

export interface OverlapAuditResult {
  candidateCount: number;
  exactLexiconOverlapCount: number;
  exactLexiconOverlapPercent: number;
  lexiconOverlapCandidates: { id: string; sourceText: string }[];
  pilotSingleOverlapCount: number;
  pilotSingleOverlapPercent: number;
  pilotBibliographyOverlapCount: number;
  testFixtureOverlapCount: number;
  outOfSampleCount: number;
  outOfSamplePercent: number;
  targetSatisfied: boolean; // outOfSamplePercent >= 70%
}

export interface AcquisitionCoverageMetrics {
  totalCandidates: number;
  categories: Record<AcquisitionCategory, number>;
  profiles: Record<ProposedProfile, number>;
  sourceKinds: Record<AcquisitionSourceKind, number>;
  independenceClasses: Record<IndependenceClass, number>;
  multiSourceCount: number;
  observedRomanizationCount: number;
  workMetadataCount: number;
  entityMetadataCount: number;
  iranicaCount: number;
  bibliographicSourceCount: number;
  rejectedCircularCount: number;
}

export interface AcquisitionValidationResult {
  success: boolean;
  manifest: AcquisitionManifest;
  candidates: ExternalCorpusCandidate[];
  deduplication: DeduplicationResult;
  overlapAudit: OverlapAuditResult;
  coverage: AcquisitionCoverageMetrics;
  errors: string[];
  report: string;
}
