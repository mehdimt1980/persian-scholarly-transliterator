# Phase 4.6 Governance & Benchmark Status

## Completed and merged

- PR #13 — historical V1 adjudication.
- PR #14 — governance/CI repair.
- PR #15 — canonical-vs-publication-rendering contract.
- PR #16 — Validation V2 canonical/rendering separation.
- PR #17 — blind V2 re-audit protocol and 108-case worklist scaffold.
- PR #18 — Batch A (`TERM` + `RELIGIOUS_TERM`).
- PR #19 — Batch B (`COMPOUND` + `MORPHOLOGY` + `IZAFAT`).
- PR #20 — Batch C (`PERSON` + `PLACE` + `INSTITUTION`).
- PR #21 — Batch D (`BOOK_TITLE`).
- PR #22 — Batch E (`AMBIGUITY`).
- PR #23 — deterministic consolidation into Validation V2.
- PR #24 — V2 human-governance sign-off readiness packet.
- PR #25 — explicit human governance `APPROVE` and external-manifest gold freeze; merge commit `4d50f30d52eb6e878058c2d7fcb2c282a291fcbc`.
- PR #26 — independent pre-remediation Phase 4.6C frozen baseline; merge commit `b644c2a1c0159545d16838db061015f7a16c0390`.

## Frozen scholarly gold

- artifact: `validation/corpus/phase4.6b-external-benchmark.v2.json`
- exact frozen Git blob: `be46b312e2cb82cc4ec0f95ed1c019f8f5e27162`
- promoted gold version: `2.0.0`
- human governance decision: `APPROVE`
- cases: 108 = 103 `FINAL` + 5 `REVIEW_REQUIRED` + 0 `UNRESOLVED`
- case-level primary provenance: OpenAI GPT-5.6 Sol / `AI_SPECIALIST`

Frozen gold is immutable for runtime remediation.

## Independent Phase 4.6C baseline — completed before remediation

PR #26 measured the current engine against the frozen benchmark before any benchmark-derived runtime authority was introduced.

| Classification | Count |
|---|---:|
| `CORRECT_AUTHORITATIVE` | 5 |
| `FALSE_AUTHORITATIVE` | **0** |
| `CORRECT_REVIEW_REQUIRED` | 0 |
| `OVER_BLOCKED` | 98 |
| `UNDER_BLOCKED` | **0** |
| `ISSUE_TYPE_MISMATCH` | 5 |
| `INVALID_GOLD_CASE` | 0 |

- authoritative exact-match rate: `5 / 103 = 4.85%`
- safe-behavior rate: `103 / 108 = 95.37%`
- canonical mismatches among authoritative outputs: 0
- rendering mismatches among authoritative outputs: 0
- dominant gap: over-blocked coverage / generic `UNKNOWN_TOKEN`
- historical measurement artifact: `validation/review/phase4.6c-baseline.v1.json`

The five issue-type mismatches are exactly the frozen `REVIEW_REQUIRED` ambiguity cases; they were safely blocked but surfaced `UNKNOWN_TOKEN` instead of `LEXICAL_AMBIGUITY`.

## Current open work — PR #28

PR #28 (`phase4.6c/reviewed-authority-promotion`) is a **post-baseline remediation** change.

It proposes a deterministic reviewed-authority layer sourced from the already human-approved frozen V2 decisions.

Authority boundary:

1. exact normalized Persian input + exact profile only;
2. no fuzzy, substring, prefix, edit-distance, or semantic matching;
3. FINAL entries return the frozen scholarly canonical and publication rendering independently;
4. the five frozen ambiguity entries remain non-copyable `LEXICAL_AMBIGUITY` cases;
5. custom `LexiconRepository` execution bypasses the frozen authority layer;
6. misses continue through the previous fail-closed compositional pipeline.

No frozen-gold file or scholarly answer is modified by PR #28.

## Evaluation semantics after PR #28

The 108-case benchmark was independent for the PR #26 baseline.

If reviewed decisions are promoted into runtime authority, that same 108-case artifact becomes a **frozen regression suite**, not an unseen post-remediation accuracy set. This distinction must remain explicit in release claims.

PR #28 adds the hard regression command:

`npm run validate:v2-regression`

It requires 103/103 authoritative exact matches, 5/5 correctly blocked review-required cases, and zero false-authoritative / under-blocked / mismatch classifications.

## Remaining release gates

1. Review PR #28 exact diff and exact-head CI; merge only if full regression and existing pilot gates pass.
2. Verify post-merge CI on `main`.
3. Add **independent anti-overreach / held-out evidence** that is not the promoted 108-case authority set.
4. Confirm near misses, wrong profiles, unrelated unknown Persian, and custom-lexicon paths remain fail-closed/isolated.
5. Resolve dependency/security findings before release, including the currently warned Next.js version and npm audit findings.
6. Rerun all frozen regressions, pilot validation, held-out checks, typecheck, lint, and production build.
7. Complete release documentation/versioning and create the release only after those gates pass.

Primary safety invariants remain:

- `FALSE_AUTHORITATIVE = 0`
- `UNDER_BLOCKED = 0`
- frozen gold is not changed to improve engine metrics.
