# Phase 4.6B Governance & Benchmark Status

## Governance Context & Post-PR #14 State

- **Prior Merged PRs:**
  - PR #13 (`data: adjudicate independent scholarly benchmark candidates` — commit `d953da58dd6df2a5ee4309b95716c56dcd2587ff`)
  - PR #14 (`chore: repair Phase 4.6B post-merge governance state` — commit `c198764b37cecbeeb294868720250abf4b1c0dd8`)
  - PR #15 (`docs(validation): separate scholarly canonical from publication rendering` — commit `c97e5a50d07540faf99111a6ea98f1c45c23ddaa`)
- **Attempted Human Sign-Off Finding:** During initial human governance review, a foundational contract ambiguity was identified: benchmark and validation terminology conflated **Scholarly Canonical Transliteration** (diacritic-complete linguistic reading truth) with **Publication Rendering** (style-dependent diacritic stripping, Word List overrides, and title casing).
- **Current Human Sign-Off State:** **PAUSED** (`humanSignoff = null`).
- **Formal Contract & Infrastructure:**
  - Contract specification: `validation/review/CANONICAL_RENDERING_CONTRACT.md` (established in PR #15)
  - V2 validation schema & evaluator: `validation/V2_SCHEMA.md` and `src/validation/v2/` (proposed on open PR #16, pending review and merge)

## Current Repository & Benchmark Status

- **Adjudication Status:** `EXPERT_ADJUDICATED_PENDING_HUMAN_SIGNOFF` (version `1.0.2-draft`, DRAFT only).
- **Gold Corpus State:** **NOT gold-frozen**. The current benchmark is not promoted to authoritative release gold.
- **Engine Evaluation State:** `engineEvaluationPerformed = false`. No evaluation of the 108-case benchmark against the transliteration engine has occurred.
- **Phase 4.6C Status:** **BLOCKED**. Phase 4.6C (engine benchmarking) cannot proceed until the canonical-vs-rendering contract is established, V2 infrastructure is reviewed and merged, and the benchmark is systematically re-audited and approved.
- **Runtime Integrity:** The transliteration engine, lexicon repository, morphological parser, and rendering profiles remain 100% untouched.

## Governance Invariants & Boundaries

1. Merge of PR #13 / PR #14 / PR #15 does **not** equal `HUMAN_REVIEWED` status.
2. The benchmark must **not** call a publication rendering "canonical" when it is actually evaluating presentation behavior.
3. Scholarly canonical truth must be established independently of current runtime profile limitations.
4. The primary safety invariant remains $$\text{FALSE\_AUTHORITATIVE} = 0$$.

## Next Substantive Governance Steps

1. **Establish Canonical vs. Rendering Contract:** Formally define the separation of reading truth from presentation profiles (completed in `CANONICAL_RENDERING_CONTRACT.md` - PR #15).
2. **Implement Validation V2 Contract:** Isolated schema, token canonical derivation, and evaluator (proposed on open PR #16, pending review and merge).
3. **Systematic Benchmark Re-Audit:** Re-audit affected cases in the 108-candidate set to explicitly separate `scholarlyCanonical` (full scholarly diacritics) from `renderedOutput` (IJMES publication presentation).
4. **Regenerate Consolidated Benchmark under V2 Schema:** Ensure validation schemas compare canonical expectations against derived token canonicals and rendered expectations against profile outputs.
5. **Execute Formal Human Governance Sign-Off:** Perform representative human review against the separated fields in `validation/review/HUMAN_SIGNOFF.md`.
6. **Gold Promotion & Engine Benchmarking (Phase 4.6C):** Promote to gold and run engine evaluation only after human approval.
