# Phase 8O — Private Scholarly Review Workbench

A working Next.js /review UI for the exact 75 BSB evidence candidates in permanent Neon **Staging**. The authoritative lexicon / Gold corpus is never written here.

## UI
- Private passphrase login (12-hour signed, HttpOnly, SameSite=Strict session), logout, same-origin POST protection, no-store API.
- Full-text Persian/Latin/source search, category filters (47 AI editorial suggestions / 23 specialist cases / 5 quick checks), decision-status filters.
- BSB source URL and evidence relationship labels (romanization, translation, undetermined); never represent an observed library string as guaranteed IJMES.
- Human editable canonical + IJMES title/full profile + reviewer reference + scholarly rationale + deliberate attestation checkbox.
- Save draft, ACCEPT, REJECT, DEFER. One case at a time, **no bulk automatic approval**.
- Each decision bound to the current exact original BSB snapshot, manifest hash and candidate review-basis SHA256. Stale state fails closed.
- Server reads Neon Staging evidence while `evidence_environment_binding.writes_enabled=false`; decision events are appended to a **separate** `phase8o_review_event` table. A DB trigger forbids UPDATE and DELETE of those events. The evidence snapshot and 75 candidate statuses remain unchanged.

## Before enabling the UI in Vercel
In the Vercel project, configure **server-only environment variables** for the intended trusted deployment(s) (do not expose with `NEXT_PUBLIC_`):
1. `PHASE8O_REVIEW_ACCESS_SECRET`: independently generated random passphrase / access secret with at least 32 characters; share it securely only with authorized reviewers. Do not commit it.
2. `PHASE8O_REVIEW_STAGING_DATABASE_URL`: URL for an appropriately restricted account on the permanent `transliterator-evidence-staging` Neon branch. Minimum privileges: SELECT on `evidence_environment_binding`, `evidence_snapshot`, `evidence_active_snapshot`, `evidence_candidate_projection`; EXECUTE on `evidence_manifest_checksum`; INSERT and SELECT on `phase8o_review_event`; branch identity SELECT. **Do not use the Production connection string.** A properly scoped reviewer account is preferred over the existing full-power Staging owner.

Do not grant public access to administrative APIs. The /review page is visible as an unprivileged sign-in page; /api/scholarly-review/queue and /decisions require signed sessions and do not leak data without authentication. Production Preview should not be supplied with Staging secrets unless reviewer traffic there is explicitly intended; restrict project/deployment access using Vercel Deployment Protection as an additional layer where supported.

**Important limitation:** The passphrase is a shared secret rather than authenticated individual accounts. `reviewerRef` is self-declared, not identity-verified. For a multi-reviewer public production system, replace this with OIDC/SSO and per-reviewer identities before issuing trusted scientific promotions. Keep the password strong and rotate if compromised; rate-limiting via an upstream gateway/edge protection is recommended.

## One-time ledger migration (Staging only)
- Workflow: `Phase 8O install isolated scholarly review ledger` (manual label only on the approved PR, never automatically runs on merge).
- Uses GitHub protected environment `phase8g-staging-import`. Checks exact host, Neon branch ID/fingerprint, active snapshot `snapshot-f76feb36ca85541c8faafb42` with exactly 75 candidates, and evidence writes disabled.
- Creates only `phase8o_review_event` (with immutable trigger and index); no evidence table schema modifications and no Blob/Production writes.
- Verify afterwards using `npm run evidence:staging:review-ledger -- verify` via a read-only Staging environment.

## Human governance & scientific limitations
An ACCEPT is an *individual, reviewer-declared scholarly judgement*, not authenticated proof of credentials. It requires reviewer reference, exact NFC canonical Latin spelling, full IJMES profile selection, explanatory rationale >=20 characters, and explicit personal verification checkbox. It is validated through the existing Phase 8N decision model. Structural checking is not substantive scientific validation.

ACCEPT does **not** update candidate `reviewStatus`, `authorityStatus`, `reviewEvidence`, the Gold corpus, or the runtime lexicon. Publication requires a separate explicit, trusted, stale-state-safe promotion workflow against a versioned lexicon with rollback. Draft AI suggestions, including the 47 generated on 10 October 2026, carry **zero** authority.

### Failure modes
- If Vercel env vars are absent, sign-in explicitly says not configured; no default password.
- If database identity or snapshot changes, data and writes fail closed.
- If ledger migration has not run, authenticated queue returns a service-unavailable message, rather than pretending it saved a decision.
- Saving a draft leaves the candidate unapproved. Historical events remain in the append-only table; latest event is displayed.
