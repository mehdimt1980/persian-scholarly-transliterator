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

2. **Mandatory Provenance**:
   - Every case must include full provenance metadata:
     - `kind`: `'IJMES_GUIDE' | 'SCHOLARLY_DICTIONARY' | 'ENCYCLOPEDIA' | 'ACADEMIC_SOURCE' | 'DISSERTATION_REVIEW' | 'PROJECT_REVIEW'`
     - `citation`: Full academic citation (e.g., dictionary, grammar reference, monograph, or guide).
     - `locator`: Page number, section, or lemma.
     - `note`: Explanatory context when appropriate.

3. **Exact Unicode Fidelity**:
   - Gold answers use exact Unicode characters and diacritics (`ā`, `ī`, `ū`, `ḥ`, `ṣ`, `ṭ`, `ẓ`, `ʿ`, `ʾ`, `-`).
   - Do not lowercase, strip diacritics, or homogenize vowels.

---

## Expected Disposition Semantics

### 1. `FINAL`
Used when scholarly consensus or reference evidence establishes a single authoritative transliteration (or a defined set of accepted variants).

**Requirements**:
- Must provide `canonical` or `allowedCanonicals`.
- Must not contain Arabic/Persian script in the canonical string.

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
    "kind": "SCHOLARLY_DICTIONARY",
    "citation": "Steingass, Comprehensive Persian-English Dictionary",
    "locator": "p. 1013"
  }
}
```

### 2. `REVIEW_REQUIRED`
Used when the input is unvocalized, ambiguous, or contains context-dependent structures (e.g. unvocalized izāfat candidates, multiple lexical readings) where the only safe behavior is to block automatic authority and require scholar review.

**Requirements**:
- The engine must output `copyable = false`.
- May specify `requiredIssueTypes` (e.g. `['LEXICAL_AMBIGUITY']`, `['IZAFAT_CANDIDATE']`).
- Must not provide an authoritative `canonical` unless accompanied by an explanatory note.

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
    "kind": "SCHOLARLY_DICTIONARY",
    "citation": "Steingass, Comprehensive Persian-English Dictionary",
    "locator": "p. 1025 (kirm worm vs karam generosity)",
    "note": "Unvocalized Persian homograph requires human review."
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
    "kind": "PROJECT_REVIEW",
    "citation": "Unreviewed stem fixture",
    "note": "Engine must not manufacture a stem reading for unreviewed vocabulary."
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

---

## Regression Policy

Any confirmed `FALSE_AUTHORITATIVE` or `UNDER_BLOCKED` case discovered in production or testing must immediately be converted into a permanent regression test case. No fix may be merged without a test reproducing the original failure.
