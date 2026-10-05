# Context-Aware Phrase Resolver — Deployment Checklist

The phrase resolver is implemented as a server-side OpenAI fallback for deterministic non-copyable phrase/title inputs. It is advisory until a user explicitly accepts or edits a proposal.

## Required environment

Configure these as **server-side secrets/configuration** in the deployment environment:

```bash
OPENAI_API_KEY=sk-...
ASSISTED_RESOLVER_MODEL=<configured-model-id>
ASSISTED_RESOLVER_TIMEOUT_MS=15000
```

Do not expose the API key through `NEXT_PUBLIC_*` variables or browser code.

The same configuration serves both:

- `POST /api/assist` — existing issue-level assistance;
- `POST /api/assist/phrase` — context-aware whole-phrase assistance.

`GET /api/assist/status` exposes only whether assistance is configured; it never returns credentials.

## Runtime behavior

In the single-transliteration workspace:

1. deterministic transliteration runs first;
2. if the result is already authoritative/copyable, the phrase endpoint is not called;
3. if the result remains blocked and contains at least two Persian-word tokens, the UI automatically requests phrase assistance after roughly 900 ms of stable input;
4. the server recomputes all deterministic evidence from the submitted input/profile/review decisions;
5. the model returns either:
   - a non-authoritative `PROPOSED` canonical + profile rendering, or
   - `REVIEW_REQUIRED` with no output when uncertainty remains;
6. only explicit **Accept** or **Edit before accepting** makes the proposal the selected copyable UI output;
7. changing source/profile/review state invalidates the accepted phrase decision through a deterministic fingerprint.

The original token-level review queue remains visible for audit.

## Request limits

Phrase assistance is deliberately bounded:

- maximum source length: **4000 characters**;
- maximum Persian-word tokens: **64**;
- maximum meaningful non-whitespace tokens: **128**;
- maximum review decisions submitted with one request: **128**.

Longer material should be split into smaller scholarly units rather than sent as one phrase request.

## Public-deployment cost protection

The repository prevents oversized phrase requests and the browser debounces automatic calls, but those controls are **not a substitute for public API abuse protection**.

If the application is publicly reachable, configure platform-level controls appropriate to the deployment, for example:

- per-IP / per-session rate limiting for `/api/assist` and `/api/assist/phrase`;
- authentication or usage quotas if access is not intended to be anonymous;
- provider-side project budgets / spend alerts;
- request and error observability without logging API keys or sensitive headers.

Do not put a provider key in the client merely to avoid server-side rate limiting.

## Pre-deployment verification

Run the repository release gates:

```bash
npm ci
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

## Post-deployment smoke test

1. Open the single-transliteration workspace.
2. Confirm a known deterministic input remains resolved without an AI request.
3. Enter a multi-token unresolved Persian phrase/title.
4. Confirm the context-aware resolver appears and automatically analyzes the full phrase when credentials are configured.
5. Confirm the proposal is labeled `AI ADVISORY · ZERO AUTHORITY` and cannot replace selected output until accepted.
6. Test **Edit before accepting**, **Cancel edit**, **Accept**, **Reject**, and **Revoke phrase decision**.
7. Change the input after acceptance and confirm the previous accepted proposal is no longer applied.
8. Remove/disable API configuration in a non-production test environment and confirm deterministic/manual review still works while the AI panel reports that assistance is unavailable.

## Current persistence boundary

Accepted phrase decisions are session-scoped UI decisions in this version. They are not automatically written into:

- the reviewed lexicon;
- frozen scholarly gold;
- reviewed runtime authority;
- bibliography-batch persistence.

Persistent learning from accepted phrase decisions should be introduced only through a separate reviewed-authority ingestion workflow with explicit provenance and governance.
