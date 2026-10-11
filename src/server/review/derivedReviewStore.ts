/** Staging-only derived scholarly review. Append-only derived decisions bound to accepted parent evidence. */
import 'server-only';
import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';
import { databaseIdentityFingerprint } from '../evidence-store/guard';
import { lexicalCandidateSchema } from '../../validation/lexical-evidence/schema';
import { assertCandidateContentHash } from '../evidence-store/publication';
import { computeBsbReviewBasis } from '../evidence-store/bsbScholarlyReview';
import { reviewerRefForSession } from './reviewAssistance';
import { validateManualTransliteration } from '../../domain/review/validation';
import type { LexicalCandidate } from '../../validation/lexical-evidence/types';
import type { ProfileId } from '../../domain/types';
import type {
  AuthorityContext,
  DerivationType,
  DerivedCandidate,
  DerivedDecisionKind,
  DerivedReviewEvent,
  DerivedReviewRecord,
} from '../../domain/authority/types';

const BRANCH = 'br-noisy-field-b2m5q1zb';
const HOST = 'ep-super-meadow-b28s6g97-pooler.c-6.eu-central-1.aws.neon.tech';
const FINGERPRINT = '721280eed36907f5da9a76e5937c2bda28c70bc9cc01e695d4c6072f80fbeae2';
const MAX_TOTAL = 10000;
const rows = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
const s = (v: unknown) => String(v ?? '');
type Sql = ReturnType<typeof neon>;

import { computeDerivedCandidateId } from '../../domain/authority/derivation';
export { computeDerivedCandidateId };

function getSql(): Sql {
  const conn = process.env.PHASE8O_REVIEW_STAGING_DATABASE_URL;
  if (!conn || new URL(conn).hostname.toLowerCase() !== HOST) {
    throw new Error('Review Staging connection not configured');
  }
  return neon(conn);
}

async function assertStaging(sql: Sql): Promise<{ snapshotId: string; manifestChecksum: string; candidateCount: number }> {
  const identity = rows(
    await sql.query(
      "SELECT current_setting('neon.branch_id',true) AS branch_id,current_database() AS db,current_user AS username,current_schema() AS schema"
    )
  )[0];
  if (
    !identity ||
    identity.branch_id !== BRANCH ||
    databaseIdentityFingerprint({ host: HOST, database: s(identity.db), user: s(identity.username), schema: s(identity.schema) }) !==
      FINGERPRINT
  ) {
    throw new Error('Review Staging identity mismatch');
  }
  const binding = rows(
    await sql.query('SELECT namespace,runtime,isolation,database_fingerprint,writes_enabled FROM evidence_environment_binding WHERE singleton=true')
  )[0];
  if (
    !binding ||
    binding.namespace !== 'phase8g_staging' ||
    binding.runtime !== 'preview' ||
    binding.isolation !== 'ISOLATED_NEON_BRANCH' ||
    binding.database_fingerprint !== FINGERPRINT ||
    binding.writes_enabled !== false
  ) {
    throw new Error('Evidence write window must remain closed');
  }
  const row = rows(
    await sql.query(`
      SELECT s.snapshot_id,s.manifest_checksum,s.status,s.candidate_count,
        s.manifest_checksum=evidence_manifest_checksum(s.schema_version,s.extraction_version,s.source_version_ids,s.manifest_json->'candidates') AS intact
      FROM evidence_active_snapshot a JOIN evidence_snapshot s ON s.snapshot_id=a.snapshot_id WHERE a.singleton=true
    `)
  )[0];
  const count = Number(row?.candidate_count);
  if (
    !row ||
    row.status !== 'ACTIVE' ||
    row.intact !== true ||
    !/^snapshot-[a-f0-9]{24}$/u.test(s(row.snapshot_id)) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > MAX_TOTAL
  ) {
    throw new Error('Review snapshot integrity or capacity check failed');
  }
  return { snapshotId: s(row.snapshot_id), manifestChecksum: s(row.manifest_checksum).trim(), candidateCount: count };
}

export interface SaveDerivedReviewInput {
  parentCandidateId: string;
  parentReviewEventId: string;
  runningTextPersianSurface: string;
  derivationType: DerivationType;
  derivationExplanation: string;
  kind: DerivedDecisionKind;
  canonical?: string | null;
  profile?: 'ijmes_full' | 'ijmes_title' | 'ijmes_citation_title' | null;
  authorityContext?: AuthorityContext;
  rationale?: string | null;
  humanAttestation?: string | null;
}

