import type { ProfileId } from '../types';

export type AuthorityContext = 'GENERAL_SCHOLARLY_TEXT' | 'BOOK_OR_ARTICLE_TITLE' | 'PERSON_NAME';
export type AuthorityEntryStatus = 'ACTIVE' | 'WITHDRAWN' | 'SUPERSEDED';

export type DerivationType =
  | 'RUNNING_TEXT_SURFACE'
  | 'CATALOGUE_INVERSION_NORMALIZED'
  | 'TITULAR_RUNNING_TEXT'
  | 'OTHER_SCHOLARLY_DERIVATION';

export type DerivedDecisionKind = 'DRAFT' | 'ACCEPT' | 'REJECT' | 'DEFER';

export interface DerivedCandidate {
  derivedCandidateId: string;
  parentCandidateId: string;
  parentSourceVersionId: string;
  parentReviewEventId: string;
  sourceSnapshotId: string;
  reviewBasisSha256: string;
  originalPersianSurface: string;
  runningTextPersianSurface: string;
  derivationType: DerivationType;
  derivationExplanation: string;
  createdAt: string;
  createdBy: string;
}

export interface DerivedReviewEvent {
  eventId: string;
  derivedCandidateId: string;
  decisionKind: DerivedDecisionKind;
  canonical: string | null;
  profile: ProfileId | null;
  authorityContext: AuthorityContext;
  reviewerRef: string;
  rationale: string | null;
  humanAttestation: string | null;
  decidedAt: string;
}

export interface DerivedReviewRecord extends DerivedCandidate {
  lastEvent: DerivedReviewEvent | null;
  decisionStatus: DerivedDecisionKind | 'PENDING';
  publicationStatus: 'NOT_PUBLISHED' | 'PUBLISHED' | 'WITHDRAWN_OR_SUPERSEDED';
}

export interface PublishedAuthorityProvenance {
  reviewEventId: string;
  candidateId: string;
  sourceSnapshotId: string;
  sourceVersionId: string;
  reviewBasisSha256: string;
  reviewerRef: string;
  reviewedAt: string;
  publicationEventId: string;
  publishedAt: string;
  derivedCandidateId?: string;
  derivedReviewEventId?: string;
  derivationType?: string;
  derivationExplanation?: string;
  parentCandidateId?: string;
  parentSourceVersionId?: string;
  parentReviewEventId?: string;
  parentReviewBasisSha256?: string;
}

export interface PublishedAuthorityEntry {
  entryId: string;
  normalizedPersian: string;
  persianSurface: string;
  canonical: string;
  profile: ProfileId;
  context: AuthorityContext;
  status: AuthorityEntryStatus;
  version: number;
  provenance: PublishedAuthorityProvenance;
}

export interface PublishedAuthoritySnapshot {
  schemaVersion: 'phase8r-authority-snapshot-v1';
  snapshotId: string;
  version: number;
  generatedAt: string;
  entries: PublishedAuthorityEntry[];
  manifestSha256: string;
}

export interface ResolvedPublishedAuthority {
  kind: 'PUBLISHED_SCHOLARLY_AUTHORITY';
  entryId: string;
  snapshotId: string;
  version: number;
  reviewEventId: string;
  publicationEventId: string;
  reviewerRef: string;
  reviewedAt: string;
  publishedAt: string;
}
