# Scholarly Export Formats

Phase 4 implements four export serializers for scholarly bibliographic interchange.

---

## 1. Export Invariants

1. **No Diagnostic Placeholders in Final Output**: Strings such as `⟦...: ambiguous⟧` or `⟦...: unresolved⟧` can **never** enter RIS, BibTeX, or final CSV outputs.
2. **UTF-8 Diacritic Preservation**: Full scholarly Unicode characters (`ā`, `ī`, `ū`, `ḥ`, `ṣ`, `ṭ`, `ẓ`, `ż`, `ʿ`, `ʾ`) are preserved directly in UTF-8.
3. **No Direct Third-Party API coupling**: Export is file-based (CSV, RIS, BibTeX). No proprietary EndNote or Zotero cloud writes.

---

## 2. Supported Export Formats

### A. Source-Preserving Review CSV (`exportReviewCsv`)
- Intended for ongoing scholarly review and auditing.
- Contains original source columns + derived `translit_*` columns + `record_status` + `review_issue_count` + all custom `passthrough` columns.
- For unresolved fields, the `translit_*` cell remains blank.

### B. Final Scholarly CSV (`exportFinalCsv`)
- Intended for downstream ingestion into spreadsheets and database tables.
- Contains final clean bibliographic metadata for resolved records.
- Obeying `STRICT_ALL` or `READY_ONLY` export policies.

### C. Scholarly RIS (`exportToRis`)
- Primary interchange format for Zotero and EndNote.
- Line-oriented with standard `\r\n` (CRLF) line endings.
- Tag mapping:
  - `BOOK` → `TY  - BOOK`
  - `JOURNAL_ARTICLE` → `TY  - JOUR`
  - `BOOK_CHAPTER` → `TY  - CHAP`
  - `THESIS` → `TY  - THES`
  - `OTHER` → `TY  - GEN`
- Standard tags: `TI` (title), `T2` (container), `AU` (repeated per author), `ED` (repeated per editor), `PY` (year), `PB` (publisher), `CY` (place), `VL` (volume), `IS` (issue), `SP`/`EP` (pages), `DO` (DOI), `UR` (URL), `SN` (ISBN/ISSN), `N1` (notes), `ER  - `.
- Sanitization: Embedded newlines within a tag are normalized to spaces and logged as an `ExportDiagnostic`.

### D. Scholarly BibTeX (`exportToBibTeX`)
- Standard LaTeX/BibTeX citation format.
- Entry types: `@book`, `@article`, `@incollection`, `@phdthesis`, `@misc`.
- Deterministic citation keys: `pst_<safeRecordId>`.
- Multi-author strings: joined with ` and ` (e.g. `author = {Creator One and Creator Two}`).
- Escapes structural characters (`\`, `{`, `}`, `%`, `$`, `&`, `#`) while preserving Unicode diacritics.
- Fails closed if citation key collisions occur (`DUPLICATE_CITATION_KEY`).
