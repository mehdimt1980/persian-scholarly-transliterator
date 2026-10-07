# Phase 7D: Production-Scale Lexical Knowledge Pack Experiment Report

**Execution Date:** 2026-10-07T17:22:11.646Z  
**Experiment Version:** 1.0.0  
**Dataset:** `kaikki.org-dictionary-Persian.jsonl` (88.93 MB)  
**Input SHA-256:** `f1647707c1bcbb7b18d355f7481ac4c656fa1ff8d91d93a0dbc6bb2e808d06c2`  
**Semantic Pack SHA-256:** `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`  

---

## 1. Executive Summary & Scholarly Governance Invariants

Phase 7D is an **empirical scale experiment** observing the behavior of the complete acquisition, interpretation, consensus, and fallback pipeline against the genuine Persian Wiktionary / Kaikki lexical dataset.

### Core Governance Invariants
- **Automatic Promotions to Lexicon:** `0` (PASS)
- **Authoritative Lexicon Mutations:** `0` (PASS)
- **False Authoritative Transliterations:** `0` (PASS)
- **Under-Blocked Interpretations:** `0` (PASS)
- **Production Fallback Pack Modified:** `NO` (remains strictly pilot pack `kaikki-fallback.v1.json`)
- **Linguistic Rules Changed or Loosened:** `ZERO` (Phase 7B rules observed strictly as-is)

### Source Provenance Record
| Provenance Field | Value | Verification / Status |
| :--- | :--- | :--- |
| **Source Edition** | `enwiktionary` | Verified format |
| **Source Language** | `Persian (fa)` | Verified language filter (`fa` / `Persian`) |
| **Source URL** | `https://kaikki.org/dictionary/Persian/kaikki.org-dictionary-Persian.jsonl` | `EXPLICITLY_SUPPLIED` |
| **Wiktionary Dump Date** | `2026-09-02` | `EXPLICITLY_SUPPLIED` |
| **Kaikki Extraction Date** | `2026-10-03` | `EXPLICITLY_SUPPLIED` |
| **Wiktextract Version** | `wiktextract 1.99.x` | `EXPLICITLY_SUPPLIED` |

*Note: Source metadata fields were explicitly supplied via CLI options where indicated.*

---

## 2. Staged Performance & Memory Profiling

| Stage | Rows Processed | Duration | Speed | Start RSS | Peak RSS | End RSS | Eligible Entries |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **STAGE_1K** | 1,000 | 0.37s | 2,702.7 rows/s | 95.11 MB | 109.66 MB | 109.66 MB | 0 |
| **STAGE_10K** | 10,000 | 3.27s | 3,056.23 rows/s | 121.6 MB | 166.52 MB | 166.52 MB | 0 |
| **FULL_DATASET** | 20,288 | 4.17s | 4,867.56 rows/s | 187.78 MB | 264.14 MB | 264.14 MB | 0 |

**Memory Scaling Behavior:** Observed peak RSS at 1k / 10k / full dataset was 109.66 MB / 166.52 MB / 264.14 MB. Memory scales primarily with the count of retained distinct normalized Persian forms and their associated lexical evidence observations. Peak RSS strictly satisfies `peakRSS >= startRSS` and `peakRSS >= endRSS` across all stages.

---

## 3. Complete Lexical Acquisition Yield Funnel

### Source Records Breakdown
| Metric | Count | % of Valid Records |
| :--- | :--- | :--- |
| **Physical JSONL Rows Read** | 20,288 | 100.00% |
| **Malformed Rows** | 0 | 0.00% |
| **Valid Persian Records** | 20,288 | 100.00% |
| **Distinct Raw Persian Forms** | 17,602 | - |
| **Distinct Normalized Persian Forms** | 17,598 | - |
| **Normalization Collisions** | 4 | - |
| **Lemma Records** | 16,511 | 81.38% |
| **Non-Lemma Records** | 3,440 | 16.96% |
| **Unknown Lemma Status Records** | 337 | 1.66% |
| **Records with Source Romanization** | 19,751 | 97.35% |
| **Records without Source Romanization** | 537 | 2.65% |
| **Records with IPA** | 15,011 | 73.99% |
| **Records with Part of Speech (POS)** | 20,288 | 100.00% |
| **Proper-Name Records** | 1,957 | 9.65% |

