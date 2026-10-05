# Phase 4.6B — Human Sign-Off Review Packet (Validation V2)

## 1. Decision context

This packet supports human governance review of the consolidated benchmark:

`validation/corpus/phase4.6b-external-benchmark.v2.json`

Current status at preparation time:

- schema: Validation V2
- benchmark version: `2.0.0-draft`
- corpus tier: `EXTERNAL_BENCHMARK`
- review status: `AI_SPECIALIST_REVIEWED_PENDING_HUMAN`
- total cases: 108
- `FINAL`: 103
- `REVIEW_REQUIRED`: 5
- `UNRESOLVED`: 0
- pending: 0
- `humanSignoff = null`
- `engineEvaluationPerformed = false`
- gold: not frozen
- Phase 4.6C: blocked

The benchmark is a deterministic projection of the completed specialist worklist. `npm run validate:v2-benchmark` verifies exact synchronization between the worklist and the committed V2 artifact.

## 2. Review model

Human sign-off is a **governance review**, not a claim that the human reviewer personally re-adjudicated every case.

The human reviewer is being asked to assess:

1. the canonical-vs-rendering policy;
2. the evidence/authority separation;
3. representative and high-risk decisions;
4. ambiguity preservation;
5. provenance truthfulness;
6. deterministic consolidation integrity;
7. the rule that future engine remediation must not rewrite frozen gold.

Case-level provenance remains OpenAI GPT-5.6 Sol / `AI_SPECIALIST` after any human approval.

## 3. Core policy examples — canonical and rendering are separate

| Persian source | Category | Scholarly canonical | Publication rendering | Why this matters |
|---|---|---|---|---|
| زکات | RELIGIOUS_TERM | `zakāt` | `zakat` | IJMES Word List form is rendering policy, not canonical truth. |
| عاشورا | RELIGIOUS_TERM | `ʿāshūrā` | `ʿAshuraʾ` | Full scholarly reading and IJMES publication form are intentionally distinct. |
| صادق هدایت | PERSON | `Ṣādiq Hidāyat` | `Sadeq Hedayat` | Canonical preserves scholarly Persian distinctions; publication uses established English-facing spelling. |
| ملک‌الشعرای بهار | PERSON | `Malik al-Shuʿarā-yi Bahār` | `Malek al-Shoʿara Bahar` | The exact Persian surface contains explicit yeh marking izāfat; rendering follows established presentation. |
| جلال آل‌احمد | PERSON | `Jalāl Āl-i Aḥmad` | `Jalal Al-e Ahmad` | Scholarly izāfat and diacritics stay canonical; established spelling belongs to rendering. |
| تخت جمشید | PLACE | `Takht-i Jamshīd` | `Persepolis` | Source-faithful canonical is not replaced by the accepted English place name. |
| پاسارگاد | PLACE | `Pāsārgād` | `Pasargadae` | Same source-faithfulness vs publication-rendering distinction. |
| کتابخانه ملی ایران | INSTITUTION | `Kitābkhāna-yi Millī-yi Īrān` | `Kitabkhana-yi Milli-yi Iran` | Canonical retains vowels/diacritics/izāfat; rendering removes ordinary diacritics. |
| مجلس شورای ملی | INSTITUTION | `Majlis-i Shūrā-yi Millī` | `Majlis-i Shura-yi Milli` | Same institution-name rendering policy. |

## 4. Book-title high-risk examples

| Persian source | Scholarly canonical | Publication rendering | Review point |
|---|---|---|---|
| تاریخ بیداری ایرانیان | `Tārīkh-i Bīdārī-yi Īrānīyān` | `Tarikh-i Bidari-yi Iraniyan` | Both izāfat linkers are preserved structurally; rendering removes ordinary diacritics. |
| سیاست‌نامه | `Siyāsat-nāma` | `Siyasat-nama` | Canonical uses the reviewed Persian reading `Siyāsat`, not a mechanically lengthened first vowel. |
| سفرنامه ناصرخسرو | `Safarnāma-yi Nāṣir-i Khusraw` | `Safarnama-yi Nasir-i Khusraw` | Post-vocalic `-yi` plus internal name izāfat are explicit. |
| سووشون | `Savūshūn` | `Savushun` | Reviewed literary-title reading is kept canonically; rendering strips macrons. |
| چشم‌هایش | `Chashm-hā-yash` | `Chashm-ha-yash` | Productive morphology remains auditable through boundaries instead of being compacted away. |
| زمستان | `Zimistān` | `Zimistan` | IJMES Persian short-vowel policy is applied canonically, then title rendering removes the macron. |

