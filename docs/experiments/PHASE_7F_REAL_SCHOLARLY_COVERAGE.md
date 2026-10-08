# Phase 7F: Real Scholarly Persian Coverage Corpus & Held-Out Evaluation

**Corpus Version:** `phase7f-openalex-persian-titles-v1`  
**Generated At:** `2026-10-08T13:50:37.185Z`  
**Evaluator Version:** `1.0.0`  
**Diagnostic Index Version:** `1.2.0`  
**Profile Recovery Version:** `1.1.0`  

---

## 1. Executive Summary

Phase 7F measures the real-world coverage impact of the Phase 7E evidence-backed lexical recovery system on **5,000 independent, frozen Persian scholarly titles** sourced from OpenAlex (CC0).

Unlike synthetic unit tests or previously reviewed corpora which were heavily covered by the hand-curated lexicon (~95% display coverage), this held-out scholarly title corpus reflects real-world academic vocabulary diversity.

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

## 2. Experimental Input Identity & Deterministic Hashes

To guarantee measurement integrity and reproducibility across offline CI and local experimental runs, all datasets and rule sets are bound to cryptographic hashes:

| Input Artifact | Identifier / Semantic SHA-256 | Role |
| :--- | :--- | :--- |
| **Frozen Corpus SHA-256** | `28d91c460585ac028e987b01f4ea274f6bd991ad3a2ea79a16f8080fae9b5d5a` | Complete 5,000 title dataset |
| **Locked Holdout SHA-256** | `92ad183e088acbecded7165a806e808d9918482d3d6ce98f3c04072e0fd215d2` | 20% locked evaluation holdout |
| **Production Fallback Semantic SHA** | `0023d8666cd71ca4a718e5d1e910511d8f529c02a44eb77907f9df92b534a77d` | Baseline production fallback pack |
| **Phase 7E Experimental Semantic SHA** | `867906aeadb8148300f1df2271c5b3fbef83523f4229ecdc1d8fbc5cf848bcca` | Recovered Wiktionary fallback pack |
| **Kaikki Source SHA-256** | `f1647707c1bcbb7b18d355f7481ac4c656fa1ff8d91d93a0dbc6bb2e808d06c2` | Raw English Wiktionary Persian dataset |
| **Profile Recovery Engine** | `v1.1.0` | Phase 7E multi-tier profile recovery |
| **Diagnostic Index Engine** | `v1.2.0` | Multi-record lemma/non-lemma aggregator |
| **Evaluator Engine** | `v1.0.0` | Independent scholarly coverage runner |

---

## 3. Corpus Provenance, Acquisition Frame & Representativeness

The evaluation dataset was constructed completely independently of the transliteration engine and lexicon.

### Provenance & Acquisition Invariants
- **Primary Source:** OpenAlex Works API (Filter: `language:fa`, License: CC0-1.0)
- **Eligibility Invariant:** Independent Persian-script validation; at least 2 Persian lexical tokens; non-Latin metadata.
- **Selection Algorithm:** Deterministic SHA-256 ranked selection (`sha256-ranked-v1`).
- **Total Selected Titles:** 5,000
- **Diagnostic Subset (80%):** 4,000 titles
- **Locked Holdout Subset (20%):** 1,000 titles
- **Total Persian Lexical Tokens:** 74,247
- **Unique Normalized Persian Forms:** 10,017

### Corpus Representativeness & Acquisition Frame Limitation
The frozen corpus work type distribution is:
- **Articles:** 4,991 (99.82%)
- **Books:** 5 (0.10%)
- **Reviews:** 3 (0.06%)
- **Book Chapters:** 1 (0.02%)

> **Scholarly Note on Representativeness:**  
> The acquisition pipeline collected the first 6,000 eligible records returned by the OpenAlex API query and hash-ranked them to select 5,000. While hash-ranking removes local ordering bias within the collected pool, this benchmark is primarily a **Persian academic article title benchmark**. It does not represent Persian books, classical prose, or historical manuscripts equally well. Future stratified corpora will address full monograph and bibliographic catalog domains.

---

## 4. Configuration Comparison by Split

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

## 5. Diagnostic Attribution of Misses (DIAGNOSTIC Split)

To maintain rigorous measurement integrity, two distinct distributions are evaluated:
1. **Baseline Misses by Source-Data Availability** (Denominator: 52,775 baseline miss tokens / 8,889 forms).
2. **Remaining Misses After Phase 7E Fallback** (Denominator: 49,960 remaining miss tokens).

### Table 5A: Baseline Misses by Source-Data Availability (Pre-Phase 7E)

