# Phase 4.6B — Human Governance Sign-Off

> [!IMPORTANT]
> **APPROVED — SUBJECT TO VALIDATED GOLD-FREEZE MANIFEST**
>
> Human governance approval was explicitly provided on 2026-10-05 by the repository owner identity `@mehdimt1980` through the connected ChatGPT/GitHub workflow.
>
> This approval does **not** claim that the human reviewer personally re-adjudicated all 108 cases. Primary case-by-case reviewer provenance remains OpenAI GPT-5.6 Sol / `AI_SPECIALIST`.
>
> The benchmark is considered frozen only when `validation/review/gold-freeze.v2.json` exists and `npm run validate:gold-freeze` passes against the exact approved benchmark payload.

## Purpose

This is the human governance layer over the consolidated Validation V2 benchmark:

- `validation/corpus/phase4.6b-external-benchmark.v2.json`
- `validation/review/reaudit-worklist.v2.json`
- `validation/review/CONSOLIDATED_V2_BENCHMARK.md`
- `validation/review/SIGNOFF_PACKET_V2.md`
- `validation/review/CANONICAL_RENDERING_CONTRACT.md`
- `validation/V2_SCHEMA.md`

Primary case-by-case adjudication was performed by OpenAI GPT-5.6 Sol with reviewer type `AI_SPECIALIST`. Human sign-off does **not** relabel those case-level decisions as human-authored. It approves the governance basis, representative/high-risk decisions, preserved ambiguity, provenance model, consolidation integrity, and readiness to freeze the benchmark.

## What approval means

The human reviewer accepts the consolidated V2 benchmark as the scholarly gold candidate for freeze after reviewing the policy and representative/high-risk material in `SIGNOFF_PACKET_V2.md`.

Approval does **not** mean:

- the human reviewer personally re-adjudicated every one of the 108 cases;
- AI specialist provenance may be removed or rewritten;
- current engine behavior has already been validated against the benchmark;
- runtime gaps may be repaired by changing gold;
- the five `REVIEW_REQUIRED` cases may be forced into single readings;
- Phase 4.6C has already run.

## Governance assertions approved

- [x] I approve the separation between **scholarly canonical transliteration** and **publication rendering**.
- [x] I approve reading/identity evidence as distinct from IJMES rendering-policy evidence.
- [x] I approve Cambridge IJMES as the publication-rendering authority used by this benchmark.
- [x] I approve the applied Persian transliteration conventions, including Persian `i/u`, scholarly consonantal distinctions, written diphthong handling where applicable, consonant-final izāfat `-i`, and post-vocalic/linker `-yi`.
- [x] I approve source-faithfulness: the exact supplied Persian surface is adjudicated rather than silently replaced by an alias, translation, or expanded identity.
- [x] I approve the rule that IJMES Word List or established English-facing forms belong to the **rendering layer** and do not overwrite scholarly canonical truth.
- [x] I approve `REVIEW_REQUIRED` as a successful gold outcome when an unvocalized Persian surface supports materially different readings.
- [x] I approve the invariant that gold may not later be changed merely to improve engine metrics.
- [x] I approve preservation of AI specialist reviewer provenance after human governance approval.

## Benchmark integrity assertions approved

- [x] I confirm the benchmark contains 108 cases: 103 `FINAL`, 5 `REVIEW_REQUIRED`, 0 `UNRESOLVED`.
- [x] I confirm all 108 specialist reviews are complete and 0 cases remain pending.
- [x] I confirm the five `REVIEW_REQUIRED` IDs are exactly `cand-amb-001`, `cand-amb-003`, `cand-amb-007`, `cand-amb-009`, and `cand-amb-011`.
- [x] I confirm non-final cases contain no authoritative `scholarlyCanonical` or `renderedOutput`.
- [x] I confirm the consolidated artifact is deterministically generated from the completed worklist and guarded by `npm run validate:v2-benchmark`.
- [x] I confirm historical V1 adjudication remains `HISTORICAL_ONLY` and is not the authority for V2 scholarly truth.
- [x] I confirm `engineEvaluationPerformed = false` at the time of freeze and that the benchmark was established before Phase 4.6C engine evaluation.

## Representative/high-risk review approved

The review packet specifically exposed:

- scholarly canonical vs publication rendering for `زکات` and `عاشورا`;
- `Ṣādiq Hidāyat` vs `Sadeq Hedayat`;
- explicit Persian izāfat in `Malik al-Shuʿarā-yi Bahār`;
- source-faithful place canonicals vs accepted English renderings (`Takht-i Jamshīd` → `Persepolis`, `Pāsārgād` → `Pasargadae`);
- title morphology and izāfat (`Safarnāma-yi Nāṣir-i Khusraw`, `Chashm-hā-yash`);
- the five deliberately unresolved homographs.

- [x] I have reviewed the representative/high-risk packet and do not see a material scholarly or governance blocker to gold freeze.

## Runtime-gap acknowledgment approved

The benchmark intentionally describes scholarly truth independently from current engine capability. V2 may expose publication-rendering or profile gaps in the present runtime.

- [x] I understand that Phase 4.6C may expose runtime/profile gaps even when the benchmark is correct.
- [x] I approve fixing runtime behavior after frozen-benchmark evaluation rather than rewriting benchmark truth to match current implementation.

## Sign-off declaration

**Human reviewer:** `@mehdimt1980`

**Role / basis of review:** Repository owner / human governance reviewer; governance, policy, representative/high-risk cases, ambiguity preservation, provenance model, and consolidation integrity.

**Date:** 2026-10-05

**Decision:** `APPROVE`

**Notes:** Approval was explicitly provided in the connected ChatGPT/GitHub workflow. It authorizes the separate gold-freeze promotion while permanently retaining OpenAI GPT-5.6 Sol / `AI_SPECIALIST` as the primary case-level reviewer provenance. It does not claim human case-by-case re-adjudication of all 108 cases.

## Machine-readable sign-off

The structured approval record is:

`validation/review/human-signoff.v2.json`

After freeze, integrity is enforced by:

```bash
npm run validate:v2-benchmark
npm run validate:gold-freeze
```

Only a successfully validated frozen benchmark authorizes Phase 4.6C engine evaluation.
