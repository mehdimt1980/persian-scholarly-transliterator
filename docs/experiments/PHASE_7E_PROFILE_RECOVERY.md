# Phase 7E Experiment Report: Wiktionary Romanization Profile Recovery

## Executive Summary

Phase 7E implements auditable **Persian Romanization Profile Recovery & Metadata Enrichment** to resolve the 83.47% (`UNCLASSIFIED_WIKTIONARY_PROFILE`) bottleneck identified in Phase 7D.

| Metric | Phase 7D Baseline | Phase 7E Recovered | Delta |
| :--- | :--- | :--- | :--- |
| **Source Records** | 20,288 | 20,288 | `0` |
| **Source SHA-256** | `f1647707c1bcbb7b18d355f7481ac4c656fa1ff8d91d93a0dbc6bb2e808d06c2` | `f1647707c1bcbb7b18d355f7481ac4c656fa1ff8d91d93a0dbc6bb2e808d06c2` | `IDENTICAL` |
| **Total Observations** | 26,998 | 26,998 | `0` |
| **Recovered Observations** | `0` | **2,505** | `+2,505` |
| **Still Unclassified** | 26,962 | **24,457** | `-2,505` |
| **Recovery Yield Rate** | `0.00%` | **9.29%** | `+9.29%` |
| **Unanimous Candidates** | 0 | **860** | `+860` |
| **Fallback Eligible Forms** | `0` | **857** | `+857` |
| **Novel Eligible Forms** | `0` | **851** | `+851` |
| **Reviewed Exact Agreement** | `N/A` | **5** | `+5` |
| **Reviewed Divergences** | `0` | **1** | `16.67%` |

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
STRUCTURAL_TEMPLATE_LINK        : 1
PAIRED_SCHEME_CORRESPONDENCE    : 2,504
MULTI_SIGNAL_CONSENSUS          : 0
NONE                            : 24,457
```

- **Recovered IRANIAN**: 1,254
- **Recovered CLASSICAL_DARI**: 1,251
- **New Conflicting**: 0

---

## 3. High-Information Paired Cohort

- **Total Multi-Romanization Records**: 6,289
- **Paired Discriminating Records**: 4,013
- **Successfully Recovered**: 1,252 (19.91%)
- **Non-Discriminating**: 2,276

---

## 4. Candidate Consensus Shift

| Consensus Status | Phase 7D Baseline | Phase 7E Recovered |
| :--- | :--- | :--- |
| `UNANIMOUS_DETERMINISTIC` | 0 | **860** |
| `PARTIAL` | 0 | **99** |
| `CONFLICTING_DETERMINISTIC` | 0 | **42** |
| `BLOCKED` | 17,099 | **16,098** |
| `NO_INTERPRETABLE_EVIDENCE` | 499 | **499** |

---

## 5. Experimental Recovered Fallback Pack

- **Full Recovered Pack**: `artifacts/phase7e/kaikki-fallback-recovered-full.json`
  - Entries: **857**
  - Raw JSON: **835.3 KB**
  - Gzip: **72.0 KB**
  - Bytes per entry: **998 bytes**
- **Novel-Only Pack**: `artifacts/phase7e/kaikki-fallback-recovered-novel.json`
  - Entries: **851**
  - Raw JSON: **829.8 KB**
  - Gzip: **71.6 KB**
- **Browser Pack Feasibility**: FEASIBLE: 857 recovered fallback entries (72 KB gzipped).

---

## 6. Scholarly Governance & Safety Invariants

- `FALSE_AUTHORITATIVE`: **0**
- `UNDER_BLOCKED`: **0**
- `Automatic promotions`: **0**
- `Authoritative lexicon mutations`: **0**
- `Production fallback pack unchanged`: **true**
