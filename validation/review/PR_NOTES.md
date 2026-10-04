# PR Notes

This branch is a review/adjudication branch, not an engine feature branch.

The specialist amendments are consolidated into `validation/review/adjudication.v1.json`; the amendment file is retained only as historical audit provenance.

Do not merge until:

- `npm run validate:adjudication` passes on the exact PR HEAD;
- normal test/typecheck/lint/build CI passes;
- explicit human governance sign-off is recorded truthfully;
- gold-promotion mechanics are reviewed without evaluating or tuning the transliteration engine against the benchmark.
