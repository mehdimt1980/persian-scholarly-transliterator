# Release Readiness & Scholarly Validation Framework

## 1. Release Philosophy

In scholarly transliteration for Iranian studies and Islamic history, the primary operational risk is **silent corruption of authority**.

A system that refuses to guess or demands human review when ambiguous retains 100% academic integrity. A system that outputs a plausible-looking but incorrect transliteration corrupts citations, search indices, library catalogs, and dissertation prose.

Therefore, our release gates enforce:
```text
FALSE_AUTHORITATIVE === 0
UNDER_BLOCKED === 0
INVALID_GOLD_CASES === 0
```

---

## 2. Safety vs. Coverage Separation

Metrics strictly separate safe behavior from coverage limitations:

- **Safety (Primary)**:
  - `CORRECT_AUTHORITATIVE`: Expected final transliteration produced authoritatively.
  - `CORRECT_REVIEW_REQUIRED`: Ambiguous/unvocalized input blocked for human review.
  - `CORRECT_UNRESOLVED`: Unattested input left safely unresolved.
  - `OVER_BLOCKED`: Input that could theoretically be transliterated is conservatively blocked. (Coverage limitation, NOT an authority failure).
- **Unsafe Failures (Zero-Tolerance Gates)**:
  - `FALSE_AUTHORITATIVE`: Engine generates copyable output that conflicts with gold scholarly truth.
  - `UNDER_BLOCKED`: Ambiguous or unattested input is silently made copyable without review.

---

## 3. Release Readiness Levels

The system evaluates readiness across four states:

1. `BLOCKED`: At least one safety violation (`FALSE_AUTHORITATIVE > 0` or `UNDER_BLOCKED > 0` or `INVALID_GOLD_CASE > 0`). Release is strictly blocked.
2. `PILOT_PASS`: All safety gates pass on the pilot corpus (`pilot-v1`).
3. `REAL_CORPUS_REQUIRED`: Pilot passed, but a comprehensive real-world dissertation corpus (100–200 items) is mandatory before release candidate declaration.
4. `RC_READY`: All safety gates pass on the full real-world scholarly corpus with verified multi-domain coverage.

---

## 4. Initial Pilot Baseline Report

- **Corpus ID**: `pilot.single` & `pilot.bibliography` (`pilot-v1`)
- **Total Cases**: 49 (46 single-item cases + 3 batch bibliography records)
- **Results**:
  - `Correct Authoritative`: 43
  - `Correct Review-Required`: 5
  - `Correct Unresolved`: 1
  - `Over-Blocked`: 0
  - `FALSE AUTHORITATIVE`: 0
  - `UNDER-BLOCKED`: 0
  - `Safe Behavior Rate`: 100.0% (49/49)
  - `Authoritative Exact-Match Rate`: 100.0% (43/43)
  - **Release Gate Status**: `PASS (PILOT_PASS)`

---

## 5. Next Steps for Real-World Expansion

The pilot corpus verifies validation mechanics. Phase 4.5 next steps:
1. Expand to a 100–200 case gold corpus extracted from real dissertation source materials (Qajar constitutional texts, Majlis debates, reform treatises, legal fatwas, historical monographs).
2. Maintain strict scholarly provenance for every newly added lemma and relation.
3. Conduct failure triage across the 12 documented categories before any lexical expansion.
