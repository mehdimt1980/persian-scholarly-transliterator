import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { databaseIdentityFingerprint } from '../evidence-store/guard';
import { assertCandidateContentHash } from '../evidence-store/publication';
import { computeBsbReviewBasis } from '../evidence-store/bsbScholarlyReview';
import { lexicalCandidateSchema } from '../../validation/lexical-evidence/schema';
import type { AcceptedReviewRecord, AuthorityPublicationRequest } from './authorityPublication';

type Row = Record<string, unknown>;
export const VERIFIED_SOURCE = Symbol('PHASE8R_VERIFIED_SOURCE');
export interface TrustedSourceQuery { query(text: string, values?: unknown[]): Promise<unknown>; }
export interface VerifiedReviewSource extends AcceptedReviewRecord {
  readonly [VERIFIED_SOURCE]: true;
  verification: { kind: 'INDEPENDENT_NEON_READ'; verifiedAt: string; sourceFingerprint: string;
    databaseTargetSha256: string; activeManifestChecksum: string; latestEventId: string };
}
export interface SourceVerificationEnvironment {
  expectedHost: string; expectedDatabaseFingerprint: string; expectedNamespace: string;
}
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];
const text = (value: unknown): string => String(value ?? '');

const VERIFY_SQL = `
  WITH active AS (
    SELECT a.snapshot_id,s.manifest_checksum,s.source_version_ids,s.manifest_json,
      s.manifest_checksum=evidence_manifest_checksum(s.schema_version,s.extraction_version,s.source_version_ids,s.manifest_json->'candidates') AS manifest_valid
    FROM evidence_active_snapshot a
    JOIN evidence_snapshot s ON s.snapshot_id=a.snapshot_id WHERE a.singleton=true AND s.status='ACTIVE'
  ), requested AS (
    SELECT e.* FROM phase8o_review_event e WHERE e.event_id=$1::uuid
  ), latest AS (
    SELECT e.event_id,e.decision_kind FROM phase8o_review_event e
    JOIN requested r ON r.candidate_id=e.candidate_id
    ORDER BY e.decided_at DESC,e.event_id DESC LIMIT 1
  )
  SELECT active.snapshot_id,active.manifest_checksum,active.manifest_valid,p.source_version_id,p.candidate_json,p.content_hash,
    active.source_version_ids ? p.source_version_id AS source_in_manifest,
    EXISTS(SELECT 1 FROM jsonb_array_elements(active.manifest_json->'candidates') item
      WHERE item->>'candidateId'=p.candidate_id AND item->>'contentHash'=p.content_hash::text
        AND item->>'sourceVersionId'=p.source_version_id) AS candidate_in_manifest,
    r.event_id,r.active_snapshot_id AS event_snapshot_id,r.candidate_id,r.review_basis_sha256,
    r.decision_kind,r.reviewer_ref,r.decision_json,r.decided_at,latest.event_id AS latest_event_id,
    latest.decision_kind AS latest_decision_kind,rv.provider,rv.source_record_id,rv.record_checksum
  FROM active JOIN requested r ON true
  LEFT JOIN evidence_candidate_projection p ON p.snapshot_id=active.snapshot_id AND p.candidate_id=r.candidate_id
  LEFT JOIN evidence_record_version rv ON rv.version_id=p.source_version_id
  CROSS JOIN latest`;