| Category | Token Occurrences | Token Share | Unique Forms | Unique Form Share | Description |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `NOT_PRESENT_IN_KAIKKI` | 18,734 | 35.50% | 6,017 | 67.69% | Form completely absent from English Wiktionary Persian dataset |
| `KAIKKI_LEMMA_SINGLE_ROMANIZATION_UNCLASSIFIED` | 12,072 | 22.87% | 1,248 | 14.04% | Lemma with 1 romanization lacking verified dialectal profile |
| `KAIKKI_LEMMA_MULTI_ROMANIZATION_UNCLASSIFIED` | 11,800 | 22.36% | 995 | 11.19% | Lemma with ≥2 romanizations lacking verified profile correspondence |
| `KAIKKI_MIXED_LEMMA_AND_NON_LEMMA` | 4,331 | 8.21% | 131 | 1.47% | Form has both lemma and inflected non-lemma records in Wiktionary |
| `PACK_PRESENT_RUNTIME_RECOVERED` | 2,815 | 5.33% | 259 | 2.91% | Phase 7E fallback entry successfully applied as displayable proposal |
| `KAIKKI_NON_LEMMA_ONLY` | 1,921 | 3.64% | 157 | 1.77% | Purely inflected/variant form lacking uninflected dictionary headword |
| `PACK_PRESENT_RUNTIME_NOT_APPLIED` | 834 | 1.58% | 62 | 0.70% | Phase 7E fallback entry present but intercepted by candidate morphology routing |
| `KAIKKI_NO_ROMANIZATION` | 139 | 0.26% | 10 | 0.11% | Wiktionary record contains Persian script but zero romanizations |
| `KAIKKI_PRESENT_UNCLASSIFIED_CAUSE` | 129 | 0.24% | 10 | 0.11% | Wiktionary record with unclassified profile or parsing blocker |

### Table 5B: Remaining Misses After Phase 7E Experimental Fallback (Post-Phase 7E)

| Category | Remaining Tokens | Token Share | Unique Forms | Unique Form Share | Description |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `NOT_PRESENT_IN_KAIKKI` | 18,734 | 37.50% | 6,017 | 69.72% | Form completely absent from English Wiktionary Persian dataset |
| `KAIKKI_LEMMA_SINGLE_ROMANIZATION_UNCLASSIFIED` | 12,072 | 24.16% | 1,248 | 14.46% | Lemma with 1 romanization lacking verified dialectal profile |
| `KAIKKI_LEMMA_MULTI_ROMANIZATION_UNCLASSIFIED` | 11,800 | 23.62% | 995 | 11.53% | Lemma with ≥2 romanizations lacking verified profile correspondence |
| `KAIKKI_MIXED_LEMMA_AND_NON_LEMMA` | 4,331 | 8.67% | 131 | 1.52% | Form has both lemma and inflected non-lemma records in Wiktionary |
| `KAIKKI_NON_LEMMA_ONLY` | 1,921 | 3.85% | 157 | 1.82% | Purely inflected/variant form lacking uninflected dictionary headword |
| `PACK_PRESENT_RUNTIME_NOT_APPLIED` | 834 | 1.67% | 62 | 0.72% | Phase 7E fallback entry present but intercepted by candidate morphology routing |
| `KAIKKI_NO_ROMANIZATION` | 139 | 0.28% | 10 | 0.12% | Wiktionary record contains Persian script but zero romanizations |
| `KAIKKI_PRESENT_UNCLASSIFIED_CAUSE` | 129 | 0.26% | 10 | 0.12% | Wiktionary record with unclassified profile or parsing blocker |

---

## 6. Audit of Reconciled Runtime Discrepancies

### The 834-Token Eligibility vs Recovery Discrepancy
In the initial unhardened diagnostic report, 3,649 tokens (321 unique forms) were declared eligible based on pack presence, but only 2,815 tokens (259 unique forms) were recovered at runtime.

**Audit Finding:**  
The remaining **834 tokens (62 unique forms)** were present in the Phase 7E fallback pack, but were intercepted at runtime by the engine's compositional morphological analyzer (`analyzeMorphology`). When a token matches candidate affix patterns (e.g. `تغییرات` matching `-āt`, `استان` matching `-stān`, `تهران` matching `-ān`), the engine routes the token to `resolveMorphologicalToken`. Because the morphological resolver currently queries only the reviewed lexicon repository and does not consult the fallback repository, the proposal was not applied.

### Table 6C: Top Intercepted Pack Forms Audit