### Observation Accounting Funnel
| Step | Count | Note / Reconciliation |
| :--- | :--- | :--- |
| **Total Extracted Evidence Observations** | 26,998 | 100.00% of observations |
| ├─ **Romanized Evidence Observations** | 26,461 | 98.01% |
| └─ **Unromanized Evidence Observations** | 537 | 1.99% |
| **Unique Observations after Group Deduplication** | 26,962 | Basis for interpretation attempts |
| **Duplicate Evidence Observations Removed** | 36 | Deduplicated within same normalized form |
| **Total Interpretation Attempts** | 26,962 | Reconciled: Unique (26,962) + Duplicates (36) = Total (26,998) |

---

## 4. Phase 7B Scheme Interpretation & Consensus Funnel

### Source-Profile Distribution of Observations *(Denominator: Total Interpretation Attempts = 26,962)*
- **CLASSICAL_DARI Observations:** 0 (0%)
- **IRANIAN Observations:** 0 (0%)
- **UNCLASSIFIED Observations:** 26,962 (100%)
- **CONFLICTING Observations:** 0 (0%)

### Candidate Profile Combinations *(Denominator: Distinct Normalized Forms = 17,598)*
- **Classical Only:** 0
- **Iranian Only:** 0
- **Cross-Profile Convergence:** 0
- **Unclassified Only:** 17,598
- **Mixed Classified / Unclassified:** 0

### Candidate Consensus Distribution *(Denominator: Distinct Normalized Forms = 17,598)*
- **UNANIMOUS_DETERMINISTIC:** 0
- **CONFLICTING_DETERMINISTIC:** 0
- **PARTIAL:** 0
- **BLOCKED:** 17,099
- **NO_INTERPRETABLE_EVIDENCE:** 499

### Fallback-Safe Yield
- **Total Fallback-Eligible Candidates:** **0**
- **Total Fallback-Ineligible Candidates:** 17,598
- **Novel Fallback Candidates (Not in Reviewed Lexicon):** **0**

---

## 5. Blocker Histogram

| Rank | Blocker Kind | Count | % of Blocked Interpretations | % of Total Attempts |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `UNCLASSIFIED_WIKTIONARY_PROFILE` | 22,506 | 83.47% | 83.47% |
| 2 | `NON_LEMMA_SOURCE_FORM` | 3,919 | 14.54% | 14.54% |
| 3 | `NO_ROMANIZATION` | 537 | 1.99% | 1.99% |

---

## 6. Confidence Tier Distribution for Fallback-Eligible Entries

| Tier | Eligible Entries | Percentage |
| :--- | :--- | :--- |
| **CROSS_PROFILE_CONSENSUS** | 0 | N/A |
| **MULTI_OBSERVATION_CONSENSUS** | 0 | N/A |
| **SINGLE_OBSERVATION_DETERMINISTIC** | 0 | N/A |

---

## 7. Reviewed Lexicon Overlap & Divergence Audit

- **Total Fallback-Eligible Entries:** 0
- **Reviewed Lexicon Overlap:** 0
- **Exact Canonical Matches:** 0
- **Canonical Divergences:** 0
- **Divergence Rate:** **N/A**

### Sample Divergences (Read-Only Audit Sample)
| Persian Form | Normalized | Reviewed Lexicon | Wiktionary Fallback Hypothesis | Confidence Tier |
| :--- | :--- | :--- | :--- | :--- |


---

## 8. Part of Speech (POS) & Proper-Name Cohort Analysis

| POS | Source Forms | Eligible Fallback Forms | Eligibility Rate |
| :--- | :--- | :--- | :--- |
| `noun` | 10,333 | 0 | 0% |
| `adj` | 2,617 | 0 | 0% |
| `verb` | 2,265 | 0 | 0% |
| `name` | 1,473 | 0 | 0% |
| `adv` | 266 | 0 | 0% |
| `phrase` | 104 | 0 | 0% |
| `suffix` | 98 | 0 | 0% |
| `intj` | 96 | 0 | 0% |
| `prep` | 67 | 0 | 0% |
| `num` | 62 | 0 | 0% |

