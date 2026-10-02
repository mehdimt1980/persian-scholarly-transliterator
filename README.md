# Persian Scholarly Transliterator

A provenance-aware Phase 1 foundation for scholarly Persian transliteration, initially targeting IJMES. It normalizes and tokenizes Persian input, resolves reviewed lexical readings, detects limited context evidence, applies canonical IJMES rules, and then formats either full scholarly or title output.

This is not an official IJMES or Cambridge product. It is not a general pronunciation engine or a character-substitution transliterator. Persian short vowels are normally unwritten, so unknown and ambiguous words remain review items and cannot be copied as final transliteration.

## Current scope

Implemented: loss-aware Unicode normalization, stable token offsets, structured Persian-column mapping data, a separate guide-level Persian tāʾ marbūṭa rule (`ih`), reviewed lexical readings, explicit ambiguity, diagnostic-only consonantal scaffolds, a minimal data-driven izāfat context mechanism, canonical initial-hamza removal, non-initial hamza and ʿayn preservation, `ijmes_full` and `ijmes_title` profiles, structural handling of supported title prefixes/articles, token inspection, and guarded copy-to-clipboard behavior.

The motivating title deliberately exposes unresolved editorial joining choices for `درباره` and `تجددخواهی`; IJMES supplies vowel and display policy but does not by itself settle those lexical segmentation decisions.

Not implemented: comprehensive morphology or lexicon, general short-vowel reconstruction, persistent corrections, batch/export workflows, or AI-assisted resolution.

## Run and verify

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```

The framework-independent engine is in `src/domain`. See the documents in `docs` for authority boundaries and extension points.
