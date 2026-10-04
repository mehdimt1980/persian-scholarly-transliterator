# Phase 4.6B PR Status

This branch is intentionally not merge-ready yet.

## Completed

- primary specialist adjudication of all 108 frozen candidates;
- second scholarly spot-audit of high-risk terms, titles, morphology, izafat, proper names, and ambiguity cases;
- explicit correction ledger in `adjudication-amendments.v1.json`;
- updated `ADJUDICATION_AUDIT.md`, `REVIEW_SUMMARY.md`, and `HUMAN_SIGNOFF.md` reflecting the second audit;
- no transliteration-engine evaluation performed against the benchmark;
- no lexicon/rule remediation performed.

## Open items before Phase 4.6B approval

- consolidate `adjudication-amendments.v1.json` into the primary `adjudication.v1.json` artifact;
- verify the consolidated artifact has exactly 108 unique cases and summary counts remain 103 FINAL / 5 REVIEW_REQUIRED / 0 UNRESOLVED;
- obtain explicit human sign-off on the consolidated scholarly review;
- build/validate gold-promotion mechanics without running the transliteration engine against the frozen benchmark;
- preserve runtime policy remediation outside the adjudication truth-setting step.

## Downstream policy gap

The 36 PERSON/PLACE/INSTITUTION cases expose a real IJMES presentation gap in the current runtime. That gap must be fixed after gold truth is frozen and before Phase 4.6C is interpreted as a product-quality evaluation. Gold truth must not be changed to fit current runtime capabilities.
