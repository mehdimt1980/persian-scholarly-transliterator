# Scholarly Corpus Authoring Guide

## Purpose

The **Scholarly Validation Corpus** establishes reviewed ground truth for Persian-to-English scholarly transliteration under the International Journal of Middle East Studies (IJMES) standard.

The core release invariant of this project is:
> **A wrong authoritative transliteration is worse than an unresolved result.**

Every test case in this corpus serves as an inviolable authority benchmark to ensure that the system never produces false authoritative transliterations on real Persian academic material.

---

## Gold Corpus Principles

1. **Human-Reviewed Ground Truth Only**:
   - The transliteration engine and application must **NEVER** create their own gold answers.
   - **No Language Model (LLM)** may generate or approve gold expected outputs.
   - **Never use current engine output as the justification for a gold answer.**
   - All gold expectations must originate from explicit scholarly review backed by cited sources.

2. **Mandatory Multi-Source Provenance**:
   - Every case must include full provenance metadata with one or more cited sources:
     - `sources`: Array of `ValidationSource` objects (`kind`, `citation`, optional `locator`, optional `note`).
     - Supported source kinds: `'IJMES_GUIDE' | 'SCHOLARLY_DICTIONARY' | 'ENCYCLOPEDIA' | 'ACADEMIC_SOURCE' | 'DISSERTATION_REVIEW' | 'PROJECT_REVIEW'`.
     - Allows citing lexical evidence (e.g. *Encyclopaedia Iranica*) alongside transliteration rules (e.g. *Cambridge IJMES Guide*).
     - Optional `reviewNote`: Explanatory context when appropriate.

3. **Exact Unicode Fidelity & No Automatic Trimming**:
   - Gold answers use exact Unicode characters and diacritics (`ā`, `ī`, `ū`, `ḥ`, `ṣ`, `ṭ`, `ẓ`, `ʿ`, `ʾ`, `-`).
   - Comparison is strictly exact (`normalize('NFC')` without `.trim()`).
   - Accidental leading or trailing whitespace in gold data is rejected during schema validation.

4. **Corpus Maturity & Review Status**:
   - `tier`: `'PILOT' | 'REAL_DISSERTATION'`
   - `reviewStatus`: `'SOURCE_BACKED_FIXTURE' | 'HUMAN_REVIEWED'`
   - When `reviewStatus === 'HUMAN_REVIEWED'`, valid `reviewer` and `reviewedAt` fields are mandatory.

---

## Expected Disposition Semantics

### 1. `FINAL`
Used when scholarly consensus or reference evidence establishes a single authoritative transliteration (or a defined set of accepted variants).

**Requirements**:
- Must provide `canonical` or `allowedCanonicals`.
- Every canonical value must be non-empty, unique, trimmed, and Latin/scholarly transliteration (not Arabic/Persian script).

**Example**:
```json
{
  "id": "case-term-01",
  "input": "کتاب",
  "profile": "ijmes_full",
  "category": "TERM",
  "expected": {
    "disposition": "FINAL",
    "canonical": "kitāb"
  },
  "provenance": {
    "sources": [
      {
        "kind": "SCHOLARLY_DICTIONARY",
        "citation": "Steingass, Comprehensive Persian-English Dictionary",
        "locator": "p. 1013"
      }
    ]
  }
}
```

### 2. `REVIEW_REQUIRED`
Used when the input is unvocalized, ambiguous, or contains context-dependent structures (e.g. unvocalized izāfat candidates, multiple lexical readings) where the only safe behavior is to block automatic authority and require scholar review.

**Requirements**:
- The engine must output `copyable = false`.
- May specify `requiredIssueTypes` (e.g. `['LEXICAL_AMBIGUITY']`, `['IZAFAT_CANDIDATE']`).
- Must not provide an authoritative `canonical` or `allowedCanonicals`.

**Example**:
```json
{
  "id": "case-ambig-01",
  "input": "کرم",
  "profile": "ijmes_full",
  "category": "AMBIGUITY",
  "expected": {
    "disposition": "REVIEW_REQUIRED",
    "requiredIssueTypes": ["LEXICAL_AMBIGUITY"]
  },
  "provenance": {
    "sources": [
      {
        "kind": "SCHOLARLY_DICTIONARY",
        "citation": "Steingass, Comprehensive Persian-English Dictionary",
        "locator": "p. 1025 (kirm worm / karam generosity)",
        "note": "Unvocalized Persian form has multiple distinct lexical readings requiring human review."
      }
    ]
  }
}
```

### 3. `UNRESOLVED`
Used when scholarly evidence is intentionally insufficient or lexical coverage is not yet established. The system must remain non-copyable rather than guessing.

**Example**:
```json
{
  "id": "case-unresolved-01",
  "input": "ناشناخته‌ها",
  "profile": "ijmes_full",
  "category": "OTHER",
  "expected": {
    "disposition": "UNRESOLVED"
  },
  "provenance": {
    "sources": [
      {
        "kind": "PROJECT_REVIEW",
        "citation": "Unreviewed stem with plural morphology fixture",
        "note": "Engine must not manufacture a stem reading for unreviewed vocabulary."
      }
    ]
  }
}
```

---

## Failure Triage Model

When validation detects a non-passing case, it must be triaged into one of the following root-cause categories before any remediation:

1. `LEXICON_COVERAGE`: Valid term missing from the reviewed lexicon.
2. `LEXICON_WRONG_READING`: Lexical entry contains an erroneous canonical reading.
3. `ORTHOGRAPHY`: Suboptimal handling of combining marks, vocalization, or ZWNJ.
4. `MORPHOLOGY`: Suffix/enclitic segmentation or realization error.
5. `IZAFAT`: Vocalized or contextual izāfat failure.
6. `PROFILE_FORMATTING`: Inconsistency in title vs full profile rules.
7. `TITLE_FORMATTING`: Capitalization or English title rule error.
8. `TOKENIZATION`: Incorrect token span or punctuation boundary.
9. `NORMALIZATION`: Unicode character normalization defect.
10. `REVIEW_AUTHORITY`: Incorrect issue detection or decision application.
11. `BIBLIOGRAPHY_PIPELINE`: Field policy or record export defect.
12. `GOLD_DATA_ERROR`: Flaw in the gold corpus case definition itself.
