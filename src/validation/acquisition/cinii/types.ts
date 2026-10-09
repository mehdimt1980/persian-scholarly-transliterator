export const CINII_DATASET_VERSION = 'phase8d-cinii-pilot-v1' as const;
export type ScriptClassification = 'PERSIAN_SCRIPT' | 'ARABIC_SCRIPT_UNCERTAIN_LANGUAGE' | 'MIXED_ARABIC_LATIN' | 'LATIN_ONLY' | 'OTHER_SCRIPT';
export type PairingStatus = 'PERSIAN_ONLY' | 'PERSIAN_WITH_OBSERVED_ROMANIZATION' | 'MULTIPLE_ROMANIZATION_VARIANTS' | 'LATIN_ONLY' | 'UNCERTAIN_LANGUAGE_OR_PAIRING';
export type BibliographicIdentityStatus = 'UNIQUE_RECORD' | 'EXACT_DUPLICATE_RECORD' | 'DUPLICATE_MANIFESTATION' | 'RELATED_EDITION' | 'SIMILAR_TITLE_ONLY' | 'UNCERTAIN_RELATIONSHIP';

export interface CiniiQueryConfig { queryId: string; q?: string; title?: string; languageType?: string[]; dataSourceType?: string[]; resourceType?: string[]; from?: string; until?: string; sortorder: 0 | 1 | 4; count: number; }
export interface RawTitleVariant { value: string; language?: string; sourceField: string; }
export interface CiniiEvidenceRecord {
  schemaVersion: 'phase8d-cinii-evidence-v1'; datasetVersion: typeof CINII_DATASET_VERSION; recordId: string; sourceProvider: 'CINII_RESEARCH_OPENSEARCH_V2'; sourceRecordId: string; sourceUrl: string; retrievedAt: string; queryId: string; recordType: string | null;
  rawTitles: RawTitleVariant[]; persianTitle: string | null; normalizedPersianTitle: string | null; observedRomanizations: Array<{ value: string; probableScheme: 'UNKNOWN'; sourceField: string }>;
  languageEvidence: { catalogLanguages: string[]; unicodeEvidence: string[]; linguisticIdentity: 'PERSIAN_SUPPORTED' | 'UNCERTAIN' };
  scriptClassification: ScriptClassification; authors: string[]; publicationMetadata: { publisher: string | null; publicationYear: number | null };
  identifiers: { crid: string | null; ncid: string | null; isbns: string[] };
  pairingStatus: PairingStatus; pairingEvidence: string[]; bibliographicIdentityStatus: BibliographicIdentityStatus; relatedRecordIds: string[]; reviewStatus: 'UNREVIEWED';
  provenance: { endpoint: 'https://cir.nii.ac.jp/opensearch/v2/books'; officialDocumentation: string; attribution: string; licenseNote: string; originalSourceFields: string[] };
  rawRecordChecksum: string; contentHash: string;
}
export interface CiniiPilotArtifact { schemaVersion: 'phase8d-cinii-pilot-artifact-v1'; datasetVersion: typeof CINII_DATASET_VERSION; mode: 'OFFLINE_MOCKED' | 'LIVE_CINII'; retrievedAt: string; query: CiniiQueryConfig; records: CiniiEvidenceRecord[]; quality: CiniiQualitySummary; }
export interface CiniiQualitySummary { attemptedRecords: number; receivedRecords: number; uniqueBibliographicIdentities: number; persianScriptTitles: number; observedRomanizationPairs: number; uncertainPairings: number; scriptLanguageMismatches: number; exactDuplicates: number; duplicateManifestations: number; relatedEditions: number; recordsMissingPublisher: number; recordsMissingYear: number; recordsMissingStableIdentifier: number; reviewReadyCandidates: number; apiErrors: number; }
export interface Phase8cCandidate { candidateId: string; sourceText: string; normalizedInput: string; reviewStatus: 'REVIEW_PENDING'; authority: 'NON_AUTHORITATIVE_BIBLIOGRAPHIC_EVIDENCE'; sourceProvider: 'CINII_RESEARCH_OPENSEARCH_V2'; sourceRecordId: string; sourceUrl: string; observedRomanizations: Array<{ value: string; role: 'BIBLIOGRAPHIC_EVIDENCE_NOT_REFERENCE'; probableScheme: 'UNKNOWN' }>; provenanceHash: string; }
