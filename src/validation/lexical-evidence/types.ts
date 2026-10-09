import type { BibliographicIdentityStatus, LatinVariantClassification } from '../acquisition/cinii/types';

export const LEXICAL_EVIDENCE_VERSION = 'phase8e-lexical-evidence-v1' as const;
export type LexicalCandidateCategory = 'PERSON_NAME' | 'PLACE_NAME' | 'WORK_TITLE' | 'ORGANIZATION_NAME' | 'MULTIWORD_EXPRESSION' | 'LEXICAL_TERM' | 'UNCLASSIFIED_CANDIDATE';
export type EvidenceStatus = 'OBSERVED' | 'CANDIDATE' | 'REVIEWED' | 'CONFLICTING' | 'INSUFFICIENT_EVIDENCE';

export interface LexicalSourceCitation { sourceRecordId: string; sourceUrl: string; sourceField: 'title' | 'dc:creator'; observedForm: string; evidenceStatus: 'OBSERVED'; }
export type EvidenceProvider = 'CINII_RESEARCH_OPENSEARCH_V2' | 'BSB_SRU_MARCXML';
export interface ProviderEvidence { provider: EvidenceProvider; sourceRecordId: string; sourceUrl: string; sourceField: string; sourceChecksum: string; relationship: 'ORIGINAL_SCRIPT' | 'ROMANIZATION_CANDIDATE' | 'TRANSLATED_TITLE' | 'PARALLEL_TITLE' | 'UNCERTAIN_VARIANT'; linkedField?: string; indicators?: [string, string]; subfields?: Array<{ code: string; value: string }>; }
export interface ReviewedEvidenceAttestation { schemaVersion: 'phase8e-review-attestation-v1'; attestedCandidateId: string; reviewerId: string; reviewedAt: string; decisionId: string; decisionProvenance: string; reviewVersion: string; scope: 'CANDIDATE_IDENTITY_AND_EVIDENCE'; reviewBasisHash: string; }
export interface LexicalCandidate {
  schemaVersion: typeof LEXICAL_EVIDENCE_VERSION; candidateId: string; originalPersianForm: string; normalizedSearchForm: string; category: LexicalCandidateCategory; contextualIdentity: string;
  linguisticContext: { kind: 'BIBLIOGRAPHIC_TITLE' | 'CREATOR_FIELD'; fullText: string; uncertainEntityType: boolean };
  sourceRecordIds: string[]; sourceUrls: string[]; fieldProvenance: LexicalSourceCitation[];
  providerEvidence?: ProviderEvidence[];
  observedLatinVariants: Array<{ value: string; classification: LatinVariantClassification; sourceField: string; sourceRecordId: string }>;
  bibliographicIdentities: Array<{ recordId: string; identityStatus: BibliographicIdentityStatus; crid: string | null; ncid: string | null; isbns: string[]; oclcs: string[] }>;
  evidenceCount: number; distinctSourceCount: number; reviewStatus: 'UNREVIEWED' | 'REVIEWED'; authorityStatus: 'NON_AUTHORITATIVE_CANDIDATE' | 'HUMAN_REVIEWED'; reviewEvidence?: ReviewedEvidenceAttestation; evidenceStatus: Exclude<EvidenceStatus, 'INSUFFICIENT_EVIDENCE'>;
  extractionMethod: 'WHOLE_BIBLIOGRAPHIC_FIELD'; extractionVersion: 'phase8e-v1' | 'phase8f-bsb-v1'; contentHash: string;
}
export interface LexicalEvidenceArtifact { schemaVersion: 'phase8e-lexical-artifact-v1'; datasetVersion: typeof LEXICAL_EVIDENCE_VERSION; generatedAt: string; sourceMode: 'OFFLINE_PHASE8D_FIXTURE' | 'LIVE_CINII'; liveStatus: 'LIVE_NOT_RUN_MISSING_AUTHORIZATION' | 'LIVE_RUN_AUTHORIZED'; liveAuthorizationStatus: 'NOT_AUTHORIZED' | 'AUTHORIZED'; liveExecutionStatus: 'NOT_RUN' | 'COMPLETE' | 'PARTIAL_BUDGET_EXHAUSTED' | 'FAILED'; candidates: LexicalCandidate[]; }
export interface EvidenceRetrievalResult { query: string; normalizedQuery: string; status: EvidenceStatus; matches: LexicalCandidate[]; citations: LexicalSourceCitation[]; }
