# Phase 4.6B Governance & Benchmark Status

## Governance Context & Post-PR #14 State

- **Prior Merged PRs:**
  - PR #13 (`data: adjudicate independent scholarly benchmark candidates` — commit `d953da58dd6df2a5ee4309b95716c56dcd2587ff`)
  - PR #14 (`chore: repair Phase 4.6B post-merge governance state` — commit `c198764b37cecbeeb294868720250abf4b1c0dd8`)
  - PR #15 (`docs(validation): separate scholarly canonical from publication rendering` — commit `c97e5a50d07540faf99111a6ea98f1c45c23ddaa`)
  - PR #16 (`feat(validation): add separated canonical and rendering v2 contract` — commit `3e5ec809b9c910e75f563be626fa6f1197db5afd`)
- **Attempted Human Sign-Off Finding:** During initial human governance review, a foundational contract ambiguity was identified: benchmark and validation terminology conflated **Scholarly Canonical Transliteration** (diacritic-complete linguistic reading truth) with **Publication Rendering** (style-dependent diacritic stripping, Word List overrides, and title casing).
- **Current Human Sign-Off State:** **PAUSED** (`humanSignoff = null`).
- **Formal Contract & Infrastructure:**
  - Contract specification: `validation/review/CANONICAL_RENDERING_CONTRACT.md` (PR #15)
  - V2 validation schema & evaluator: `validation/V2_SCHEMA.md` and `src/validation/v2/` (PR #16)
  - V2 blind re-audit protocol & worklist workspace: `validation/review/REAUDIT_PROTOCOL_V2.md` and `validation/review/reaudit-worklist.v2.json` (PR #17)

## Current Repository & Benchmark Status

- **Adjudication Status:** `EXPERT_ADJUDICATED_PENDING_HUMAN_SIGNOFF` (version `1.0.2-draft`, DRAFT only).
- **V2 Re-Audit Worklist State:** `READY_FOR_BLIND_REAUDIT` (108 cases `PENDING`, 0 adjudicated in PR #17).
- **Gold Corpus State:** **NOT gold-frozen**. The benchmark is not promoted to authoritative release gold.
- **Engine Evaluation State:** `engineEvaluationPerformed = false`. No evaluation of the 108-case benchmark against the transliteration engine has occurred.
- **Phase 4.6C Status:** **BLOCKED**. Phase 4.6C (engine benchmarking) cannot proceed until the V2 systematic re-audit is conducted and approved.
- **Runtime Integrity:** The transliteration engine, lexicon repository, morphological parser, and rendering profiles remain 100% untouched.

## Governance Invariants & Boundaries

1. Merge of PR #13 / PR #14 / PR #15 / PR #16 does **not** equal `HUMAN_REVIEWED` status.
2. The benchmark must **not** call a publication rendering "canonical" when it is actually evaluating presentation behavior.
3. Scholarly canonical truth must be established independently of current runtime profile limitations and historical V1 adjudication.
4. The primary safety invariant remains $$\text{FALSE\_AUTHORITATIVE} = 0$$.

## Next Substantive Governance Steps

1. **Establish Canonical vs. Rendering Contract:** Formally define the separation of reading truth from presentation profiles (completed in `CANONICAL_RENDERING_CONTRACT.md` - PR #15).
2. **Implement Validation V2 Contract:** Isolated schema, token canonical derivation, and evaluator (completed in `src/validation/v2/` - PR #16).
3. **Scaffold Blind V2 Re-Audit Protocol & Workspace:** Establish formal protocol, blank 108-case worklist, and alignment validators (completed in PR #17).
4. **Conduct Systematic Benchmark Re-Audit (Batches A–E):** Re-adjudicate all 108 candidates under the blind protocol into `reaudit-worklist.v2.json`.
5. **Regenerate Consolidated Benchmark under V2 Schema:** Ensure validation schemas compare canonical expectations against derived token canonicals and rendered expectations against profile outputs.
6. **Execute Formal Human Governance Sign-Off:** Perform representative human review against the separated fields in `validation/review/HUMAN_SIGNOFF.md`.
7. **Gold Promotion & Engine Benchmarking (Phase 4.6C):** Promote to gold and run engine evaluation only after human approval.
