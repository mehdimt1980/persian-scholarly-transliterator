# Validation V2 Contract Specification

## 1. Purpose & Motivation

Validation V1 evaluated transliteration test cases by comparing `expected.canonical` against `TransliterationResult.output` (the top-level rendered presentation output). This conflated two distinct architectural layers:

1. **Scholarly Canonical Transliteration:** The linguistically accurate, diacritic-preserving, source-faithful representation of Persian input under the scholarly transliteration scheme.
2. **Publication / Profile Rendering:** Style-dependent presentation transformations (e.g., diacritic removal on proper names, title-casing, or English word list substitutions) governed by editorial house policies such as IJMES.

As defined in the [Canonical-vs-Rendering Contract](./review/CANONICAL_RENDERING_CONTRACT.md), canonical transliteration truth and publication rendering rules are separate concerns. Validation V2 establishes a formal, versioned contract that independently defines, parses, and evaluates both dimensions.

> **Important Governance Boundary:**
> - No current benchmark case is made authoritative merely by the introduction of V2.
> - The 108-case Phase 4.6B benchmark must be re-audited before migration into V2.

---

## 2. V1 Legacy Compatibility Status

Validation V1 remains intact for existing pilot and release gates:
- The existing pilot corpus (`validation/corpus/pilot.v1.json`) continues to validate under V1 schemas and evaluators without modification.
- Existing functions (`evaluateSingleCase`, `validateSingleCase`, `runCorpusValidation`) retain their V1 behavior.
- V1 `expected.canonical` is preserved purely as legacy compatibility terminology and must **not** be used as the model for new Phase 4.6B gold data.

---

## 3. V2 Expectation Model

Validation V2 test cases use `ScholarlyValidationExpectationV2`:

```ts
interface ScholarlyValidationExpectationV2 {
  disposition: ValidationExpectedDisposition;

  // Canonical Dimension (Scholarly Diacritic-Preserving)
  scholarlyCanonical?: string;
  allowedScholarlyCanonicals?: string[];

  // Rendered Dimension (Publication Profile Presentation)
  renderedOutput?: string;
  allowedRenderedOutputs?: string[];

  // Review Issues (For REVIEW_REQUIRED)
  requiredIssueTypes?: ReviewIssueType[];
  forbiddenIssueTypes?: ReviewIssueType[];
}
```

And test cases are structured as `ScholarlyValidationCaseV2`:

```ts
interface ScholarlyValidationCaseV2 {
  id: string;
  input: string;
  profile: ProfileId;
  category: ScholarlyCategory;
  expected: ScholarlyValidationExpectationV2;
  provenance: ValidationProvenance;
  tags?: string[];
}
```

Corpus containers are versioned with `schemaVersion: 2`:

```ts
interface SingleValidationCorpusV2 {
  schemaVersion: 2;
  metadata: CorpusMetadata;
  cases: ScholarlyValidationCaseV2[];
}
```

---

## 4. Disposition Semantics in V2

### A. `FINAL`
Used when scholarly consensus or reference evidence establishes authoritative ground truth.

For every `FINAL` case, **BOTH dimensions must be explicitly specified**:
1. **Scholarly Canonical Transliteration:** Exactly one of `scholarlyCanonical` or `allowedScholarlyCanonicals`.
2. **Rendered Output:** Exactly one of `renderedOutput` or `allowedRenderedOutputs`.

- Neither dimension may be inferred from the other (even when the strings are identical, e.g., in `ijmes_full`).
- Both strings must be non-empty, trimmed, and free of Persian/Arabic script.
- Both dimensions are validated independently against the engine's derived canonical state and rendered presentation output.

### B. `REVIEW_REQUIRED`
Used when an input is unvocalized, ambiguous, or contains context-dependent structures where automatic authority must be blocked.

- Must **NOT** contain authoritative `scholarlyCanonical`, `allowedScholarlyCanonicals`, `renderedOutput`, or `allowedRenderedOutputs`.
- May specify `requiredIssueTypes` and `forbiddenIssueTypes`.
- If the engine produces copyable output, the case is evaluated as `UNDER_BLOCKED`.
- If the engine safely blocks authority with non-copyable state, review issue types are validated.

### C. `UNRESOLVED`
Used when lexical coverage is absent or evidence is intentionally insufficient.

- Must **NOT** contain authoritative `scholarlyCanonical`, `allowedScholarlyCanonicals`, `renderedOutput`, or `allowedRenderedOutputs`.
- If the engine produces copyable output, the case is evaluated as `UNDER_BLOCKED`.
- If the engine safely blocks authority, the case is evaluated as `CORRECT_UNRESOLVED`.

---

## 5. Canonical Output Derivation Algorithm

In Validation V2, canonical truth is not read from `result.output` (which reflects publication rendering). Instead, it is derived directly from the token state using `deriveScholarlyCanonicalOutput(result: TransliterationResult)`:

1. **Persian Transliterated Tokens (`persian-word`):**
   - Uses `token.canonicalTransliteration` (which preserves all scholarly diacritics and confirmed izāfat).
   - If `canonicalTransliteration` is `null` or missing, derivation fails closed and returns `null`.
2. **Structural & Non-Transliterated Tokens (`whitespace`, `punctuation`, `number`, `latin`):**
   - Preserves literal string representation (`token.canonicalTransliteration ?? token.rendered ?? token.normalizedSurface`).
3. **Unknown / Unresolved Tokens (`unknown`):**
   - Fails closed and returns `null`.
4. **Editorial & Profile Independence:**
   - Does **not** apply title profile transformations (e.g. proper noun diacritic stripping, capitalization).

---

## 6. Exact Comparison & Evaluation Rules

The V2 evaluator `evaluateSingleCaseV2(testCase, result)` operates as follows:

1. **Safety / Authority Gate:**
   - If `disposition === 'FINAL'` but `result.copyable === false`, returns `OVER_BLOCKED`.
   - If `disposition !== 'FINAL'` and `result.copyable === true`, returns `UNDER_BLOCKED`.
2. **Canonical Comparison:**
   - Compares derived canonical output against expected canonicals using strict Unicode NFC equality (`normalize('NFC')`).
3. **Rendered Comparison:**
   - Compares `result.output` against expected rendered outputs using strict Unicode NFC equality.
4. **Classification:**
   - Returns `CORRECT_AUTHORITATIVE` **only if BOTH canonical and rendered expectations match**.
   - If either fails, returns `FALSE_AUTHORITATIVE` with explicit reason tags:
     - `CANONICAL_MISMATCH`: Scholarly canonical output deviated from gold canonical.
     - `RENDERING_MISMATCH`: Publication rendered output deviated from gold rendered output.

---

## 7. Future Migration Sequence

1. **Phase 4.6B Canonical Contract & V2 Infrastructure (Current PRs):**
   - Define architectural contract (PR #15).
   - Implement isolated Validation V2 types, schemas, derivation helper, and evaluator (PR #16).
2. **Phase 4.6B Systematic 108-Case Re-Audit (Future PR):**
   - Audit all 108 benchmark candidates to explicitly define both `goldCanonical` and `goldRendered`.
   - Migrate benchmark dataset to V2 schema format.
3. **Human Governance Sign-Off (Future PR):**
   - Complete human review checklist in `HUMAN_SIGNOFF.md`.
   - Freeze gold dataset.
4. **Phase 4.6C Engine Evaluation (Future PR):**
   - Evaluate engine against re-audited V2 gold benchmark.
