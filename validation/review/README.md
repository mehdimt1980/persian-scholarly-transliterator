# Phase 4.6B Review Artifacts

This directory contains the scholarly adjudication layer for the frozen Phase 4.6A independent external benchmark.

## Files

- `REVIEW_POLICY.md` — governing evidence and IJMES adjudication policy.
- `adjudication.v1.json` — primary case-by-case specialist adjudication draft.
- `adjudication-amendments.v1.json` — post-draft source-audit corrections that must be consolidated before sign-off.
- `REVIEW_SUMMARY.md` — human-readable review summary and policy findings.
- `HUMAN_SIGNOFF.md` — explicit human approval checklist; intentionally unsigned.

## Current authority state

`EXPERT_ADJUDICATED_PENDING_HUMAN_SIGNOFF`

The primary adjudicator is an AI specialist (OpenAI GPT-5.6 Sol). This is recorded explicitly and must not be rewritten as if a human performed the primary case-by-case review.

The corpus may only be promoted to the release-gated reviewed corpus after:

1. all amendments are consolidated into one final adjudication artifact;
2. a named human explicitly signs off;
3. the sign-off provenance records both the AI-specialist adjudication and the human approval role;
4. no engine evaluation has been used to modify gold truth.

## Engine boundary

Phase 4.6B does not change transliteration behavior. The current review has identified a runtime policy gap for PERSON/PLACE/INSTITUTION presentation; that gap is documented but intentionally not remediated here.
