# Adjudication Consolidation

Phase 4.6B scholarly truth currently consists of:

1. `validation/review/adjudication.v1.json`
2. `validation/review/adjudication-amendments.v1.json`

The amendments contain substantive expert corrections made after the first draft audit.

Use:

```bash
npm run validate:adjudication
```

to apply the amendments in memory and fail closed if any amendment's expected `from` value no longer matches the base artifact.

Use:

```bash
npm run review:consolidate
```

to write:

`validation/review/adjudication.consolidated.v1.json`

The consolidation step is mechanical only. It may not introduce, remove, or reinterpret scholarly decisions.

Expected effective disposition counts:

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

The engine must not be evaluated against this corpus before gold freeze. Human governance sign-off is still required before promotion to a release-authoritative benchmark.
