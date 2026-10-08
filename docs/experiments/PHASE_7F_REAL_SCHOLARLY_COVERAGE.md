# Phase 7F: Real Scholarly Persian Coverage Corpus & Held-Out Evaluation

**Corpus Version:** `phase7f-openalex-persian-titles-v1`  
**Generated At:** `2026-10-08T13:09:22.792Z`  
**Corpus SHA-256:** `28d91c460585ac028e987b01f4ea274f6bd991ad3a2ea79a16f8080fae9b5d5a`  
**Locked Holdout SHA-256:** `92ad183e088acbecded7165a806e808d9918482d3d6ce98f3c04072e0fd215d2`  

---

## 1. Executive Summary

Phase 7F measures the real-world coverage impact of the Phase 7E evidence-backed lexical recovery system on **5,000 independent, frozen Persian scholarly titles** sourced from OpenAlex (CC0).

Unlike prior benchmark corpora which were heavily covered by the reviewed lexicon (~95% display coverage), this held-out scholarly title corpus reflects real-world vocabulary diversity.

### Core Quantitative Findings

| Metric | REVIEWED_ONLY | CURRENT_PRODUCTION | PHASE7E_EXPERIMENTAL | Incremental Delta (Δ) |
| :--- | :---: | :---: | :---: | :---: |
| **Authoritative Token Coverage** | 11.23% | 11.23% | 11.23% | +0.00% (Strict Invariant) |
| **Display Token Coverage** | 11.23% | 11.30% | 16.04% | **+4.74%** |
| **Unique-Form Display Coverage** | 0.43% | 0.46% | 3.23% | **+2.78%** |
| **Fully Displayable Title Rate** | 0.00% | 0.00% | 0.00% | **+0.00%** |
| **Fully Authoritative Title Rate** | 0.00% | 0.00% | 0.00% | +0.00% |
| **Copyable Title Rate** | 0.00% | 0.00% | 0.00% | +0.00% (Review Required) |

### Lexical Miss Recovery Impact

- **Baseline NO_LEXICAL_ENTRY Tokens:** 65,846
- **Recovered by Phase 7E Proposals:** 3,517 (**5.34%** recovery rate)
- **Baseline Unique Miss Forms:** 9,968
- **Recovered Unique Miss Forms:** 278 (**2.79%** unique-form recovery rate)
- **Titles with Baseline Misses:** 5,000
- **Titles Gaining ≥1 Proposal:** 2,543
- **Titles Becoming Fully Displayable:** 0

---

## 2. Corpus Provenance & Frozen Partitions

The evaluation dataset was constructed completely independently of the transliteration engine and lexicon.

- **Primary Source:** OpenAlex Works API (Filter: `language:fa`, License: CC0-1.0)
- **Eligibility Invariant:** Independent Persian-script validation; at least 2 Persian lexical tokens; non-Latin metadata.
- **Selection Algorithm:** Deterministic SHA-256 ranked selection (`sha256-ranked-v1`).
- **Total Selected Titles:** 5,000
- **Diagnostic Subset (80%):** 4,000 titles
- **Locked Holdout Subset (20%):** 1,000 titles
- **Total Persian Lexical Tokens:** 74,247
- **Unique Normalized Persian Forms:** 10,017

---

## 3. Configuration Comparison by Split

### A. Full Corpus (5,000 Titles)

| Configuration | Token Display Cov. | Unique Form Cov. | Fully Displayable Titles | Lexical Miss Tokens | Other Blocker Tokens |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **REVIEWED_ONLY** | 11.23% | 0.43% | 0 (0.00%) | 65897 | 11 |
| **CURRENT_PRODUCTION** | 11.30% | 0.46% | 0 (0.00%) | 65846 | 11 |
| **PHASE7E_EXPERIMENTAL** | 16.04% | 3.23% | 0 (0.00%) | 62329 | 11 |

### B. Diagnostic Split (80% / 4,000 Titles)

| Configuration | Token Display Cov. | Unique Form Cov. | Fully Displayable Titles | Lexical Miss Tokens |
| :--- | :---: | :---: | :---: | :---: |
| **CURRENT_PRODUCTION** | 11.26% | 0.50% | 0 (0.00%) | 52775 |
| **PHASE7E_EXPERIMENTAL** | 15.99% | 3.40% | 0 (0.00%) | 49960 |

### C. Locked Holdout Split (20% / 1,000 Titles)

| Configuration | Token Display Cov. | Unique Form Cov. | Fully Displayable Titles | Lexical Miss Tokens |
| :--- | :---: | :---: | :---: | :---: |
| **CURRENT_PRODUCTION** | 11.46% | 0.88% | 0 (0.00%) | 13071 |
| **PHASE7E_EXPERIMENTAL** | 16.22% | 4.58% | 0 (0.00%) | 12369 |

