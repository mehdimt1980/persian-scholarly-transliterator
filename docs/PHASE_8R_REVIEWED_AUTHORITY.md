# Phase 8R — Reviewed Authority Promotion and Runtime Integration

## Repository assessment

The repository already had four separate mechanisms that Phase 8R must preserve:

1. Phase 8G stores immutable BSB source versions, non-authoritative candidate projections, and versioned evidence snapshots in Neon.
2. Phase 8O records append-only `DRAFT`, `ACCEPT`, `REJECT`, and `DEFER` review events against an exact source snapshot and review-basis hash.
3. Phase 5E contains a hermetic, explicit human-decision-to-lexicon promotion model. It establishes the important rule that acceptance and publication are separate events.
4. The runtime engine is client-side and deterministic. Its existing frozen reviewed authority is a build-time, exact-phrase snapshot; the browser has no Neon credentials.

The Phase 8O shared-passphrase review session is not an independently verified identity and is not a publication credential. The main runtime cannot safely query its private Staging ledger. Phase 8R therefore reuses the existing exact-phrase runtime pattern and adds a distinct publication ledger and sanitized, versioned runtime snapshot.

## Three-layer authority model

- **Catalogue evidence:** immutable BSB MARC data and candidate projections remain `NON_AUTHORITATIVE_CANDIDATE`.
- **Human review:** append-only review events record reviewer-declared decisions. `ACCEPT` means `ACCEPTED — NOT PUBLISHED` until a separate publication succeeds.
- **Published authority:** only active entries in a validated Phase 8R authority snapshot may resolve runtime input.

No data flows directly from catalogue romanization or AI output into published authority.

## Controlled publication

`NeonReviewSourceVerifier` is the trust boundary for preview generation. The administrator request contains only intent and pinned expectations; it does not supply a review row, candidate, active snapshot, or a `latestForCandidate` assertion. A separately configured read-only Neon credential independently reads the active evidence snapshot, immutable candidate projection and source version, authentic append-only review event, and latest event for that candidate. It recomputes the candidate content hash and Phase 8N review-basis hash before `prepareAuthorityPublication` is called.

`prepareAuthorityPublication` then verifies:

- the latest decision is `ACCEPT`;
- the source snapshot and review-basis hash are still current;
- candidate content and source-version provenance are present;
- canonical, profile, rationale, reviewer reference, timestamp, and human attestation are complete;
- no active authority has a conflicting canonical for the same normalized phrase, IJMES profile, and context;
- a personal name has an explicit running-text-order attestation.

`NeonAuthorityRepository` is the durable write path. It requires a positively identified isolated database target, a database-resident Phase 8R environment binding with writes enabled, administrator mode, and a separately hashed authorization file. Publication uses a serializable transaction and transaction-scoped authority and evidence-publication advisory locks. Inside that transaction it pins the prior active authority snapshot, rechecks the active evidence snapshot, source version, candidate content hash, ACCEPT event, review-basis hash, and absence of a later review event, checks authority conflicts, and atomically inserts the entry, audit event, snapshot membership, snapshot, and active pointer. The evidence lock prevents the source snapshot from changing between the final check and commit. A failure rolls back the complete transaction. A concurrent identical publisher reads back the winner as an idempotent result; a different competing publication fails closed.

Withdrawal and rollback also run under the same lock and create append-only audit events and new snapshots. Prior snapshots and publication events are retained. The active sanitized snapshot omits withdrawn entries. Rollback reactivates the selected historical membership in a newly versioned snapshot rather than rewriting a historical snapshot.

`npm run authority:admin -- --request <intent.json>` is preview-only unless `--publish` is supplied. It no longer accepts `--review-event` or `--snapshot` JSON as authority. Preview requires `PHASE8R_SOURCE_DATABASE_URL` and `PHASE8R_AUTHORITY_DATABASE_URL`, credential-specific `PHASE8R_SOURCE_DATABASE_FINGERPRINT` and `PHASE8R_AUTHORITY_DATABASE_FINGERPRINT`, and exact host, namespace, and isolation bindings. The two credentials may use different database roles; a role-independent host/database/schema digest proves that they target the same database. Publication additionally requires a separate authorization JSON file whose SHA-256 matches `PHASE8R_PUBLICATION_AUTHORIZATION_SHA256`, whose administrator matches `PHASE8R_PUBLICATION_ADMIN_REF`, and explicit Phase 8R write/admin flags. The exported snapshot is created only after database commit and read-back. There is no public HTTP publication endpoint.

Migration `002_phase8r_reviewed_authority.sql` adds a database-resident environment binding, authority entries, append-only publication events, snapshots, immutable snapshot membership, and an active-snapshot pointer. Unique review-event and active-key constraints reinforce idempotency and conflict safety. The down migration is for positively identified disposable environments only; operational rollback uses a forward `ROLLBACK` event and new snapshot.

This implementation deliberately ships an empty `phase8r-empty-v1` runtime snapshot. It does not publish either existing accepted decision.

## Runtime lookup

The browser imports a sanitized build-time `PublishedAuthoritySnapshot`; it never receives a database URL, review passphrase, private review row, or Staging administration API. Every snapshot is hash-validated before use.

