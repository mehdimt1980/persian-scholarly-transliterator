# Wiktionary Romanization Profile Recovery & Metadata Enrichment (Phase 7E)

## 1. Context & Motivation

Phase 7D established an empirical baseline on the complete Kaikki English Wiktionary Persian dataset (20,288 source records, 26,998 extracted observations):

```text
20,288 Persian source records
19,751 records with source romanization

26,998 extracted evidence observations
26,962 interpretation attempts

22,506 UNCLASSIFIED_WIKTIONARY_PROFILE = 83.47% of all interpretation attempts
 3,919 NON_LEMMA_SOURCE_FORM           = 14.54%
   537 NO_ROMANIZATION                 =  1.99%

Fallback eligible candidates: 0
```

The dominant bottleneck across the dataset was **NOT lexical coverage**, but **Source Profile Recovery**:
English Wiktionary defines separate transliteration policies for **Iranian Persian** and **Classical Persian / Dari**, but Wiktextract `forms[]` arrays in the Persian dump generally do not carry explicit variety tags (99%+ carry only the generic tag `["romanization"]`).

Phase 7E introduces a formal, multi-tier profile recovery subsystem that unlocks **2,505 recovered observations** and **857 unanimous fallback candidates** with zero linguistic shortcuts and zero authoritative lexicon mutations.

---

## 2. Core Invariants

### 2.1 Distinction Between Source Tags and Recovered Profiles

```text
Raw Source Tag ≠ Recovered Profile Identity ≠ IJMES Target Hypothesis ≠ Authoritative Lexicon
```

- Raw source metadata (`romanizationTags`, `rawTags`, `source`, `headNr`, `sounds`, `templates`) is **strictly immutable**.
- Profiles resolved via evidence analysis are stored in a dedicated `WiktionaryProfileRecoveryResult` layer.
- Provenance is preserved at every step (`profileOrigin: 'EXPLICIT' | 'RECOVERED_STRUCTURAL' | 'RECOVERED_PAIRED' | 'UNCLASSIFIED'`).

### 2.2 Prohibited Typography Shortcuts

A single typographic glyph (e.g. `â` or `ā`) alone is **strictly prohibited** from determining a profile.
Profile recovery requires a multi-evidence bundle anchored on:
1. Source-local structural metadata, or
2. Persian-script consonantal alignment and complementary vowel correspondences across >= 2 discriminative features.

---

## 3. Metadata Observability Audit

Audit on the 20,288 Persian records (`f1647707c1bcbb7b18d355f7481ac4c656fa1ff8d91d93a0dbc6bb2e808d06c2`):

- **Forms total**: 236,661
- **Forms with Romanization**: 26,461
  - Forms with explicit `Iranian-Persian`: 18
  - Forms with explicit `Classical-Persian`: 10
  - Forms with explicit `Dari`: 111
  - Forms with explicit `Tehrani`: 109
  - Forms with generic `["romanization"]`: 26,461 (99.9%)
- **Sound records**: 15,076 records (105,951 sound blocks)
  - Sounds have variety tags (`Classical-Persian`: 13,021, `Dari`: 25,088, `Iran`: 16,341), but **0 sound blocks contain a `form` string** to link directly to a romanization string without guessing.
- **Head templates**: 20,225 records contain structured head templates (`fa-noun`: 10,556, `fa-adj`: 2,544, `fa-proper noun`: 1,827, `fa-verb`: 1,381).
- **Multi-Romanization Cohort**:
  - Records with 1 romanization: 13,462
  - Records with 2 romanizations: 6,009
  - Records with 3+ romanizations: 280
  - **Paired Discriminating Candidates**: 4,013 records exhibit coherent complementary Classical↔Iranian phonological patterns.

---

## 4. Recovery Evidence Hierarchy

### Tier A — Explicit per-observation profile tag
- Highest confidence (`EXPLICIT_ROMANIZATION_TAG`).
- Applied when `forms[n].tags` explicitly contains `Iranian-Persian`, `Classical-Persian`, etc.
- `profileOrigin: 'EXPLICIT'`.

### Tier B — Direct structural template linkage
- Medium-high confidence (`STRUCTURAL_TEMPLATE_LINK`).
- Applied when a head template argument explicitly binds a romanization slot (e.g. `cls = "..."` or `ira = "..."`).
- `profileOrigin: 'RECOVERED_STRUCTURAL'`.

### Tier C — Script-Anchored Paired-Scheme Correspondence
- Primary high-yield mechanism (`PAIRED_SCHEME_CORRESPONDENCE`).
- Applies when:
  1. Same Persian lexical record and same Persian spelling;
  2. Same etymology and head subdivision;
  3. Consonantal skeletons match identically;
  4. Both strings align independently to the Persian script;
  5. The vowel slots satisfy >= 2 independent discriminative correspondences (e.g. `ā` ↔ `â` [Long A] and `i` ↔ `e` [Kasra] in `imām` / `emâm` or `jihād` / `jehâd`).
- `profileOrigin: 'RECOVERED_PAIRED'`.

---

## 5. Conflict Resolution & Precedence

Effective profile resolution follows strict precedence:
1. `EXPLICIT` source tag.
2. `RECOVERED_STRUCTURAL` template link.
3. `RECOVERED_PAIRED` correspondence.
4. `UNCLASSIFIED`.

If explicit and recovered evidence disagree:
```text
effectiveProfile → CONFLICTING
```

---

## 6. Empirical Results & Yield Metrics

| Metric | Phase 7D Baseline | Phase 7E Recovered |
| :--- | :--- | :--- |
| **Observation Recovery** | 0 (0.00%) | **2,505 (9.29%)** |
| **Recovered Iranian** | 0 | **1,254** |
| **Recovered Classical/Dari** | 0 | **1,251** |
| **Unanimous Candidate Consensus** | 0 | **860 candidates** |
| **Partial Consensus** | 0 | **99 candidates** |
| **Conflicting Deterministic** | 0 | **42 candidates** |
| **Fallback Eligible Forms** | 0 | **857 entries** (851 novel) |
| **Reviewed Lexicon Overlap** | 0 | **6 forms** (5 exact matches, 1 divergence) |
| **Reviewed Divergence Rate** | N/A | **16.67%** |
| **Full Experimental Pack Size** | 0 KB | **72 KB gzipped (857 entries)** |

---

## 7. Remaining Blockers & Next Interventions

The remaining blockers after Phase 7E profile recovery:
1. `UNCLASSIFIED_WIKTIONARY_PROFILE` (20,178 observations = 81.91%):
   - Single-romanization records without explicit tags or template bindings.
2. `NON_LEMMA_SOURCE_FORM` (3,919 observations = 15.91%):
   - Inflected forms and grammatical variants intentionally blocked from lexical fallback.
3. `NO_ROMANIZATION` (537 observations = 2.18%):
   - Records with no observed romanization string.
4. `SOURCE_SCRIPT_ALIGNMENT_FAILED` (1 observation = 0.004%):
   - Complex script-transcription mismatch.

**Recommended Next Step (Phase 7F)**:
Investigate single-romanization source template extraction and IPA-assisted disambiguation for the 13,462 single-romanization cohort to safely unlock the remaining unclassified vocabulary.
