# Phase 4.6 Governance, Remediation & Release Status

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
- PR #28 — post-baseline deterministic reviewed-authority remediation; merge commit `5cd6ba47c8cbd57ff2e948ace26b451df52c8134`.
- PR #29 — authority-independent release portability / anti-overreach gate; merge commit `fc18a486f5ad78a229a59d7e2cf56da28e123023`.

## Closed without merge

- PR #27 — narrow lexical-ambiguity remediation; superseded by the broader merged PR #28.
- PR #30 — temporary framework-upgrade experiment; superseded by the clean security branch/PR #31.

## Frozen scholarly gold

- artifact: `validation/corpus/phase4.6b-external-benchmark.v2.json`
- exact frozen Git blob: `be46b312e2cb82cc4ec0f95ed1c019f8f5e27162`
- promoted gold version: `2.0.0`
- human governance decision: `APPROVE`
- cases: 108 = 103 `FINAL` + 5 `REVIEW_REQUIRED` + 0 `UNRESOLVED`
- case-level primary provenance: OpenAI GPT-5.6 Sol / `AI_SPECIALIST`

Frozen gold is immutable for runtime remediation.

## Independent Phase 4.6C baseline — completed before remediation

PR #26 measured the engine against frozen gold before benchmark-derived reviewed authority was introduced.

| Classification | Count |
|---|---:|
| `CORRECT_AUTHORITATIVE` | 5 |
| `FALSE_AUTHORITATIVE` | **0** |
| `CORRECT_REVIEW_REQUIRED` | 0 |
| `OVER_BLOCKED` | 98 |
| `UNDER_BLOCKED` | **0** |
| `ISSUE_TYPE_MISMATCH` | 5 |
| `INVALID_GOLD_CASE` | 0 |

This remains the independent pre-remediation measurement. It must not be rewritten after remediation.

## Post-remediation frozen regression — current

After PR #28, the human-approved 108-case artifact is a frozen **regression suite**, not an unseen post-remediation benchmark.

Hard gate:

`npm run validate:v2-regression`

Required result:

- 103/103 `CORRECT_AUTHORITATIVE`
- 5/5 `CORRECT_REVIEW_REQUIRED`
- `FALSE_AUTHORITATIVE = 0`
- `OVER_BLOCKED = 0`
- `UNDER_BLOCKED = 0`
- `ISSUE_TYPE_MISMATCH = 0`
- `INVALID_GOLD_CASE = 0`

## Independent anti-overreach evidence — merged

PR #29 adds `npm run validate:portability` over 13 cases with zero exact-key overlap with frozen reviewed authority:

- 8 compositional positives;
- 5 fail-closed negatives;
- frozen-authority overlap = 0.

This supports a narrow portability / non-leakage claim and is not presented as a broad unseen scholarly accuracy benchmark.

## Current release hardening — PR #31

PR #31 (`security/next16-active-lts-clean`) is the clean dependency/security migration from the current `main` baseline.

Validated migration target:

- Next.js `16.3.8` (Active LTS security release)
- React / React DOM `19.3.0`
- Vitest `4.1.11`
- `oxlint` `1.86.0` as development-only lint tooling
- legacy `eslint` / `eslint-config-next` chain removed

The migration has already passed, on a reproducible GitHub Actions runner:

- full unit tests;
- frozen V2 regression;
- release portability gate;
- existing pilot corpus;
- typecheck;
- lint;
- production build;
- `npm audit --audit-level=high`.

PR #31 also makes the high/critical dependency audit a permanent CI gate.

## Remaining release gates

1. Review and merge PR #31 only if final exact-head CI is green and the temporary regeneration workflow is absent from the final diff.
2. Verify post-merge CI on `main`.
3. Finalize release documentation and package/application versioning.
4. Create the release/tag only after the release commit itself passes the complete CI/security suite.

Primary safety invariants remain:

- `FALSE_AUTHORITATIVE = 0`
- `UNDER_BLOCKED = 0`
- frozen gold is not changed to improve engine metrics
- post-remediation regression is not represented as an unseen benchmark
