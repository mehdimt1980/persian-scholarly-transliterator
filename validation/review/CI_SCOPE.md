# Phase 4.6B CI Scope

This PR must remain engine-blind.

Required verification:

```bash
npm test
npm run validate:acquisition
npm run validate:adjudication
npm run validate:reaudit-worklist
npm run validate:corpus
npm run typecheck
npm run lint
npm run build
```

`validate:adjudication` verifies review integrity and frozen-corpus alignment only. It must not import or call the transliteration engine.

`validate:reaudit-worklist` verifies candidate alignment, anti-anchoring, and engine blindness for the 108-case V2 re-audit workspace. It must not import or call the transliteration engine.

The existing `validate:corpus` command continues to validate only the pre-existing pilot corpus; it is not permitted to evaluate the new 108-case adjudication benchmark in Phase 4.6B.

The first engine-vs-gold benchmark comparison belongs to Phase 4.6C after explicit human sign-off and gold freeze.
