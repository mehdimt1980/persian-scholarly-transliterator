# Phase 8C reuse and boundary audit

This audit was completed before Phase 8C implementation. The branch is based on `f82b549ca03919ff2597b26a998c0fc43fdabadc`, the merge commit for Phase 8B PR #53.

## Reused components

- `normalizePersian` supplies the product's existing input normalization.
- `transliterate` and `buildPhraseResolverRequest` create exactly the deterministic evidence and semantic request used by the application.
- `OpenAiPhraseResolverProvider` remains the only live provider path. It retains Structured Outputs, timeout handling, response validation, and request/reading fingerprints.
- `validatePhraseProviderResolution` remains authoritative for structural, deterministic-evidence, token-alignment, and canonical-policy validation.
- `diagnoseScholarlyCanonical` and `renderScholarlyCanonical` supply policy diagnostics and Full Scholarly/IJMES Publication rendering.
- Existing SHA-256 corpus-freeze conventions informed the separate Phase 8C manifest and identity checks.

## Missing capabilities supplied by Phase 8C

The repository did not have an independently reviewable AI-quality corpus, reference-review states, accepted-alternative matching, token/feature scoring, validator confusion matrices, confidence intervals, correction-distance proxies, or an auditable live-run artifact. Phase 8C adds those capabilities without changing product inference.

## Exact boundary

Phase 8C is evaluation infrastructure. It does not alter the resolver prompt, provider/model selection, response validator, transliteration engine, presentation renderer, reviewed lexicon, bibliography processing, UI, or existing benchmarks. Offline fixtures are synthetic and test the evaluator, not the model. Live execution is opt-in and uses the existing provider.

## Historical integrity requirements

- Phase 7F corpus files and manifests remain byte-for-byte governed by their existing freeze gate.
- V2/V3 scholarly gold and reviewed lexicon assets are inputs to existing gates only; Phase 8C never writes them.
- The Phase 8C corpus has its own version, canonical SHA-256, deterministic split identities, duplicate-group constraint, and review-state rules.
- Reference canonical readings are unavailable to the resolver request and are consulted only after prediction capture.
- Only `INDEPENDENTLY_REVIEWED` or `ADJUDICATED` references with a canonical annotation may enter primary accuracy denominators.
