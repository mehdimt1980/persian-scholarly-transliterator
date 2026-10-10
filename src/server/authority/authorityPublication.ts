import { createHash } from 'node:crypto';
import { normalizePersian } from '../../domain/normalization';
import { validateManualTransliteration } from '../../domain/review/validation';
import { validatePublishedAuthoritySnapshot } from '../../domain/authority/snapshot';
import { assertAuthorityManifest, authorityManifestSha256 } from './manifest';
import type { AuthorityContext, PublishedAuthorityEntry, PublishedAuthoritySnapshot } from '../../domain/authority/types';
import type { ProfileId } from '../../domain/types';
import { VERIFIED_SOURCE, type VerifiedReviewSource } from './sourceVerification';

export type PublicationEventKind = 'PUBLISH' | 'WITHDRAW' | 'ROLLBACK';
export interface AcceptedReviewRecord {
  eventId: string; candidateId: string; activeSnapshotId: string; sourceVersionId: string;
  reviewBasisSha256: string; decisionKind: 'ACCEPT' | 'REJECT' | 'DEFER' | 'DRAFT';
  canonical: string | null; profile: ProfileId | null; reviewerRef: string | null;
  reviewedAt: string | null; rationale: string | null; humanAttestation: string | null;
  persianSurface: string; candidateContentHash: string; latestForCandidate: boolean;
  sourceRecordIds: string[]; category: string;
}
export interface AuthorityPublicationRequest {
  reviewEventId: string; expectedReviewBasisSha256: string; expectedSourceSnapshotId: string;
  context: AuthorityContext; publicationReason: string;
  personalNameOrderingAttestation?: 'RUNNING_TEXT_ORDER_VERIFIED';
}
export interface PublicationAuthorization {
  administratorRef: string; authorizedAt: string;
  scope: 'PHASE8R_AUTHORITY_PUBLICATION'; authorizationVersion: '1';
}
export interface VerifiedPublicationAuthorization extends PublicationAuthorization {
  verification: { kind: 'INDEPENDENT_ADMIN_FILE_HASH'; sha256: string };
}
export interface AuthorityPublicationPreview {
  previewId: string; entry: PublishedAuthorityEntry; publicationReason: string; warnings: string[];
  validation: { evidenceIntact: true; reviewCurrent: true; conflictFree: true; humanAttested: true };
}
export interface AuthorityPublicationEvent {
  eventId: string; kind: PublicationEventKind; entryId: string | null; snapshotId: string;
  previousSnapshotId: string; administratorRef: string; authorizationVersion: '1';
  reason: string; occurredAt: string;
}

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const HASH = /^[a-f0-9]{64}$/u;

