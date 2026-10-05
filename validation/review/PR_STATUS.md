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
- PR #31 — Next.js 16 Active LTS security/toolchain migration and permanent high/critical audit gate; merge commit `f914cfc03b4ea010b05f8f865f3b0b27e173b8d8`.
- PR #32 — `v0.2.0` package/version, README milestone, and evidence-backed release notes; merge commit `2ba4acfcb0165e416dfea5c7407d028f97e83ddc`.

## Closed without merge

- PR #27 — narrow lexical-ambiguity remediation; superseded by the broader merged PR #28.
- PR #30 — temporary framework-upgrade experiment; superseded by the clean merged PR #31.

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

This remains the independent pre-remediation measurement and is not rewritten after remediation.

## Post-remediation frozen regression

After PR #28, the human-approved 108-case artifact is a frozen **regression suite**, not an unseen post-remediation benchmark.

Current hard-gate result:

- 103/103 `CORRECT_AUTHORITATIVE`
- 5/5 `CORRECT_REVIEW_REQUIRED`
- `FALSE_AUTHORITATIVE = 0`
- `OVER_BLOCKED = 0`
- `UNDER_BLOCKED = 0`
- `ISSUE_TYPE_MISMATCH = 0`
- `INVALID_GOLD_CASE = 0`

## Authority-independent anti-overreach evidence

PR #29 adds `npm run validate:portability` over 13 cases with zero exact-key overlap with frozen reviewed authority:

- 8 compositional positives;
- 5 fail-closed negatives;
- frozen-authority overlap = 0.

This supports a narrow portability / non-leakage claim and is not presented as a broad unseen scholarly accuracy benchmark.

## Release security state

The `v0.2.0` release line uses:

- Next.js `16.3.8`;
- React / React DOM `19.3.0`;
- Vitest `4.1.11`;
- development-only oxlint `1.86.0`;
- no legacy `eslint` / `eslint-config-next` dependency chain.

CI permanently enforces `npm audit --audit-level=high`.

## v0.2.0 repository release state

Repository-internal release gates are complete for version `0.2.0`:

- package and lockfile are synchronized at `0.2.0`;
- release notes are committed at `docs/RELEASE_v0.2.0.md`;
- PR #32 exact-head CI passed the complete validation/security/build suite;
- post-merge CI run `37303893764` on merge commit `2ba4acfcb0165e416dfea5c7407d028f97e83ddc` also passed the complete suite;
- frozen scholarly gold was not modified during release preparation.

The Git tag and GitHub Release `v0.2.0` must point to a final `main` commit that preserves this verified repository state. Creating the tag/release is release metadata, not permission to alter scholarly gold or relax any gate.

Primary safety invariants remain:

- `FALSE_AUTHORITATIVE = 0`
- `UNDER_BLOCKED = 0`
- frozen gold is not changed to improve engine metrics
- genuine ambiguity remains review-required rather than guessed
- post-remediation regression is not represented as an unseen accuracy benchmark
