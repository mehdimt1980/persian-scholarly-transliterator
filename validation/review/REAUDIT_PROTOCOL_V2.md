# Phase 4.6B Systematic Blind Re-Audit Protocol (Validation V2)

## 1. Purpose & Core Principles

The **Phase 4.6B Systematic Re-Audit** establishes proposed V2 scholarly ground truth that remains pending human governance sign-off and gold freeze for all 108 externally acquired benchmark candidates under the [Canonical-vs-Rendering Contract](./CANONICAL_RENDERING_CONTRACT.md) and [Validation V2 Specification](../V2_SCHEMA.md).

```text
Blind specialist re-audit
        ↓
Proposed V2 benchmark
        ↓
Human governance sign-off
        ↓
Gold freeze
        ↓
Phase 4.6C engine evaluation
```

The re-audit must be conducted under strict **anti-anchoring** and **engine-blindness** discipline. Specifically, all new decisions must be established independently of:
- Current engine output;
- Current runtime lexicon;
- Current morphological parser;
- Current profile rendering implementation;
- Historical V1 adjudication values (`adjudication.v1.json`).

> **Governing Status of Historical V1 Adjudication:**
> Historical V1 adjudication records conflated scholarly canonical transliteration with publication rendering in some records. Therefore, V1 adjudication is designated **`HISTORICAL_ONLY`**. It must **never** be cited or used as evidence for new V2 decisions. Historical V1 records may be consulted only *after* a V2 decision is locked, strictly for post-hoc discrepancy analysis.

---

## 2. Three Independent Questions per Candidate

For every candidate, the reviewer must determine three dimensions independently:

### A. Expected Disposition
Exactly one of:
1. **`FINAL`**: Scholarly consensus or verified reference evidence establishes an authoritative reading and publication rendering.
2. **`REVIEW_REQUIRED`**: The unvocalized source string is genuinely ambiguous, context-dependent, or supports multiple defensible readings where automatic authority cannot safely be asserted.
3. **`UNRESOLVED`**: Scholarly lexical evidence is absent or intentionally insufficient.

### B. Scholarly Canonical Transliteration (Required for `FINAL`)
- Source-faithful, diacritic-preserving linguistic representation.
- Fully represents Persian phonology, vowels, consonants, ʿayn (`ʿ`), hamza (`ʾ`), morphological boundaries, and izāfat (`-i` / `-yi`).
- Must **not** be derived from or modified by publication house style (e.g. proper-name diacritic stripping or English title capitalization).

### C. Publication Rendering (Required for `FINAL`)
- The presentation string under the candidate's designated profile policy (e.g., `ijmes_full` or `ijmes_title`).
- Reflects editorial transformations (e.g. removal of ordinary diacritics from proper names, English title casing, Cambridge IJMES Word List forms, or established English conventional spellings where permitted by IJMES).
- Publication rendering must **never** redefine or overwrite scholarly canonical truth.

---

## 3. Evidence Separation

Reviewers must strictly distinguish two distinct types of evidence:

```text
+------------------------------------+      +------------------------------------+
|      Reading / Identity Evidence   |      |        Rendering Evidence          |
+------------------------------------+      +------------------------------------+
| Dictionaries (Dehkhoda, Steingass) |      | Cambridge IJMES Guide              |
| Encyclopaedia Iranica Headwords    |      | Cambridge IJMES Word List          |
| Academic Grammars & Editions       |      | Title Casing Rules                 |
| Library Authority Records (LC/VIAF)|      | Accepted English Proper Names      |
+------------------------------------+      +------------------------------------+
                  |                                           |
                  v                                           v
    Scholarly Canonical Truth                       Publication Rendering
```

- **Reading / Identity Evidence** establishes the true Persian lexical reading, pronunciation, and grammatical structure.
- **Rendering Evidence** governs how that established reading is formatted for publication.

> **Key Rule:**
> - A source can establish identity or reading without being authoritative for IJMES rendering.
> - IJMES can govern publication rendering without independently establishing Persian lexical reading.

