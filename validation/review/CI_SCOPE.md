# Repository CI & Release Verification Scope

The repository is past Phase 4.6B adjudication and Phase 4.6C baseline measurement. CI now protects the frozen scholarly benchmark, post-remediation runtime regression, anti-overreach behavior, dependency security, and production build.

Required verification:

```bash
npm audit --audit-level=high
npm test
npm run validate:acquisition
npm run validate:adjudication
npm run validate:reaudit-worklist
npm run validate:v2-benchmark
npm run validate:gold-freeze
npm run evaluate:v2-frozen
npm run validate:v2-regression
npm run validate:portability
npm run validate:corpus
npm run typecheck
npm run lint
npm run build
```

## Governance boundaries

- `validate:adjudication` remains an integrity check over the historical V1 review artifact and must not silently redefine V2 gold.
- `validate:reaudit-worklist` verifies the completed V2 scholarly re-audit workspace and its provenance/governance invariants.
- `validate:v2-benchmark` verifies that the consolidated V2 corpus is exactly reproducible from the reviewed worklist.
- `validate:gold-freeze` binds the immutable human-approved benchmark snapshot to the gold-freeze manifest.
- `evaluate:v2-frozen` preserves the historical Phase 4.6C evaluation path.
- `validate:v2-regression` is the hard post-remediation frozen regression gate: 103/103 authoritative exact matches, 5/5 review-required cases safely blocked, and zero false-authoritative, under-blocked, mismatch, or invalid-gold results.
- `validate:portability` is independent anti-overreach evidence outside the exact frozen-authority lookup set; it is not represented as a broad unseen scholarly accuracy benchmark.
- `validate:corpus` continues to protect the pre-existing 49-case pilot corpus.
- `npm audit --audit-level=high` blocks high/critical dependency advisories from entering `main`.

Primary safety invariants remain:

- `FALSE_AUTHORITATIVE = 0`
- `UNDER_BLOCKED = 0`
- frozen scholarly gold is immutable for runtime remediation
- post-remediation regression is not described as an unseen benchmark
