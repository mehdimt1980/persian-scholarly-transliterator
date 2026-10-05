# Lexical Evidence Model & Acquisition Architecture (Phase 5A)

## 1. Objective & Core Scholarly Invariant

This architectural foundation establishes a provenance-aware lexical acquisition system with a strict domain boundary between:

1. **External Lexical Evidence** (raw and normalized external observations),
2. **Lexical Candidates** (aggregated and synthesized non-authoritative proposals),
3. **Authoritative Scholarly Lexicon** (`LexiconRepository` entries used by the deterministic transliterator).

### The Invariant

```text
EXTERNAL OBSERVATION
        ≠
LEXICAL CANDIDATE
        ≠
AUTHORITATIVE LEXICON ENTRY
```

> **Library records are evidence, not automatic scholarly authority.**
> External evidence is never authoritative merely because it comes from a library, authority file, website, AI model, or other external source.

Raw external observations remain historical evidence until explicitly adjudicated and promoted through a future human-controlled workflow.

---

## 2. Acquisition & Promotion Lifecycle

```text
External Source (LoC, VIAF, BnF, GND, WorldCat, Iranica, etc.)
      │
      ▼
Raw External Record (MARC 21, XML, JSON-LD, RDF, API payload)
      │
      ▼ (Source Adapter / Connector)
Source-Neutral Lexical Evidence (`LexicalEvidence`)
  - Retains exact raw Persian script form without normalization loss
  - Retains exact observed external romanization
  - Explicit romanization scheme (`ALA_LC`, `IJMES`, `IRANICA`, `ISO`, `DMG`, `LOCAL`, `UNKNOWN`)
  - Full structured provenance (source ID, record ID, field, URI, retrieval timestamp)
  - Append-only / immutable historical observation (altered re-ingestion fails closed)
      │
      ▼ (Candidate Synthesis & Scheme-Aware Conflict Detection)
Lexical Candidate (`LexicalCandidate`)
  - Validates that all supporting evidence normalizes to candidate Persian identity
  - Scheme-aware conflict detection:
      * Same-scheme disagreements -> `CONFLICT_WITHIN_SCHEME` (sets `REVIEW_REQUIRED`)
      * Cross-scheme differences -> `VARIANT_ACROSS_SCHEMES` (remains `UNREVIEWED`)
  - Lifecycle state: `UNREVIEWED` | `REVIEW_REQUIRED` | `ACCEPTED` | `REJECTED`
  - Still 100% NON-AUTHORITATIVE
      │
      ▼ (Specialist Human Adjudication)
Human Governance Adjudication Record (`CandidateAdjudicationRecord`)
  - `ACCEPTED` candidates require `adjudication.disposition === 'ACCEPTED'`
  - `REJECTED` candidates require `adjudication.disposition === 'REJECTED'`
      │
      ▼ (Future Explicit Promotion - Phase 5E)
Authoritative Scholarly Lexicon (`LexiconRepository`)
  - IJMES canonical transliteration
  - Deterministic runtime transliteration
```

---

## 3. Domain Model Specifications

### A. Source-Neutral Lexical Evidence (`LexicalEvidence`)

Defined in `src/domain/evidence/types.ts`:

- `id`: Deterministic identifier generated from exact raw observation fields (`sourceId`, `sourceRecordId`, `sourceField`, `persianForm`, `observedRomanization`, `romanizationScheme`) using null-byte delimiters.
- `sourceType`: `'LIBRARY_CATALOG' | 'AUTHORITY_FILE' | 'SCHOLARLY_DICTIONARY' | 'ENCYCLOPEDIA' | 'BIBLIOGRAPHIC_RECORD' | 'ACADEMIC_GRAMMAR' | 'OTHER'`.
- `sourceRecordId`: Identifier in external system (e.g. LCCN, VIAF ID, GND ID).
- `sourceUri`: Canonical URL/URI.
- `sourceField`: Field locator (e.g. MARC `100$a`, `245$a`, `650$a`).
- `persianForm`: Exact un-mutated Persian script as observed in the source.
- `observedRomanization`: Exact observed external romanization string.
- `romanizationScheme`: First-class scheme (`ALA_LC`, `IJMES`, `IRANICA`, `ISO`, `DMG`, `LOCAL`, `UNKNOWN`).
- `entityType`: `'WORD' | 'PHRASE' | 'PERSON' | 'PLACE' | 'ORGANIZATION' | 'WORK' | 'TITLE' | 'OTHER'`.
- `context`: Surrounding context or title.
- `provenance`: Complete retrieval metadata (`sourceId`, `sourceTitle`, `sourceOrganization`, `retrievalMethod`, `retrievedAt`, `extractorVersion`).
- `status`: `'OBSERVED' | 'SUPERSEDED' | 'INVALIDATED'`.

### B. Append-Only Immutability

In `LexicalEvidenceRepository`:
- Previously unseen evidence records are added and indexed.
- Re-adding an exact identical evidence record is an idempotent no-op.
- Attempting to add an existing evidence ID with altered content fails closed by throwing `EvidenceImmutabilityViolationError`.

### C. Scheme-Aware Conflict Detection vs Cross-Scheme Variants

Different transliteration schemes legitimately produce different romanized strings:

```text
Persian: قاجار
  - IJMES: Qājār
  - LOCAL: Qajar
  - ALA_LC: Qājār
  - DMG: Ḳādschār
```

- **Cross-Scheme Differences**: Coexist as `VARIANT_ACROSS_SCHEMES` and do **not** falsely mark a candidate as `REVIEW_REQUIRED`.
- **Same-Scheme Disagreements**: Two observations within the same standard (e.g., two IJMES records disagreeing on vocalization) are classified as `CONFLICT_WITHIN_SCHEME` and automatically mark the candidate as `REVIEW_REQUIRED`.

### D. Persian Identity Validation

`synthesizeCandidateFromEvidence(persianForm, evidenceList)` strictly validates Persian identity:
- Candidate Persian form is normalized with `normalizePersian()`.
- Every supporting evidence record must normalize to the exact same form.
- Any mismatch fails closed immediately, preventing unrelated evidence attachment.

### E. Candidate Lifecycle & Human Adjudication Semantics

In `src/domain/evidence/candidate.ts`:
- Candidates with status `ACCEPTED` must contain `adjudication` with `disposition === 'ACCEPTED'`.
- Candidates with status `REJECTED` must contain `adjudication` with `disposition === 'REJECTED'`.
- Candidates with status `UNREVIEWED` or `REVIEW_REQUIRED` cannot carry a completed adjudication record.

### F. Source Connector Boundary (`LexicalEvidenceSource`)

Defined in `src/domain/evidence/connector.ts`:

Connectors are source-neutral contracts defining `fetch(query)` and `extractEvidence(record)`. Connectors ingest raw external payloads (e.g., MARC21 records or JSON-LD) and produce `LexicalEvidence` objects. Connectors have **zero dependency on or access to** `LexiconRepository`.

### G. Structural Separation (Non-Authoritative Boundary)

The separation between external evidence and the authoritative transliterator is enforced structurally:
1. `LexicalEvidenceRepository` contains evidence and candidate proposals only; it has no mutation path to `LexiconRepository`.
2. `LexicalCandidate` objects are non-authoritative proposals and are never consulted by `transliterate()`.
3. External connectors produce `LexicalEvidence` records only.
4. Promotion into `LexiconRepository` requires explicit future Phase 5E human adjudication tools.
