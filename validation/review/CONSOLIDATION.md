# Adjudication Consolidation

Phase 4.6B scholarly truth is now consolidated in:

`validation/review/adjudication.v1.json`

Current artifact version:

`1.0.2-draft`

The historical correction trail remains in:

`validation/review/adjudication-amendments.v1.json`

That file is now marked `CONSOLIDATED`; it is audit provenance, not a second executable layer of gold truth.

Use:

```bash
npm run validate:adjudication
```

to fail closed unless all of the following are true:

- the adjudication artifact contains exactly 108 unique cases;
- dispositions remain 103 `FINAL`, 5 `REVIEW_REQUIRED`, 0 `UNRESOLVED`;
- every `FINAL` case has exactly one canonical and no `allowedCanonicals`;
- every `REVIEW_REQUIRED` case has no single canonical and at least two recorded alternatives;
- the five expected ambiguity IDs are the only `REVIEW_REQUIRED` cases;
- adjudication IDs, Persian `sourceText`, and categories match the frozen Phase 4.6A acquisition corpus;
- every historical amendment's `to` value is present in the consolidated artifact;
- amendment metadata points to the current adjudication version;
- `engineEvaluationPerformed` remains false;
- human sign-off has not been fabricated prematurely.

Expected disposition counts:

- total: 108
- FINAL: 103
- REVIEW_REQUIRED: 5
- UNRESOLVED: 0

Expected REVIEW_REQUIRED case IDs:

- `cand-amb-001`
- `cand-amb-003`
- `cand-amb-007`
- `cand-amb-009`
- `cand-amb-011`

There is intentionally no command that rewrites or reapplies the historical amendment ledger. Any future scholarly correction after human sign-off must use an explicit corpus-correction process with new provenance rather than silently mutating the frozen gold artifact.

The engine must not be evaluated against this corpus before gold freeze. Explicit human governance sign-off is still required before promotion to a release-authoritative benchmark.
