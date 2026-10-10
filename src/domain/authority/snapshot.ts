import { normalizePersian } from '../normalization';
import type { ProfileId, ReviewDecision } from '../types';
import type { AuthorityContext, PublishedAuthorityEntry, PublishedAuthoritySnapshot } from './types';

const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[a-z0-9][a-z0-9._:-]{2,160}$/u;

export function validatePublishedAuthoritySnapshot(snapshot: PublishedAuthoritySnapshot): void {
  if (snapshot.schemaVersion !== 'phase8r-authority-snapshot-v1' || !ID.test(snapshot.snapshotId) ||
      !Number.isSafeInteger(snapshot.version) || snapshot.version < 1 || !HASH.test(snapshot.manifestSha256) ||
      Number.isNaN(Date.parse(snapshot.generatedAt))) throw new Error('INVALID_AUTHORITY_SNAPSHOT_METADATA');
  const keys = new Set<string>();
  for (const entry of snapshot.entries) {
    const normalized = normalizePersian(entry.persianSurface).normalizedInput;
    const p = entry.provenance;
    if (!ID.test(entry.entryId) || entry.normalizedPersian !== normalized || !entry.canonical.trim() ||
        !['ijmes_full', 'ijmes_citation_title'].includes(entry.profile) || entry.status !== 'ACTIVE' ||
        !Number.isSafeInteger(entry.version) || entry.version < 1 || !ID.test(p.reviewEventId) ||
        !ID.test(p.publicationEventId) || !ID.test(p.candidateId) || !HASH.test(p.reviewBasisSha256) ||
        !p.sourceSnapshotId || !p.sourceVersionId || !p.reviewerRef ||
        Number.isNaN(Date.parse(p.reviewedAt)) || Number.isNaN(Date.parse(p.publishedAt)))
      throw new Error(`INVALID_AUTHORITY_ENTRY:${entry.entryId}`);
    const key = `${entry.normalizedPersian}\u0000${entry.profile}\u0000${entry.context}`;
    if (keys.has(key)) throw new Error(`CONFLICTING_ACTIVE_AUTHORITY:${key}`);
    keys.add(key);
  }
}

export function findPublishedAuthority(snapshot: PublishedAuthoritySnapshot, input: string, profile: ProfileId,
  context: AuthorityContext, userDecisions: ReviewDecision[] = []): PublishedAuthorityEntry | undefined {
  validatePublishedAuthoritySnapshot(snapshot);
  if (userDecisions.length > 0) return undefined;
  const normalized = normalizePersian(input).normalizedInput;
  const exact = snapshot.entries.filter((entry) => entry.status === 'ACTIVE' && entry.profile === profile &&
    entry.normalizedPersian === normalized);
  if (exact.length === 0) return undefined;
  const canonicals = new Set(exact.map((entry) => entry.canonical));
  if (canonicals.size > 1) throw new Error('AMBIGUOUS_PUBLISHED_AUTHORITY');
  // The published PERSON_NAME context is itself the reviewed semantic classification. It is
  // eligible only for an exact normalized phrase/profile match; no substring/name guessing occurs.
  return exact.find((entry) => entry.context === context) ?? exact.find((entry) => entry.context === 'PERSON_NAME');
}