export async function verifyReviewSourceWithQuery(query: TrustedSourceQuery, reviewEventId: string,
  request: AuthorityPublicationRequest, sourceFingerprint: string, databaseTargetSha256 = sourceFingerprint,
  verifiedAt = new Date().toISOString()): Promise<VerifiedReviewSource> {
  if (!/^[0-9a-f-]{36}$/iu.test(reviewEventId)) throw new Error('INVALID_REVIEW_EVENT_ID');
  const result = rows(await query.query(VERIFY_SQL, [reviewEventId]));
  if (result.length !== 1) throw new Error('SOURCE_EVIDENCE_NOT_UNAMBIGUOUS');
  const row = result[0];
  const candidate = lexicalCandidateSchema.parse(row.candidate_json);
  assertCandidateContentHash(candidate);
  const snapshotId = text(row.snapshot_id), manifestChecksum = text(row.manifest_checksum);
  const sourceVersionId = text(row.source_version_id), eventId = text(row.event_id);
  if (row.manifest_valid !== true || row.source_in_manifest !== true || row.candidate_in_manifest !== true ||
      eventId !== reviewEventId || text(row.event_snapshot_id) !== snapshotId ||
      text(row.candidate_id) !== candidate.candidateId || text(row.content_hash) !== candidate.contentHash ||
      text(row.provider) !== 'BSB_SRU_MARCXML' || !sourceVersionId.startsWith(`BSB_SRU_MARCXML:${text(row.source_record_id)}:`) ||
      !candidate.sourceRecordIds.includes(text(row.source_record_id))) throw new Error('SOURCE_EVIDENCE_INTEGRITY_FAILURE');
  const computedBasis = computeBsbReviewBasis(snapshotId, manifestChecksum, sourceVersionId, candidate);
  if (text(row.review_basis_sha256) !== computedBasis) throw new Error('REVIEW_BASIS_HASH_MISMATCH');
  if (request.expectedReviewBasisSha256 !== computedBasis || request.expectedSourceSnapshotId !== snapshotId)
    throw new Error('STALE_REVIEW_BASIS');
  if (text(row.latest_event_id) !== eventId || text(row.latest_decision_kind) !== 'ACCEPT' || text(row.decision_kind) !== 'ACCEPT')
    throw new Error('REVIEW_NOT_CURRENT_ACCEPT');
  const decision = row.decision_json as Row | null;
  if (!decision || text(decision.eventId) !== eventId || text(decision.candidateId) !== candidate.candidateId ||
      text(decision.basisSha256) !== computedBasis || text(decision.kind) !== 'ACCEPT' ||
      text(decision.reviewerRef) !== text(row.reviewer_ref)) throw new Error('REVIEW_EVENT_INTEGRITY_FAILURE');
  const profile = decision.profile === 'ijmes_title' ? 'ijmes_citation_title' : decision.profile;
  if (profile !== 'ijmes_full' && profile !== 'ijmes_citation_title') throw new Error('INCOMPLETE_HUMAN_ATTESTATION');
  return {
    [VERIFIED_SOURCE]: true,
    eventId, candidateId: candidate.candidateId, activeSnapshotId: snapshotId, sourceVersionId,
    reviewBasisSha256: computedBasis, decisionKind: 'ACCEPT', canonical: text(decision.canonical) || null,
    profile, reviewerRef: text(decision.reviewerRef) || null,
    reviewedAt: text(decision.reviewedAt) || null, rationale: text(decision.rationale) || null,
    humanAttestation: text(decision.humanAttestation) || null, persianSurface: candidate.originalPersianForm,
    candidateContentHash: candidate.contentHash, latestForCandidate: true,
    sourceRecordIds: [...candidate.sourceRecordIds], category: candidate.category,
    verification: { kind: 'INDEPENDENT_NEON_READ', verifiedAt, sourceFingerprint,
      databaseTargetSha256, activeManifestChecksum: manifestChecksum, latestEventId: eventId }
  };
}

export class NeonReviewSourceVerifier {
  private readonly sql: ReturnType<typeof neon>;
  private readonly host: string;
  constructor(connectionString: string, private readonly environment: SourceVerificationEnvironment) {
    if (!connectionString) throw new Error('PHASE8R_SOURCE_DATABASE_URL is required');
    this.host = new URL(connectionString).hostname.toLowerCase();
    this.sql = neon(connectionString);
  }
  async verify(request: AuthorityPublicationRequest): Promise<VerifiedReviewSource> {
    if (this.host !== this.environment.expectedHost.toLowerCase()) throw new Error('SOURCE_DATABASE_HOST_MISMATCH');
    const identityRows = rows(await this.sql.query('SELECT current_database() AS database,current_user AS user,current_schema() AS schema'));
    const identity = identityRows[0];
    if (!identity) throw new Error('SOURCE_DATABASE_IDENTITY_UNAVAILABLE');
    const fingerprint = databaseIdentityFingerprint({host:this.host,database:text(identity.database),
      user:text(identity.user),schema:text(identity.schema)});
    if (fingerprint !== this.environment.expectedDatabaseFingerprint) throw new Error('SOURCE_DATABASE_IDENTITY_MISMATCH');
    const binding = rows(await this.sql.query('SELECT namespace,database_fingerprint,writes_enabled FROM evidence_environment_binding WHERE singleton=true'))[0];
    if (!binding || text(binding.namespace) !== this.environment.expectedNamespace ||
        text(binding.database_fingerprint) !== fingerprint || binding.writes_enabled !== false)
      throw new Error('SOURCE_DATABASE_BINDING_MISMATCH');
    const integrity=rows(await this.sql.query(`SELECT
      to_regclass('evidence_candidate_projection') AS projection,
      to_regclass('evidence_record_version') AS record_version,
      to_regclass('phase8o_review_event') AS review_event,
      EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='phase8o_event_immutable' AND tgenabled<>'D') AS immutable_review`))[0];
    if(!integrity?.projection||!integrity.record_version||!integrity.review_event||integrity.immutable_review!==true)
      throw new Error('SOURCE_LEDGER_INTEGRITY_CONTROLS_MISSING');
    const targetSha=createHash('sha256').update([this.host,text(identity.database),text(identity.schema)].join('\n')).digest('hex');
    return verifyReviewSourceWithQuery(this.sql, request.reviewEventId, request, fingerprint, targetSha);
  }
}