export function prepareAuthorityPublication(review: VerifiedReviewSource, request: AuthorityPublicationRequest,
  activeSourceSnapshotId: string, existing: PublishedAuthorityEntry[]): AuthorityPublicationPreview {
  if (review[VERIFIED_SOURCE] !== true || review.verification?.kind !== 'INDEPENDENT_NEON_READ' || review.verification.latestEventId !== review.eventId ||
      review.verification.sourceFingerprint.length !== 64) throw new Error('INDEPENDENT_SOURCE_VERIFICATION_REQUIRED');
  if (review.eventId !== request.reviewEventId || review.decisionKind !== 'ACCEPT' || !review.latestForCandidate)
    throw new Error('REVIEW_NOT_CURRENT_ACCEPT');
  if (review.activeSnapshotId !== activeSourceSnapshotId || request.expectedSourceSnapshotId !== activeSourceSnapshotId ||
      review.reviewBasisSha256 !== request.expectedReviewBasisSha256 || !HASH.test(review.reviewBasisSha256))
    throw new Error('STALE_REVIEW_BASIS');
  if (!review.canonical || !review.profile || !review.reviewerRef || !review.reviewedAt ||
      review.humanAttestation !== 'I_PERSONALLY_VERIFIED_THIS_IJMES_FORM') throw new Error('INCOMPLETE_HUMAN_ATTESTATION');
  if (Number.isNaN(Date.parse(review.reviewedAt)) || !review.rationale?.trim() || !review.sourceVersionId ||
      !HASH.test(review.candidateContentHash)) throw new Error('INCOMPLETE_REVIEW_PROVENANCE');
  const canonical = validateManualTransliteration(review.canonical);
  if (!canonical.valid || !canonical.normalized) throw new Error('INVALID_IJMES_CANONICAL');
  const normalizedPersian = normalizePersian(review.persianSurface).normalizedInput;
  if (!normalizedPersian || !request.publicationReason.trim()) throw new Error('INVALID_PUBLICATION_REQUEST');
  if (request.context === 'PERSON_NAME' && request.personalNameOrderingAttestation !== 'RUNNING_TEXT_ORDER_VERIFIED')
    throw new Error('PERSON_NAME_ORDERING_NOT_VERIFIED');
  const conflict = existing.find(entry => entry.status === 'ACTIVE' && entry.normalizedPersian === normalizedPersian &&
    entry.profile === review.profile && entry.context === request.context && entry.canonical !== canonical.normalized);
  if (conflict) throw new Error(`CONFLICTING_PUBLISHED_AUTHORITY:${conflict.entryId}`);
  const identity = sha([review.eventId, review.reviewBasisSha256, normalizedPersian, review.profile,
    request.context, canonical.normalized].join('\n'));
  const publicationEventId = `pub-${identity.slice(0, 24)}`;
  const entry: PublishedAuthorityEntry = {
    entryId: `authority-${identity.slice(0, 24)}`, normalizedPersian, persianSurface: review.persianSurface,
    canonical: canonical.normalized, profile: review.profile, context: request.context, status: 'ACTIVE', version: 1,
    provenance: { reviewEventId: review.eventId, candidateId: review.candidateId,
      sourceSnapshotId: review.activeSnapshotId, sourceVersionId: review.sourceVersionId,
      reviewBasisSha256: review.reviewBasisSha256, reviewerRef: review.reviewerRef,
      reviewedAt: review.reviewedAt, publicationEventId, publishedAt: '' }
  };
  return { previewId: `preview-${sha(JSON.stringify({ entry, request })).slice(0, 24)}`, entry,
    publicationReason:request.publicationReason.trim(),
    warnings: request.context === 'PERSON_NAME' ? ['Running-text name order was explicitly attested; catalogue order was not reused automatically.'] : [],
    validation: { evidenceIntact: true, reviewCurrent: true, conflictFree: true, humanAttested: true } };
}

export function authorizePublication(preview: AuthorityPublicationPreview, authorization: PublicationAuthorization,
  publishedAt: string, previous: PublishedAuthoritySnapshot): { entry: PublishedAuthorityEntry; snapshot: PublishedAuthoritySnapshot; event: AuthorityPublicationEvent | null } {
  if (authorization.scope !== 'PHASE8R_AUTHORITY_PUBLICATION' || authorization.authorizationVersion !== '1' ||
      !authorization.administratorRef.trim() || Number.isNaN(Date.parse(authorization.authorizedAt)) ||
      Number.isNaN(Date.parse(publishedAt))) throw new Error('PUBLICATION_AUTHORIZATION_REQUIRED');
  validatePublishedAuthoritySnapshot(previous);
  assertAuthorityManifest(previous);
  const entry = { ...preview.entry, provenance: { ...preview.entry.provenance, publishedAt } };
  const same = previous.entries.find(candidate => candidate.entryId === entry.entryId);
  if (same) return { entry: same, snapshot: previous, event: null };
  const conflicting = previous.entries.some(candidate => candidate.status === 'ACTIVE' &&
    candidate.normalizedPersian === entry.normalizedPersian && candidate.profile === entry.profile &&
    candidate.context === entry.context && candidate.canonical !== entry.canonical);
  if (conflicting) throw new Error('CONFLICTING_ACTIVE_AUTHORITY');
  const base = { schemaVersion: 'phase8r-authority-snapshot-v1' as const,
    snapshotId: `authority-snapshot-${preview.previewId.slice(-24)}`, version: previous.version + 1,
    generatedAt: publishedAt, entries: [...previous.entries, entry] };
  const snapshot = { ...base, manifestSha256: authorityManifestSha256(base) };
  validatePublishedAuthoritySnapshot(snapshot);
  assertAuthorityManifest(snapshot);
  return { entry, snapshot, event: { eventId: entry.provenance.publicationEventId, kind:'PUBLISH',
    entryId:entry.entryId,snapshotId:snapshot.snapshotId,previousSnapshotId:previous.snapshotId,
    administratorRef:authorization.administratorRef,authorizationVersion:'1',
    reason:preview.publicationReason,occurredAt:publishedAt } };
}

