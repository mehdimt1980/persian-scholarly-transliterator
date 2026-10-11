# Phase 8S: Derived Scholarly Authority & Controlled Publication

## 1. Executive Summary & Scientific Problem

In scholarly bibliographic and catalogue sources (such as the Bavarian State Library / BSB MARC collection), Persian personal names are routinely catalogued in inverted surname-first format:
- **Persian catalogue surface:** `نصیری، محمدرضا`
- **Accepted catalogue canonical:** `Naṣīrī, Muḥammad Riḍā`
- **Catalogue candidate:** `lex-000a84a77bd88ba3fefb`
- **Catalogue review event:** `0c550779-1ed2-4613-96f4-e14c66ee4475`

However, the natural input in scholarly prose and bibliography running-text is:
- **Running-text surface:** `محمدرضا نصیری`
- **Intended transliteration:** `Muḥammad Riḍā Naṣīrī`

This represents a distinct textual and scholarly form. The system must **never** automatically reverse names or invert transliterations through heuristic word manipulation:
1. Persian compound names, titles, nisbas, and izafats follow delicate linguistic conventions that cannot be reversed algorithmically.
2. The catalogue source evidence remains immutable historical evidence and must never be mutated or overwritten.
3. Authority publication must be explicitly human-reviewed, attested, and authorized.

Phase 8S implements a generic, deterministic, provenance-preserving **Derived Scholarly Authority** architecture.

---

## 2. Three-Layer Architecture

### Layer A — Source Evidence (Immutable)
- Retains original BSB MARC evidence, candidate projections (`phase8g_lexical_candidate`), immutable source versions (`phase8g_source_version`), and review events (`phase8g_review_event`).
- Source data, candidate IDs, review-basis hashes, and existing `ACCEPT` decisions remain unchanged.
- Purely read-only source of truth.

### Layer B — Derived Authority Review (Append-Only Staging)
- Introduces `phase8s_derived_candidate` and `phase8s_derived_review_event`.
- Deterministic derived candidate ID generation:
  $$\text{sha256}(\text{parentCandidateId} \mathbin{\Vert} \text{derivationType} \mathbin{\Vert} \text{normalizedPersian} \mathbin{\Vert} \text{profile} \mathbin{\Vert} \text{context})$$
- Captures explicit links:
  - `parentCandidateId`
  - `parentSourceVersionId`
  - `parentReviewEventId`
  - `sourceSnapshotId`
  - `reviewBasisSha256`
- Supports explicit review lifecycle:
  $$\text{DRAFT} \to \text{ACCEPT} \mathbin{/} \text{REJECT} \mathbin{/} \text{DEFER}$$
- An accepted derived record remains in status **`ACCEPTED — NOT PUBLISHED`** until independent administrative publication authorization.
- Later review events append to the ledger and immediately supersede prior decisions.

### Layer C — Published Authority (Independent Controlled Publication)
- Only an independently verified and authorized derived `ACCEPT` may be published into the Phase 8R Published Authority system.
- The published entry uses the reviewed running-text surface, not the catalogue surface.
- Preserves both immediate derived review provenance and parent source provenance.
- Deployed snapshots remain static and deterministic: database publication is strictly separate from runtime deployment.

---

## 3. Independent Verification Boundary

When a publication request is submitted, the system bypasses caller-supplied data and re-verifies everything against Neon database tables:
1. **Parent Evidence Existence & Validity**: Checks `phase8g_lexical_candidate` and verifies candidate content hash.
2. **Parent Review Authenticity**: Verifies `phase8g_review_event` has status `ACCEPT`, matches `expectedParentReviewEventId`, and parent review basis hash.
3. **Derived Record Linkage**: Confirms `phase8s_derived_candidate` references the authentic parent candidate and source version.
4. **Latest Decision Verification**: Queries the latest `phase8s_derived_review_event` for the candidate. Rejects if superseded, withdrawn, rejected, deferred, or still in draft.
5. **Surface Invariants**: Ensures running-text Persian surface contains no commas and matches the normalized form.
6. **No Conflicting Active Authority**: Ensures no duplicate active authority exists for the same `(normalizedPersian, profile, context)`.
7. **Human Scholarly Attestation**: Demands explicit scholarly attestation and reviewer reference.
8. **Independent Admin Authorization**: Demands separate administrative authentication.

Any failure, stale hash, or mismatch causes the transaction to **fail closed**.

---

## 4. Database Schema & Migration

Migration `migrations/evidence/003_phase8s_derived_authority.sql`:
- **`phase8s_derived_candidate`**:
  - `derived_candidate_id` (PK, text)
  - `parent_candidate_id` (text)
  - `parent_source_version_id` (FK to `evidence_record_version(version_id)`)
  - `parent_review_event_id` (FK to `phase8o_review_event(event_id)`)
  - `source_snapshot_id` (FK to `evidence_snapshot(snapshot_id)`)
  - `review_basis_sha256` (char(64))
  - `original_persian_surface` (text)
  - `running_text_persian_surface` (text, check constraint forbidding commas)
  - `derivation_type` (text, check constraint)
  - `derivation_explanation` (text)
  - `created_at` (timestamptz)
  - `created_by` (text)
