# Wiktionary Romanization Profile Recovery & Metadata Enrichment (Phase 7E Hardened)

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

Phase 7E introduces a formal, multi-tier profile recovery subsystem that unlocks **3,161 recovered observations** and **1,099 unanimous fallback candidates** with zero linguistic shortcuts and zero authoritative lexicon mutations.

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
1. Source-local structural metadata on verified templates with successful script alignment, or
2. Persian-script consonantal alignment and complementary vowel correspondences across >= 2 position-aligned discriminative slots.

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
- Applied when a verified head template argument explicitly binds a valid romanization slot (e.g. `cls = "..."` or `ira = "..."`), rejects placeholders/sentinels (`"-"`), and validates under script alignment.
- `profileOrigin: 'RECOVERED_STRUCTURAL'`.

### Tier C — Position-Aligned Paired-Scheme Correspondence
- Primary high-yield mechanism (`PAIRED_SCHEME_CORRESPONDENCE`).
- Applies when:
  1. Same Persian lexical record and same Persian spelling;
  2. Same etymology and head subdivision (including `forms[].head_nr`);
  3. Consonantal skeletons match identically in alignment slots;
  4. Both strings align independently to the Persian script;
  5. The vowel slots satisfy >= 2 independent position-aligned discriminative correspondences (e.g. `ā` ↔ `â` [Long A] and `i` ↔ `e` [Kasra] in `imām` / `emâm` or `jihād` / `jehâd`).
- `profileOrigin: 'RECOVERED_PAIRED'`.

---

## 5. Conflict Resolution & Global Multi-Observation Reconciliation

Effective profile resolution follows strict precedence and global order-invariance:
1. `EXPLICIT` source tag.
2. `RECOVERED_STRUCTURAL` template link.
3. `RECOVERED_PAIRED` correspondence.

Global reconciliation algorithm:
- Enumerate all valid pair hypotheses across all observations in a record.
- Collect all profile assignments per observation.
- If all valid evidence assigns the same profile $\to$ `RECOVERED`, preserving all supporting evidence.
- If contradictory assignments exist (e.g. observation paired as Classical with one partner and Iranian with another, or contradicting explicit tags) $\to$ `CONFLICTING`.
- If insufficient signal $\to$ `UNCLASSIFIED`.
- Output is mathematically independent of array or pair iteration order.

---

## 6. Official Wiktionary Policy Signatures

References:
- Classical: [Wiktionary:Persian transliteration/Classical](https://en.wiktionary.org/wiki/Wiktionary:Persian_transliteration/Classical)
- Iranian: [Wiktionary:Persian transliteration/Iranian](https://en.wiktionary.org/wiki/Wiktionary:Persian_transliteration/Iranian)

| Signature ID | Feature | Classical | Iranian | Status |
| :--- | :--- | :--- | :--- | :--- |
| `SIG_PAIR_LONG_A` | Long A | `ā` | `â` | Discriminative |
| `SIG_PAIR_SHORT_KASRA` | Kasra | `i` | `e` | Discriminative |
| `SIG_PAIR_SHORT_ZAMMA` | Zamma | `u` | `o` | Discriminative |
| `SIG_PAIR_LONG_I` | Long I | `ī` | `i` | Discriminative |
| `SIG_PAIR_LONG_U` | Long U | `ū` | `u` | Discriminative |
| `SIG_PAIR_MAJHUL_E_TO_I` | Majhul E | `ē` | `i` | Discriminative |
| `SIG_PAIR_MAJHUL_O_TO_U` | Majhul O | `ō` | `u` | Discriminative |
| `SIG_PAIR_DIPHTHONG_AY_EY` | Diphthong ay/ey | `ay` | `ey` | Discriminative |
| `SIG_PAIR_DIPHTHONG_AW_OW` | Diphthong aw/ow | `aw` | `ow` | Discriminative |
| `SIG_SHARED_FATHAH_A` | Fathah | `a` | `a` | Compatible (Non-discriminative) |