export function assertVerifiedPublicationAuthorization(authorization: VerifiedPublicationAuthorization): void {
  if (authorization.verification?.kind !== 'INDEPENDENT_ADMIN_FILE_HASH' ||
      !HASH.test(authorization.verification.sha256)) throw new Error('PUBLICATION_AUTHORIZATION_NOT_INDEPENDENTLY_VERIFIED');
}

export function withdrawAuthority(snapshot: PublishedAuthoritySnapshot, entryId: string, authorization: PublicationAuthorization,
  at: string, reason = 'Explicit scholarly withdrawal'): { snapshot: PublishedAuthoritySnapshot; event: AuthorityPublicationEvent } {
  if (authorization.scope !== 'PHASE8R_AUTHORITY_PUBLICATION' || !authorization.administratorRef.trim())
    throw new Error('PUBLICATION_AUTHORIZATION_REQUIRED');
  validatePublishedAuthoritySnapshot(snapshot);
  assertAuthorityManifest(snapshot);
  const target = snapshot.entries.find(entry => entry.entryId === entryId);
  if (!target) throw new Error('UNKNOWN_AUTHORITY_ENTRY');
  const entries = snapshot.entries.filter(entry => entry.entryId !== entryId);
  const base = { schemaVersion: snapshot.schemaVersion, snapshotId: `authority-snapshot-withdraw-${sha(`${entryId}\n${at}`).slice(0, 16)}`,
    version: snapshot.version + 1, generatedAt: at, entries };
  const next = { ...base, manifestSha256: authorityManifestSha256(base) };
  return { snapshot: next, event: { eventId:`withdraw-${sha(`${entryId}\n${at}\n${reason}`).slice(0,24)}`,
    kind:'WITHDRAW',entryId,snapshotId:next.snapshotId,previousSnapshotId:snapshot.snapshotId,
    administratorRef:authorization.administratorRef,authorizationVersion:'1',reason,occurredAt:at } };
}

export function rollbackAuthority(current: PublishedAuthoritySnapshot, target: PublishedAuthoritySnapshot,
  authorization: PublicationAuthorization, at: string, reason: string):
  { snapshot: PublishedAuthoritySnapshot; event: AuthorityPublicationEvent } {
  if (!reason.trim() || authorization.scope !== 'PHASE8R_AUTHORITY_PUBLICATION' || !authorization.administratorRef.trim())
    throw new Error('PUBLICATION_AUTHORIZATION_REQUIRED');
  validatePublishedAuthoritySnapshot(current); validatePublishedAuthoritySnapshot(target);
  assertAuthorityManifest(current); assertAuthorityManifest(target);
  const base={schemaVersion:current.schemaVersion,
    snapshotId:`authority-snapshot-rollback-${sha(`${current.snapshotId}\n${target.snapshotId}\n${at}`).slice(0,16)}`,
    version:current.version+1,generatedAt:at,entries:target.entries.map(entry=>({...entry,provenance:{...entry.provenance}}))};
  const snapshot={...base,manifestSha256:authorityManifestSha256(base)};
  return {snapshot,event:{eventId:`rollback-${sha(`${snapshot.snapshotId}\n${reason}`).slice(0,24)}`,
    kind:'ROLLBACK',entryId:null,snapshotId:snapshot.snapshotId,previousSnapshotId:current.snapshotId,
    administratorRef:authorization.administratorRef,authorizationVersion:'1',reason,occurredAt:at}};
}
