# Phase 8B migration and compatibility

Phase 8B is additive. It does not change `ProfileId`, legacy profile output, frozen authority keys, bibliography field policies, or exports. `renderCanonicalForProfile` and `transliterate` retain their existing contracts.

Workspace schema V1 remains readable. Existing accepted phrase decisions without V2 fields retain their original profile-bound `requestFingerprint` applicability semantics. New accepted decisions may persist the pair `readingIdentityVersion: "2"` and a non-empty `readingFingerprint`; both must be present together or the accepted decision fails closed as corrupted. Persisted rendered output remains intentionally absent and is re-derived from canonical data on hydration.

No legacy fingerprint is upgraded or declared equivalent automatically. No accepted correction or provenance field is fabricated. Unsupported schema versions and malformed provenance continue through the existing safe-failure path.

The bibliography subsystem remains on legacy profiles. Adoption of `ijmes_publication_v1` there would require an explicit field-context and export migration and is outside this phase.
