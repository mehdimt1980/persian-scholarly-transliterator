# Phase 4.6B — Human Governance Sign-Off

> [!IMPORTANT]
> **READY FOR HUMAN GOVERNANCE REVIEW — NOT YET APPROVED**
>
> The canonical-vs-rendering contract repair, 108-case blind V2 specialist re-audit, and deterministic V2 consolidation are complete. The earlier pause condition has therefore been resolved.
>
> This document is intentionally **unsigned**. `humanSignoff` remains `null`, the benchmark remains `2.0.0-draft`, gold is not frozen, and Phase 4.6C remains blocked until an explicitly named human reviewer records a decision.

## Purpose

This is the human governance layer over the consolidated Validation V2 benchmark:

- `validation/corpus/phase4.6b-external-benchmark.v2.json`
- `validation/review/reaudit-worklist.v2.json`
- `validation/review/CONSOLIDATED_V2_BENCHMARK.md`
- `validation/review/SIGNOFF_PACKET_V2.md`
- `validation/review/CANONICAL_RENDERING_CONTRACT.md`
- `validation/V2_SCHEMA.md`

Primary case-by-case adjudication was performed by OpenAI GPT-5.6 Sol with reviewer type `AI_SPECIALIST`. Human sign-off does **not** relabel those case-level decisions as human-authored. It approves the governance basis, representative/high-risk decisions, preserved ambiguity, provenance model, and readiness to freeze the benchmark.

## What approval means

By selecting `APPROVE`, the human reviewer confirms that they have reviewed the policy and representative/high-risk material in `SIGNOFF_PACKET_V2.md` and accept the consolidated V2 benchmark as the scholarly gold candidate to be frozen in the next explicit promotion step.

Approval does **not** mean:

- the human reviewer personally re-adjudicated every one of the 108 cases;
- AI specialist provenance may be removed or rewritten;
- current engine behavior has been validated against the benchmark;
- runtime gaps may be repaired by changing gold;
- the five `REVIEW_REQUIRED` cases may be forced into single readings;
- Phase 4.6C has already run.

## Governance assertions to review

- [ ] I approve the separation between **scholarly canonical transliteration** and **publication rendering**.
- [ ] I approve reading/identity evidence as distinct from IJMES rendering-policy evidence.
- [ ] I approve Cambridge IJMES as the publication-rendering authority used by this benchmark.
- [ ] I approve the applied Persian transliteration conventions, including Persian `i/u`, scholarly consonantal distinctions, written diphthong handling where applicable, consonant-final izāfat `-i`, and post-vocalic/linker `-yi`.
- [ ] I approve source-faithfulness: the exact supplied Persian surface is adjudicated rather than silently replaced by an alias, translation, or expanded identity.
- [ ] I approve the rule that IJMES Word List or established English-facing forms belong to the **rendering layer** and do not overwrite scholarly canonical truth.
- [ ] I approve `REVIEW_REQUIRED` as a successful gold outcome when an unvocalized Persian surface supports materially different readings.
- [ ] I approve the invariant that gold may not later be changed merely to improve engine metrics.
- [ ] I approve preservation of AI specialist reviewer provenance after human governance approval.

## Benchmark integrity assertions

- [ ] I confirm the benchmark contains 108 cases: 103 `FINAL`, 5 `REVIEW_REQUIRED`, 0 `UNRESOLVED`.
- [ ] I confirm all 108 specialist reviews are complete and 0 cases remain pending.
- [ ] I confirm the five `REVIEW_REQUIRED` IDs are exactly `cand-amb-001`, `cand-amb-003`, `cand-amb-007`, `cand-amb-009`, and `cand-amb-011`.
- [ ] I confirm non-final cases contain no authoritative `scholarlyCanonical` or `renderedOutput`.
- [ ] I confirm the consolidated artifact is deterministically generated from the completed worklist and guarded by `npm run validate:v2-benchmark`.
- [ ] I confirm historical V1 adjudication remains `HISTORICAL_ONLY` and is not the authority for V2 scholarly truth.
- [ ] I confirm `engineEvaluationPerformed = false` and that the benchmark was established before Phase 4.6C engine evaluation.

## Representative/high-risk review

Review the full table and rationale in `SIGNOFF_PACKET_V2.md`, with particular attention to:

- scholarly canonical vs publication rendering for `زکات` and `عاشورا`;
- `Ṣādiq Hidāyat` vs `Sadeq Hedayat`;
- explicit Persian izāfat in `Malik al-Shuʿarā-yi Bahār`;
- source-faithful place canonicals vs accepted English renderings (`Takht-i Jamshīd` → `Persepolis`, `Pāsārgād` → `Pasargadae`);
- title morphology and izāfat (`Safarnāma-yi Nāṣir-i Khusraw`, `Chashm-hā-yash`);
- the five deliberately unresolved homographs.

- [ ] I have reviewed the representative/high-risk packet and do not see a material scholarly or governance blocker to gold freeze.

## Runtime-gap acknowledgment

The current benchmark intentionally describes scholarly truth independently from current engine capability. In particular, V2 may require publication rendering behavior for PERSON/PLACE/INSTITUTION cases that the present runtime profile model does not yet faithfully express.

- [ ] I understand that Phase 4.6C may expose runtime/profile gaps even when the benchmark is correct.
- [ ] I approve fixing runtime behavior after frozen-benchmark evaluation rather than rewriting benchmark truth to match current implementation.

## Sign-off declaration

**Leave this section blank until the reviewer explicitly decides.**

**Human reviewer:**

**Role / basis of review:**

**Date:**

**Decision:** `APPROVE` / `REQUEST_CORRECTIONS`

**Notes:**

After an explicit `APPROVE`, a separate promotion/freeze change must record human governance approval while retaining permanent AI-specialist case provenance. Only after that freeze may Phase 4.6C execute against the frozen benchmark.