---

## 4. Source Fidelity & Anti-Substitution

Reviewers must adjudicate the **exact Persian surface string** supplied in the candidate record.

- **No Silent Substitution:** Do not replace an epithet, compound title, or specific wording with an expanded formal name, another alias, or an English translation (e.g., `ملک‌الشعرای بهار` must be adjudicated as the title string itself, not replaced with `Mohammad-Taqi Bahar`).
- **Entity Identity vs. Surface Text:** Entity identification aids comprehension of context, but the benchmark evaluates transliteration of the exact surface text.

---

## 5. Ambiguity & Safety Policy

The primary project invariant is:
$$\text{FALSE\_AUTHORITATIVE} = 0$$

- If an unvocalized Persian surface supports multiple materially different scholarly readings and context does not disambiguate them, the mandatory disposition is **`REVIEW_REQUIRED`**.
- `REVIEW_REQUIRED` is a successful, safe scholarly outcome. Reviewers must never guess a single reading to force a `FINAL` disposition.
- Disjunctive candidate readings may be recorded in reviewer notes for discrepancy tracking, but must **not** populate authoritative output fields in V2 gold data.

---

## 6. Anti-Anchoring & Blindness Protocol

During initial V2 adjudication:
1. **Prohibited Starting Inputs:**
   - Previous V1 `canonical` or `allowedCanonicals`;
   - Previous amendment ledger records;
   - Transliteration engine output or runtime tokens;
   - Lexicon lookup results;
   - Benchmark evaluation metrics.
2. **Permitted Starting Materials:**
   - Persian source candidate (`sourceText`);
   - Candidate category and proposed profile;
   - Acquired provenance and verification receipts;
   - Primary reference lexica and IJMES style manuals;
   - Additional independent scholarly literature when needed.

---

## 7. Reviewer Provenance & Governance Integrity

- When adjudication is conducted by an AI specialist, provenance must record the canonical reviewer object:
  ```json
  "reviewer": {
    "name": "OpenAI GPT-5.6 Sol",
    "type": "AI_SPECIALIST",
    "reviewedAt": "YYYY-MM-DD"
  }
  ```
  Specifically, `reviewer.type = "AI_SPECIALIST"`.
- Do not claim human review.
- The `reviewedAt` field must record the actual review date (in `YYYY-MM-DD` format) on which the adjudication was performed.
- Human governance sign-off occurs in a subsequent phase (`validation/review/HUMAN_SIGNOFF.md`) and does not retroactively rewrite AI reviewer provenance.

---

## 8. Category-Specific Review Guidelines

### A. `TERM` & `RELIGIOUS_TERM`
- Distinguish Persianized pronunciation/reading from Classical Arabic root etymology.
- Differentiate IJMES Word List conventional forms from full scholarly transliteration.
- Avoid mechanical character substitutions from Encyclopaedia Iranica transcription.

### B. `PERSON`, `PLACE`, `INSTITUTION`
- Preserve exact source identity and spelling.
- Scholarly canonical preserves all diacritics (`ā`, `ī`, `ū`, `ḥ`, `ṣ`, `ṭ`, `ẓ`, `ʿ`, `ʾ`).
- Rendering removes ordinary diacritics per IJMES house style while retaining ʿayn and medial/final hamza.
- Accepted English forms apply only at the rendering level when explicitly established under IJMES policy.

### C. `BOOK_TITLE`
- Scholarly canonical transliterates the full Persian title with all diacritics and izāfat linkers.
- Publication rendering applies title casing, removes ordinary diacritics, and leaves grammatical connectives lowercase.

### D. `COMPOUND` & `MORPHOLOGY`
- Verify morpheme boundaries, suffixes, prefixes, and enclitics.
- Handle zero-width non-joiners (ZWNJ) and vowel-final host stems accurately.

