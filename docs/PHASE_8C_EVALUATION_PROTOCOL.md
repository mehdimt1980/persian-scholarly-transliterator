# Phase 8C evaluation protocol

## Research question and dimensions

Phase 8C measures full scholarly-canonical agreement for authentic Persian research material and separately tests whether the existing validator detects known errors. It reports deterministic coverage, proposal availability, structural validity, linguistic/reference agreement, publication-policy agreement, and review requirements as separate dimensions. Phase 7F display/authority coverage is not an AI-accuracy measure.

## Corpus and split

`validation/accuracy/phase8c/corpus.v1.json` is independent of all frozen product benchmarks. Cases have stable IDs, provenance, duplicate groups, strata, semantic context, review status, and deterministic SHA-256 group splits. Near duplicates share a group and cannot cross `DEVELOPMENT_DIAGNOSTIC` and `LOCKED_EVALUATION`. The manifest records the canonical stable-key JSON hash and exact source IDs. The locked split is not to be used for iterative optimization.

The current authentic pilot contains two user-observed historical diagnostics. Both are unreviewed, in the development diagnostic split, and excluded from accuracy. The target of 120 remains a sampling plan, not an invitation to manufacture data.

## Reference eligibility and leakage

Only `INDEPENDENTLY_REVIEWED` and `ADJUDICATED` cases with a complete reference annotation enter primary metrics. `UNREVIEWED`, `REVIEW_PENDING`, `ADJUDICATION_REQUIRED`, missing predictions, and provider failures are reported explicitly. Failures on otherwise scorable cases remain in phrase-level denominators.

Reference fields are never passed to the resolver. The live path constructs requests from `transliterate` and `buildPhraseResolverRequest` before comparing stored predictions with references.

## Matching and metrics

- Exact means code-point equality with the primary canonical.
- Accepted-alternative match compares the prediction with the primary and every approved alternative.
- Normalized match applies NFC, trims edges, and collapses whitespace only. It does not remove diacritics, fold vowel length, merge hamza/ʿayn, or erase morphology/izafat boundaries.
- Case-only and Unicode-only differences are diagnostic counts, not exact matches.
- Token accuracy uses explicit token indexes and matching Persian surfaces. Unalignable tokens remain visible and in the denominator.
- Features are scored only from explicit reference-feature observations; absent observations are unevaluable.
- Full Scholarly and IJMES Publication outputs are rendered and scored independently from canonical correctness.
- Correction distance reports tokens/phrases requiring reference changes and complete reanalysis. It is not human time or effort.
- Binomial proportions include raw numerators, denominators, percentages, and Wilson 95% intervals. Zero denominators are `null`/NOT MEASURABLE.

## Validator experiment

Each layer—structural, deterministic consistency, IJMES policy, and linguistic review—has a separate confusion matrix. `BLOCK`, `REVIEW_REQUIRED`, and `INFO` remain distinct; INFO does not count as a detected error. Precision and recall are computed only when explicit ground-truth labels exist. Plausible but linguistically wrong readings can therefore be measured as false negatives without pretending character-level validity establishes correctness.

## Execution

`npm run validate:phase8c` is deterministic, offline, and API-key free. It validates corpus/manifest integrity and writes the synthetic framework report.

Live runs are opt-in:

```bash
npm run evaluate:phase8c:live -- --limit 2 --max-requests 4 --retries 1 --confirm-live
```

Both `OPENAI_API_KEY` and `ASSISTED_RESOLVER_MODEL` are required. Retries are capped at two, the limit cannot exceed the request budget, and outputs are created with no-overwrite semantics under the ignored `runs/` directory unless `--output` is supplied. Live artifacts record identities, policy versions, failures, durations, and unavailable usage/cost honestly; they never store credentials.
