# Persian Scholarly Transliterator

A provenance-aware scholarly Persian transliteration system, initially targeting IJMES. Phase 2B adds a conservative, stem-first productive-suffix layer without reconstructing missing vowels or weakening earlier review boundaries.

This is not an official IJMES or Cambridge product. It is not a general pronunciation engine or a character-substitution transliterator. Persian short vowels are normally unwritten, so unknown and ambiguous words remain review items and cannot be copied as final transliteration.

## Current scope

Implemented: loss-aware Unicode normalization, Unicode-category tokenization, orthographic evidence, stem-first morphology for plural `ها`, comparative `تر`, superlative `ترین`, six post-consonantal possessive-enclitic realizations, plural-host `های` izāfat evidence, lexical resolution, relation analysis, canonical IJMES rendering, token/morpheme/relation inspection, and guarded copying.

Arabic/Persian punctuation is structural punctuation, not word material merely because its code point lies inside the Arabic Unicode block. The result retains the original input globally; public token fields are deliberately named `normalizedSurface`, `normalizedStart`, and `normalizedEnd`. They describe normalized input and do not claim original-input spans. Exact original-token span alignment is a documented future refinement.

The motivating title deliberately exposes unresolved editorial joining choices for `درباره` and `تجددخواهی`; IJMES supplies vowel and display policy but does not by itself settle those lexical segmentation decisions.

Not implemented: general morphology or POS tagging, non-scoped suffixes, verb/prefix analysis, automatic compound splitting, missing-short-vowel reconstruction, user corrections, batch/export workflows, or AI-assisted resolution.

## Run and verify

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```

The framework-independent engine is in `src/domain`. See `docs/PRODUCTIVE_MORPHOLOGY.md` and `docs/MORPHOLOGY_CONTEXT_MODEL.md` for the Phase 2B evidence model.
