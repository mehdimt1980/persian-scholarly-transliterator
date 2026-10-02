# Persian Scholarly Transliterator

A provenance-aware foundation for scholarly Persian transliteration, initially targeting IJMES. It is a small working vertical slice: Persian input is normalized, tokenized, resolved through structured lexical data, rendered through a canonical representation, and formatted for either full scholarly or title presentation.

This is not an official IJMES or Cambridge product. It is not a character-substitution tool and it does not claim to reconstruct Persian short vowels from script alone. Unknown words remain visibly unresolved.

## Scope

Implemented: Unicode-safe normalization, stable token offsets, structured Persian IJMES mappings, lexical readings with provenance, a guide-grounded izāfat example (`vilāyat-i faqīh`), hamza/ʿayn preservation, `ijmes_full` and `ijmes_title` profiles, token inspection, and copy-to-clipboard UI.

Not yet implemented: complete Persian morphology, comprehensive lexicon, automatic short-vowel inference, user lexicon persistence, batch bibliography export, or AI-assisted resolution.

## Run

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`. Verify with `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.

## Design

The engine is independent from React and follows: normalization → tokenization → lexical/context resolution → canonical transliteration → profile formatting. Rule definitions retain authority category, concise source notes, and stable IDs. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/IJMES_RULE_MODEL.md`](docs/IJMES_RULE_MODEL.md), and [`docs/AMBIGUITY_AND_AUTHORITY.md`](docs/AMBIGUITY_AND_AUTHORITY.md).
