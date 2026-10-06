# Scheme-Aware Evidence Aggregation (Phase 5D)

## 1. Objective & Fundamental Invariants

Phase 5D interprets external romanization observations (such as Library of Congress ALA-LC catalog entries) relative to the project's target scholarly standard (IJMES) without creating scholarly authority.

### The Pipeline

```text
LoC MARC / External Source Observation (ALA-LC)
      ↓
Field-Level Raw LexicalEvidence (Phase 5B)
      ↓
Validated Aligned Segment Evidence (Phase 5C: Lineage-Revalidated)
      ↓
Candidate Extraction & Conflict Tracking (Phase 5C)
      ↓
Scheme-Aware Interpretation (Phase 5D: Interpreter & Rules)
      ↓
Candidate Scheme Consensus (Phase 5D: Exact Evidence Set Closure)
      ↓
Non-Authoritative Candidate Proposal (proposedCanonical: null)
```

### Core Invariants

```text
EXTERNAL ROMANIZATION
        ≠
SCHEME INTERPRETATION
        ≠
TARGET-SCHEME HYPOTHESIS
        ≠
AUTHORITATIVE CANONICAL FORM
```

1. **Target Hypotheses are Non-Authoritative**: Phase 5D produces `targetHypothesis` and `consensusTargetHypothesis`, but NEVER writes to `LexicalCandidate.proposedCanonical` or the authoritative lexicon repository. `candidate.proposedCanonical` remains strictly `null`.
2. **Exact Candidate Evidence Set Closure**: Candidate scheme analysis (`analyzeCandidateSchemeEvidence`) is computed from **exactly** `candidate.evidenceIds`. Analyzing an evidence subset (which could hide conflicts) or injecting external evidence (which could skew consensus) fails closed immediately.
3. **Phase 5C Lineage Revalidation**: For derived aligned evidence records, candidate scheme analysis independently executes `validateDerivedEvidenceLineage()` against the parent evidence store to ensure parent existence, substring bounds, deterministic eligibility, and provenance are strictly verified.
4. **Preservation of Raw Conflict Dimension**: Phase 5C raw source conflicts (`candidate.conflicts`, `candidate.status`) and Phase 5D target-scheme consensus (`consensusStatus`, `consensusTargetHypothesis`) are preserved as independent, explicit dimensions on `CandidateSchemeAnalysis` (`rawSourceConflicts`, `rawCandidateStatus`). Raw conflicts are NEVER silently cleared even when target hypotheses converge unanimously.
5. **No Circularity**: The interpreter never invokes `transliterate()`, `DEFAULT_LEXICON_REPOSITORY`, `findFrozenReviewedAuthority()`, or AI language models as answer keys.
6. **No Benchmark-Driven Mapping**: Rules are derived exclusively from published official transliteration standards and explicit Persian orthographic facts, never by overfitting to the frozen 108-case gold benchmark.

---

## 2. Authoritative Source Standards & Policy Registries

Phase 5D rules and target policies cite official published standards:

