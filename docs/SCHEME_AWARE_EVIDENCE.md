# Scheme-Aware Evidence Aggregation (Phase 5D)

## 1. Objective & Fundamental Invariant

Phase 5D interprets external romanization observations (such as Library of Congress ALA-LC catalog entries) relative to the project's target scholarly standard (IJMES) without creating scholarly authority.

### The Pipeline

```text
External Source Observation (e.g. ALA-LC)
      ↓
Validated Aligned Segment Evidence (Phase 5C)
      ↓
Scheme-Aware Interpretation (Phase 5D: Interpreter & Rules)
      ↓
Target-Scheme Hypothesis (e.g. IJMES hypothesis)
      ↓
Candidate-Level Scheme Consensus (Aggregator)
      ↓
Non-Authoritative Candidate Proposal (proposedCanonical: null)
```

### The Invariant

```text
EXTERNAL ROMANIZATION
        ≠
SCHEME INTERPRETATION
        ≠
TARGET-SCHEME HYPOTHESIS
        ≠
AUTHORITATIVE CANONICAL FORM
```

1. **Target Hypotheses are Non-Authoritative**: Phase 5D never writes to `LexicalCandidate.proposedCanonical` or the authoritative lexicon repository. `candidate.proposedCanonical` remains strictly `null`.
2. **No Circularity**: The interpreter never invokes `transliterate()`, `DEFAULT_LEXICON_REPOSITORY`, `findFrozenReviewedAuthority()`, or AI language models as answer keys.
3. **No Benchmark-Driven Mapping**: Rules are derived exclusively from published official transliteration standards and explicit Persian orthographic facts, never by overfitting to the frozen 108-case gold benchmark.

---

## 2. Authoritative Source Standards

Phase 5D rules cite official published standards:

1. **Library of Congress / ALA-LC**:
   - Document: *ALA-LC Romanization Tables: Persian* (2012 Version).
   - Source: [Library of Congress CPSO Persian Table](https://www.loc.gov/catdir/cpso/romanization/persian.pdf).
   - Key conventions:
     - `ع` ('Ayn) $\rightarrow$ `ʻ` (modifier letter turned comma U+02BB) or catalog single quotes.
     - `ء` (Hamzah) $\rightarrow$ `ʼ` (modifier letter apostrophe U+02BC).
     - `ض` (Z̤ād) $\rightarrow$ `z̤` (`z` + combining diaeresis below U+0324).
     - Separator / affix prime $\rightarrow$ `ʹ` (modifier letter prime U+02B9).
     - Izāfat $\rightarrow$ `-i`, `-ʼi`, `-yi`.
2. **IJMES (International Journal of Middle East Studies)**:
   - Documents: *IJMES Translation and Transliteration Guide* and *IJMES Transliteration Chart*.
   - Source: Cambridge University Press Author Resources.
   - Key conventions:
     - `ع` (ʿayn) $\rightarrow$ `ʿ` (modifier letter reversed comma U+02BF).
     - `ء` (hamzah) $\rightarrow$ `ʾ` (modifier letter right half ring U+02BE).
     - `ض` (żād) $\rightarrow$ `ż` (latin small letter z with dot above U+017C).
     - Izāfat $\rightarrow$ `-i`.

---

## 3. Interpreter vs. Converter Architecture

Phase 5D is an **interpreter**, not an automatic string converter. Rather than assuming all input can be blindly transformed, the interpreter explicitly classifies what is known, what rule fired, and what requires grammatical/morphological context:

### Interpretation Statuses

| Status | Meaning | `targetHypothesis` |
| :--- | :--- | :--- |
| `DIRECT_EQUIVALENT` | Observation matches target scheme after presentation normalization alone. No scholarly transliteration rule was needed. | Computed (e.g. `gulistān`) |
| `DETERMINISTIC_EQUIVALENT` | Observation was deterministically transformed using explicit, source-cited scholarly scheme rules. | Computed (e.g. `saʿdī`, `riżā`) |
| `CONTEXT_REQUIRED` | Observation contains structural/contextual markers (izāfat, affix prime, indefinite marker, ambiguous final -ah) that cannot be safely unbound without morphological context. | `null` |
| `UNSUPPORTED` | Scheme is not supported in the current pilot (e.g. `UNKNOWN`, `LOCAL`, `DMG`, `ISO`) or romanization is missing. | `null` |

---

## 4. Presentation Normalization vs. Scholarly Scheme Rules

Phase 5D strictly separates:
- **Presentation Normalization**: Unicode normalization (NFC) and deterministic case normalization (lowercasing). For example, `Gulistān` $\rightarrow$ `gulistān` is classified as `DIRECT_EQUIVALENT` because no material scheme difference exists between ALA-LC and IJMES for this word.
- **Scholarly Scheme Transformation**: Explicit rules that bridge genuine differences between standards (e.g. `Saʻdī` $\rightarrow$ `saʿdī` via `ALA_LC_TO_IJMES_AYN`, or `Riz̤ā` $\rightarrow$ `riżā` via `ALA_LC_TO_IJMES_DAD`).

---

## 5. Structural & Contextual Blockers (Fail-Closed)

To prevent spurious candidate formation and false morphological stripping:

1. **`HYPHEN_CONTEXT_BOUND`**: Any segment containing an internal hyphen or marked `CONTEXT_BOUND` in Phase 5C (e.g. `Kitāb-i`, `al-ṭibb`, `Dawrah-ʼi`) fails closed.
2. **`STRUCTURAL_PRIME`**: ALA-LC affix / compound prime `ʹ` (e.g. `Ṣafīʹnizhād`) is NOT silently deleted. It is classified as `CONTEXT_REQUIRED` (`targetHypothesis = null`).
3. **`STRUCTURAL_INDEFINITE`**: Indefinite markers ending in `-ʼi` (e.g. `khānahʼi`) are NOT treated as lexical root hamza. Classified as `CONTEXT_REQUIRED`.
4. **`AMBIGUOUS_FINAL_HEH`**: Words ending in `-ah` / `-eh` (e.g. `khānah`) require script-conditioned morphological unbinding and are NOT blindly stripped (`ah` $\rightarrow$ `a`). Classified as `CONTEXT_REQUIRED` (`targetHypothesis = null`).

---

## 6. Candidate-Level Scheme Consensus

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

---

## 7. Read-Only IJMES Runtime Policy Audit

`auditIjmesRuntimePolicy()` provides a read-only diagnostic comparing Phase 5D target scheme definitions with project runtime mappings (`PERSIAN_CONSONANT_MAPPINGS` and `PERSIAN_GUIDE_SPECIAL_RENDERINGS`).
- Compares: `ع` $\rightarrow$ `ʿ`, `ء` $\rightarrow$ `ʾ`, `ض` $\rightarrow$ `ż`, `ص` $\rightarrow$ `ṣ`, `ط` $\rightarrow$ `ṭ`, `ظ` $\rightarrow$ `ẓ`, `ح` $\rightarrow$ `ḥ`, `خ` $\rightarrow$ `kh`, `غ` $\rightarrow$ `gh`, `ش` $\rightarrow$ `sh`, `چ` $\rightarrow$ `ch`, `ژ` $\rightarrow$ `zh`, `ة` $\rightarrow$ `ih`.
- Strict invariant: This audit never modifies runtime tables or engine behavior.

---

## 8. Relationship to Phase 5E

- **Phase 5D (Current)**: Non-authoritative scheme interpretation and target-scheme hypothesis consensus (`proposedCanonical: null`).
- **Phase 5E (Future)**: Specialist human adjudication UI and explicit promotion workflow into `LexiconRepository`.
