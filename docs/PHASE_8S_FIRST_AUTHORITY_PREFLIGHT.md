# Phase 8S — First controlled authority publication: scientific preflight

## Observed source evidence (read-only, 2026-10-11)

The Review Staging ledger has three historical ACCEPT events covering **two distinct candidates**. The latest accepted personal-name source candidate is:

- Persian catalogue surface: `نصیری، محمدرضا`
- Accepted Latin canonical: `Naṣīrī, Muḥammad Riḍā`
- Profile: `ijmes_full`
- Latest ACCEPT event: `0c550779-1ed2-4613-96f4-e14c66ee4475`
- Candidate: `lex-000a84a77bd88ba3fefb`
- Review basis: `62003c1a5f47320549b705bc16df5c26da5f348c5fa337b4fa9d566ff59553eb`

**Scientific blocker:** both reviewed Persian surface and accepted canonical use catalogue surname-first order. The main runtime's whole-phrase matcher cannot treat that accepted surface as `محمدرضا نصیری`, or the catalogue canonical as the running-text name form. Setting `RUNNING_TEXT_ORDER_VERIFIED` must not silently make this reordering occur.

## Scope of this PR

- Add a fail-closed check prohibiting direct `PERSON_NAME` publication of comma-separated catalogue surfaces.
- Add regression coverage proving that a supplied running-text-order attestation cannot override this source-shape mismatch.
- Preserve Phase 8R production's empty authority snapshot, current Neon publication database, all ledger events and review decisions.

## Proposed next controlled steps

1. Obtain an explicitly reviewed **running-text** Persian surface and exact IJMES canonical, including spelling and applicable profile; distinguish from the BSB inverted catalogue record.
2. Design and review a provenance-preserving derived-authority decision (or new eligible candidate) that links back to the catalogue evidence without rewriting its source surface or original ACCEPT event. The current Phase 8R API cannot safely publish a derived normalized source under a different Persian surface: it requires exact source identity.
3. Add separate scholarly attestation for the derived surface and canonical, a publication preview, conflict report and administrator-only authorization.
4. Positively identify the authority database target. Staging Review credentials and shared passphrase are not publication credentials; no migration or writes to the Review Staging branch are authorized by this PR.
5. Test first in a disposable Neon branch, then commit/review sanitized snapshot, deploy through the normal PR/CI/Vercel gate, and confirm the running-text phrase in the actual main UI without AI.

## Release gates

No actual BSB authority publication until the derived-identity workflow and independent scholarly authorization exist. No code merge may be treated as publication. No automatic promotion, no real Neon writes, no new GitHub Actions workflow. Scientific input and publication approval are separate actions.
