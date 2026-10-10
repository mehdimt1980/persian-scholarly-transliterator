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

`prepareAuthorityPublication` is a pure preview step. It verifies:

- the latest decision is `ACCEPT`;
- the source snapshot and review-basis hash are still current;
- candidate content and source-version provenance are present;
- canonical, profile, rationale, reviewer reference, timestamp, and human attestation are complete;
- no active authority has a conflicting canonical for the same normalized phrase, IJMES profile, and context;
- a personal name has an explicit running-text-order attestation.

`authorizePublication` is separate and requires `PHASE8R_AUTHORITY_PUBLICATION` administrator authorization. It emits an append-only publication event and a new deterministic authority snapshot. Repeating an identical request is idempotent. Withdrawal and rollback create new snapshots and audit events; they do not erase prior snapshots or review history.

`npm run authority:admin` is preview-only unless `--publish` is supplied. Publication additionally requires a separate authorization JSON file whose SHA-256 matches the server-only `PHASE8R_PUBLICATION_AUTHORIZATION_SHA256`, and whose administrator matches `PHASE8R_PUBLICATION_ADMIN_REF`. Output files use exclusive creation and cannot overwrite an existing snapshot or receipt. There is deliberately no public HTTP publication endpoint.

Migration `002_phase8r_reviewed_authority.sql` adds authority entries, publication events, snapshots, and an active-snapshot pointer. The publication-event table is append-only. The down migration is provided for disposable environments only; production rollback uses a forward `ROLLBACK` event and new snapshot.

This implementation deliberately ships an empty `phase8r-empty-v1` runtime snapshot. It does not publish either existing accepted decision.

## Runtime lookup

The browser imports a sanitized build-time `PublishedAuthoritySnapshot`; it never receives a database URL, review passphrase, private review row, or Staging administration API. Every snapshot is hash-validated before use.

Lookup is deterministic and fail-closed:

1. Normalize Persian with the existing conservative Unicode normalizer.
2. Require an exact normalized phrase, IJMES profile, and authority context match.
3. Reject duplicate active keys rather than selecting by order.
4. Do not apply published authority when user-specific review decisions are present.
5. Return the approved scholarly canonical to the existing Presentation renderer.
6. On a miss, continue through the existing lexicon, morphology, unresolved, and manual-only AI paths.

Personal-name entries use the separate `PERSON_NAME` context. The current main page intentionally exposes no semantic-context selector, so such entries are not applied unless an internal caller can establish that context. This avoids confusing catalogue surname-first forms with running-text order.

## Precedence

1. Active user-specific review decision.
2. Exact, active published scholarly authority with matching profile and context.
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

## First-publication prerequisites

Before publishing a real entry, an owner must:

1. Review and apply the additive migration in a positively identified authority database.
2. Configure a publication role separate from the Review passphrase.
3. Export or query the exact accepted review event and immutable source projection under a read-only Staging credential.
4. Generate and inspect the preview and conflict report.
5. Authorize publication through an administrator-only, auditable path.
6. Export the active sanitized authority snapshot, verify its manifest hash, commit it for review, and deploy it through normal CI.

No Phase 8R migration, publication, withdrawal, rollback, Neon write, Blob write, or candidate update was executed while implementing this phase.
