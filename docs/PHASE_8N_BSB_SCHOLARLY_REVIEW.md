# Phase 8N — BSB Scholarly Review Queue (IJMES)

The successfully imported **75** BSB candidates are **bibliographic evidence**, not automatically correct IJMES transliterations. This workflow never changes the Staging evidence snapshot, a runtime lexicon, or the frozen Gold benchmark.

## Reviewer workflow

1. A labelled, **read-only** GitHub Action checks the exact permanent Neon Staging branch, active snapshot `snapshot-f76feb36ca85541c8faafb42`, manifest checksum and disabled write binding. It exports all 75 active candidate JSON projections, preserving source MARC identity and observed Latin relationship classification.
2. Download the temporary `phase8n-bsb-scholarly-review-queue` artifact. Keep the files together:
   - `review-packet.json`: immutable review basis with candidate full provenance and SHA-256 per item;
   - `human-review.csv`: convenient sheet with Persian form, Latin variants, source URL/MARC fields and blank reviewer columns. It is **illustrative only**, not machine-authoritative;
   - `human-decisions.template.json`: exactly 75 entries, initially **PENDING** with no reviewer or scholarly canonical supplied;
   - `validation-preview.json`: initial counts, all PENDING, no promotion;
   - `file-checksums.json`: audit checksums.
3. A qualified human reviewer consults the actual source and IJMES rules. Edit a copy of `human-decisions.template.json` with one of `ACCEPT`, `REJECT`, or `DEFER` for each reviewed item; leave others `PENDING`.
4. An `ACCEPT` requires a manually selected NFC scholarly canonical, explicit `ijmes_full` or `ijmes_title` profile, reviewerRef, ISO time, substantial scholarly rationale and `humanAttestation: "I_PERSONALLY_VERIFIED_THIS_IJMES_FORM"`. Choosing a library's observed English translation, alternate title, or unspecific Latin variant is **not** scholarly approval.
5. Run `npm run evidence:bsb:review -- validate <review-packet.json> <your-decisions.json>`. This checks review-basis integrity, no duplicate/missing cases, chronology formatting and manual canonical structure. It prints a **non-published** proposal of individually accepted readings, bound to the exact BSB evidence snapshot.
6. Accepted, deferred and rejected reviewer outcomes are **not** written to Neon and do not change the project's current authority. A future, separately authorized lexicon-promotion integration must validate stale state and any conflicting human decisions, then create a new version with rollback support. The existing Phase 5E adjudication architecture distinguishes review decisions from promotion, and is not automatically mapped onto these Phase 8F whole-field candidate types.

## Key protections

- All 75 review bases are pinned to exact active snapshot ID, manifest checksum, source version ID, candidate JSON and full evidence hash. A source or candidate change invalidates the packet/decision match.
- BSB romanizations, translations and alternate titles are marked as observed evidence; a title translation is **not** converted into an IJMES canonical automatically.
- All template decisions begin `PENDING`; no scripted or LLM-issued acceptance.
- The review queue reads the known **Staging** branch only, with `writes_enabled=false`. No Production, Blob or database mutation.
- There is **no reviewer-authentication system** in this offline pipeline; `reviewerRef` is reviewer-declared provenance, not proof of personal identity. A trusted editor must validate the reviewer before promotion.
- Structural validity of a manual canonical is **not itself scientific IJMES conformity**.

## Summary
Successfully completing Phase 8N means the review queue is prepared, **not** that 75 entries have been scientifically approved. Scientific approval requires explicit, case-by-case human decisions and a distinct publication step.
