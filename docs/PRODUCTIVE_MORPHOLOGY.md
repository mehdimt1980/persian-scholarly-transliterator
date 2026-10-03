# Productive morphology

## Scope and evidence hierarchy

Phase 2B implements only plural `ها`, comparative `تر`, superlative `ترین`, and possessive `م`, `ت`, `ش`, `مان`, `تان`, and `شان`. Rules are structured data in `src/domain/morphology/rules.ts`; evaluation and resolution live in the morphology directory rather than `engine.ts`.

Evidence is ordered conservatively:

1. explicit source boundary or suffix-specific orthography;
2. reviewed lexical stem and compatible category;
3. reviewed productive rule;
4. candidate segmentation;
5. no segmentation.

ZWNJ identifies a boundary, not its meaning. A right segment receives morphology only if it matches one of the scoped rules and the proposed stem validates. Plural and degree morphology require ZWNJ for confirmation. The six possessive enclitics may be confirmed without it only when a reviewed nominal stem, a person-specific rule, and a supported host-ending realization agree.

## Model

Each `MorphologicalAnalysis` records normalized token coordinates, `lexicalLookupStem`, stem vowel evidence, typed `MorphemeSegment` values, `CONFIRMED`, `CANDIDATE`, or `CONFLICT` status, evidence, alternatives, warnings, and rule provenance. Explicit vowels remain indexed by base letter; suffix vowels are not passed to stem resolution. Unsupported combining marks prevent confirmation.

Confirmed rendering composes a resolved canonical stem with an applicable rule realization: `کتاب‌ها → kitāb-hā`, `بزرگ‌تر → buzurg-tar`, and `کتابم → kitāb-am`. These hyphens make the productive structure inspectable; they are not obtained from whole-word lexical entries.

## Possessive identity and realization

Morpheme identity remains person/number-specific (`POSSESSIVE_1SG` through `POSSESSIVE_3PL`) and is distinct from phonological realization. Phase 2B classifies reviewed hosts as `CONSONANT_FINAL`, `VOWEL_FINAL`, `HEH_FINAL`, or `UNKNOWN`. Possessive rule data provides authoritative realizations only for `CONSONANT_FINAL`:

- 1SG `-am`, 2SG `-at`, 3SG `-ash`;
- 1PL `-imān`, 2PL `-itān`, 3PL `-ishān`.

The underlying formal Persian plural-person linking vowel is conventionally described as `e` in the grammar sources (`-emān`, `-etān`, `-ešān`). The project converts that vowel to scholarly `i` under the IJMES Persian vowel convention. IJMES does not supply the Persian morpheme analysis itself.

Vowel-final hosts require additional glide/allomorph rules, and final-heh hosts require distinct orthographic/allomorphic handling. Neither environment is implemented here. The analyzer preserves the reviewed stem and suffix-shape evidence but returns `CANDIDATE`, no canonical suffix rendering, a review warning, and non-copyable output. It never invents `y` or chooses a simplified consonant-final form.

## Plural and izāfat

`کتاب‌های ایران` is modeled as `[کتاب + ها] --IZAFAT--> ایران`. The final `ی` is retained as explicit plural-host izāfat evidence. Morphological provenance (`PERSIAN-MORPH-PLURAL-HA`, `PERSIAN-MORPH-PLURAL-IZAFAT-YE`) remains separate from relation interpretation and IJMES rendering (`PERSIAN-CONTEXT-IZAFAT-EXPLICIT`, `IJMES-P-IZAFAT-RENDER`). Bare `کتاب‌ها ایران` does not receive the same confirmed relation.

## Ambiguity and limitations

Unknown stems never become authoritative because a suffix matches. If a reviewed whole-token reading competes with a valid segmentation, both are exposed and copying is disabled. Superlative `ترین` is one scoped morpheme, never recursively `تر + ین`.

There is no general parser, POS tagger, compound splitter, verb morphology, `می-` analysis, negation, unrestricted suffix stacking, exhaustive Persian plural handling, or vowel-final/heh-final possessive realization.

## Linguistic sources

- Gernot Windfuhr and John R. Perry, [“Persian and Tajik,”](https://glottolog.org/resource/reference/id/106546) in *The Iranian Languages*, ed. Gernot Windfuhr (Routledge, 2009), pp. 416–544. Used for the scoped Persian nominal morphology and pronominal-enclitic model.
- Saeed Yousef and Hayedeh Torabi, [*Intermediate Persian: A Grammar and Workbook*, 2nd ed.](https://api.pageplace.de/preview/DT0400.9780429555190_A41590452/preview-9780429555190_A41590452.pdf) (Routledge, 2020), unit 8. Used for comparative `-tar` and superlative `-tarin`.
- [“EŻĀFA,”](https://www.iranicaonline.org/articles/ezafa/) *Encyclopaedia Iranica*. Used for izāfat structure, including its interaction with plural `-hā`.
- [University of Texas at Austin Persian Online, “Superlative.”](https://sites.la.utexas.edu/persian_online_resources/adjectives/superlative/) Used to cross-check the adjective-plus-`-tarin` structure and the reviewed `بزرگ` example family.
- The current IJMES Translation and Transliteration Guide remains the authority for canonical transliteration and izāfat rendering only, not Persian morphological analysis.