export async function saveDerivedReviewDecision(
  input: SaveDerivedReviewInput
): Promise<{ candidate: DerivedCandidate; event: DerivedReviewEvent }> {
  if (
    !input ||
    !/^lex-[a-f0-9]{20}$/u.test(input.parentCandidateId) ||
    !/^[0-9a-f-]{36}$/iu.test(input.parentReviewEventId) ||
    !['DRAFT', 'ACCEPT', 'REJECT', 'DEFER'].includes(input.kind)
  ) {
    throw new Error('Invalid derived review identity or disposition');
  }

  const runningTextSurface = input.runningTextPersianSurface?.trim() ?? '';
  if (!runningTextSurface) {
    throw new Error('Running-text Persian surface cannot be empty');
  }
  if (/[,،]/u.test(runningTextSurface)) {
    throw new Error('Running-text Persian surface must not contain catalogue commas');
  }

  const validTypes: DerivationType[] = [
    'RUNNING_TEXT_SURFACE',
    'CATALOGUE_INVERSION_NORMALIZED',
    'TITULAR_RUNNING_TEXT',
    'OTHER_SCHOLARLY_DERIVATION',
  ];
  if (!validTypes.includes(input.derivationType)) {
    throw new Error('Invalid derivation type');
  }

  const explanation = input.derivationExplanation?.trim() ?? '';
  if (!explanation) {
    throw new Error('Derivation explanation is required');
  }

  const sql = getSql();
  const meta = await assertStaging(sql);

  // Revalidate parent evidence in active snapshot
  const parentRows = rows(
    await sql.query(
      `
      SELECT p.source_version_id, p.candidate_json, p.content_hash,
        r.event_id AS parent_event_id, r.decision_kind AS parent_decision_kind,
        r.review_basis_sha256 AS parent_basis_sha256,
        latest.event_id AS latest_event_id, latest.decision_kind AS latest_decision_kind
      FROM evidence_candidate_projection p
      JOIN phase8o_review_event r ON r.event_id = $2::uuid AND r.candidate_id = p.candidate_id
      JOIN (
        SELECT event_id, decision_kind FROM phase8o_review_event
        WHERE candidate_id = $1 ORDER BY decided_at DESC, event_id DESC LIMIT 1
      ) latest ON true
      WHERE p.snapshot_id = $3 AND p.candidate_id = $1 AND p.provider = 'BSB_SRU_MARCXML'
    `,
      [input.parentCandidateId, input.parentReviewEventId, meta.snapshotId]
    )
  );

  if (parentRows.length !== 1) {
    throw new Error('Parent candidate or review event not found in active evidence snapshot');
  }

  const parentRow = parentRows[0];
  if (s(parentRow.latest_event_id) !== input.parentReviewEventId || s(parentRow.latest_decision_kind) !== 'ACCEPT') {
    throw new Error('Parent review event is not the current ACCEPT decision for this candidate');
  }

  const candidate = lexicalCandidateSchema.parse(parentRow.candidate_json) as LexicalCandidate;
  assertCandidateContentHash(candidate);
  if (candidate.candidateId !== input.parentCandidateId || candidate.contentHash !== s(parentRow.content_hash)) {
    throw new Error('Parent candidate content hash mismatch');
  }

  const sourceVersionId = s(parentRow.source_version_id);
  const computedBasis = computeBsbReviewBasis(meta.snapshotId, meta.manifestChecksum, sourceVersionId, candidate);
  if (computedBasis !== s(parentRow.parent_basis_sha256)) {
    throw new Error('Parent review basis hash mismatch');
  }

  const derivedCandidateId = computeDerivedCandidateId(
    input.parentCandidateId,
    runningTextSurface,
    input.derivationType
  );

  const reviewerRef = reviewerRefForSession();
  const now = new Date().toISOString();

  const derivedCandidate: DerivedCandidate = {
    derivedCandidateId,
    parentCandidateId: input.parentCandidateId,
    parentSourceVersionId: sourceVersionId,
    parentReviewEventId: input.parentReviewEventId,
    sourceSnapshotId: meta.snapshotId,
    reviewBasisSha256: computedBasis,
    originalPersianSurface: candidate.originalPersianForm,
    runningTextPersianSurface: runningTextSurface,
    derivationType: input.derivationType,
    derivationExplanation: explanation,
    createdAt: now,
    createdBy: reviewerRef,
  };

  const context: AuthorityContext = input.authorityContext ?? (candidate.category === 'PERSON_NAME' ? 'PERSON_NAME' : 'GENERAL_SCHOLARLY_TEXT');
  const normalizedProfile: ProfileId | null =
    input.profile === 'ijmes_title'
      ? 'ijmes_citation_title'
      : (input.profile as ProfileId) ?? null;

  if (input.kind === 'ACCEPT') {
    if (!input.canonical?.trim()) {
      throw new Error('Scholarly canonical transliteration is required for ACCEPT');
    }
    const val = validateManualTransliteration(input.canonical);
    if (!val.valid || !val.normalized) {
      throw new Error('Invalid IJMES transliteration: ' + (val.error ?? 'validation failed'));
    }
    if (!normalizedProfile || !['ijmes_full', 'ijmes_citation_title'].includes(normalizedProfile)) {
      throw new Error('A valid IJMES profile is required for ACCEPT');
    }
    if (
      input.humanAttestation !== 'I_PERSONALLY_VERIFIED_THIS_RUNNING_TEXT_IJMES_FORM' &&
      input.humanAttestation !== 'I_PERSONALLY_VERIFIED_THIS_IJMES_FORM'
    ) {
      throw new Error('Personal scholarly human attestation is required for ACCEPT');
    }
    if (!input.rationale?.trim()) {
      throw new Error('Scholarly rationale is required for ACCEPT');
    }
  }

  const event: DerivedReviewEvent = {
    eventId: randomUUID(),
    derivedCandidateId,
    decisionKind: input.kind,
    canonical: input.kind === 'REJECT' || input.kind === 'DEFER' ? null : input.canonical?.trim() || null,
    profile: input.kind === 'ACCEPT' ? normalizedProfile : null,
    authorityContext: context,
    reviewerRef,
    rationale: input.rationale?.trim() || null,
    humanAttestation: input.kind === 'ACCEPT' ? input.humanAttestation ?? null : null,
    decidedAt: now,
  };

  // Transactionally ensure candidate exists, then append immutable review event
  await sql.transaction([
    sql`INSERT INTO phase8s_derived_candidate(
      derived_candidate_id, parent_candidate_id, parent_source_version_id, parent_review_event_id,
      source_snapshot_id, review_basis_sha256, original_persian_surface, running_text_persian_surface,
      derivation_type, derivation_explanation, created_at, created_by
    ) VALUES (
      ${derivedCandidate.derivedCandidateId}, ${derivedCandidate.parentCandidateId},
      ${derivedCandidate.parentSourceVersionId}, ${derivedCandidate.parentReviewEventId}::uuid,
      ${derivedCandidate.sourceSnapshotId}, ${derivedCandidate.reviewBasisSha256},
      ${derivedCandidate.originalPersianSurface}, ${derivedCandidate.runningTextPersianSurface},
      ${derivedCandidate.derivationType}, ${derivedCandidate.derivationExplanation},
      ${derivedCandidate.createdAt}, ${derivedCandidate.createdBy}
    ) ON CONFLICT (derived_candidate_id) DO NOTHING`,
    sql`INSERT INTO phase8s_derived_review_event(
      event_id, derived_candidate_id, decision_kind, canonical, profile,
      authority_context, reviewer_ref, rationale, human_attestation, decision_json, decided_at
    ) VALUES (
      ${event.eventId}::uuid, ${event.derivedCandidateId}, ${event.decisionKind},
      ${event.canonical}, ${event.profile}, ${event.authorityContext},
      ${event.reviewerRef}, ${event.rationale}, ${event.humanAttestation},
      ${JSON.stringify(event)}::jsonb, ${event.decidedAt}
    )`,
  ]);

  return { candidate: derivedCandidate, event };
}