---

## 4. Coverage by Scholarly Work Type

| Work Type | Titles | Tokens | Baseline Display Cov. | Phase 7E Display Cov. | Miss Recovery Rate | Baseline Fully Disp. Rate | Phase 7E Fully Disp. Rate |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **article** | 4991 | 74164 | 11.30% | 16.04% | 5.34% | 0.00% | 0.00% |
| **review** | 3 | 41 | 7.32% | 17.07% | 10.53% | 0.00% | 0.00% |
| **book-chapter** | 1 | 15 | 6.67% | 13.33% | 7.14% | 0.00% | 0.00% |
| **book** | 5 | 27 | 7.41% | 7.41% | 0.00% | 0.00% | 0.00% |

---

## 5. Coverage by Title Length Bucket

| Token Count Bucket | Titles | Baseline Fully Displayable Rate | Phase 7E Fully Displayable Rate | Delta (Δ) |
| :--- | :---: | :---: | :---: | :---: |
| **2-4 tokens** | 18 | 0.00% | 0.00% | +0.00% |
| **5-8 tokens** | 370 | 0.00% | 0.00% | +0.00% |
| **9-15 tokens** | 2509 | 0.00% | 0.00% | +0.00% |
| **16+ tokens** | 2103 | 0.00% | 0.00% | +0.00% |

---

## 6. Diagnostic Attribution of Remaining Misses (Diagnostic Split)

Joining the baseline unresolved `NO_LEXICAL_ENTRY` forms against the Kaikki knowledge base provides empirical evidence for the exact causes of remaining lexical misses:

| Blocker Category | Token Occurrences | Token Share | Unique Forms | Unique Form Share |
| :--- | :---: | :---: | :---: | :---: |
| `NOT_PRESENT_IN_KAIKKI` | 18,734 | 35.50% | 6,017 | 67.69% |
| `KAIKKI_LEMMA_MULTI_ROMANIZATION_INSUFFICIENT_SIGNAL` | 13,037 | 24.70% | 1,144 | 12.87% |
| `KAIKKI_LEMMA_SINGLE_ROMANIZATION_UNCLASSIFIED` | 10,935 | 20.72% | 1,100 | 12.37% |
| `KAIKKI_NON_LEMMA` | 6,281 | 11.90% | 297 | 3.34% |
| `PHASE7E_ELIGIBLE` | 3,649 | 6.91% | 321 | 3.61% |
| `KAIKKI_NO_ROMANIZATION` | 139 | 0.26% | 10 | 0.11% |
| `KAIKKI_PROFILE_OR_ALIGNMENT_BLOCKED` | 0 | 0.00% | 0 | 0.00% |
| `KAIKKI_CONFLICTING` | 0 | 0.00% | 0 | 0.00% |

### Proper-Name Diagnostic Cohort
- **Proper-Name Miss Tokens:** 1,266 (2.40% of miss tokens)
- **Proper-Name Unique Forms:** 218 (2.45% of miss forms)

### Surface Morphology Pattern Analysis
- **Forms with ZWNJ (`\u200c`):** 0
- **Forms with Plural Suffix `-hā` (`ها`):** 119
- **Forms with Plural Ezafe `-hā-ye` (`های`):** 676
- **Forms with Relational `-ī` (`ی`):** 3,182
- **Forms with Comparative `-tar` (`تر`):** 32
- **Forms with Superlative `-tarīn` (`ترین`):** 8
- **Forms with Enclitic Pronouns (`مان` / `شان` / etc.):** 82

---

## 7. Recommended Next Intervention (Phase 7G)

**Derived strictly from the 80% DIAGNOSTIC partition:**

- **Recommended Phase:** `Phase 7G`
- **Primary Focus:** **External Authority Expansion (LoC / Academic Authority Lexicon Integration)**
- **Rationale:** Forms absent from Wiktionary dominate, requiring external scholarly authority acquisition.
- **Dominant Blocker Category:** `NOT_PRESENT_IN_KAIKKI` (35.50% of unresolved miss tokens, 67.69% of unique miss forms).

---

## 8. Governance Invariants

- **FALSE_AUTHORITATIVE:** `0`
- **UNDER_BLOCKED:** `0`
- **Automatic Promotions:** `0`
- **Authoritative Lexicon Mutations:** `0`
- **Production Fallback Pack Unchanged:** `true` (`src/data/generated/kaikki-fallback.v1.json`)
- **Evaluation Fallback Union Conflicts:** `0`
