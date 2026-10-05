# Release Portability / Anti-Overreach Gate

## Purpose

The human-approved 108-case V2 benchmark is now a frozen regression suite because its reviewed decisions have been explicitly promoted into the default runtime authority layer after the independent Phase 4.6C baseline.

It must therefore **not** be presented as an unseen post-remediation accuracy set.

This release gate provides a separate property-oriented check outside the frozen authority lookup surface.

## Scope

The gate currently contains 13 exact cases that are programmatically required to have **zero exact-key overlap** with frozen reviewed authority:

### Compositional positives — 8

These exercise existing productive behavior rather than phrase-level reviewed authority:

- second reviewed noun + productive plural;
- comparative morphology;
- five possessive-enclitic forms;
- explicit plural-host izāfat across multiple tokens.

For every positive case the gate requires:

- no frozen-authority match;
- no frozen-authority provenance/warning;
- copyable output;
- exact expected rendering;
- expected runtime status;
- morphology/relations evidence where applicable.

### Fail-closed negatives — 5

These cover:

- unknown plural stem;
- unknown comparative stem;
- currently unsupported heh-final possessive rendering;
- a near-miss of a frozen authority term (`زکاتی` vs `زکات`);
- a frozen title supplied under the wrong profile.

For every negative case the gate requires:

- no frozen-authority match;
- no frozen-authority provenance/warning;
- non-copyable output;
- the expected fail-closed status.

## Interpretation

This suite is **not** a new broad scholarly accuracy benchmark and does not justify a claim that arbitrary Persian input is 100% correct.

It establishes a narrower release property:

> Promoting the reviewed frozen authority does not leak authority to nearby/wrong-profile inputs, and core compositional morphology/izāfat behavior continues to work outside the promoted lookup set.

The independent pre-remediation evidence remains PR #26. The frozen 108-case suite remains the post-remediation regression contract. This portability gate supplements those two artifacts with explicit anti-overreach evidence.

## Required command

```bash
npm run validate:portability
```

Release CI must keep this gate green together with:

- frozen-gold integrity;
- frozen V2 regression;
- the existing 49-case pilot;
- typecheck, lint, and production build.