- **`phase8s_derived_review_event`**:
  - `event_id` (PK, UUID)
  - `derived_candidate_id` (FK to `phase8s_derived_candidate`)
  - `decision_kind` (`DRAFT`, `ACCEPT`, `REJECT`, `DEFER`)
  - `canonical` (text)
  - `profile` (`ijmes_full`, `ijmes_citation_title`)
  - `authority_context` (`GENERAL_SCHOLARLY_TEXT`, `BOOK_OR_ARTICLE_TITLE`, `PERSON_NAME`)
  - `reviewer_ref` (text)
  - `rationale` (text)
  - `human_attestation` (text)
  - `decision_json` (jsonb)
  - `decided_at` (timestamptz)
  - Append-only immutability trigger `phase8s_derived_event_immutable` blocking UPDATE and DELETE.
- **`phase8r_authority_entry` & `phase8r_publication_event`**:
  - Additive columns: `derived_review_event_id`, `derived_candidate_id`, `derivation_type`, `derivation_explanation`.
  - Foreign key constraints linking published authority to derived candidate and event.

Rollback is provided in `migrations/evidence/003_phase8s_derived_authority.down.sql`.

---

## 5. Review Workbench UI States

The Review Workbench (`/review`) introduces four clear visual state badges:
1. **`SOURCE EVIDENCE — NON-AUTHORITATIVE`**: Displays original catalogue evidence.
2. **`DERIVED AUTHORITY — REVIEW REQUIRED`**: For newly proposed or draft running-text forms.
3. **`ACCEPTED — NOT PUBLISHED`**: When a reviewer has accepted the derived candidate, but publication has not occurred.
4. **`PUBLISHED SCHOLARLY AUTHORITY`**: When the record has been formally published into an active snapshot.

---

## 6. Runtime Integration

- Exact normalized running-text Persian surface matching.
- Evaluated prior to general lexicon lookup; yields if the user provides manual review decisions.
- Completely deterministic; requires 0 ms network calls and 0 AI requests.
- Preserves backward compatibility with existing Phase 8R empty or populated snapshots.

---

## 7. First-Publication Checklist (Operation Runbook)

When preparing to publish the first derived authority (e.g., `محمدرضا نصیری`):

### Preflight (Local & CI)
- [ ] PR #82 passes all checks: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- [ ] Runtime published snapshot (`src/data/publishedAuthority.ts`) remains clean with `entries: []`.
- [ ] Code is reviewed and approved without merging.

### Step 1: Disposable Neon Integration Verification
- [ ] Create a disposable test branch in Neon (e.g. `test-disposable-phase8s-<date>`).
- [ ] Apply migrations:
  - `001_phase8g_schema.sql`
  - `002_phase8r_authority.sql`
  - `003_phase8s_derived_authority.sql`
- [ ] Run integration test suite with `PHASE8R_TEST_DISPOSABLE_CONFIRMATION=I_CONFIRM_PHASE8R_DISPOSABLE_ISOLATED_DATABASE` and required environment variables (`PHASE8R_TEST_ADMIN_DATABASE_URL`, `PHASE8R_TEST_SOURCE_DATABASE_URL`, `PHASE8R_TEST_NAMESPACE`, `PHASE8R_TEST_NEON_BRANCH_ID`).
- [ ] Verify complete transaction rollback on failure and idempotency on repeat publication.
- [ ] Destroy disposable Neon branch.

### Step 2: Staging Derived Review
- [ ] Reviewer opens accepted BSB catalogue candidate `lex-000a84a77bd88ba3fefb` in Review Workbench.
- [ ] Creates proposed running-text derived candidate:
  - Derived Persian surface: `محمدرضا نصیری`
  - Proposed canonical: `Muḥammad Riḍā Naṣīrī`
  - Profile: `ijmes_full`
  - Context: `PERSON_NAME`
  - Derivation type: `RUNNING_TEXT_NORMALIZATION`
  - Explanation: Standard Persian scholarly personal name in natural word order.
- [ ] Reviewer accepts candidate with human scholarly attestation.
- [ ] Review status displays **`ACCEPTED — NOT PUBLISHED`**.

### Step 3: Publication Preview & Independent Verification
- [ ] Administrator opens authority publication preview.
- [ ] Verifies:
  - Parent candidate `lex-000a84a77bd88ba3fefb` exists and is intact.
  - Parent review event `0c550779-1ed2-4613-96f4-e14c66ee4475` is authentic `ACCEPT`.
  - Derived review is latest event with `ACCEPT`.
  - Preview displays exact expected transliteration: `Muḥammad Riḍā Naṣīrī`.
  - Zero conflicts exist in active authorities.

### Step 4: Controlled Publication Execution
- [ ] Administrator submits publication with valid admin secret and confirmation.
- [ ] Database transaction acquires advisory lock, writes `phase8r_publication_event` and `phase8r_authority_entry`.
- [ ] Generates updated snapshot manifest with computed SHA-256.

### Step 5: Runtime Snapshot Deployment
- [ ] Export published snapshot from database into `src/data/publishedAuthority.ts`.
- [ ] Run full test suite to verify deterministic runtime resolution.
- [ ] Submit separate deployment PR for the snapshot.
