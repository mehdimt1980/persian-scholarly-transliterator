# Phase 4.6C — Reviewed Authority Promotion

## Purpose

This remediation follows the independently recorded frozen baseline in PR #26.

The baseline was measured **before** any benchmark-derived runtime authority was introduced:

- 108 frozen cases
- 103 FINAL
- 5 REVIEW_REQUIRED
- 5 CORRECT_AUTHORITATIVE
- 98 OVER_BLOCKED
- 5 ISSUE_TYPE_MISMATCH
- 0 FALSE_AUTHORITATIVE
- 0 UNDER_BLOCKED

The dominant failure was coverage (`UNKNOWN_TOKEN`), not incorrect authoritative transliteration.

## What this change does

After the baseline measurement, the human-approved frozen V2 decisions are promoted into a deterministic reviewed-authority layer used by the default runtime.

The authority layer is deliberately narrow:

1. lookup is by **exact normalized Persian input + exact profile**;
2. there is no fuzzy, substring, prefix, suffix, edit-distance, or semantic matching;
3. FINAL reviewed entries supply both the frozen scholarly canonical form and frozen publication rendering;
4. the five REVIEW_REQUIRED entries remain non-copyable lexical ambiguities and expose `LEXICAL_AMBIGUITY` with the reviewed non-authoritative alternatives;
5. explicit human review can select an ambiguity reading without changing its automatic ambiguous snapshot;
6. callers that supply a custom `LexiconRepository` bypass this authority layer entirely;
7. any input not exactly covered falls through unchanged to the existing lexicon/morphology/review pipeline.

## Frozen-gold boundary

This PR does **not** modify:

`validation/corpus/phase4.6b-external-benchmark.v2.json`

Frozen source Git blob remains:

`be46b312e2cb82cc4ec0f95ed1c019f8f5e27162`

Promoted gold version remains:

`2.0.0`

The authority layer checks the existing gold-freeze manifest before loading reviewed authority.

## Evaluation semantics after promotion

The 108-case Phase 4.6B/4.6C benchmark was an independent evaluation set for the pre-remediation baseline.

Once its reviewed decisions are promoted into runtime authority, it must **not** be described as an unseen post-remediation test set. From this PR onward it is a frozen regression suite proving that the reviewed authority has not regressed.

Therefore post-remediation evidence is separated into:

- **historical independent baseline:** PR #26 / `phase4.6c-baseline.v1.json`;
- **frozen regression:** `npm run validate:v2-regression`;
- **independent post-remediation generalization evidence:** must come from separate held-out/portability tests before release.

## Regression gate

`npm run validate:v2-regression` fails unless the frozen suite produces exactly:

- 103 `CORRECT_AUTHORITATIVE`
- 5 `CORRECT_REVIEW_REQUIRED`
- 0 `FALSE_AUTHORITATIVE`
- 0 `OVER_BLOCKED`
- 0 `UNDER_BLOCKED`
- 0 `ISSUE_TYPE_MISMATCH`
- 0 `INVALID_GOLD_CASE`
- 100% authoritative exact-match rate
- 100% safe-behavior rate
- 0 canonical mismatches
- 0 rendering mismatches

This is a regression contract, not an independent accuracy estimate.

## Anti-overreach requirements

Before release, separate tests must verify at minimum:

- near-miss Persian strings do not inherit authority;
- wrong profiles do not inherit profile-specific authority;
- custom lexicon execution remains isolated;
- unrelated unknown Persian remains fail-closed;
- the existing 49-case pilot continues to pass;
- a separate held-out set or equivalent independent portability evidence is reported honestly.

## Provenance

The runtime authority remains traceable to:

- human-approved frozen gold version `2.0.0`;
- exact frozen benchmark blob;
- original source citations carried by each V2 case;
- permanent case-level `AI_SPECIALIST` provenance plus human governance approval.

No benchmark answer is rewritten to fit engine behavior.
