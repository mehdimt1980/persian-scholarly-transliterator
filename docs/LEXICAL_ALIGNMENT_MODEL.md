# Lexical Alignment & Candidate Extraction Model (Phase 5C)

## 1. Objective & Core Invariant

Phase 5C bridges field- and phrase-level external evidence observations (such as those ingested from the Library of Congress in Phase 5B) to smaller, aligned lexical observations and non-authoritative lexical candidate proposals.

### The Pipeline

```text
External Source Record (e.g. LoC MARCXML)
      ↓
Field-Level Lexical Evidence (e.g. 245$a ↔ 880[245-03]$a)
      ↓
Source-Neutral Alignment Engine (POSITIONAL_EQUAL_COUNT)
      ↓
Derived Aligned Lexical Evidence (exact parent substring slices + lineage)
      ↓
Cross-Record Candidate Grouping (keyed by normalizePersian with deduplication)
      ↓
Lexical Candidate Proposals (proposedCanonical: null)
```

### The Core Invariant

```text
SOURCE OBSERVATION
      ≠
DERIVED ALIGNMENT
      ≠
LEXICAL CANDIDATE
      ≠
AUTHORITATIVE SCHOLARLY LEXICON
```

1. **No ALA-LC to IJMES Conversion**: Phase 5C never converts Library of Congress ALA-LC romanization into IJMES canonical transliterations.
2. **`proposedCanonical` is strictly `null`**: Every candidate generated automatically in Phase 5C has `proposedCanonical: null`.
3. **No Circularity**: The alignment module never invokes `transliterate()`, `DEFAULT_LEXICON_REPOSITORY`, frozen gold benchmarks, or AI models to guess correspondences.
4. **Non-Authoritative**: Generated candidates remain proposals requiring future human review and explicit adjudication (Phase 5E).

---

## 2. Raw Evidence vs. Derived Aligned Evidence

A fundamental semantic distinction exists between field-level observations and computationally derived aligned segments:

| Dimension | Raw External Observation (Parent) | Derived Aligned Segment Evidence (Child) |
| :--- | :--- | :--- |
| **Semantics** | "The Library of Congress explicitly cataloged this entire field." | "This exact substring occurs inside that source observation and was computationally aligned to another exact substring." |
| **Lineage** | `derivation: undefined` | `derivation: LexicalEvidenceDerivation` |
| **Persian Form** | Full field text (e.g. `كتاب گلستان.`) | Exact substring slice (e.g. `گلستان`) |
| **Romanization** | Full field romanization (e.g. `Kitāb-i Gulistān.`) | Exact substring slice (e.g. `Gulistān`) |
| **ID Format** | `evi-loc-...` | `evi-align-loc-...` |

---

## 3. Source-Span Integrity & Repository Lineage Constraints

Derived segment evidence records preserve exact substrings from parent observations without lossy lowercasing, diacritic stripping, or normalization mutation.

### Enforced Repository Invariants

For every derived segment evidence record added to `LexicalEvidenceRepository`:

1. **Parent Existence**: `parentEvidenceId` must reference an existing evidence record in the repository.
2. **Parent Romanization Requirement**: `parent.observedRomanization !== null` (a parent without Romanization cannot produce aligned segment evidence).
3. **No Self-Derivation**: `parentEvidenceId !== child.id`.
4. **No Recursive Derivation**: Phase 5C derived segments cannot derive from other derived segments (`parent.derivation === undefined`).
5. **Exact Persian Span Integrity**:
   ```text
   parent.persianForm.slice(persianSpan.start, persianSpan.end) === child.persianForm
   ```
6. **Exact Romanization Span Integrity**:
   ```text
   parent.observedRomanization.slice(romanizationSpan.start, romanizationSpan.end) === child.observedRomanization
   ```
7. **Non-Forgeable Eligibility Integrity**:
   `child.derivation.candidateEligibility` and `child.derivation.exclusionReason` must match the deterministic classification of `classifyAlignedSegmentEligibility(child.observedRomanization)`.
8. **Strict Source Identity Preservation**:
   `sourceType`, `sourceField`, `sourceRecordId`, `sourceUri`, `romanizationScheme`, `provenance.sourceId`, `provenance.sourceTitle`, `provenance.sourceOrganization`, and `provenance.extractorVersion` must remain strictly identical between parent and child.

Any violation fails closed immediately at repository insertion time and during deserialization integrity validation.

---

## 4. Provenance Architecture: External Extraction vs. Computational Derivation

Phase 5C strictly separates external source provenance from computational alignment derivation:

1. **`child.provenance`**: Preserves the parent observation's external extraction metadata (`sourceId: 'LOC'`, `extractorVersion: '1.0.0'`, `retrievedAt: '...'`). The alignment engine NEVER overwrites the source extractor version.
2. **`child.derivation`**: Records the alignment event (`alignerVersion`, `derivedAt`, `alignmentStrategy`, `persianSpan`, `romanizationSpan`, `candidateEligibility`, `exclusionReason`).
3. **Deterministic Evidence ID**: Includes `parentEvidenceId`, `segmentIndex`, `persianSpan`, `romanizationSpan`, `alignmentStrategy`, and `alignerVersion`, ensuring that re-running identical semantic alignment remains idempotent without creating spurious duplicate IDs due to wall-clock time.

