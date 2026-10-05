# Lexical Evidence Model & Acquisition Architecture

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
  - Retains exact Persian script form
  - Retains exact observed external romanization
  - Explicit romanization scheme (`ALA_LC`, `IJMES`, `IRANICA`, `ISO`, `DMG`, `LOCAL`, `UNKNOWN`)
  - Full structured provenance (source ID, record ID, field, URI, retrieval timestamp)
  - Append-only / immutable historical observation
      │
      ▼ (Synthesis & Conflict Detection)
Lexical Candidate (`LexicalCandidate`)
  - Aggregates 1+ supporting evidence records
  - Explicit conflict detection across differing observations
  - Lifecycle state: `UNREVIEWED` | `REVIEW_REQUIRED` | `ACCEPTED` | `REJECTED`
  - Still 100% NON-AUTHORITATIVE
      │
      ▼ (Future Specialist Human Adjudication)
Human Governance Sign-Off & Promotion
      │
      ▼
Authoritative Scholarly Lexicon (`LexiconRepository`)
  - IJMES canonical transliteration
  - Deterministic runtime transliteration
```

---

## 3. Domain Model Specifications

### A. Source-Neutral Lexical Evidence (`LexicalEvidence`)

Defined in `src/domain/evidence/types.ts`:

- `id`: Deterministic identifier generated from source ID, record ID, field, Persian form, and romanization.
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

### B. Romanization Scheme Distinction

An external romanization scheme (such as Library of Congress `ALA_LC`) is never treated as project `IJMES` canonical form:

```text
Library of Congress observation:
  Persian: مشروطه
  Observed: Mashrūṭah (ALA-LC with -ah for tāʾ marbūṭa)

IJMES canonical policy:
  Persian: مشروطه
  Canonical: mashrūṭih (IJMES with -ih)
```

The domain model records `Mashrūṭah` under `romanizationScheme: 'ALA_LC'`, ensuring adapters and candidate synthesizers cannot silently confuse external conventions with canonical scholarly rules.

### C. Lexical Candidates (`LexicalCandidate`)

Defined in `src/domain/evidence/types.ts`:

- `id`: Deterministic candidate identifier.
- `persianForm`: Base Persian script form.
- `normalizedForm`: Standard normalized Persian for indexing without mutating the raw evidence.
- `proposedCanonical`: Proposed transliteration (advisory only).
- `proposedProfile`: Target transliteration profile (`ijmes_full` | `ijmes_title`).
- `entityType`: Lexical classification.
- `evidenceIds`: Array of supporting `LexicalEvidence.id`s.
- `conflicts`: Explicit list of `ConflictingObservation`s detected among evidence records.
- `status`: Lifecycle state (`UNREVIEWED`, `REVIEW_REQUIRED`, `ACCEPTED`, `REJECTED`).
- `derivationProvenance`: Strategy and metadata describing candidate construction.

### D. Source Connector Boundary (`LexicalEvidenceSource`)

Defined in `src/domain/evidence/connector.ts`:

Connectors are source-neutral contracts defining `fetch(query)` and `extractEvidence(record)`. Connectors ingest raw external payloads (e.g., MARC21 records or JSON-LD) and produce `LexicalEvidence` objects. Connectors have **zero dependency on or access to** `LexiconRepository`.

### E. Storage Semantics (`LexicalEvidenceRepository`)

Defined in `src/domain/evidence/repository.ts`:

- Append-only historical observation storage.
- Multiple conflicting observations for the same Persian form coexist without overwriting.
- Deterministic serialization and deserialization.
- `assertNonAuthoritative()` method asserting non-authoritative boundary.
- Full integrity validation guarding against broken evidence references.

---

## 4. Invariant Protection & Zero Scholarly-Output Changes

1. **No Automatic Lexicon Mutation**: Creating or loading evidence or candidates cannot mutate `LexiconRepository` or alter `transliterate()` outputs.
2. **Zero AI Authority**: External language models and advisory assistants have no authority to promote evidence or candidates.
3. **Reproducibility**: All evidence and candidate IDs are deterministic and reproducible.
