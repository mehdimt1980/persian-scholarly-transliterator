# Roadmap

1. **Phase 2A — complete:** source-aware vowel evidence, vocalized lookup, ZWNJ structure, confirmed izāfat, and conservative relation candidates.
2. **Phase 2B — complete:** cited, reviewed semantics for plural `ها`, comparative `تر`, superlative `ترین`, six possessive enclitics, and plural-host izāfat.
3. **Phase 2C — complete:** indexed reviewed scholarly lexicon repository, expanded vocabulary with scholarly source metadata, proper-name models, deterministic review issues, and human review/override workflow (`USER_OVERRIDE`, manual canonical input, izāfat and morphology review).
4. **Phase 3 — complete:** human-gated assisted candidate resolver (advisory language model suggestions behind strict zero-authority boundaries and manual selection).
5. **Phase 4 — complete:** source-preserving batch bibliography processing, canonical record schemas, field-level policies, field-scoped review and assistance, source-preserving CSV, final scholarly CSV, scholarly RIS, and scholarly BibTeX exports.
6. **Phase 4.5 — complete:** real-world scholarly corpus validation framework, gold corpus schema, safety and coverage metrics, release gates, regression conversion, and failure triage methodology.
7. **Phase 4.6A — complete:** independent external scholarly benchmark acquisition and strict provenance verification; 108 retained candidates frozen before engine evaluation.
8. **Phase 4.6B — current:** specialist scholarly adjudication of the 108-case external benchmark, IJMES policy alignment, ambiguity disposition, and preparation for explicit human sign-off. The current draft is `EXPERT_ADJUDICATED_PENDING_HUMAN_SIGNOFF`; it must not be represented as `HUMAN_REVIEWED` before an actual human sign-off.
9. **Phase 4.6C — future:** blind engine evaluation against the signed-off gold corpus, safety/coverage measurement, and failure triage.
10. **Phase 4.6D — future if required by 4.6C:** evidence-backed remediation of coverage or policy gaps discovered by the frozen benchmark; no benchmark-driven data mutation.
11. **Release hardening — future before RC:** dependency/security remediation, release-gate cleanup (including replacing the legacy `REAL_DISSERTATION` corpus-tier name), and release documentation.
12. **v1.0.0-rc1 — future:** only after signed-off independent benchmark evaluation satisfies safety gates and agreed usefulness/coverage thresholds.
13. **Phase 5A — Lexical Evidence Foundation (complete):** source-neutral external evidence models, candidate semantics, and connector boundaries (`docs/LEXICAL_EVIDENCE_MODEL.md`).
14. **Phase 5B — Library of Congress Pilot Connector (complete):** source adapter for Library of Congress catalog records, non-authoritative evidence extraction (`docs/LOC_EVIDENCE_CONNECTOR.md`).
15. **Phase 5C — Alignment & Candidate Extraction (complete):** provenance-safe positional alignment, derived lexical segment evidence, span integrity enforcement, and non-authoritative candidate extraction (`docs/LEXICAL_ALIGNMENT_MODEL.md`).
16. **Phase 5D — Scheme-Aware Evidence Aggregation (complete):** multi-scheme interpretation analysis (ALA-LC to IJMES mapping), deterministic consensus aggregation, structural blockers, and policy audit (`docs/SCHEME_AWARE_EVIDENCE.md`).
17. **Phase 5E — Human Adjudication & Explicit Lexicon Promotion (current):** specialist human review workflow, immutable review packets, append-only decision ledger, and explicit promotion into `LexiconRepository` (`docs/HUMAN_ADJUDICATION_AND_PROMOTION.md`).
18. **Phase 6 — Multi-Source Expansion (future):** VIAF, BnF, GND, and additional scholarly source adapters.
19. **Phase 7 — Training Corpus & Small Transformer (future):** verified scholarly training corpus curation and domain model distillation.
20. **Later / Deferred:** extensible citation style formatting (CSL-compatible models, Chicago/APA scholarly notes, and bibliographic formatting).

Phase 4.6B performs scholarly review only and does not evaluate or tune the transliteration engine.