---

## 5. Deterministic Alignment Algorithm (`POSITIONAL_EQUAL_COUNT`)

Phase 5C implements a conservative, high-transparency alignment strategy:

```text
POSITIONAL_EQUAL_COUNT
```

### Algorithm Steps:

1. **Persian Lexical Tokenization**: Identifies lexical word tokens using `tokenizePersianLexicalTokens()`, extracting exact source spans while excluding catalog punctuation and surrounding whitespace.
2. **Roman Lexeme Tokenization**: Identifies scholarly Latin lexemes using `tokenizeRomanLexemes()`, preserving Unicode combining marks, scholarly modifier characters (`ʻ`, `ʼ`, `ʿ`, `ʾ`, `ʹ`, `'`), and internal hyphens.
3. **Zero-Token Check**: If either side yields zero lexical tokens, alignment halts and emits a diagnostic (`NO_PERSIAN_TOKENS` or `NO_ROMAN_TOKENS`).
4. **Count Comparison**:
   - If Persian token count $\neq$ Roman token count: alignment **fails closed** with diagnostic `TOKEN_COUNT_MISMATCH`. No guessing, Levenshtein distance, or fuzzy matching is attempted.
   - If Persian token count $=$ Roman token count: tokens are paired 1-to-1 by ordinal position.
5. **Eligibility & Context-Bound Classification**:
   - Shared deterministic classifier `classifyAlignedSegmentEligibility(observedRomanization)`.
   - If the Romanized token contains an internal hyphen (e.g. `Kitāb-i`, `al-ṭibb`, `Dawrah-ʼi`), it is classified as `CONTEXT_BOUND` and excluded from candidate generation.
   - Otherwise, the segment is marked `ELIGIBLE`.
6. **Entity Type Semantics**:
   - Single-token parent heading $\rightarrow$ preserves parent entity type (e.g. `PERSON` for `100$a`).
   - Multi-token parent $\rightarrow$ derived segments default to `WORD`.

---

## 6. Cross-Record Candidate Extraction & Invariants

Once candidate-eligible derived segments exist:

1. **Input-Order Invariance**:
   - Candidate `persianForm` and `normalizedForm` are strictly set to the normalized grouping key (`normalizePersian(persianForm).normalizedInput`).
   - Sibling evidence records (`[eviA, eviB]` vs `[eviB, eviA]`) produce the exact same candidate identity and candidate ID.
   - Raw historical orthographies (`سعدى` vs `سعدی`) remain unmutated in the supporting evidence records.
2. **Evidence Deduplication**:
   - Supporting evidence records are deduplicated by immutable evidence ID prior to synthesis.
   - Duplicate inputs (`[eviA, eviB]` vs `[eviA, eviB, eviA]`) produce identical candidates.
   - Supporting evidence IDs are sorted deterministically.
3. **Entity Type Reconciliation**:
   - If all supporting evidence records agree on an entity type (e.g. `PERSON`), the candidate inherits that type.
   - If supporting records differ (e.g. `WORK` vs `WORD`), the candidate falls back to `WORD`.
4. **Same-Scheme Conflict Preservation**:
   - Disagreements under the same comparable scheme (e.g. `Gulistān` vs `Golistān` under `ALA_LC`) flag `CONFLICT_WITHIN_SCHEME` and assign status `REVIEW_REQUIRED`.
5. **`proposedCanonical: null`**:
   - The candidate proposal leaves `proposedCanonical` null. ALA-LC strings are never copied into the project canonical field.
6. **Candidate Derivation Strategy**:
   - Automatically synthesized candidates carry `strategy: 'ALIGNED_SEGMENT_SYNTHESIS'`.

---

## 7. Truthful Metrics Architecture

The domain model avoids hard-coding zero telemetry in pure functions:

1. **`extractCandidatesFromAlignedEvidence(derivedEvidence)`**:
   Returns metrics truth-computable directly from derived evidence:
   - `derivedSegmentsCount`
   - `eligibleSegmentsCount`
   - `contextBoundSegmentsCount`
   - `candidateGroupsCount`
   - `candidates`
2. **`processEvidenceAlignmentBatch(parentEvidenceList)`**:
   Whole-batch orchestrator that truthfully computes:
   - `parentObservationsCount`
   - `unalignedObservationsCount`
   - `derivedSegmentsCount`
   - `eligibleSegmentsCount`
   - `contextBoundSegmentsCount`
   - `candidateGroupsCount`
   - `candidates`
   - `derivedEvidence`
   - `alignmentResults`

---

## 8. Relationship to Future Phases

- **Phase 5C (Current)**: Provenance-safe alignment and candidate proposal extraction (`proposedCanonical: null`).
- **Phase 5D (Future)**: Scheme-aware interpretation (e.g. explicit scholarly ALA-LC to IJMES mapping rules and morphological unbinding).
- **Phase 5E (Future)**: Specialist human adjudication and explicit promotion into `LexiconRepository`.
