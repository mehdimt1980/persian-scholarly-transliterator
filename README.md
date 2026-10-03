# Persian Scholarly Transliterator

A provenance-aware scholarly Persian transliteration system, initially targeting IJMES. Phase 2A adds source-aware orthographic analysis and productive relation candidates without reconstructing missing vowels or weakening Phase 1 review boundaries.

This is not an official IJMES or Cambridge product. It is not a general pronunciation engine or a character-substitution transliterator. Persian short vowels are normally unwritten, so unknown and ambiguous words remain review items and cannot be copied as final transliteration.

## Current scope

Implemented: loss-aware Unicode normalization, stable token offsets, explicit fatḥa/kasra/ḍamma evidence, vocalized-surface lookup against unvocalized lexical forms, ZWNJ boundary evidence, structured lexical ambiguity filtering, confirmed explicit izāfat, curated relation evidence, conservative unmarked izāfat candidates, canonical IJMES rendering, two output profiles, token/relation inspection, and guarded copying.

The motivating title deliberately exposes unresolved editorial joining choices for `درباره` and `تجددخواهی`; IJMES supplies vowel and display policy but does not by itself settle those lexical segmentation decisions.

Not implemented: comprehensive morphology or lexicon, missing-short-vowel reconstruction, productive suffix semantics, automatic compound splitting, user corrections, batch/export workflows, or AI-assisted resolution.

## Run and verify

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```

The framework-independent engine is in `src/domain`. See `docs/MORPHOLOGY_CONTEXT_MODEL.md` for the Phase 2A evidence and relation model.