### E. `IZAFAT`
- Independently verify consonant-final (`-i`) versus post-vocalic (`-yi`) izāfat.
- Do not infer linker spelling from engine defaults.

### F. `AMBIGUITY`
- Default to `REVIEW_REQUIRED` unless context or unambiguous orthography dictates a unique reading.

---

## 9. Re-Audit Batch Plan

The 108 candidates are organized into 5 deterministic review batches:

| Batch | Description | Categories Included | Case Count |
|---|---|---|---|
| **Batch A** | Lexical & Religious | `TERM` (15), `RELIGIOUS_TERM` (10) | **25** |
| **Batch B** | Grammatical Structure | `COMPOUND` (5), `MORPHOLOGY` (10), `IZAFAT` (8) | **23** |
| **Batch C** | Named Entities | `PERSON` (18), `PLACE` (12), `INSTITUTION` (6) | **36** |
| **Batch D** | Titles | `BOOK_TITLE` (12) | **12** |
| **Batch E** | Ambiguity & Polysemy | `AMBIGUITY` (12) | **12** |
| **Total** | | **All 10 Categories** | **108** |

All 108 cases start in state **`PENDING`** with **`decision: null`** in [`validation/review/reaudit-worklist.v2.json`](./reaudit-worklist.v2.json).

---

## 10. Future Decision Contract (Batches A–E)

During subsequent batch adjudication PRs, each reviewed case will transition from `reviewState = "PENDING"` to `reviewState = "COMPLETED"` with a populated `decision` object adhering strictly to the contract below.

### A. Contract for `disposition = "FINAL"`
```json
{
  "disposition": "FINAL",
  "scholarlyCanonical": "source-faithful transliteration with full diacritics",
  "renderedOutput": "profile-formatted publication string",
  "readingEvidence": [
    {
      "source": "Dehkhoda / Steingass / Academic Lexicon",
      "citation": "Full scholarly citation",
      "locator": "Page / entry headword"
    }
  ],
  "renderingEvidence": [
    {
      "source": "Cambridge IJMES Guide / Word List",
      "rule": "Specific rendering rule citation"
    }
  ],
  "reviewNote": "Explanatory scholarly rationale",
  "reviewer": {
    "name": "OpenAI GPT-5.6 Sol",
    "type": "AI_SPECIALIST",
    "reviewedAt": "YYYY-MM-DD"
  }
}
```

### B. Contract for `disposition = "REVIEW_REQUIRED"` and `UNRESOLVED`
For non-FINAL cases:
- Authoritative `scholarlyCanonical` must be **absent**.
- Authoritative `renderedOutput` must be **absent**.
- `readingEvidence` plus a clear review rationale should document why authoritative reading is blocked or unresolved.
- `renderingEvidence` is **optional** and only appropriate when a relevant rendering-policy fact materially contributes to the review (it must not be mandatory when no scholarly canonical reading has been established).
- Non-authoritative candidate alternative readings may appear in `nonAuthoritativeAlternatives`, strictly as **NON-GOLD**:
```json
{
  "disposition": "REVIEW_REQUIRED",
  "nonAuthoritativeAlternatives": [
    {
      "reading": "candidate reading a",
      "source": "Citation A"
    },
    {
      "reading": "candidate reading b",
      "source": "Citation B"
    }
  ],
  "readingEvidence": [
    {
      "source": "Dehkhoda / Academic Lexicon",
      "citation": "Scholarly citation documenting ambiguity",
      "locator": "Page / headword"
    }
  ],
  "reviewNote": "Unvocalized Persian source supports multiple distinct lexical readings.",
  "reviewer": {
    "name": "OpenAI GPT-5.6 Sol",
    "type": "AI_SPECIALIST",
    "reviewedAt": "YYYY-MM-DD"
  }
}
```

> **Important Boundary:**
> - In this PR (PR #17), all 108 cases remain `decision = null` and `reviewState = "PENDING"`.
> - Subsequent batch adjudication PRs will use a batch-aware validator to verify populated decisions against this contract.
