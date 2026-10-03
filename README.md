# Persian Scholarly Transliterator

A provenance-aware scholarly Persian transliteration system, initially targeting IJMES. Phase 2C adds a scalable indexed reviewed scholarly lexicon and a human review/override workflow for unresolved and ambiguous evidence.

This is not an official IJMES or Cambridge product. It is not a general pronunciation engine or a character-substitution transliterator. Persian short vowels are normally unwritten, so unknown and ambiguous words remain review items and cannot be copied as final transliteration without human decision.

## Current scope

Implemented:
- Loss-aware Unicode normalization.
- Unicode-category tokenization.
- Orthographic evidence and combining-mark preservation.
- Scalable, indexed **reviewed scholarly lexicon repository** with stable IDs, source citations, and proper-name metadata (`docs/LEXICON_MODEL.md`).
- Stem-first morphology for plural `ها`, comparative `تر`, superlative `ترین`, six post-consonantal possessive-enclitic realizations, and plural-host `های` izāfat evidence.
- Context relation analysis (confirmed and candidate izāfat).
- **Human review / override workflow** (`docs/REVIEW_WORKFLOW.md`) supporting:
  - Lexical reading selection (e.g. `کرم` → `karam` / `kirm`).
  - Safe manual canonical transliteration for unknown tokens (e.g. `مشروطهخواهی` → `mashrūṭa-khvāhī`).
  - Izāfat candidate acceptance (`ACCEPT_IZAFAT`) and rejection (`REJECT_IZAFAT`).
  - Morphology competition resolution (`WHOLE_WORD` vs `PRODUCTIVE_SEGMENTATION`).
  - Distinct `USER_OVERRIDE` status with separate provenance rules (`USER-LEXICAL-READING-SELECTION`, `USER-MANUAL-CANONICAL-OVERRIDE`, `USER-IZAFAT-ACCEPT`, `USER-IZAFAT-REJECT`, `USER-MORPHOLOGY-SELECTION`).
- **Human-gated assisted candidate resolver** (`docs/ASSISTED_RESOLVER.md`) providing advisory language model suggestions for unresolved issues behind strict zero-authority boundaries and human selection.
- Guarded copying: output becomes copyable only when all review blockers are resolved.
- Interactive Next.js Review Workspace with real-time decision application, assisted suggestion queries, and undo.

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

The framework-independent engine is in `src/domain`. See `docs/REVIEW_WORKFLOW.md`, `docs/LEXICON_MODEL.md`, `docs/PRODUCTIVE_MORPHOLOGY.md`, and `docs/MORPHOLOGY_CONTEXT_MODEL.md` for architecture details.