Lookup is deterministic and fail-closed:

1. Normalize Persian with the existing conservative Unicode normalizer.
2. Require an exact normalized phrase and IJMES profile match.
3. Use the requested GENERAL/TITLE context when available. A unique exact `PERSON_NAME` authority may itself establish the reviewed semantic context; this does not use substring matching, a name list, or phrase guessing.
4. If eligible contexts contain different canonicals, return a non-copyable ambiguous result for human clarification rather than selecting by order.
5. Do not apply published authority when user-specific review decisions are present.
6. Return the approved scholarly canonical to the existing Presentation renderer.
7. On a miss, continue through the existing lexicon, morphology, unresolved, and manual-only AI paths.

Personal-name entries retain the separate `PERSON_NAME` context and require publication-time running-text-order attestation. The main page still exposes only the three Presentation choices and no semantic-context selector. Exact published personal-name authority supplies semantic classification only for its exact phrase/profile. Explicit user decisions continue to take precedence.

## Precedence

1. Active user-specific review decision.
2. Exact, active published scholarly authority with matching profile and an unambiguous eligible context.
3. Existing frozen reviewed authority and deterministic lexicon/morphology rules.
4. Non-authoritative evidence proposals.
5. AI suggestions, only after the user explicitly presses **Generate with AI**.

Conflicting published entries invalidate the snapshot. Incomplete context or a mismatched profile produces no authority match and retains the existing `REVIEW_REQUIRED`/unresolved behavior.

## Example lifecycle

For a Persian personal name:

- **Before review:** catalogue romanizations remain evidence only; runtime remains unresolved or uses an independently established deterministic rule.
- **After ACCEPT:** the workbench shows `ACCEPTED — NOT PUBLISHED`; runtime behavior is unchanged.
- **After controlled publication:** an exact `PERSON_NAME` entry with running-text-order attestation can resolve deterministically, and the UI shows `Published Scholarly Authority`, authority version, and publication provenance.

The spelling is data-driven. No name or candidate-specific answer is hardcoded into the engine.

The profile/context separation follows the current [Cambridge IJMES Translation and Transliteration Guide](https://www.cambridge.org/core/journals/international-journal-of-middle-east-studies/information/author-resources/ijmes-translation-and-transliteration-guide): technical terms use full transliteration, while titles and many names follow distinct no-diacritic/editorial conventions. A catalogue form therefore cannot establish the runtime profile or name order by itself.

## Publication is not deployment

A database commit does not change browser behavior. The runtime imports only `src/data/publishedAuthority.ts`, so every authority change requires a reviewed build and deployment:

1. Independently verify the accepted review through the read-only Neon boundary.
2. Generate and inspect the publication preview.
3. Obtain separate administrator authorization.
4. Commit and read back the transactional database publication.
5. Export the sanitized active authority snapshot (no private review rows or credentials).
6. Validate schema and manifest integrity and review the diff.
7. Replace the build-time snapshot through the normal repository/CI/deployment process.
8. Verify exact runtime lookup and displayed publication provenance in Preview.
9. Record the deployed authority snapshot ID/version separately from the database publication event.

There is intentionally no automatic production release. Until step 7 completes, the newly committed database authority is not deployed.

## First-publication prerequisites

Before publishing a real entry, an owner must:

1. Review and apply the additive migration in a positively identified authority database.
2. Configure a publication role separate from the Review passphrase.
3. Provision a dedicated read-only source credential and a separately scoped publication credential for the same positively identified database target; the latter may read evidence/review tables and write only Phase 8R tables.
4. Generate and inspect the preview and conflict report.
5. Authorize publication through an administrator-only, auditable path.
6. Export the active sanitized authority snapshot, verify its manifest hash, commit it for review, and deploy it through normal CI.

Real integration verification is opt-in and must use a disposable isolated Neon branch/schema with explicit target fingerprint and disposable confirmation. Skipped tests are unverified, not passed. Never run the migration/down migration or teardown against the existing Review Staging branch.

The opt-in command is `npm run test:phase8r:integration`. It requires separate `PHASE8R_TEST_ADMIN_DATABASE_URL` and `PHASE8R_TEST_SOURCE_DATABASE_URL` credentials, the exact `PHASE8R_TEST_NEON_BRANCH_ID` confirmed from `current_setting('neon.branch_id')` through both credentials, a namespace beginning `phase8r_test_`, and the exact `PHASE8R_TEST_DISPOSABLE_CONFIRMATION=I_CONFIRM_PHASE8R_DISPOSABLE_ISOLATED_DATABASE`. The suite applies the real SQL migrations, seeds only a disposable fixture, verifies independent reload, concurrent idempotent publication, rollback after a forced SQL failure, withdrawal, historical rollback, and restart/reload. It deliberately performs no automatic teardown; delete the positively identified disposable Neon branch through administrator infrastructure after retaining test logs. Absence of these variables yields four explicit skips.

No Phase 8R migration, publication, withdrawal, rollback, Neon write, Blob write, or candidate update was executed while implementing this phase. The shipped runtime snapshot remains empty.
