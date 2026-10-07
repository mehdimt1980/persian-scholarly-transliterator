# Phase 7E Experiment Report: Wiktionary Romanization Profile Recovery (Hardened)

## Executive Summary

Phase 7E implements auditable, position-aligned **Persian Romanization Profile Recovery & Metadata Enrichment** to resolve the 83.47% (`UNCLASSIFIED_WIKTIONARY_PROFILE`) bottleneck identified in Phase 7D.

| Metric | Phase 7D Baseline | Phase 7E Recovered | Delta |
| :--- | :--- | :--- | :--- |
| **Source Records** | 20,288 | 20,288 | `0` |
| **Source SHA-256** | `f1647707c1bcbb7b18d355f7481ac4c656fa1ff8d91d93a0dbc6bb2e808d06c2` | `f1647707c1bcbb7b18d355f7481ac4c656fa1ff8d91d93a0dbc6bb2e808d06c2` | `IDENTICAL` |
| **Total Observations** | 26,998 | 26,998 | `0` |
| **Explicit Source Profiles** | 0 | 0 | `0` |
| **Recovered Profiles** | `0` | **3,161** | `+3,161` |
| **Still Unclassified** | 26,962 | **23,801** | `-3,161` |
| **Recovery Yield Rate** | `0.00%` | **11.72%** | `+11.72%` |
| **Unanimous Candidates** | 0 | **1,102** | `+1,102` |
| **Fallback Eligible Forms** | `0` | **1,099** | `+1,099` |
| **Novel Eligible Forms** | `0` | **1,089** | `+1,089` |
| **Reviewed Exact Agreement** | `N/A` | **9** | `+9` |
| **Reviewed Formatting Diffs** | `0` | **1** | `+1` |
| **Reviewed Substantive Divergences** | `0` | **0** | `+0` |

---

## 1. Metadata Observability Audit

- **Forms Total**: 236,661
- **Forms with Source Field**: 191,215
- **Forms with Head Number**: 24
- **Records with Sounds**: 15,076 (105,951 sound blocks)
- **Records with Head Templates**: 20,225
- **Multi-Romanization Records**: 6,289
  - 2 Romanizations: 6,009
  - 3+ Romanizations: 280
  - Paired Discriminating Candidates: **4,013**

---

## 2. Recovery Hierarchy & Method Distribution

```text
EXPLICIT_ROMANIZATION_TAG       : 0
STRUCTURAL_SOUND_LINK           : 0
STRUCTURAL_TEMPLATE_LINK        : 0
PAIRED_SCHEME_CORRESPONDENCE    : 3,161
MULTI_SIGNAL_CONSENSUS          : 0
NONE                            : 23,801
```

- **Explicit Profiles**: 0
- **Recovered Structural Profiles**: 0
- **Recovered Paired Profiles**: 3,161
- **Recovered IRANIAN**: 1,581
- **Recovered CLASSICAL_DARI**: 1,580
- **New Conflicting**: 0

---

## 3. High-Information Paired Cohort

- **Total Multi-Romanization Records**: 6,289
- **Paired Discriminating Records**: 4,013
- **Records with Valid Pair Evidence**: 1,580 (25.12%)
- **Unique Consistent Recoveries**: 1,549
- **Multiple Consistent Recoveries**: 31
- **Conflicting Assignments**: 0
- **Insufficient Positional Signal**: 0

---

## 4. 3+ Romanization Records Audit (280 Records)

- **Fully Consistent**: 27
- **Partially Recoverable**: 49
- **Conflicting Assignment Graph**: 0
- **Non-Discriminating**: 204
- **Subdivision Separated**: 0

---

## 5. Candidate Consensus Shift

| Consensus Status | Phase 7D Baseline | Phase 7E Recovered |
| :--- | :--- | :--- |
| `UNANIMOUS_DETERMINISTIC` | 0 | **1,102** |
| `PARTIAL` | 0 | **122** |
| `CONFLICTING_DETERMINISTIC` | 0 | **28** |
| `BLOCKED` | 17,099 | **15,847** |
| `NO_INTERPRETABLE_EVIDENCE` | 499 | **499** |

---

## 6. Corpus Coverage Evaluation

| Corpus | Display Coverage Before | Display Coverage After | Auth Coverage Before | Auth Coverage After |
| :--- | :--- | :--- | :--- | :--- |
| **V3 Frozen Benchmark (108 cases)** | 95.41% | **95.41%** | 95.41% | **95.41%** |
| **Pilot Single Corpus (46 cases)** | 92.16% | **92.16%** | 92.16% | **92.16%** |

---

## 7. Experimental Recovered Fallback Pack

- **Full Recovered Pack**: `artifacts/phase7e/kaikki-fallback-recovered-full.json`
  - Entries: **1,099**
  - Raw JSON: **1072.5 KB**
  - Gzip: **92.5 KB**
  - Bytes per entry: **999 bytes**
- **Novel-Only Pack**: `artifacts/phase7e/kaikki-fallback-recovered-novel.json`
  - Entries: **1,089**
  - Raw JSON: **1063.3 KB**
  - Gzip: **91.8 KB**
- **Browser Pack Feasibility**: FEASIBLE: 1099 recovered fallback entries (93 KB gzipped).

---

## 8. Scholarly Governance & Safety Invariants

- `FALSE_AUTHORITATIVE`: **0**
- `UNDER_BLOCKED`: **0**
- `Automatic promotions`: **0**
- `Authoritative lexicon mutations`: **0**
- `Production fallback pack unchanged`: **true**
