import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { transliterate } from '../engine';
import { PUBLISHED_AUTHORITY_SNAPSHOT } from '../../data/publishedAuthority';
import { assertAuthorityManifest, authorityManifestSha256 } from '../../server/authority/manifest';
import { parseMarcCollection } from '../../validation/acquisition/bsb/marcxml';
import { adaptBsbRecord } from '../../validation/acquisition/bsb/adapter';
import { sha256 } from '../../validation/acquisition/cinii/identity';
import { computeBsbReviewBasis } from '../../server/evidence-store/bsbScholarlyReview';
import {
  prepareAuthorityPublication,
  authorizePublication,
  withdrawAuthority,
  rollbackAuthority,
  type AuthorityPublicationRequest,
  type PublicationAuthorization,
  type VerifiedPublicationAuthorization,
} from '../../server/authority/authorityPublication';
import {
  verifyDerivedReviewSourceWithQuery,
  type TrustedSourceQuery,
  type VerifiedDerivedReviewSource,
} from '../../server/authority/sourceVerification';
import {
  MemoryAuthorityRepository,
  publishAuthorizedAuthority,
  withdrawPublishedAuthority,
  rollbackPublishedAuthority,
} from '../../server/authority/authorityRepository';
import { computeDerivedCandidateId } from './derivation';
import type { PublishedAuthoritySnapshot } from './types';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');

// Load authentic BSB record and construct Nasiri candidate conforming to schema
const xmlPath = path.resolve(__dirname, '../../../validation/acquisition/bsb/authentic-selected-records.v1.xml');
const authenticXml = fs.readFileSync(xmlPath, 'utf8');
const baseCandidate = parseMarcCollection(authenticXml).flatMap(adaptBsbRecord)[0];

const parentCandidate = {
  ...baseCandidate,
  candidateId: 'lex-000a84a77bd88ba3fefb',
  originalPersianForm: 'نصیری، محمدرضا',
  normalizedSearchForm: 'نصیری محمدرضا',
  category: 'PERSON_NAME' as const,
  observedLatinVariants: [
    {
      ...baseCandidate.observedLatinVariants[0],
      value: 'Naṣīrī, Muḥammad Riḍā',
    },
  ],
};
parentCandidate.contentHash = sha256({ ...parentCandidate, contentHash: undefined });

const parentEventId = '0c550779-1ed2-4613-96f4-e14c66ee4475';
const activeSnapshotId = 'snapshot-' + 'a'.repeat(24);
const activeManifestChecksum = 'b'.repeat(64);
const parentSourceVersionId = `BSB_SRU_MARCXML:${parentCandidate.sourceRecordIds[0]}:${'c'.repeat(64)}`;
const parentReviewBasisSha256 = computeBsbReviewBasis(
  activeSnapshotId,
  activeManifestChecksum,
  parentSourceVersionId,
  parentCandidate
);

const derivedSurface = 'محمدرضا نصیری';
const derivedCanonical = 'Muḥammad Riḍā Naṣīrī';
const derivedCandidateId = computeDerivedCandidateId(parentCandidate.candidateId, derivedSurface, 'RUNNING_TEXT_SURFACE');
const derivedEventId = '77777777-7777-4777-8777-777777777777';
const reviewedAt = '2026-10-11T12:00:00.000Z';
const now = '2026-10-11T12:30:00.000Z';

