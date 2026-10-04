# Phase 4.6A — Independent External Scholarly Benchmark Candidate Acquisition

This directory contains the independent external candidate dataset acquired for Phase 4.6A of `persian-scholarly-transliterator`.

## Purpose and Scope

Phase 4.6A establishes an **independent external benchmark candidate set** for Persian scholarly transliteration.

The benchmark candidates in this dataset are:
- **Acquired from independent external scholarly sources**: Encyclopaedia Iranica, OpenAlex, Crossref, Library catalogs (Library of Congress, British Library, Harvard Hollis), Authority files (VIAF, ISNI, GeoNames), and Academic Lexica / Grammars (Lazard, Windfuhr, Thackston, Steingass, Moeen, Dehkhoda).
- **Zero-Authority / Pending Human Review**: Every candidate has `reviewStatus = "PENDING_HUMAN_REVIEW"`.
- **No Expected Outputs**: This dataset contains NO gold transliterations, canonicals, or expected review decisions.
- **Engine-Independent**: No transliteration engine calls or sample generation heuristics were used to select, spell, or classify candidates.
- **Dissertation/Pilot Independent**: Strictly excludes any data from the author's dissertation, dissertation bibliography, pilot validation fixtures, or repository sample outputs.

---

## Benchmark Candidate Inventory

- **Manifest**: [`external-candidates.manifest.json`](file:///d:/persian-scholarly-transliterator/validation/acquisition/external-candidates.manifest.json)
- **Candidate Data**: [`external-candidates.v1.json`](file:///d:/persian-scholarly-transliterator/validation/acquisition/external-candidates.v1.json)
- **Total Candidates**: 160 items
- **Out-of-Sample Rate**: 98.8% (Target >= 70%)
- **Categories Covered**:
  - `TERM` (18)
  - `LEGAL_TERM` (12)
  - `RELIGIOUS_TERM` (12)
  - `PERSON` (18)
  - `PLACE` (12)
  - `INSTITUTION` (10)
  - `BOOK_TITLE` (18)
  - `ARTICLE_TITLE` (12)
  - `COMPOUND` (10)
  - `MORPHOLOGY` (10)
  - `IZAFAT` (10)
  - `AMBIGUITY` (12)
  - `MIXED_SCRIPT` (6)

---

## Freeze Rule (Section 38)

Once `external-benchmark-candidates-v1` is declared acquired and enters human review (Phase 4.6B), candidate `sourceText`, category, proposedProfile, and source provenance are frozen. They must not be modified or filtered based on engine behavior. Any subsequent corrections require explicit versioned provenance.

---

## Review Queue Export

To export the human scholarly review sheet with blank adjudications for Phase 4.6B:

```bash
npm run acquisition:review-sheet
```

This exports `review-sheet.csv` with all candidate source citations, URLs, observed external romanizations, and empty review decision fields.

---

## Validation Commands

```bash
# Offline hermetic acquisition validation and report
npm run validate:acquisition

# Validate scholarly pilot validation corpus (unchanged from Phase 4.5)
npm run validate:corpus
```
