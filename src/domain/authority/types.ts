import type { ProfileId } from '../types';

export type AuthorityContext = 'GENERAL_SCHOLARLY_TEXT' | 'BOOK_OR_ARTICLE_TITLE' | 'PERSON_NAME';
export type AuthorityEntryStatus = 'ACTIVE' | 'WITHDRAWN' | 'SUPERSEDED';

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