1. **Library of Congress / ALA-LC**:
   - Document: *ALA-LC Romanization Tables: Persian* (2012 Version).
   - Source: [Library of Congress CPSO Persian Table](https://www.loc.gov/catdir/cpso/romanization/persian.pdf).
   - Exact Unicode conventions:
     - `ع` ('Ayn) $\rightarrow$ `ʻ` (modifier letter turned comma U+02BB).
     - `ء` (Hamzah) $\rightarrow$ `ʼ` (modifier letter apostrophe U+02BC).
     - `ض` (Z̤ād) $\rightarrow$ `z̤` (`z` + combining diaeresis below U+0324).
     - Separator / affix prime $\rightarrow$ `ʹ` (modifier letter prime U+02B9).
     - Izāfat $\rightarrow$ `-i`, `-ʼi`, `-yi`.
2. **IJMES (International Journal of Middle East Studies)**:
   - Documents: *IJMES Translation and Transliteration Guide* and *IJMES Transliteration Chart*.
   - Source: Cambridge University Press Author Resources.
   - Exact Unicode conventions:
     - `ع` (ʿayn) $\rightarrow$ `ʿ` (modifier letter reversed comma U+02BF).
     - `ء` (hamzah) $\rightarrow$ `ʾ` (modifier letter right half ring U+02BE).
     - `ض` (żād) $\rightarrow$ `ż` (latin small letter z with dot above U+017C).
     - Izāfat $\rightarrow$ `-i`.

### Genuinely Source-Backed Policy Registry (`IJMES_TARGET_POLICY_REGISTRY`)

The read-only diagnostic auditor operates exclusively against real, source-cited policy definitions in `IJMES_TARGET_POLICY_REGISTRY`:
- Zero "ghost" rule IDs (e.g. `STANDARD_IJMES_DIRECT` removed in favor of concrete `IJMES_POLICY_*` definitions).
- Each policy entry specifies the Persian character, letter name, target symbol, official source citation (document title, section/table), and explanatory notes.
- Summary reports use truthful semantics (`PASS`, `PASS_WITH_NONCOMPARABLE`, `DISCREPANCY_DETECTED`).

---

## 3. Interpreter vs. Converter Architecture

Phase 5D is an **interpreter**, not an automatic string converter. Rather than assuming all input can be blindly transformed, the interpreter explicitly classifies what is known, what rule fired, and what requires grammatical/morphological context:

### Interpretation Statuses

| Status | Meaning | `targetHypothesis` |
| :--- | :--- | :--- |
| `DIRECT_EQUIVALENT` | Observation matches target scheme after presentation normalization alone. No scholarly transliteration rule was needed. | Computed (e.g. `gulistān`, `khān`) |
| `DETERMINISTIC_EQUIVALENT` | Observation was deterministically transformed using explicit, source-cited scholarly scheme rules. | Computed (e.g. `saʿdī`, `riżā`, `muʾassir`) |
| `CONTEXT_REQUIRED` | Observation contains structural/contextual markers (izāfat, affix prime, indefinite marker, ambiguous final -ah) or ambiguous typography that cannot be safely transformed without context. | `null` |
| `UNSUPPORTED` | Scheme is not supported in the current pilot (e.g. `UNKNOWN`, `LOCAL`, `DMG`, `ISO`) or romanization is missing. | `null` |

---

## 4. Unicode-Exact Markers vs. Typographic Normalization Boundary

Phase 5D does not silently collapse visually similar punctuation characters:

- **Verified ALA-LC Markers**:
  - `ʻ` (U+02BB) for ʿAyn $\rightarrow$ transformed to `ʿ` (U+02BF) via `ALA_LC_TO_IJMES_AYN`.
  - `ʼ` (U+02BC) for medial/final Hamza $\rightarrow$ transformed to `ʾ` (U+02BE) via `ALA_LC_TO_IJMES_LEXICAL_HAMZA`.
  - `z\u0324` for Persian ض $\rightarrow$ transformed to `ż` (U+017C) via `ALA_LC_TO_IJMES_DAD`.
- **Typographic Variants Fail Closed**:
  - Left single quote `‘` (U+2018), right single quote `’` (U+2019), ASCII apostrophe `'` (U+0027), and prime `′` (U+2032) are NOT silently treated as scholarly modifiers.
  - They trigger the `UNVERIFIED_TYPOGRAPHIC_VARIANT` blocker and fail closed as `CONTEXT_REQUIRED` (`targetHypothesis = null`).
- **Initial Hamza Marker Disallowed**:
  - Because ALA-LC and IJMES drop initial hamza, word-initial `ʼ` (e.g. `ʼamr`) fails closed with blocker `INITIAL_HAMZA_DISALLOWED`. Medial and final hamza (e.g. `muʼassir`, `pāʼīn`, `khulafāʼ`) remain eligible.

---

## 5. Structural & Contextual Blockers (Fail-Closed)

To prevent spurious candidate formation and false morphological stripping:

1. **`STRUCTURAL_IZAFAT`**: Endings matching `-i`, `-ʼi`, or `-yi` (e.g. `Kitāb-i`, `khānah-ʼi`, `Daryā-yi`) are explicitly classified as structural izāfat and fail closed (`targetHypothesis = null`).
2. **`HYPHEN_CONTEXT_BOUND`**: Non-izāfat hyphens (e.g. Arabic article in `al-ṭibb`) or Phase 5C context-bound segments fail closed.
3. **`STRUCTURAL_INDEFINITE`**: Unhyphenated indefinite markers ending in `-ʼi` or `-ʼī` (e.g. `khānahʼi`) fail closed as `STRUCTURAL_INDEFINITE`.
4. **`STRUCTURAL_PRIME`**: ALA-LC affix / compound prime `ʹ` (U+02B9, e.g. `Ṣafīʹnizhād`) is NOT silently deleted; it fails closed as `STRUCTURAL_PRIME`.
5. **`AMBIGUOUS_FINAL_HEH`**: Final `-ah` representations (e.g. `khānah`, `rūznāmah`) fail closed without any hardcoded lexical allowlist. Genuine lexical exceptions are left for Phase 5E human adjudication.

---

## 6. Candidate-Level Scheme Consensus & Exact Closure

Candidate-level aggregation evaluates all supporting observations for a candidate:

```ts
export type SchemeConsensusStatus =
  | 'UNANIMOUS_DETERMINISTIC'
  | 'CONFLICTING_DETERMINISTIC'
  | 'PARTIAL'
  | 'BLOCKED'
  | 'NO_INTERPRETABLE_EVIDENCE';
```

- **`UNANIMOUS_DETERMINISTIC`**: All supporting observations yield exactly one identical IJMES hypothesis and no blockers exist on contributing evidence.
- **`CONFLICTING_DETERMINISTIC`**: Supporting observations produce multiple disagreeing IJMES target hypotheses. No automatic choice is made.
- **`PARTIAL`**: At least one observation resolves deterministically, but others require context or are unsupported.
- **`BLOCKED`**: All supporting observations require context or are unsupported.
- **`NO_INTERPRETABLE_EVIDENCE`**: No supporting evidence contains an observed romanization string.

### Immutable Analysis Record

`CandidateSchemeAnalysis` provides an immutable record containing:
- `id`: Deterministic hash of candidate ID, target scheme, aggregator version, and sorted interpretation IDs.
- `candidateId`, `persianForm`.
- `interpretations`: Array of individual evidence interpretations.
- `deterministicTargetHypotheses`: Sorted unique list of non-null target hypotheses.
- `consensusStatus`, `consensusTargetHypothesis`.
- `rawSourceConflicts`: Immutable snapshot of Phase 5C raw conflicts (`candidate.conflicts`).
- `rawCandidateStatus`: Immutable snapshot of Phase 5C candidate status (`candidate.status`).
- `blockers`, `appliedRuleIds`, `aggregatorVersion`, `analyzedAt`.

---

## 7. Genuine Fixture Statistics (LoC Catalog Records)

Across the three genuine Library of Congress MARCXML fixtures:

| Fixture LCCN | Record Title / Subject | Candidates | Observations | DIRECT | DETERMINISTIC | CONTEXT_REQ | UNSUPPORTED | UNANIMOUS | BLOCKED |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `2016404617` | Saʻdī / Gulistān | 2 | 4 | 2 | 1 | 0 | 0 | 2 | 0 |
| `2002341405` | Mīzān al-ṭibb | 8 | 14 | 11 | 0 | 0 | 0 | 8 | 0 |
| `2025364468` | Rūznāmah-ʼi Sharaf va Sharāfat | 13 | 20 | 13 | 2 | 2 | 0 | 11 | 2 |
| **Total** | | **23** | **38** | **26** | **3** | **2** | **0** | **21** | **2** |

- **Zero Authority Leakage**: Across all 23 candidate records, `candidate.proposedCanonical` remains strictly `null`.
- **Zero Engine Mutations**: Authoritative lexicon and runtime transliterator tables remain 100% untouched.

---

## 8. Relationship to Phase 5E

- **Phase 5D (Current)**: Non-authoritative scheme interpretation, exact candidate evidence closure, lineage revalidation, and target-scheme hypothesis consensus (`proposedCanonical: null`).
- **Phase 5E (Future)**: Specialist human adjudication UI and explicit promotion workflow into `LexiconRepository`.
