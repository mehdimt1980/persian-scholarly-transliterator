# Persian Scholarly Transliterator

A provenance-aware scholarly Persian transliteration system, initially targeting IJMES. Phase 4 adds a source-preserving batch bibliography processing and scholarly export workflow (CSV, RIS, BibTeX).

This is not an official IJMES or Cambridge product. It is not a general pronunciation engine or a character-substitution transliterator. Persian short vowels are normally unwritten, so unknown and ambiguous words remain review items and cannot be copied as final transliteration without human decision.

## Current scope

Implemented:
- Loss-aware Unicode normalization.
- Unicode-category tokenization.
- Orthographic evidence and combining-mark preservation.
- Scalable, indexed **reviewed scholarly lexicon repository** with stable IDs, source citations, and proper-name metadata (`docs/LEXICON_MODEL.md`).
- Stem-first morphology for plural `ها`, comparative `تر`, superlative `ترین`, six post-consonantal possessive-enclitic realizations, and plural-host `های` izāfat evidence.
- Context relation analysis (confirmed and candidate izāfat).
- **Human review / override workflow** (`docs/REVIEW_WORKFLOW.md`) supporting lexical reading selection, safe manual overrides, izāfat decisions, and morphology branch selection with `USER_OVERRIDE` provenance.
- **Human-gated assisted candidate resolver** (`docs/ASSISTED_RESOLVER.md`) providing advisory language model suggestions for unresolved issues behind strict zero-authority boundaries and human selection.
- **Batch bibliography processing & scholarly exports** (`docs/BIBLIOGRAPHY_BATCH.md`, `docs/EXPORT_FORMATS.md`):
  - RFC-4180 CSV import with unknown column passthrough.
  - Field-level Persian script detection and IJMES policy assignment.
  - Field-scoped review decisions and assisted suggestion integration.
  - Deterministic record and batch readiness evaluation.
  - Source-preserving CSV export.
  - Final scholarly CSV export with `STRICT_ALL` and `READY_ONLY` export modes.
  - Scholarly UTF-8 RIS export (Zotero/EndNote compatible) with CRLF endings and newline sanitization.
  - Scholarly BibTeX export with deterministic citation keys, author formatting, and structural character escaping.
- Interactive Next.js Single and Batch Workspaces.

Arabic/Persian punctuation is structural punctuation, not word material merely because its code point lies inside the Arabic Unicode block. The result retains the original input globally; public token fields are deliberately named `normalizedSurface`, `normalizedStart`, and `normalizedEnd`. They describe normalized input and do not claim original-input spans.

## Run and verify

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```

The framework-independent engine is in `src/domain`. See `docs/BIBLIOGRAPHY_BATCH.md`, `docs/EXPORT_FORMATS.md`, `docs/ASSISTED_RESOLVER.md`, `docs/REVIEW_WORKFLOW.md`, and `docs/LEXICON_MODEL.md` for architecture details.
