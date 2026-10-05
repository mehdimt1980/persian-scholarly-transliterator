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
- PR #23 — deterministic consolidation into Validation V2; merged at `cc4cf4e557591a81f995d56765508a7dc0b08155`.
- PR #24 — V2 human-governance sign-off readiness packet; merged at `4420f7b4c2c1ae3724923e67ac50ce58eff0efa3`.
- PR #25 — explicit human governance approval and external-manifest gold freeze; merged at `4d50f30d52eb6e878058c2d7fcb2c282a291fcbc`.

## Frozen scholarly gold

- reviewed source artifact: `validation/corpus/phase4.6b-external-benchmark.v2.json`
- exact frozen Git blob: `be46b312e2cb82cc4ec0f95ed1c019f8f5e27162`
- promoted scholarly gold version: `2.0.0`
- human sign-off: `validation/review/human-signoff.v2.json`
- freeze manifest: `validation/review/gold-freeze.v2.json`
- integrity gate: `npm run validate:gold-freeze`
- cases: 108 = 103 `FINAL` + 5 `REVIEW_REQUIRED` + 0 `UNRESOLVED`
- case-level primary reviewer provenance: OpenAI GPT-5.6 Sol / `AI_SPECIALIST`
- human governance decision: `APPROVE` by `@mehdimt1980` on 2026-10-05

The source benchmark payload remains unchanged after review. Promotion/freeze state is externalized so the exact reviewed bytes remain auditable.

## Current open gate — Phase 4.6C frozen baseline

PR #26 introduces a measurement-only evaluation runner. No remediation or gold change is included.

The first frozen baseline was executed on runner HEAD:

`9d3ca9eb407d1bb03dc2df4017b8a5f6715c7191`

GitHub Actions run:

`37292803825` (#136) — **PASS**

### Baseline summary

| Classification | Count |
|---|---:|
| `CORRECT_AUTHORITATIVE` | 5 |
| `FALSE_AUTHORITATIVE` | **0** |
| `CORRECT_REVIEW_REQUIRED` | 0 |
| `OVER_BLOCKED` | 98 |
| `UNDER_BLOCKED` | **0** |
| `ISSUE_TYPE_MISMATCH` | 5 |
| `INVALID_GOLD_CASE` | 0 |

Additional metrics:

- authoritative exact-match rate: `5 / 103 = 4.85%`
- safe-behavior rate: `103 / 108 = 95.37%`
- canonical mismatch count: `0`
- rendering mismatch count: `0`
- both canonical + rendering mismatch count: `0`

Machine-readable historical baseline summary:

`validation/review/phase4.6c-baseline.v1.json`

Full interpretation:

`validation/review/PHASE_4_6C_BASELINE.md`

## Baseline meaning

The current engine is conservative rather than recklessly wrong:

- it produced **zero false authoritative outputs**;
- it produced **zero under-blocked ambiguity cases**;
- every currently authoritative FINAL result matches both frozen dimensions;
- the dominant deficiency is **coverage**: 98 FINAL cases are over-blocked;
- the five frozen ambiguity cases are safely blocked but classified with generic `UNKNOWN_TOKEN` behavior instead of required `LEXICAL_AMBIGUITY` semantics.

The five issue-type mismatch IDs are exactly:

- `cand-amb-001`
- `cand-amb-003`
- `cand-amb-007`
- `cand-amb-009`
- `cand-amb-011`

## Remediation governance

Frozen gold is immutable for remediation purposes. Phase 4.6C failures may identify runtime gaps, but benchmark answers must not simply be copied into production as test-specific hardcodes.

Authoritative remediation must be source-backed and generalizable. After every remediation slice, rerun the same frozen blob and preserve:

- `FALSE_AUTHORITATIVE = 0`
- `UNDER_BLOCKED = 0`

Recommended sequence:

1. ambiguity recognition / correct `LEXICAL_AMBIGUITY` issue semantics;
2. reviewed lexical coverage;
3. productive morphology and structural coverage;
4. named-entity / publication-rendering policy;
5. title/profile rendering;
6. final frozen-benchmark regression and release-readiness documentation.

## Immediate next gate

1. Merge PR #26 only after its final documentation HEAD passes full CI.
2. Verify post-merge CI on `main`.
3. Begin remediation in separate narrow PRs; do not combine baseline measurement and remediation.