## 5. Morphology and izāfat spot checks

| Persian source | Scholarly canonical | Policy exposed |
|---|---|---|
| کتاب‌ها | `kitāb-hā` | plural boundary |
| نامه‌های | `nāma-hā-yi` | plural + post-vocalic/linker `-yi` |
| خانه‌ات | `khāna-at` | vowel-final stem + enclitic |
| دیدگاه‌هایشان | `dīdgāh-hā-yi-shān` | plural + linker + possessive enclitic |
| گزارش‌های | `guzārish-hā-yi` | plural + linker |
| تاریخ ادبیات | `tārīkh-i adabīyāt` | consonant-final izāfat `-i` |
| خانه پدری | `khāna-yi pidarī` | post-vocalic izāfat `-yi` |
| صدای باران | `ṣidā-yi bārān` | post-vocalic izāfat `-yi` |
| دیوان حافظ | `dīvān-i ḥāfiẓ` | consonant-final izāfat + scholarly consonants |

## 6. Ambiguity preservation — the five non-authoritative cases

These cases intentionally contain **no authoritative canonical or rendered output** in the V2 benchmark:

| ID | Persian source | Non-authoritative alternatives | Reason for `REVIEW_REQUIRED` |
|---|---|---|---|
| `cand-amb-001` | مهر | `mihr` / `muhr` | Material vowel difference survives transliteration. |
| `cand-amb-003` | سر | `sar` / `sirr` | Native Persian and Arabic-derived readings remain distinct. |
| `cand-amb-007` | گل | `gul` / `gil` | Flower/rose vs clay/mud readings remain materially distinct. |
| `cand-amb-009` | شور | `shūr` / `shawr` | Distinct readings remain distinct under the project IJMES policy. |
| `cand-amb-011` | روی | `rūy` / `ravī` | Native and Arabic-derived readings remain materially distinct. |

Seven other AMBIGUITY-category cases are `FINAL` only because their relevant senses collapse to one benchmark transliteration: `shīr`, `bād`, `bār`, `dād`, `gūsh`, `rāst`, and `gāv`.

## 7. Provenance and anti-anchoring checks

The review chain is intentionally separated:

```text
Phase 4.6A external acquisition / source verification
        ↓
Blind V2 specialist re-audit (AI_SPECIALIST)
        ↓
Deterministic V2 consolidation
        ↓
Human governance review  ← CURRENT GATE
        ↓
Explicit gold freeze
        ↓
Blind Phase 4.6C engine evaluation
```

Governance properties already enforced before human review:

- Historical V1 adjudication is `HISTORICAL_ONLY`.
- Current engine output was not evidence for the V2 scholarly decisions.
- `engineEvaluationPerformed = false` remains enforced during worklist validation and consolidation.
- Consolidation does not call the transliteration engine.
- The committed V2 JSON must exactly match the deterministic projection of the completed worklist.
- The five expected `REVIEW_REQUIRED` IDs are hard-checked during consolidation.
- Non-final V2 cases are schema-blocked from carrying authoritative canonical/rendered output.

## 8. Runtime-gap acknowledgment

The benchmark describes expected scholarly truth independently from present implementation capability. That is intentional.

The current runtime profile model may not yet reproduce every PERSON/PLACE/INSTITUTION publication rendering encoded in V2. This is not a reason to alter the benchmark. After gold freeze, Phase 4.6C must measure such gaps honestly and remediation must occur in runtime/profile policy.

## 9. Human decision standard

An `APPROVE` decision should mean:

- no material policy flaw was found;
- the representative/high-risk cases above are acceptable;
- the five true ambiguities are correctly preserved;
- AI specialist provenance is transparent and acceptable as the primary case-level review provenance;
- the deterministic consolidated artifact is suitable to promote and freeze as scholarly gold.

A `REQUEST_CORRECTIONS` decision should identify the specific policy or case-level correction required **before** gold freeze. Any correction must carry explicit new provenance and must be made before Phase 4.6C, not in response to engine metrics.

The actual decision must be recorded in `HUMAN_SIGNOFF.md`; this review packet itself does not constitute approval.