function makeMockDerivedRow(overrides: Record<string, unknown> = {}) {
  return {
    snapshot_id: activeSnapshotId,
    manifest_checksum: activeManifestChecksum,
    source_version_id: parentSourceVersionId,
    manifest_valid: true,
    source_in_manifest: true,
    candidate_in_manifest: true,
    candidate_json: parentCandidate,
    content_hash: parentCandidate.contentHash,
    provider: 'BSB_SRU_MARCXML',
    source_record_id: parentCandidate.sourceRecordIds[0],
    record_checksum: sha('record-checksum'),
    parent_candidate_id: parentCandidate.candidateId,
    parent_source_version_id: parentSourceVersionId,
    parent_review_event_id: parentEventId,
    parent_event_id: parentEventId,
    parent_basis: parentReviewBasisSha256,
    candidate_basis: parentReviewBasisSha256,
    parent_decision_kind: 'ACCEPT',
    parent_reviewer_ref: 'reviewer:primary',
    parent_decided_at: '2026-10-10T10:00:00.000Z',
    latest_parent_event_id: parentEventId,
    latest_parent_decision_kind: 'ACCEPT',
    derived_candidate_id: derivedCandidateId,
    original_persian_surface: parentCandidate.originalPersianForm,
    running_text_persian_surface: derivedSurface,
    derivation_type: 'RUNNING_TEXT_SURFACE',
    derivation_explanation: 'Standard Persian direct personal-name reading without catalogue inversion.',
    derived_event_id: derivedEventId,
    derived_decision_kind: 'ACCEPT',
    derived_canonical: derivedCanonical,
    derived_profile: 'ijmes_full',
    derived_context: 'PERSON_NAME',
    derived_reviewer_ref: 'reviewer:primary',
    derived_rationale: 'Verified running-text name order against Persian literary conventions and IJMES transliteration.',
    derived_attestation: 'I_PERSONALLY_VERIFIED_THIS_RUNNING_TEXT_IJMES_FORM',
    derived_decided_at: reviewedAt,
    latest_derived_event_id: derivedEventId,
    latest_derived_decision_kind: 'ACCEPT',
    ...overrides,
  };
}

const mockQuery = (rows: unknown[]): TrustedSourceQuery => ({
  query: async () => rows,
});

const defaultRequest: AuthorityPublicationRequest = {
  reviewEventId: derivedEventId,
  derivedReviewEventId: derivedEventId,
  expectedReviewBasisSha256: parentReviewBasisSha256,
  expectedSourceSnapshotId: activeSnapshotId,
  context: 'PERSON_NAME',
  publicationReason: 'First controlled personal-name authority publication',
  personalNameOrderingAttestation: 'RUNNING_TEXT_ORDER_VERIFIED',
};

const adminAuth: VerifiedPublicationAuthorization = {
  administratorRef: 'admin:scholarly-authority',
  authorizedAt: now,
  scope: 'PHASE8R_AUTHORITY_PUBLICATION',
  authorizationVersion: '1',
  verification: {
    kind: 'INDEPENDENT_ADMIN_FILE_HASH',
    sha256: 'a'.repeat(64),
  },
};

