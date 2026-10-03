# Scalable Reviewed Lexicon Architecture (Phase 2C)

Phase 2C replaces the flat anonymous seed array with an indexed, source-grounded `LexiconRepository` model supporting stable IDs, source citations, integrity validation, and proper name metadata.

## 1. Structured Lexical Record Model

Each lexical entry in `src/data/lexicon.ts` adheres to:

```ts
export type LexicalSourceType =
  | 'IJMES_GUIDE'
  | 'SCHOLARLY_DICTIONARY'
  | 'ACADEMIC_GRAMMAR'
  | 'ENCYCLOPEDIA'
  | 'REVIEWED_PROJECT_ENTRY';

export interface LexicalSource {
  type: LexicalSourceType;
  citation: string;
  reference?: string;
}

export type ProperNameType = 'PERSON' | 'PLACE' | 'DYNASTY' | 'INSTITUTION';

export interface ProperNameMetadata {
  type: ProperNameType;
  notes?: string;
}

export interface LexicalReading {
  id?: string;
  canonical: string;
  confidence: number;
  notes?: string;
  source: string;
  sources?: LexicalSource[];
  vocalization?: VocalizationEvidence[];
  properName?: ProperNameMetadata;
  category?: LexicalCategory;
}

export interface LexicalEntry {
  id: string;
  surface: string;
  normalized: string;
  category?: LexicalCategory;
  readings: LexicalReading[];
  sources?: LexicalSource[];
  context?: LexicalContextEvidence;
  notes?: string;
  properName?: ProperNameMetadata;
}
```

## 2. Lexicon Repository Abstraction

Instead of performing repeated linear scans (`LEXICON.find(...)`), the engine uses `LexiconRepository`:
- `findByNormalized(normalized: string): LexicalEntry | undefined`
- `findAllByNormalized(normalized: string): LexicalEntry[]`
- `findById(id: string): LexicalEntry | undefined`
- `getAllEntries(): LexicalEntry[]`
- `validateIntegrity(): LexiconIntegrityReport`

### Data Integrity Safeguards
Automated validation checks:
- Unique entry IDs (preventing collisions).
- Unique canonical readings within each entry.
- Non-empty surface and normalized forms.
- Mandatory source citations on all reviewed readings.

## 3. Scholarly Lexicon Expansion

The Phase 2C lexicon expands beyond basic seed words to include over 35 core scholarly terms across Persian historiography, Middle Eastern studies, religion, and political history:
- **State & Monarchy:** `دولت` (*daulat*), `حکومت` (*ḥukūmat*), `مشروطه` (*mashrūṭa*), `مشروطیت` (*mashrūṭīyat*), `مجلس` (*majlis*), `سلطنت` (*salṭanat*), `شاه` (*shāh*), `سیاست` (*siyāsat*), `انقلاب` (*inqilāb*).
- **Law, Religion & Clerics:** `قانون` (*qānūn*), `حقوق` (*ḥuqūq*), `فقه` (*fiqh*), `شریعت` (*sharīʿat*), `دین` (*dīn*), `مذهب` (*mazhab*), `علما` (*ʿulamā*), `مجتهد` (*mujtahid*).
- **Modernity, Society & Thought:** `تجدد` (*tajaddud*), `اصلاحات` (*iṣlāḥāt*), `آزادی` (*āzādī*), `ملت` (*millat*), `ملی` (*millī*), `جامعه` (*jāmiʿa*), `مردم` (*mardum*), `فرهنگ` (*farhang*), `تمدن` (*tamaddun*), `اندیشه` (*andīsha*).
- **Academic & Publication Vocabulary:** `رساله` (*risāla*), `مقاله` (*maqāla*), `گفتار` (*guftār*), `شرح` (*sharḥ*), `متن` (*matn*), `ترجمه` (*tarjuma*).
- **Proper Names:** `ایران` (*īrān* [PLACE]), `تهران` (*tihrān* [PLACE]), `تبریز` (*tabrīz* [PLACE]), `اصفهان` (*iṣfahān* [PLACE]), `قاجار` (*qājār* [DYNASTY]), `صفوی` (*ṣafavī* [DYNASTY]).
