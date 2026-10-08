# Phase 7G: Safe Whole-Word Evidence Resolution Evaluation

**Corpus Version:** `phase7f-openalex-persian-titles-v1`  
**Generated At:** `2026-10-08T14:33:29.286Z`  
**Evaluator Version:** `1.0.0`  
**Routing Policy Version:** `v1.0.0`  
**Frozen Corpus SHA-256:** `28d91c460585ac028e987b01f4ea274f6bd991ad3a2ea79a16f8080fae9b5d5a`  
**Holdout SHA-256:** `92ad183e088acbecded7165a806e808d9918482d3d6ce98f3c04072e0fd215d2`  

---

## 1. Executive Summary

Phase 7G implements **Track A: Safe Whole-Word Evidence vs. Morphology Resolution**.
In Phase 7F, diagnostic analysis revealed that **834 lexical tokens** in the DIAGNOSTIC partition possessed valid, high-confidence Wiktionary fallback entries in the Phase 7E pack, but were intercepted and prevented from surfacing because the engine unconditionally prioritized candidate morphology (e.g. suffix-shaped matches on words like *استان*, *دانش*, *بارش*, *تغییرات*, *کرمان*) even when the morphological analysis was only a candidate shape lacking a confirmed reviewed stem.

Under Phase 7G, an explicit **Resolution Precedence Contract** evaluates candidate morphology against whole-word fallback evidence:
1. **Reviewed Exact Whole-Word Authority** (Highest precedence)
2. **Confirmed Reviewed Morphology** (Reviewed stem + valid suffix rule, strictly authoritative)
3. **Safe Whole-Word Fallback Evidence** (Surfaces provisional proposal if candidate morphology is shape-only)
4. **Competing Ambiguity** (Retains explicit review marker if both morphology and fallback have plausible support)

### Core Multi-Configuration Findings (Full Corpus: 5,000 Titles, 74,247 Persian Tokens)

| Metric | REVIEWED_ONLY | CURRENT_PRODUCTION | PHASE7E_EXPERIMENTAL | PHASE7G_SAFE_ROUTING | Δ (7G vs 7E) | Total Δ vs Prod |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Authoritative Token Coverage** | 11.23% | 11.23% | 11.23% | 11.23% | +0.00% | +0.00% (Strict Invariant) |
| **Display Token Coverage** | 11.23% | 11.30% | 16.04% | 17.47% | **+1.43%** | **+6.17%** |
| **Unique-Form Display Coverage** | 0.43% | 0.46% | 3.23% | 3.89% | **+0.66%** | **+3.43%** |
| **Displayable Tokens Count** | 8,339 | 8,390 | 11,907 | 12,971 | **+1,064** | **+4,581** |
| **Fully Displayable Title Rate** | 0.00% | 0.00% | 0.00% | 0.00% | **+0.00%** | **+0.00%** |
| **Fully Displayable Titles Count** | 0 | 0 | 0 | 0 | **+0** | **+0** |
| **Fully Authoritative Title Rate** | 0.00% | 0.00% | 0.00% | 0.00% | +0.00% | +0.00% |
| **Copyable Title Rate** | 0.00% | 0.00% | 0.00% | 0.00% | +0.00% | +0.00% (Review Required) |

---

## 2. Partitioned Comparison: DIAGNOSTIC vs LOCKED_HOLDOUT

To verify generalization without leakage, performance is tracked across partitions:

### DIAGNOSTIC Partition (4,000 Titles, 59,380 Tokens)
- **Production Display Coverage:** 11.26% (6,698 tokens)
- **Phase 7E Display Coverage:** 15.99% (9,513 tokens)
- **Phase 7G Safe Routing Coverage:** 17.39% (10,347 tokens)
- **DIAGNOSTIC Incremental Gain:** **+1.40 percentage points** (+834 tokens)
- **Fully Displayable Titles:** 0 titles (vs 0 in 7E)

### LOCKED_HOLDOUT Partition (1,000 Titles, 14,867 Tokens - Aggregate Only)
- **Production Display Coverage:** 11.46% (1,692 tokens)
- **Phase 7E Display Coverage:** 16.22% (2,394 tokens)
- **Phase 7G Safe Routing Coverage:** 17.77% (2,624 tokens)
- **LOCKED_HOLDOUT Incremental Gain:** **+1.56 percentage points** (+230 tokens)
- **Fully Displayable Titles:** 0 titles (vs 0 in 7E)

The consistent incremental gain across both partitions confirms that the safe routing resolution strategy generalizes cleanly across held-out scholarly vocabulary.

---

## 3. Reconciled Diagnostic Interception Audit (834 Original Tokens)

The 834 tokens in the DIAGNOSTIC partition that were intercepted by candidate morphology routing in Phase 7F reconcile as follows:

| Outcome Category | Token Count | Share of Intercepted Cohort |
| :--- | :---: | :---: |
| **Safe Routing Proposals Created (Recovered)** | **834** | **100.00%** |
| **Still Blocked by Confirmed Morphology** | 0 | 0.00% |
| **Blocked by Competing Reviewed Evidence** | 0 | 0.00% |
| **Blocked by Explicit Orthography** | 0 | 0.00% |
| **Invalid or Missing Fallback Entry** | 0 | 0.00% |
| **Unresolved for Other Reasons** | 0 | 0.00% |
| **Total Reconciled Intercepted Cohort** | **834** | **100.00%** |

- **Unique Lexical Forms Recovered:** 62
- **Titles Benefiting from Safe Proposals:** 709 titles

---

## 4. Safety and Regression Summary

| Regression Check | Result | Safety Assessment |
| :--- | :---: | :--- |
| **Newly Displayable Tokens** | +1,064 | Expected: Recovered from candidate morphology intercept |
| **Unchanged Displayable Tokens** | 11,907 | Stable: Existing proposals preserved |
| **Lost Displayability Tokens** | 0 | Pass: Zero silent loss of displayability |
| **New Ambiguity Tokens** | 0 | Pass: Explicit competition flags preserved |
| **New Authoritative Results** | **0** | **STRICT PASS: Zero unreviewed fallback promoted to authority** |

---

## 5. Governance and Verification Invariants

```json
{
  "falseAuthoritative": 0,
  "underBlocked": 0,
  "automaticPromotions": 0,
  "authoritativeLexiconMutations": 0,
  "productionFallbackPackUnchanged": true,
  "productionDefaultUnchanged": true
}
```

- **Production Default Behavior:** Unaltered (ResolutionPolicy defaults to `CURRENT_PRODUCTION`).
- **Production Fallback Pack:** Byte-identical and immutable.
- **Authoritative Lexicon:** Strictly unchanged.
- **Corpus and Holdout Datasets:** Cryptographically verified and preserved.
