# Release Readiness & Scholarly Validation Framework

## 1. Release Philosophy

In scholarly transliteration for Iranian studies and Islamic history, the primary operational risk is **silent corruption of authority**.

A system that refuses to guess or demands human review when ambiguous retains 100% academic integrity. A system that outputs a plausible-looking but incorrect transliteration corrupts citations, search indices, library catalogs, and dissertation prose.

Therefore, our release gates enforce:
```text
FALSE_AUTHORITATIVE === 0
UNDER_BLOCKED === 0
INVALID_GOLD_CASES === 0
DEFAULT_LEXICON_INTEGRITY === VALID
```

---

## 2. Safety vs. Coverage Separation

Metrics strictly separate safe behavior from coverage limitations:

- **Safe Behaviors (Counted in Safe Behavior Rate)**:
  - `CORRECT_AUTHORITATIVE`: Expected final transliteration produced authoritatively.
  - `CORRECT_REVIEW_REQUIRED`: Ambiguous/unvocalized input blocked for human review.
  - `CORRECT_UNRESOLVED`: Unattested input left safely unresolved.
  - `OVER_BLOCKED`: Input that could theoretically be transliterated is conservatively blocked. (Coverage limitation, NOT an authority failure).
- **Unsafe / Mismatch Failures (Excluded from Safe Behavior)**:
  - `FALSE_AUTHORITATIVE`: Engine generates copyable output that conflicts with gold scholarly truth.
  - `UNDER_BLOCKED`: Ambiguous or unattested input is silently made copyable without review.
  - `ISSUE_TYPE_MISMATCH`: Review issue detected, but the required issue type does not match gold expectations.
  - `INVALID_GOLD_CASE`: Malformed or self-contradictory gold fixture definition.

---

## 3. Corpus Maturity and Release Target Model

To prevent arbitrary non-pilot corpora from falsely claiming release readiness, release gating strictly separates **Safety Gate Evaluation** (`safetyPassed`) from **Target Satisfaction** (`targetSatisfied`):

```ts
type CorpusTier = 'PILOT' | 'REAL_DISSERTATION';
type ReleaseTarget = 'PILOT' | 'RC';
type CorpusReviewStatus = 'SOURCE_BACKED_FIXTURE' | 'HUMAN_REVIEWED';

interface ReleaseGateResult {
  readiness: ReleaseReadiness;
  safetyPassed: boolean;
  targetSatisfied: boolean;
  passed: boolean; // passed === targetSatisfied
  violations: string[];
  blockers: string[];
  metrics: CombinedValidationMetrics;
  context: ReleaseGateContext;
}
```

### State Semantics:
- **`BLOCKED`**:
  - `safetyPassed = false`, `targetSatisfied = false`
  - Triggered by any safety violation (`FALSE_AUTHORITATIVE > 0`, `UNDER_BLOCKED > 0`, `INVALID_GOLD_CASE > 0`, lexicon repository integrity failure, or empty validation corpus).
- **`PILOT_PASS` (Target = PILOT)**:
  - `safetyPassed = true`, `targetSatisfied = true`
  - All safety gates pass on a valid pilot corpus (`PILOT` tier).
- **`REAL_CORPUS_REQUIRED` (Target = RC)**:
  - `safetyPassed = true`, `targetSatisfied = false`
  - Safety gates pass on pilot or fixture data, but a comprehensive real-world dissertation corpus with `HUMAN_REVIEWED` status is mandatory before release candidate declaration. The CLI exits with a non-zero code to block premature release.
- **`RC_READY` (Target = RC)**:
  - `safetyPassed = true`, `targetSatisfied = true`
  - All safety gates pass on a non-empty `REAL_DISSERTATION` corpus with verified `HUMAN_REVIEWED` status (reviewer identity and review date recorded).

---

## 4. Corpus Manifest Architecture & Coherence

Validation runner uses corpus manifests to configure datasets without hardcoding filenames or inferring authority:

```json
{
  "id": "pilot-v1",
  "version": "1.0.0",
  "description": "Scholarly transliteration source-backed pilot validation fixtures",
  "tier": "PILOT",
  "reviewStatus": "SOURCE_BACKED_FIXTURE",
  "single": "pilot.single.json",
  "bibliography": "pilot.bibliography.json"
}
```

### Manifest / Corpus Metadata Coherence
The validation harness strictly verifies metadata coherence between the manifest and loaded corpus files:
- `single.metadata.tier === manifest.tier`
- `single.metadata.reviewStatus === manifest.reviewStatus`
- `bibliography.metadata.tier === manifest.tier`
- `bibliography.metadata.reviewStatus === manifest.reviewStatus`
- For `HUMAN_REVIEWED` status, `reviewer` and `reviewedAt` must also match.
- Mismatches or declared files that do not exist trigger immediate fatal failure (`CORPUS_MANIFEST_METADATA_MISMATCH` or `CORPUS_FILE_NOT_FOUND`).

### CLI execution:
```bash
# Validate default pilot manifest (target PILOT, exits 0 on PILOT_PASS)
npm run validate:corpus

# Validate pilot manifest targeting RC (target RC, exits 1 on REAL_CORPUS_REQUIRED)
npm run validate:corpus -- --target RC

# Validate arbitrary dissertation manifest
npm run validate:corpus -- --manifest validation/corpus/dissertation.manifest.json --target RC
```

---

## 5. Pilot Baseline Report

- **Composition**:
  - Single Items: `pilot.single` (46 cases)
  - Bibliography Records: `pilot.bibliography` (3 records)
  - Total: 49 cases
- **Review Status**: `SOURCE_BACKED_FIXTURE` (Source-backed pilot validation fixtures; establishes validation mechanics and regression baseline, not independent real-world accuracy).
- **Results**:
  - `Correct Authoritative`: 43 (41 single + 2 bib)
  - `Correct Review-Required`: 5 (4 single + 1 bib)
  - `Correct Unresolved`: 1 (1 single + 0 bib)
  - `Over-Blocked`: 0
  - `FALSE AUTHORITATIVE`: 0
  - `UNDER-BLOCKED`: 0
  - `Issue Type Mismatch`: 0
  - `Invalid Gold Cases`: 0
  - `Safe Behavior Rate`: 100.0% (49/49)
  - `Single Authoritative Exact-Match Rate`: 100.0% (41/41)
  - **Safety Gate**: `PASS`
  - **Requested Target**: `PILOT`
  - **Target Satisfaction**: `PASS`
  - **Readiness State**: `PILOT_PASS`

---

## 6. Category Coverage & Expansion Targets

### Represented Single Categories in Pilot (46 cases):
- `TERM` (8 cases)
- `PLACE` (5 cases)
- `INSTITUTION` (2 cases)
- `LEGAL_TERM` (4 cases)
- `RELIGIOUS_TERM` (8 cases)
- `COMPOUND` (2 cases)
- `MORPHOLOGY` (7 cases)
- `IZAFAT` (3 cases)
- `AMBIGUITY` (4 cases)
- `MIXED_SCRIPT` (2 cases)
- `OTHER` (1 case)

### Missing Single Categories (Targets for Real Dissertation Corpus):
- `PERSON` (Personal names under IJMES full and title profiles)
- `BOOK_TITLE` (Single monograph titles under IJMES title profile)
- `ARTICLE_TITLE` (Periodical article titles under IJMES title profile)