### Proper-Name Cohort
- **Source Proper-Name Forms:** 1,938
- **Interpretable Proper-Name Forms:** 0
- **Fallback-Eligible Proper-Name Forms:** 0
- **Cross-Profile Proper-Name Forms:** 0

---

## 9. Duplicate Evidence Analysis
- **Candidates with 1 Observation:** 11,125
- **Candidates with 2 Observations:** 5,124
- **Candidates with 3+ Observations:** 1,349
- **Literal Duplicate Observations Count:** 7
- **Same Romanization Across Distinct Source Records:** 2,244
- **Distinct Normalized Forms with Multiple Observations:** 6,473
- **Candidate Evidence Count Reduction if Semantic Duplicates Collapsed:** 7

---

## 10. Experimental Pack Size & Feasibility

| Pack Artifact | Entries | Raw JSON Size | Gzip Compressed | Bytes / Entry |
| :--- | :--- | :--- | :--- | :--- |
| **Full Fallback Pack** | 0 | 0.00 MB (443 B) | 0.00 MB | N/A |
| **Novel-Only Pack** | 0 | 0.00 MB (443 B) | 0.00 MB | N/A |

---

## 11. Internal Corpus Coverage Evaluations

### V3_FROZEN_EXTERNAL_BENCHMARK (108 cases)
- **Total Lexical Tokens:** 109 (Unique forms: 109)
- **Display Coverage Before:** 95.41% (Unique-form: 95.41%)
- **Display Coverage After (Experimental Fallback):** **95.41%** (Unique-form: **95.41%**)
- **Authoritative Coverage Before / After:** **95.41%** → **95.41%** (STRICTLY UNCHANGED)
- **Lexical Miss Recovery Rate:** **0%** (Unique-form recovery: **0%**)

### PILOT_SINGLE_VALIDATION_CORPUS (46 cases)
- **Total Lexical Tokens:** 51 (Unique forms: 43)
- **Display Coverage Before:** 92.16% (Unique-form: 90.7%)
- **Display Coverage After (Experimental Fallback):** **92.16%** (Unique-form: **90.7%**)
- **Authoritative Coverage Before / After:** **92.16%** → **92.16%** (STRICTLY UNCHANGED)
- **Lexical Miss Recovery Rate:** **0%** (Unique-form recovery: **0%**)


---

## 12. Top Bottlenecks & Next-Phase Recommendations

### Top Bottlenecks by Empirical Measurement
1. **`UNCLASSIFIED_WIKTIONARY_PROFILE`** (22,506 occurrences, 83.47% of blocked interpretations)
2. **`NON_LEMMA_SOURCE_FORM`** (3,919 occurrences, 14.54% of blocked interpretations)
3. **`NO_ROMANIZATION`** (537 occurrences, 1.99% of blocked interpretations)

### Recommended Next Interventions (Strictly Data-Derived)
1. **Dialect & Profile Metadata Enrichment:** English Wiktionary raw form objects generally omit explicit dialect tags on romanization fields in isolation. Consequently, `UNCLASSIFIED_WIKTIONARY_PROFILE` represents **83.47%** of all blocked attempts. Future phases can investigate propagating verified variety tags from phonetic sound blocks or template parameters where safe.
2. **Non-Lemma Morphological Normalization:** `NON_LEMMA_SOURCE_FORM` accounts for **14.54%** of blocked attempts. Linking inflected forms to established lemma roots will unlock substantial vocabulary.
3. **Source Missing Romanization:** `NO_ROMANIZATION` accounts for **1.99%** of blocked attempts where entries contain only Persian text or IPA without Latin transliteration.
4. **Proper-Name Subsystem:** Proper nouns constitute **1,938** distinct forms with strong source romanizations; a specialized proper-name subsystem will expand entity coverage.
5. **Browser Pack Architecture Recommendation:** Production pack delivery architecture is **UNDETERMINED** at the strict Phase 7D baseline, because zero entries passed eligibility under the unclassified profile blocker. Delivery feasibility (bundled JSON vs. sharded index) should be evaluated after profile enrichment produces a representative non-empty fallback pack.