| Persian Form | Token Frequency | Title Count | Pack Hypothesis | Runtime Cause | Example Title |
| :--- | :---: | :---: | :--- | :--- | :--- |
| **استان** | 219 | 218 | `ustān` | Interpreted as candidate morphological stem/suffix; routed through resolveMorphologicalToken without fallback lookup | *بررسی اثر تغییر کاربری اراضی بر میزان ذخیره و...* |
| **تغییرات** | 99 | 95 | `taghyīrāt` | Interpreted as candidate morphological stem/suffix; routed through resolveMorphologicalToken without fallback lookup | *پیشبینی تغییرات برخی از متغیرهای اقلیمی با اس...* |
| **دانش** | 76 | 74 | `dānish` | Interpreted as candidate morphological stem/suffix; routed through resolveMorphologicalToken without fallback lookup | *مقیاس مهارتهای زندگی:تدوین وهنجاریابی،ابزاری ...* |
| **اقلیم** | 51 | 50 | `iqlīm` | Interpreted as candidate morphological stem/suffix; routed through resolveMorphologicalToken without fallback lookup | *اثر تغییر اقلیم بر اقتصاد گندم دیم (مطالعه مو...* |
| **بارش** | 39 | 37 | `bārish` | Interpreted as candidate morphological stem/suffix; routed through resolveMorphologicalToken without fallback lookup | *کاربرد روش کریجینگ در میان¬یابی بارش مطالعه م...* |
| **پذیرش** | 36 | 36 | `pazīrish` | Interpreted as candidate morphological stem/suffix; routed through resolveMorphologicalToken without fallback lookup | *اثر بخشی درمان گروهی پذیرش و تعهد بر اضطراب و...* |
| **نظام** | 27 | 27 | `niẓām` | Interpreted as candidate morphological stem/suffix; routed through resolveMorphologicalToken without fallback lookup | *تحلیل الزامات به¬کارگیری نظام آموزش ترکیبی از...* |
| **کرمان** | 22 | 22 | `kirmān` | Interpreted as candidate morphological stem/suffix; routed through resolveMorphologicalToken without fallback lookup | *نقشهبرداری رقومی افقهای مشخصه و گروههای بزرگ ...* |
| **گلستان** | 22 | 22 | `gulistān` | Interpreted as candidate morphological stem/suffix; routed through resolveMorphologicalToken without fallback lookup | *رویکرد برنامهریزی وکالتی در برنامهریزی شهری (...* |
| **کردستان** | 21 | 20 | `kurdistān` | Interpreted as candidate morphological stem/suffix; routed through resolveMorphologicalToken without fallback lookup | *مقایسه ویژگی های مورفولوژیکی و شیمیایی میوه ب...* |
| **محصولات** | 17 | 17 | `maḥṣūlāt` | Interpreted as candidate morphological stem/suffix; routed through resolveMorphologicalToken without fallback lookup | *مطالعه جلبکهای سبز- آبی خاکزی و تأثیر آنها بر...* |
| **ایلام** | 16 | 16 | `īlām` | Interpreted as candidate morphological stem/suffix; routed through resolveMorphologicalToken without fallback lookup | *عوامل مؤثر بر نگرش زیستمحیطی مالکان و مدیران ...* |
| **پستان** | 13 | 13 | `pistān` | Interpreted as candidate morphological stem/suffix; routed through resolveMorphologicalToken without fallback lookup | *بررسی اثر ضد باکتریایی ماربوفلوکساسین بر روی ...* |
| **خشونت** | 11 | 11 | `khushūnat` | Interpreted as candidate morphological stem/suffix; routed through resolveMorphologicalToken without fallback lookup | *بررسی میزان خشونت مردان علیه زنان و متغیرهای ...* |
| **عفونت** | 10 | 10 | `ʿufūnat` | Interpreted as candidate morphological stem/suffix; routed through resolveMorphologicalToken without fallback lookup | *بررسی شیوع اینتگرون در اشرشیا کلی و کلبسیلا د...* |

---

## 7. Orthographic & Surface Morphology Analysis

### Zero-Width Non-Joiner (ZWNJ) Empirical Analysis
- **Raw OpenAlex Title ZWNJ Count:** `0`
- **Normalized Surface ZWNJ Count:** `0`

> **ZWNJ Finding:**  
> Empirical inspection confirms that raw metadata feeds from Iranian academic publishers in OpenAlex contain literally zero U+200C codepoints. Authors and publishers consistently write compounds with regular spaces (e.g., `داده های` instead of `داده‌های`) or continuous attachment (e.g., `خروجیهای`). Normalization did **not** strip or delete ZWNJ; the zero count reflects the raw source orthography.

### Surface Suffix & Enclitic Cohorts in Unresolved Tokens
- **Plural Suffix `-hā` (`ها`):** 119 forms
- **Plural Ezafe `-hā-ye` (`های`):** 676 forms
- **Relational `-ī` (`ی`):** 3,182 forms
- **Comparative `-tar` (`تر`):** 32 forms
- **Superlative `-tarīn` (`ترین`):** 8 forms
- **Enclitic Pronouns (`مان`, `شان`, etc.):** 82 forms
- **Proper-Name Cohort:** 218 forms (1,266 tokens, 2.40% of baseline misses)

---

## 8. Recommended Next Intervention (Phase 7G)

**Derived strictly from the 80% DIAGNOSTIC partition remaining misses:**

- **Recommended Phase:** `Phase 7G`
- **Primary Focus:** **External Authority Expansion (LoC / Academic Authority Lexicon Integration)**
- **Rationale:** Forms absent from Wiktionary constitute 37.50% of remaining miss tokens and 69.72% of unique missing forms, forming the largest empirical blocker.
- **Dominant Blocker Category:** `NOT_PRESENT_IN_KAIKKI` (37.50% of remaining unresolved tokens, 69.72% of unique missing forms).

---

## 9. Governance & Safety Invariants

- **FALSE_AUTHORITATIVE:** `0`
- **UNDER_BLOCKED:** `0`
- **Automatic Promotions:** `0`
- **Authoritative Lexicon Mutations:** `0`
- **Production Fallback Pack Unchanged:** `true` (`src/data/generated/kaikki-fallback.v1.json`)
- **Evaluation Fallback Union Conflicts:** `0`
