import { LexicalEntry } from '../domain/lexicon/types';
import { LexiconRepository } from '../domain/lexicon/repository';

export const LEXICON: LexicalEntry[] = [
  {
    id: 'lex:vilayat',
    surface: 'ولایت',
    normalized: 'ولایت',
    category: 'noun',
    readings: [{
      id: 'read:vilayat:1',
      canonical: 'vilāyat',
      confidence: 0.99,
      source: 'Current IJMES guide example',
      sources: [{ type: 'IJMES_GUIDE', citation: 'Current IJMES Translation and Transliteration Guide', reference: 'Compound title example: vilāyat-i faqīh' }]
    }],
    context: { explicitIzafatAfter: ['فقیه'], source: 'Current IJMES guide example: vilāyat-i faqīh' }
  },
  {
    id: 'lex:faqih',
    surface: 'فقیه',
    normalized: 'فقیه',
    category: 'noun',
    readings: [{
      id: 'read:faqih:1',
      canonical: 'faqīh',
      confidence: 0.99,
      source: 'Current IJMES guide example',
      sources: [{ type: 'IJMES_GUIDE', citation: 'Current IJMES Translation and Transliteration Guide', reference: 'Compound title example: vilāyat-i faqīh' }]
    }]
  },
  {
    id: 'lex:taammuli',
    surface: 'تأملی',
    normalized: 'تأملی',
    readings: [{
      id: 'read:taammuli:1',
      canonical: 'taʾammulī',
      confidence: 0.9,
      source: 'Seed lexical reading; IJMES i/u convention applied',
      sources: [{ type: 'REVIEWED_PROJECT_ENTRY', citation: 'Seed lexical reading; IJMES i/u convention applied' }]
    }]
  },
  {
    id: 'lex:darbara',
    surface: 'درباره',
    normalized: 'درباره',
    readings: [
      {
        id: 'read:darbara:1',
        canonical: 'dar bāra-yi',
        confidence: 0.7,
        source: 'Persian lexical analysis; segmentation requires editorial review',
        sources: [{ type: 'ACADEMIC_GRAMMAR', citation: 'Persian prepositional phrase analysis; Lambton, Persian Grammar, p. 115' }]
      },
      {
        id: 'read:darbara:2',
        canonical: 'darbāra-yi',
        confidence: 0.7,
        source: 'Alternative editorial joining; requires review',
        sources: [{ type: 'ACADEMIC_GRAMMAR', citation: 'Alternative compound joining; Windfuhr, Persian Grammar' }]
      }
    ],
    notes: 'IJMES governs i/u and diacritics but does not settle this seed entry’s joining choice.'
  },
  {
    id: 'lex:iran',
    surface: 'ایران',
    normalized: 'ایران',
    category: 'proper-noun',
    properName: { type: 'PLACE', notes: 'Country / realm of Iran' },
    readings: [{
      id: 'read:iran:1',
      canonical: 'īrān',
      confidence: 0.99,
      source: 'Reviewed proper-name seed entry',
      sources: [{ type: 'ENCYCLOPEDIA', citation: 'Encyclopaedia Iranica', reference: '“IRAN i. Pre-Islamic, Islamic periods”' }]
    }]
  },
  {
    id: 'lex:maktab',
    surface: 'مکتب',
    normalized: 'مکتب',
    readings: [{
      id: 'read:maktab:1',
      canonical: 'maktab',
      confidence: 0.98,
      source: 'Reviewed seed lexicon',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 1298' }]
    }]
  },
  {
    id: 'lex:tabriz',
    surface: 'تبریز',
    normalized: 'تبریز',
    category: 'proper-noun',
    properName: { type: 'PLACE', notes: 'City of Tabriz' },
    readings: [{
      id: 'read:tabriz:1',
      canonical: 'tabrīz',
      confidence: 0.99,
      source: 'Reviewed place-name seed entry',
      sources: [{ type: 'ENCYCLOPEDIA', citation: 'Encyclopaedia Iranica', reference: '“TABRIZ”' }]
    }]
  },
  {
    id: 'lex:va',
    surface: 'و',
    normalized: 'و',
    category: 'conjunction',
    readings: [{
      id: 'read:va:1',
      canonical: 'va',
      confidence: 0.98,
      source: 'Reviewed conjunction seed entry',
      sources: [{ type: 'IJMES_GUIDE', citation: 'Current IJMES Translation and Transliteration Guide', reference: 'Conjunction va convention' }]
    }]
  },
  {
    id: 'lex:dar',
    surface: 'در',
    normalized: 'در',
    category: 'preposition',
    readings: [{
      id: 'read:dar:1',
      canonical: 'dar',
      confidence: 0.98,
      source: 'Reviewed preposition seed entry',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 518' }]
    }]
  },
  {
    id: 'lex:mabani',
    surface: 'مبانی',
    normalized: 'مبانی',
    category: 'noun',
    readings: [{
      id: 'read:mabani:1',
      canonical: 'mabānī',
      confidence: 0.98,
      source: 'Reviewed seed lexicon',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 1198' }]
    }]
  },
  {
    id: 'lex:tajaddud-khvahi',
    surface: 'تجددخواهی',
    normalized: 'تجددخواهی',
    readings: [
      {
        id: 'read:tajaddud-khvahi:1',
        canonical: 'tajaddud-khvāhī',
        confidence: 0.72,
        source: 'Persian lexical reading; editorial hyphenation requires review',
        sources: [{ type: 'ACADEMIC_GRAMMAR', citation: 'Persian compound morphology; Windfuhr and Perry, The Iranian Languages (2009)' }]
      },
      {
        id: 'read:tajaddud-khvahi:2',
        canonical: 'tajaddudkhvāhī',
        confidence: 0.72,
        source: 'Alternative editorial joining; requires review',
        sources: [{ type: 'REVIEWED_PROJECT_ENTRY', citation: 'Alternative solid compound transliteration' }]
      }
    ],
    notes: 'The vowel u follows IJMES; compound joining remains an editorial question.'
  },
  {
    id: 'lex:karam-kirm',
    surface: 'کرم',
    normalized: 'کرم',
    category: 'noun',
    readings: [
      {
        id: 'read:karam:1',
        canonical: 'karam',
        confidence: 0.5,
        source: 'Ambiguity test lexicon: generosity reading',
        sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 1025' }],
        vocalization: [{ afterBaseIndex: 0, vowel: 'a' }]
      },
      {
        id: 'read:kirm:1',
        canonical: 'kirm',
        confidence: 0.5,
        source: 'Ambiguity test lexicon: worm reading',
        sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 1026' }],
        vocalization: [{ afterBaseIndex: 0, vowel: 'i' }]
      }
    ]
  },
  {
    id: 'lex:amr',
    surface: 'امر',
    normalized: 'امر',
    readings: [{
      id: 'read:amr:1',
      canonical: 'ʾamr',
      confidence: 0.95,
      source: 'Hamza behavior test entry',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 95' }]
    }]
  },
  {
    id: 'lex:ilm',
    surface: 'علم',
    normalized: 'علم',
    readings: [{
      id: 'read:ilm:1',
      canonical: 'ʿilm',
      confidence: 0.95,
      source: 'ʿAyn behavior test entry',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 864' }]
    }]
  },
  {
    id: 'lex:dur',
    surface: 'دور',
    normalized: 'دور',
    readings: [{
      id: 'read:dur:1',
      canonical: 'dūr',
      confidence: 0.9,
      source: 'Long-vowel behavior test entry',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 547' }]
    }]
  },
  {
    id: 'lex:al-hilal',
    surface: 'الهلال',
    normalized: 'الهلال',
    readings: [{
      id: 'read:al-hilal:1',
      canonical: 'al-hilāl',
      confidence: 0.9,
      source: 'Title article behavior test entry',
      sources: [{ type: 'IJMES_GUIDE', citation: 'Current IJMES Translation and Transliteration Guide', reference: 'Arabic definite article in titles' }]
    }]
  },
  {
    id: 'lex:hamkari',
    surface: 'همکاری',
    normalized: 'همکاری',
    readings: [{
      id: 'read:hamkari:1',
      canonical: 'ham-kārī',
      confidence: 0.9,
      source: 'Hyphenated Persian compound behavior test entry',
      sources: [{ type: 'ACADEMIC_GRAMMAR', citation: 'Windfuhr and Perry, The Iranian Languages (2009)' }]
    }]
  },
  {
    id: 'lex:kitab',
    surface: 'کتاب',
    normalized: 'کتاب',
    category: 'noun',
    readings: [{
      id: 'read:kitab:1',
      canonical: 'kitāb',
      confidence: 0.98,
      source: 'Reviewed Phase 2A noun seed entry',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 1013' }]
    }]
  },
  {
    id: 'lex:tarikh',
    surface: 'تاریخ',
    normalized: 'تاریخ',
    category: 'noun',
    readings: [{
      id: 'read:tarikh:1',
      canonical: 'tārīkh',
      confidence: 0.98,
      source: 'Reviewed Phase 2A noun seed entry',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 275' }]
    }]
  },
  {
    id: 'lex:khana',
    surface: 'خانه',
    normalized: 'خانه',
    category: 'noun',
    readings: [{
      id: 'read:khana:1',
      canonical: 'khāna',
      confidence: 0.95,
      source: 'Reviewed Phase 2A heh-final noun seed entry',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 442' }]
    }]
  },
  {
    id: 'lex:buzurg',
    surface: 'بزرگ',
    normalized: 'بزرگ',
    category: 'adjective',
    readings: [{
      id: 'read:buzurg:1',
      canonical: 'buzurg',
      confidence: 0.95,
      source: 'Reviewed adjective reading; UT Austin Persian Online degree-of-adjective examples, with IJMES Persian i/u convention',
      sources: [{ type: 'ACADEMIC_GRAMMAR', citation: 'UT Austin Persian Online, Comparative and Superlative Adjectives' }]
    }]
  },

  // --- Phase 2C Scholarly Vocabulary Expansion (State, Law, Society, Religion, Titles, Proper Names) ---

  {
    id: 'lex:daulat',
    surface: 'دولت',
    normalized: 'دولت',
    category: 'noun',
    readings: [{
      id: 'read:daulat:1',
      canonical: 'daulat',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 548 (state, government, empire)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 548' }]
    }]
  },
  {
    id: 'lex:hukumat',
    surface: 'حکومت',
    normalized: 'حکومت',
    category: 'noun',
    readings: [{
      id: 'read:hukumat:1',
      canonical: 'ḥukūmat',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 427 (rule, dominion, government)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 427' }]
    }]
  },
  {
    id: 'lex:mashruta',
    surface: 'مشروطه',
    normalized: 'مشروطه',
    category: 'noun',
    readings: [{
      id: 'read:mashruta:1',
      canonical: 'mashrūṭa',
      confidence: 0.98,
      source: 'Browne, The Persian Revolution of 1905–1909; Steingass, p. 1218',
      sources: [{ type: 'ACADEMIC_GRAMMAR', citation: 'E. G. Browne, The Persian Revolution of 1905–1909 (Cambridge, 1910)' }]
    }]
  },
  {
    id: 'lex:mashrutiyat',
    surface: 'مشروطیت',
    normalized: 'مشروطیت',
    category: 'noun',
    readings: [{
      id: 'read:mashrutiyat:1',
      canonical: 'mashrūṭīyat',
      confidence: 0.98,
      source: 'Encyclopaedia Iranica, “CONSTITUTIONAL REVOLUTION i. Overview”',
      sources: [{ type: 'ENCYCLOPEDIA', citation: 'Encyclopaedia Iranica, “CONSTITUTIONAL REVOLUTION”' }]
    }]
  },
  {
    id: 'lex:majlis',
    surface: 'مجلس',
    normalized: 'مجلس',
    category: 'noun',
    readings: [{
      id: 'read:majlis:1',
      canonical: 'majlis',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 1180 (assembly, parliament)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 1180' }]
    }]
  },
  {
    id: 'lex:saltanat',
    surface: 'سلطنت',
    normalized: 'سلطنت',
    category: 'noun',
    readings: [{
      id: 'read:saltanat:1',
      canonical: 'salṭanat',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 695 (monarchy, sovereignty, reign)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 695' }]
    }]
  },
  {
    id: 'lex:shah',
    surface: 'شاه',
    normalized: 'شاه',
    category: 'noun',
    readings: [{
      id: 'read:shah:1',
      canonical: 'shāh',
      confidence: 0.99,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 724 (king, monarch)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 724' }]
    }]
  },
  {
    id: 'lex:siyasat',
    surface: 'سیاست',
    normalized: 'سیاست',
    category: 'noun',
    readings: [{
      id: 'read:siyasat:1',
      canonical: 'siyāsat',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 713 (politics, administration, policy)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 713' }]
    }]
  },
  {
    id: 'lex:inqilab',
    surface: 'انقلاب',
    normalized: 'انقلاب',
    category: 'noun',
    readings: [{
      id: 'read:inqilab:1',
      canonical: 'inqilāb',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 111 (revolution, upheaval)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 111' }]
    }]
  },
  {
    id: 'lex:qanun',
    surface: 'قانون',
    normalized: 'قانون',
    category: 'noun',
    readings: [{
      id: 'read:qanun:1',
      canonical: 'qānūn',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 953 (law, canon, regulation)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 953' }]
    }]
  },
  {
    id: 'lex:huquq',
    surface: 'حقوق',
    normalized: 'حقوق',
    category: 'noun',
    readings: [{
      id: 'read:huquq:1',
      canonical: 'ḥuqūq',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 426 (rights, jurisprudence, law)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 426' }]
    }]
  },
  {
    id: 'lex:fiqh',
    surface: 'فقه',
    normalized: 'فقه',
    category: 'noun',
    readings: [{
      id: 'read:fiqh:1',
      canonical: 'fiqh',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 933 (Islamic jurisprudence)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 933' }]
    }]
  },
  {
    id: 'lex:shariat',
    surface: 'شریعت',
    normalized: 'شریعت',
    category: 'noun',
    readings: [{
      id: 'read:shariat:1',
      canonical: 'sharīʿat',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 744 (divine law, sharia)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 744' }]
    }]
  },
  {
    id: 'lex:din',
    surface: 'دین',
    normalized: 'دین',
    category: 'noun',
    readings: [{
      id: 'read:din:1',
      canonical: 'dīn',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 553 (religion, faith)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 553' }]
    }]
  },
  {
    id: 'lex:mazhab',
    surface: 'مذهب',
    normalized: 'مذهب',
    category: 'noun',
    readings: [{
      id: 'read:mazhab:1',
      canonical: 'mazhab',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 1215 (sect, denomination, creed)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 1215' }]
    }]
  },
  {
    id: 'lex:ulama',
    surface: 'علما',
    normalized: 'علما',
    category: 'noun',
    readings: [{
      id: 'read:ulama:1',
      canonical: 'ʿulamā',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 863 (scholars, learned men, clerics)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 863' }]
    }]
  },
  {
    id: 'lex:mujtahid',
    surface: 'مجتهد',
    normalized: 'مجتهد',
    category: 'noun',
    readings: [{
      id: 'read:mujtahid:1',
      canonical: 'mujtahid',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 1181 (jurist, authority in religious law)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 1181' }]
    }]
  },
  {
    id: 'lex:tajaddud',
    surface: 'تجدد',
    normalized: 'تجدد',
    category: 'noun',
    readings: [{
      id: 'read:tajaddud:1',
      canonical: 'tajaddud',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 280 (modernity, renewal)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 280' }]
    }]
  },
  {
    id: 'lex:islahat',
    surface: 'اصلاحات',
    normalized: 'اصلاحات',
    category: 'noun',
    readings: [{
      id: 'read:islahat:1',
      canonical: 'iṣlāḥāt',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 86 (reforms, improvements)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 86' }]
    }]
  },
  {
    id: 'lex:azadi',
    surface: 'آزادی',
    normalized: 'آزادی',
    category: 'noun',
    readings: [{
      id: 'read:azadi:1',
      canonical: 'āzādī',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 23 (freedom, liberty)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 23' }]
    }]
  },
  {
    id: 'lex:millat',
    surface: 'ملت',
    normalized: 'ملت',
    category: 'noun',
    readings: [{
      id: 'read:millat:1',
      canonical: 'millat',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 1304 (nation, people, religious community)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 1304' }]
    }]
  },
  {
    id: 'lex:milli',
    surface: 'ملی',
    normalized: 'ملی',
    category: 'adjective',
    readings: [{
      id: 'read:milli:1',
      canonical: 'millī',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 1305 (national)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 1305' }]
    }]
  },
  {
    id: 'lex:jamia',
    surface: 'جامعه',
    normalized: 'جامعه',
    category: 'noun',
    readings: [{
      id: 'read:jamia:1',
      canonical: 'jāmiʿa',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 352 (society, community, university)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 352' }]
    }]
  },
  {
    id: 'lex:mardum',
    surface: 'مردم',
    normalized: 'مردم',
    category: 'noun',
    readings: [{
      id: 'read:mardum:1',
      canonical: 'mardum',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 1216 (people, men, mankind)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 1216' }]
    }]
  },
  {
    id: 'lex:farhang',
    surface: 'فرهنگ',
    normalized: 'فرهنگ',
    category: 'noun',
    readings: [{
      id: 'read:farhang:1',
      canonical: 'farhang',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 930 (culture, learning, dictionary)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 930' }]
    }]
  },
  {
    id: 'lex:tamaddun',
    surface: 'تمدن',
    normalized: 'تمدن',
    category: 'noun',
    readings: [{
      id: 'read:tamaddun:1',
      canonical: 'tamaddun',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 320 (civilization, refinement)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 320' }]
    }]
  },
  {
    id: 'lex:andisha',
    surface: 'اندیشه',
    normalized: 'اندیشه',
    category: 'noun',
    readings: [{
      id: 'read:andisha:1',
      canonical: 'andīsha',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 109 (thought, reflection, meditation)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 109' }]
    }]
  },
  {
    id: 'lex:risala',
    surface: 'رساله',
    normalized: 'رساله',
    category: 'noun',
    readings: [{
      id: 'read:risala:1',
      canonical: 'risāla',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 577 (treatise, tract, letter)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 577' }]
    }]
  },
  {
    id: 'lex:maqala',
    surface: 'مقاله',
    normalized: 'مقاله',
    category: 'noun',
    readings: [{
      id: 'read:maqala:1',
      canonical: 'maqāla',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 1284 (article, essay, speech)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 1284' }]
    }]
  },
  {
    id: 'lex:guftar',
    surface: 'گفتار',
    normalized: 'گفتار',
    category: 'noun',
    readings: [{
      id: 'read:guftar:1',
      canonical: 'guftār',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 1093 (discourse, word, speech)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 1093' }]
    }]
  },
  {
    id: 'lex:sharh',
    surface: 'شرح',
    normalized: 'شرح',
    category: 'noun',
    readings: [{
      id: 'read:sharh:1',
      canonical: 'sharḥ',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 741 (commentary, exposition)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 741' }]
    }]
  },
  {
    id: 'lex:matn',
    surface: 'متن',
    normalized: 'متن',
    category: 'noun',
    readings: [{
      id: 'read:matn:1',
      canonical: 'matn',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 1148 (text, corpus)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 1148' }]
    }]
  },
  {
    id: 'lex:tarjuma',
    surface: 'ترجمه',
    normalized: 'ترجمه',
    category: 'noun',
    readings: [{
      id: 'read:tarjuma:1',
      canonical: 'tarjuma',
      confidence: 0.98,
      source: 'Steingass, Comprehensive Persian-English Dictionary, p. 296 (translation, interpretation)',
      sources: [{ type: 'SCHOLARLY_DICTIONARY', citation: 'Steingass, Comprehensive Persian-English Dictionary, p. 296' }]
    }]
  },
  {
    id: 'lex:tihran',
    surface: 'تهران',
    normalized: 'تهران',
    category: 'proper-noun',
    properName: { type: 'PLACE', notes: 'City of Tehran / capital of Iran' },
    readings: [{
      id: 'read:tihran:1',
      canonical: 'tihrān',
      confidence: 0.99,
      source: 'Encyclopaedia Iranica, “TEHRAN i. GEOGRAPHY AND ENVIRONMENT”; IJMES standard place name',
      sources: [
        { type: 'IJMES_GUIDE', citation: 'IJMES Translation and Transliteration Guide' },
        { type: 'ENCYCLOPEDIA', citation: 'Encyclopaedia Iranica, “TEHRAN”' }
      ]
    }]
  },
  {
    id: 'lex:qajar',
    surface: 'قاجار',
    normalized: 'قاجار',
    category: 'proper-noun',
    properName: { type: 'DYNASTY', notes: 'Qajar dynasty of Iran (1789–1925)' },
    readings: [{
      id: 'read:qajar:1',
      canonical: 'qājār',
      confidence: 0.99,
      source: 'Encyclopaedia Iranica, “QAJAR DYNASTY”; IJMES dynastic name',
      sources: [
        { type: 'IJMES_GUIDE', citation: 'IJMES Translation and Transliteration Guide' },
        { type: 'ENCYCLOPEDIA', citation: 'Encyclopaedia Iranica, “QAJAR DYNASTY”' }
      ]
    }]
  },
  {
    id: 'lex:safavi',
    surface: 'صفوی',
    normalized: 'صفوی',
    category: 'proper-noun',
    properName: { type: 'DYNASTY', notes: 'Safavid dynasty of Iran (1501–1736)' },
    readings: [{
      id: 'read:safavi:1',
      canonical: 'ṣafavī',
      confidence: 0.99,
      source: 'Encyclopaedia Iranica, “SAFAVID DYNASTY”',
      sources: [{ type: 'ENCYCLOPEDIA', citation: 'Encyclopaedia Iranica, “SAFAVID DYNASTY”' }]
    }]
  },
  {
    id: 'lex:isfahan',
    surface: 'اصفهان',
    normalized: 'اصفهان',
    category: 'proper-noun',
    properName: { type: 'PLACE', notes: 'City of Isfahan' },
    readings: [{
      id: 'read:isfahan:1',
      canonical: 'iṣfahān',
      confidence: 0.99,
      source: 'Encyclopaedia Iranica, “ISFAHAN”',
      sources: [{ type: 'ENCYCLOPEDIA', citation: 'Encyclopaedia Iranica, “ISFAHAN”' }]
    }]
  }
];

export const DEFAULT_LEXICON_REPOSITORY = new LexiconRepository(LEXICON);