describe('Phase 8S: Derived Scholarly Authority & Controlled Publication', () => {
  // 1. Original BSB source remains unchanged
  it('1. preserves original BSB source record, candidate projection, and review event without mutation', async () => {
    const verified = await verifyDerivedReviewSourceWithQuery(
      mockQuery([makeMockDerivedRow()]),
      derivedEventId,
      defaultRequest,
      'b'.repeat(64)
    );
    expect(verified.originalPersianSurface).toBe('نصیری، محمدرضا');
    expect(verified.parentCandidateId).toBe(parentCandidate.candidateId);
    expect(verified.parentReviewEventId).toBe(parentEventId);
    expect(parentCandidate.originalPersianForm).toBe('نصیری، محمدرضا');
  });

  // 2. Derived Persian surface differs legitimately from catalogue surface
  it('2. distinguishes derived running-text Persian surface from catalogue inverted surface', async () => {
    const verified = await verifyDerivedReviewSourceWithQuery(
      mockQuery([makeMockDerivedRow()]),
      derivedEventId,
      defaultRequest,
      'b'.repeat(64)
    );
    expect(verified.runningTextPersianSurface).toBe('محمدرضا نصیری');
    expect(verified.originalPersianSurface).toBe('نصیری، محمدرضا');
    expect(verified.runningTextPersianSurface).not.toBe(verified.originalPersianSurface);
  });

  // 3. No automatic surname/given-name reordering
  it('3. rejects unreviewed automatic word reordering or commas in running-text Persian surface', async () => {
    const invertedDerived = makeMockDerivedRow({ running_text_persian_surface: 'نصیری، محمدرضا' });
    await expect(
      verifyDerivedReviewSourceWithQuery(mockQuery([invertedDerived]), derivedEventId, defaultRequest, 'b'.repeat(64))
    ).rejects.toThrow('CATALOGUE_INVERTED_NAME_NOT_PUBLISHABLE_AS_RUNNING_TEXT');
  });

  // 4. Derived DRAFT does not publish
  it('4. rejects publication preparation for a derived record in DRAFT status', async () => {
    const draftRow = makeMockDerivedRow({
      derived_decision_kind: 'DRAFT',
      latest_derived_decision_kind: 'DRAFT',
    });
    await expect(
      verifyDerivedReviewSourceWithQuery(mockQuery([draftRow]), derivedEventId, defaultRequest, 'b'.repeat(64))
    ).rejects.toThrow('REVIEW_NOT_CURRENT_ACCEPT');
  });

  // 5. Derived ACCEPT does not automatically publish
  it('5. leaves accepted derived authority unpublished until explicit administrator authorization', async () => {
    const verified = await verifyDerivedReviewSourceWithQuery(
      mockQuery([makeMockDerivedRow()]),
      derivedEventId,
      defaultRequest,
      'b'.repeat(64)
    );
    expect(PUBLISHED_AUTHORITY_SNAPSHOT.entries).toEqual([]);
    const preview = prepareAuthorityPublication(verified, defaultRequest, activeSnapshotId, PUBLISHED_AUTHORITY_SNAPSHOT.entries);
    expect(preview.entry.persianSurface).toBe('محمدرضا نصیری');
    expect(PUBLISHED_AUTHORITY_SNAPSHOT.entries).toEqual([]);
  });

  // 6. REJECT and DEFER cannot publish
  it('6. prevents REJECT and DEFER derived decisions from publication', async () => {
    const rejectRow = makeMockDerivedRow({ derived_decision_kind: 'REJECT', latest_derived_decision_kind: 'REJECT' });
    const deferRow = makeMockDerivedRow({ derived_decision_kind: 'DEFER', latest_derived_decision_kind: 'DEFER' });
    await expect(
      verifyDerivedReviewSourceWithQuery(mockQuery([rejectRow]), derivedEventId, defaultRequest, 'b'.repeat(64))
    ).rejects.toThrow('REVIEW_NOT_CURRENT_ACCEPT');
    await expect(
      verifyDerivedReviewSourceWithQuery(mockQuery([deferRow]), derivedEventId, defaultRequest, 'b'.repeat(64))
    ).rejects.toThrow('REVIEW_NOT_CURRENT_ACCEPT');
  });

  // 7. A later decision invalidates an earlier ACCEPT
  it('7. invalidates an earlier ACCEPT if a later decision was recorded for the derived candidate', async () => {
    const supersededRow = makeMockDerivedRow({
      derived_decision_kind: 'ACCEPT',
      latest_derived_event_id: '88888888-8888-4888-8888-888888888888',
      latest_derived_decision_kind: 'DEFER',
    });
    await expect(
      verifyDerivedReviewSourceWithQuery(mockQuery([supersededRow]), derivedEventId, defaultRequest, 'b'.repeat(64))
    ).rejects.toThrow('REVIEW_NOT_CURRENT_ACCEPT');
  });

  // 8. Publication cannot trust caller-supplied review data
  it('8. rejects caller-supplied JSON that lacks independent Neon verification symbol', () => {
    const unverifiedFake: VerifiedDerivedReviewSource = {
      isDerived: true,
      eventId: derivedEventId,
      candidateId: derivedCandidateId,
      activeSnapshotId,
      sourceVersionId: parentSourceVersionId,
      reviewBasisSha256: parentReviewBasisSha256,
      decisionKind: 'ACCEPT',
      canonical: derivedCanonical,
      profile: 'ijmes_full',
      reviewerRef: 'caller-supplied',
      reviewedAt,
      rationale: 'Unverified caller rationale',
      humanAttestation: 'I_PERSONALLY_VERIFIED_THIS_RUNNING_TEXT_IJMES_FORM',
      persianSurface: derivedSurface,
      candidateContentHash: parentCandidate.contentHash,
      latestForCandidate: true,
      sourceRecordIds: parentCandidate.sourceRecordIds,
      category: 'PERSON_NAME',
      derivedCandidateId,
      parentCandidateId: parentCandidate.candidateId,
      parentSourceVersionId,
      parentReviewEventId: parentEventId,
      parentReviewBasisSha256,
      runningTextPersianSurface: derivedSurface,
      originalPersianSurface: parentCandidate.originalPersianForm,
      derivationType: 'RUNNING_TEXT_SURFACE',
      derivationExplanation: 'None',
      verification: {
        kind: 'INDEPENDENT_NEON_READ',
        verifiedAt: now,
        sourceFingerprint: 'b'.repeat(64),
        databaseTargetSha256: 'b'.repeat(64),
        activeManifestChecksum,
        latestEventId: derivedEventId,
      },
    } as unknown as VerifiedDerivedReviewSource;

    expect(() =>
      prepareAuthorityPublication(unverifiedFake, defaultRequest, activeSnapshotId, [])
    ).toThrow('INDEPENDENT_SOURCE_VERIFICATION_REQUIRED');
  });

  // 9. Stale parent evidence is rejected
  it('9. rejects derived publication if parent evidence snapshot is stale', async () => {
    const staleSnapshotId = 'snapshot-' + '9'.repeat(24);
    const staleBasis = computeBsbReviewBasis(staleSnapshotId, activeManifestChecksum, parentSourceVersionId, parentCandidate);
    const staleSnapshotRow = makeMockDerivedRow({
      snapshot_id: staleSnapshotId,
      parent_basis: staleBasis,
      candidate_basis: staleBasis,
    });
    await expect(
      verifyDerivedReviewSourceWithQuery(mockQuery([staleSnapshotRow]), derivedEventId, defaultRequest, 'b'.repeat(64))
    ).rejects.toThrow('STALE_REVIEW_BASIS');
  });

  // 10. Wrong source version, candidate, or review-basis hash is rejected
  it('10. rejects mismatched review basis hash or candidate content hash', async () => {
    const wrongBasisRow = makeMockDerivedRow({ parent_basis: '0'.repeat(64) });
    await expect(
      verifyDerivedReviewSourceWithQuery(mockQuery([wrongBasisRow]), derivedEventId, defaultRequest, 'b'.repeat(64))
    ).rejects.toThrow('REVIEW_BASIS_HASH_MISMATCH');

    const wrongCandidateHash = makeMockDerivedRow({ content_hash: '0'.repeat(64) });
    await expect(
      verifyDerivedReviewSourceWithQuery(mockQuery([wrongCandidateHash]), derivedEventId, defaultRequest, 'b'.repeat(64))
    ).rejects.toThrow('SOURCE_EVIDENCE_INTEGRITY_FAILURE');
  });

  // 11. Conflicting canonical is rejected
  it('11. rejects publication if conflicting active authority already exists for the same phrase and profile', async () => {
    const verified = await verifyDerivedReviewSourceWithQuery(
      mockQuery([makeMockDerivedRow()]),
      derivedEventId,
      defaultRequest,
      'b'.repeat(64)
    );
    const existingConflictingEntry = {
      entryId: 'authority-conflict-01',
      normalizedPersian: 'محمدرضا نصیری',
      persianSurface: 'محمدرضا نصیری',
      canonical: 'Differing Transliteration',
      profile: 'ijmes_full' as const,
      context: 'PERSON_NAME' as const,
      status: 'ACTIVE' as const,
      version: 1,
      provenance: {
        reviewEventId: 'old-event-01',
        candidateId: 'old-cand-01',
        sourceSnapshotId: activeSnapshotId,
        sourceVersionId: parentSourceVersionId,
        reviewBasisSha256: parentReviewBasisSha256,
        reviewerRef: 'old-reviewer',
        reviewedAt,
        publicationEventId: 'old-pub-01',
        publishedAt: reviewedAt,
      },
    };
    expect(() =>
      prepareAuthorityPublication(verified, defaultRequest, activeSnapshotId, [existingConflictingEntry])
    ).toThrow(/CONFLICTING_PUBLISHED_AUTHORITY/);
  });

  // 12. Explicit administrator authorization is mandatory
  it('12. enforces independent administrator authorization file hash and ref', async () => {
    const verified = await verifyDerivedReviewSourceWithQuery(
      mockQuery([makeMockDerivedRow()]),
      derivedEventId,
      defaultRequest,
      'b'.repeat(64)
    );
    const preview = prepareAuthorityPublication(verified, defaultRequest, activeSnapshotId, []);
    const unverifiedAuth: PublicationAuthorization = {
      administratorRef: '',
      authorizedAt: now,
      scope: 'PHASE8R_AUTHORITY_PUBLICATION',
      authorizationVersion: '1',
    };
    expect(() => authorizePublication(preview, unverifiedAuth, now, PUBLISHED_AUTHORITY_SNAPSHOT)).toThrow(
      'PUBLICATION_AUTHORIZATION_REQUIRED'
    );
  });

  // 13. Concurrent identical publication is idempotent
  it('13. performs idempotent publication when executed concurrently', async () => {
    const verified = await verifyDerivedReviewSourceWithQuery(
      mockQuery([makeMockDerivedRow()]),
      derivedEventId,
      defaultRequest,
      'b'.repeat(64)
    );
    const repo = new MemoryAuthorityRepository(PUBLISHED_AUTHORITY_SNAPSHOT);
    const preview = prepareAuthorityPublication(verified, defaultRequest, activeSnapshotId, []);

    const [pub1, pub2] = await Promise.all([
      publishAuthorizedAuthority(repo, preview, adminAuth, now),
      publishAuthorizedAuthority(repo, preview, adminAuth, now),
    ]);

    expect(pub1.snapshotId).toBe(pub2.snapshotId);
    expect(pub1.entries.length).toBe(1);
    expect(pub1.entries[0].persianSurface).toBe('محمدرضا نصیری');
    expect(pub1.entries[0].canonical).toBe(derivedCanonical);
  });

  // 14. Failed transaction rolls back completely
  it('14. rolls back state changes completely on transactional failure', async () => {
    const repo = new MemoryAuthorityRepository(PUBLISHED_AUTHORITY_SNAPSHOT);
    const initial = await repo.read();

    await expect(
      repo.transaction(async (state) => {
        state.activeSnapshotId = 'corrupted-snapshot-id';
        throw new Error('SIMULATED_TRANSACTION_FAILURE');
      })
    ).rejects.toThrow('SIMULATED_TRANSACTION_FAILURE');

    const after = await repo.read();
    expect(after.activeSnapshotId).toBe(initial.activeSnapshotId);
    expect(after.events).toEqual(initial.events);
  });

  // 15. Withdrawal and historical rollback preserve audit history
  it('15. appends audit events for withdrawal and rollback while maintaining manifest validity', async () => {
    const verified = await verifyDerivedReviewSourceWithQuery(
      mockQuery([makeMockDerivedRow()]),
      derivedEventId,
      defaultRequest,
      'b'.repeat(64)
    );
    const repo = new MemoryAuthorityRepository(PUBLISHED_AUTHORITY_SNAPSHOT);
    const preview = prepareAuthorityPublication(verified, defaultRequest, activeSnapshotId, []);
    const published = await publishAuthorizedAuthority(repo, preview, adminAuth, now);
    const entryId = published.entries[0].entryId;

    // Withdrawal
    const withdrawn = await withdrawPublishedAuthority(repo, entryId, adminAuth, '2026-10-11T13:00:00.000Z', 'Test scholarly withdrawal');
    expect(withdrawn.entries).toHaveLength(0);
    assertAuthorityManifest(withdrawn);

    // Rollback
    const restored = await rollbackPublishedAuthority(repo, published.snapshotId, adminAuth, '2026-10-11T13:30:00.000Z', 'Test rollback restoration');
    expect(restored.entries).toHaveLength(1);
    expect(restored.entries[0].entryId).toBe(entryId);
    assertAuthorityManifest(restored);

    const state = await repo.read();
    expect(state.events.map((e) => e.kind)).toEqual(['PUBLISH', 'WITHDRAW', 'ROLLBACK']);
  });

  // 16. Restarting the repository reloads the correct state
  it('16. persists and reloads published derived authority across repository instantiation', async () => {
    const verified = await verifyDerivedReviewSourceWithQuery(
      mockQuery([makeMockDerivedRow()]),
      derivedEventId,
      defaultRequest,
      'b'.repeat(64)
    );
    const repo1 = new MemoryAuthorityRepository(PUBLISHED_AUTHORITY_SNAPSHOT);
    const preview = prepareAuthorityPublication(verified, defaultRequest, activeSnapshotId, []);
    const publishedSnapshot = await publishAuthorizedAuthority(repo1, preview, adminAuth, now);

    // Restart repository using published snapshot as persisted initial state
    const repo2 = new MemoryAuthorityRepository(publishedSnapshot);
    const loadedState = await repo2.read();
    expect(loadedState.activeSnapshotId).toBe(publishedSnapshot.snapshotId);
    expect(loadedState.snapshots.get(publishedSnapshot.snapshotId)?.entries[0].canonical).toBe(derivedCanonical);
  });

  // 17. Runtime resolves an exact published derived surface
  it('17. resolves exact published derived running-text Persian surface with complete authority provenance', async () => {
    const verified = await verifyDerivedReviewSourceWithQuery(
      mockQuery([makeMockDerivedRow()]),
      derivedEventId,
      defaultRequest,
      'b'.repeat(64)
    );
    const repo = new MemoryAuthorityRepository(PUBLISHED_AUTHORITY_SNAPSHOT);
    const preview = prepareAuthorityPublication(verified, defaultRequest, activeSnapshotId, []);
    const publishedSnapshot = await publishAuthorizedAuthority(repo, preview, adminAuth, now);

    const result = transliterate('محمدرضا نصیری', 'ijmes_full', [], undefined, undefined, {
      publishedAuthoritySnapshot: publishedSnapshot,
    });

    expect(result.status).toBe('LEXICON_RESOLVED');
    expect(result.output).toBe(derivedCanonical);
    expect(result.authority?.kind).toBe('PUBLISHED_SCHOLARLY_AUTHORITY');
    expect(result.authority?.reviewEventId).toBe(derivedEventId);
    expect(result.authority?.snapshotId).toBe(publishedSnapshot.snapshotId);
  });

  // 18. Unpublished derived records are invisible to runtime
  it('18. does not resolve running-text phrase when derived record is only accepted in review but not published', () => {
    // Default snapshot has no published entries
    const result = transliterate('محمدرضا نصیری', 'ijmes_full', [], undefined, undefined, {
      publishedAuthoritySnapshot: PUBLISHED_AUTHORITY_SNAPSHOT,
    });
    // Misses authority layer and falls back to compositional transliteration pipeline
    expect(result.authority).toBeUndefined();
    expect(result.output).not.toBe(derivedCanonical);
  });

  // 19. No AI network request is required for published authority resolution
  it('19. resolves published authority deterministically without network or AI inference requests', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('ILLEGAL_NETWORK_OR_AI_CALL');
    });

    try {
      const base = {
        schemaVersion: 'phase8r-authority-snapshot-v1' as const,
        snapshotId: 'authority-snapshot-offline-test',
        version: 2,
        generatedAt: now,
        entries: [
          {
            entryId: 'authority-nasiri-test',
            normalizedPersian: 'محمدرضا نصیری',
            persianSurface: 'محمدرضا نصیری',
            canonical: derivedCanonical,
            profile: 'ijmes_full' as const,
            context: 'PERSON_NAME' as const,
            status: 'ACTIVE' as const,
            version: 1,
            provenance: {
              reviewEventId: derivedEventId,
              candidateId: derivedCandidateId,
              sourceSnapshotId: activeSnapshotId,
              sourceVersionId: parentSourceVersionId,
              reviewBasisSha256: parentReviewBasisSha256,
              reviewerRef: 'reviewer:primary',
              reviewedAt,
              publicationEventId: 'pub-test-01',
              publishedAt: now,
              derivedCandidateId,
              derivedReviewEventId: derivedEventId,
              parentCandidateId: parentCandidate.candidateId,
            },
          },
        ],
      };
      const snapshot: PublishedAuthoritySnapshot = {
        ...base,
        manifestSha256: authorityManifestSha256(base),
      };

      const result = transliterate('محمدرضا نصیری', 'ijmes_full', [], undefined, undefined, {
        publishedAuthoritySnapshot: snapshot,
      });

      expect(result.output).toBe(derivedCanonical);
      expect(result.authority?.kind).toBe('PUBLISHED_SCHOLARLY_AUTHORITY');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  // 20. Existing transliteration functionality remains unchanged
  it('20. leaves standard compositional and morphological transliteration unchanged', () => {
    const standardWord = transliterate('ایران', 'ijmes_full');
    expect(standardWord.output).toBe('īrān');
    expect(standardWord.status).toBe('LEXICON_RESOLVED');

    const standardPhrase = transliterate('ولایت فقیه', 'ijmes_full');
    expect(standardPhrase.output).toBe('vilāyat-i faqīh');
  });

  // Specific Nasiri test scenario verification
  it('end-to-end Nasiri scenario: transforms BSB catalogue record into separately reviewed running-text authority', async () => {
    // 1. Verify Layer A catalogue evidence
    expect(parentCandidate.originalPersianForm).toBe('نصیری، محمدرضا');
    expect(parentCandidate.observedLatinVariants[0].value).toBe('Naṣīrī, Muḥammad Riḍā');

    // 2. Layer B: Verify independent derived review with running-text surface and scientific canonical
    const verified = await verifyDerivedReviewSourceWithQuery(
      mockQuery([makeMockDerivedRow()]),
      derivedEventId,
      defaultRequest,
      'c'.repeat(64)
    );
    expect(verified.isDerived).toBe(true);
    expect(verified.runningTextPersianSurface).toBe('محمدرضا نصیری');
    expect(verified.canonical).toBe('Muḥammad Riḍā Naṣīrī');
    expect(verified.derivationType).toBe('RUNNING_TEXT_SURFACE');
    expect(verified.humanAttestation).toBe('I_PERSONALLY_VERIFIED_THIS_RUNNING_TEXT_IJMES_FORM');

    // 3. Layer C: Preview publication without writes
    const preview = prepareAuthorityPublication(verified, defaultRequest, activeSnapshotId, []);
    expect(preview.originalPersianSource).toBe('نصیری، محمدرضا');
    expect(preview.reviewedDerivedPersianSurface).toBe('محمدرضا نصیری');
    expect(preview.reviewedCanonicalTransliteration).toBe('Muḥammad Riḍā Naṣīrī');
    expect(preview.exactRuntimeInputPhrase).toBe('محمدرضا نصیری');
    expect(preview.expectedDeterministicOutput).toBe('Muḥammad Riḍā Naṣīrī');
    expect(preview.validation.prerequisitesSatisfied).toBe(true);
    expect(preview.parentSourceProvenance?.candidateId).toBe('lex-000a84a77bd88ba3fefb');
    expect(preview.derivedReviewProvenance?.derivedCandidateId).toBe(derivedCandidateId);

    // 4. Authorized publication into authority repository
    const repo = new MemoryAuthorityRepository(PUBLISHED_AUTHORITY_SNAPSHOT);
    const published = await publishAuthorizedAuthority(repo, preview, adminAuth, now);
    expect(published.entries).toHaveLength(1);
    expect(published.entries[0].persianSurface).toBe('محمدرضا نصیری');
    expect(published.entries[0].canonical).toBe('Muḥammad Riḍā Naṣīrī');
    expect(published.entries[0].provenance.parentCandidateId).toBe('lex-000a84a77bd88ba3fefb');

    // 5. Runtime lookup matches running-text surface
    const runtimeResult = transliterate('محمدرضا نصیری', 'ijmes_full', [], undefined, undefined, {
      publishedAuthoritySnapshot: published,
    });
    expect(runtimeResult.output).toBe('Muḥammad Riḍā Naṣīrī');
    expect(runtimeResult.status).toBe('LEXICON_RESOLVED');
    expect(runtimeResult.authority?.kind).toBe('PUBLISHED_SCHOLARLY_AUTHORITY');

    // 6. User decision precedence over published authority
    const userOverride = transliterate('محمدرضا نصیری', 'ijmes_full', [
      {
        issueId: 'issue-token-override',
        action: 'MANUAL_CANONICAL_OVERRIDE',
        manualCanonicalTransliteration: 'Custom User Transliteration',
      },
    ], undefined, undefined, {
      publishedAuthoritySnapshot: published,
    });
    // When manual user review decision is provided, findPublishedAuthority yields to user decision
    expect(userOverride.authority).toBeUndefined();
  });
});