export async function loadDerivedReviewsForCandidate(
  parentCandidateId: string
): Promise<DerivedReviewRecord[]> {
  if (!/^lex-[a-f0-9]{20}$/u.test(parentCandidateId)) {
    throw new Error('Invalid candidate ID');
  }
  const sql = getSql();
  await assertStaging(sql);

  const derivedTable = rows(await sql.query("SELECT to_regclass('phase8s_derived_candidate') AS rel"))[0]?.rel;
  if (!derivedTable) return [];

  const candidateRows = rows(
    await sql.query(
      `
      SELECT dc.*,
        latest.event_id AS latest_event_id,
        latest.decision_kind AS latest_decision_kind,
        latest.canonical AS latest_canonical,
        latest.profile AS latest_profile,
        latest.authority_context AS latest_context,
        latest.reviewer_ref AS latest_reviewer_ref,
        latest.rationale AS latest_rationale,
        latest.human_attestation AS latest_attestation,
        latest.decided_at AS latest_decided_at,
        latest.decision_json AS latest_decision_json
      FROM phase8s_derived_candidate dc
      LEFT JOIN LATERAL (
        SELECT * FROM phase8s_derived_review_event de
        WHERE de.derived_candidate_id = dc.derived_candidate_id
        ORDER BY de.decided_at DESC, de.event_id DESC LIMIT 1
      ) latest ON true
      WHERE dc.parent_candidate_id = $1
      ORDER BY dc.created_at ASC
    `,
      [parentCandidateId]
    )
  );

  if (candidateRows.length === 0) return [];

  const authorityTable = rows(await sql.query("SELECT to_regclass('phase8r_authority_entry') AS rel"))[0]?.rel;
  const derivedIds = candidateRows.map((r) => s(r.derived_candidate_id));

  const pubStatusMap = new Map<string, 'NOT_PUBLISHED' | 'PUBLISHED' | 'WITHDRAWN_OR_SUPERSEDED'>();
  if (authorityTable && derivedIds.length > 0) {
    const pubRows = rows(
      await sql.query(
        `SELECT derived_candidate_id, status FROM phase8r_authority_entry
         WHERE derived_candidate_id = ANY($1::text[]) ORDER BY version DESC`,
        [derivedIds]
      )
    );
    for (const pr of pubRows) {
      const cid = s(pr.derived_candidate_id);
      if (!pubStatusMap.has(cid)) {
        pubStatusMap.set(
          cid,
          pr.status === 'ACTIVE' ? 'PUBLISHED' : 'WITHDRAWN_OR_SUPERSEDED'
        );
      }
    }
  }

  return candidateRows.map((row) => {
    const cid = s(row.derived_candidate_id);
    const lastEvent: DerivedReviewEvent | null = row.latest_event_id
      ? {
          eventId: s(row.latest_event_id),
          derivedCandidateId: cid,
          decisionKind: s(row.latest_decision_kind) as DerivedDecisionKind,
          canonical: row.latest_canonical ? s(row.latest_canonical) : null,
          profile: row.latest_profile ? (s(row.latest_profile) as ProfileId) : null,
          authorityContext: (s(row.latest_context) || 'PERSON_NAME') as AuthorityContext,
          reviewerRef: s(row.latest_reviewer_ref),
          rationale: row.latest_rationale ? s(row.latest_rationale) : null,
          humanAttestation: row.latest_attestation ? s(row.latest_attestation) : null,
          decidedAt: s(row.latest_decided_at),
        }
      : null;

    const pubStatus = pubStatusMap.get(cid) ?? 'NOT_PUBLISHED';
    return {
      derivedCandidateId: cid,
      parentCandidateId: s(row.parent_candidate_id),
      parentSourceVersionId: s(row.parent_source_version_id),
      parentReviewEventId: s(row.parent_review_event_id),
      sourceSnapshotId: s(row.source_snapshot_id),
      reviewBasisSha256: s(row.review_basis_sha256),
      originalPersianSurface: s(row.original_persian_surface),
      runningTextPersianSurface: s(row.running_text_persian_surface),
      derivationType: s(row.derivation_type) as DerivationType,
      derivationExplanation: s(row.derivation_explanation),
      createdAt: s(row.created_at),
      createdBy: s(row.created_by),
      lastEvent,
      decisionStatus: lastEvent ? lastEvent.decisionKind : 'PENDING',
      publicationStatus: pubStatus,
    };
  });
}
