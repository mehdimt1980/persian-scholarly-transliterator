# Phase 7G Track B: Library of Congress Bibliographic Evidence Feasibility Pilot

**Pilot Version:** `1.1.0`  
**Generated At:** `2026-10-08T14:32:23.475Z`  
**Execution Mode:** `FIXTURE_VALIDATION`  
**Selection Version:** `phase7g-diagnostic-runtime-v1.1.0`  
**Pilot Selection SHA-256:** `40cb8fc7ce2307f5cf06a0b3f4069fe9be2fcb3c92f1c69e92cb19257737886b`  
**Corpus Manifest SHA-256:** `28d91c460585ac028e987b01f4ea274f6bd991ad3a2ea79a16f8080fae9b5d5a`  

---

## 1. Feasibility Study Objective & Scientific Principles

Phase 7G Track B determines whether the existing Library of Congress (LoC) bibliographic connector can supply additional, provenance-backed Persian/Latin paired observations relevant to the uncovered scholarly-title corpus.

### Governing Principles
1. **Bibliographic Entity Evidence Yield ≠ Lexical Coverage Improvement:**  
   WorldCat and LoC catalog records attest monographic titles, author names, publishers, and corporate bodies. They do **not** provide independently verified romanization for every constituent word within a title.
2. **No Automatic Multiword Dictionary Extraction:**  
   A multiword Latin title cannot be naively tokenized to create word-level dictionary entries. Token alignment without contextual morphological grounding introduces severe lexical distortion.
3. **Cataloging Scheme vs Convention Distinction (ALA-LC vs RDA vs IJMES):**  
   MARC 040$e denotes cataloging description conventions (e.g., RDA, AACR2), not ALA-LC romanization scheme confirmation. Catalog provenance does not confer authoritative transliteration status.

---

## 2. Pilot Selection Frame (DIAGNOSTIC Split Only)

- **Total Diagnostic Cases Available:** 4,000 titles
- **Eligible Unresolved Cases:** Titles with unresolved Persian lexical tokens at runtime (`status === 'UNRESOLVED'`)
- **Sampling Method:** Deterministic SHA-256 hash ranking (`sha256-ranked-v1`)
- **Sample Size:** **100 titles**
- **Holdout Partition Protection:** **LOCKED_HOLDOUT partition was strictly untouched (zero leakage).**

---

## 3. Quantitative Pilot Findings & Linkage Validation

| Extraction & Linkage Metric | Pilot Yield | Interpretation |
| :--- | :---: | :--- |
| **Execution Mode** | **`FIXTURE_VALIDATION`** | Fixture-based structural validation (Offline CI) |
| **Pilot Titles Selected** | **100** | Bounded, reproducible DIAGNOSTIC sample |
| **Live Remote Requests Attempted** | 0 | Zero live requests in fixture validation mode |
| **Live Remote Responses Succeeded** | 0 | Zero live responses in fixture validation mode |
| **Unique Fixture Records Loaded** | 13 | Committed XML fixtures across catalog sample |
| **Unique Live Records Retrieved** | 0 | Offline execution (live network optional) |
| **Persian-Language Records Verified** | 10 | Verified via 008, 041, 546 language markers |
| **Records Containing MARC Field 880** | 13 | Alternate graphic representation present |
| **Valid MARC 880 Linkages ($6 MATCHED)** | 29 | Robust bi-directional pairing across fixture records |
| **Rejected / Ambiguous Linkages** | 3 | Correctly rejected by linkage validator |
| **Eligible Persian/Latin Title Pairs** | 6 | Monographic titles (MARC 245$a, 245$b, 246$a) |
| **Eligible Personal Name Pairs** | 4 | Author/Editor names (MARC 100$a, 700$a) |
| **Exact Matched Pilot Titles** | **0** | **Zero exact title matches to journal articles** |
| **Partial Matched Pilot Titles** | 0 | Coincidental sub-phrase overlap only |
| **Unmatched Pilot Titles** | 100 | Unmatched against monographic catalog records |
| **Source Scheme Status** | Inferred | `UNVERIFIED_INFERRED` (ALA-LC cataloging basis) |
| **Real-World Search Yield** | **NOT_MEASURED** | Structural validation, not empirical search yield |
| **Lexical Coverage Delta** | **UNDETERMINED** | **Cannot calculate lexical delta without word alignment** |

---

## 4. Fundamental Structural Findings

### A. Bibliographic Publication Type Mismatch
The OpenAlex scholarly coverage corpus is **99.82% journal articles** (`workType: 'article'`), whereas national library catalogs (Library of Congress, British Library, National Library of Iran) index **monographic books, edited volumes, and dissertations**. Individual journal articles are indexed in abstracting and indexing databases (e.g. Scopus, Web of Science, SID, Magiran), not as standalone monographic MARC catalog records.

### B. Phrase-Level vs Word-Level Lexical Utility
LoC catalog records provide high-value bibliographic entity evidence for:
- **Personal Names:** Persian author names matched to Latin authority forms (e.g., *حافظ* ↔ *Ḥāfiẓ*).
- **Uniform Titles & Monograph Titles:** (e.g., *دیوان حافظ* ↔ *Dīvān-i Ḥāfiẓ*).

However, they do **not** solve general vocabulary lexical misses (e.g. *بررسی*, *تاثیر*, *رویکرد*, *شناختی*) because converting multiword catalog titles into word dictionaries without supervised alignment violates scholarly integrity.

---

## 5. Governance & Future Evidence Architecture Recommendations

1. **Keep LoC Evidence Separate from Lexical Fallback:**  
   Bibliographic entity evidence from LoC must reside in a dedicated **Bibliographic Entity Repository**, not mixed into the general lexical fallback pack.
2. **Future Scope for WorldCat / National Bibliographies:**  
   Future integration of WorldCat or Persian national bibliographies requires:
   - Dedicated bibliographic entity data structures.
   - Scheme mapping layers (ALA-LC → IJMES).
   - Independent scholarly adjudication before any promotion.

```json
{
  "zeroAutomaticDictionaryExtraction": true,
  "zeroAuthorityPromotion": true,
  "heldOutCorpusUntouched": true
}
```
