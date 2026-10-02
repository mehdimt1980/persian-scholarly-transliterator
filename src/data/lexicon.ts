import { LexicalEntry } from '../domain/types';

export const LEXICON: LexicalEntry[] = [
  { surface: 'ولایت', normalized: 'ولایت', readings: [{ canonical: 'vilāyat', confidence: 0.99, source: 'Current IJMES guide example' }], context: { explicitIzafatAfter: ['فقیه'], source: 'Current IJMES guide example: vilāyat-i faqīh' } },
  { surface: 'فقیه', normalized: 'فقیه', readings: [{ canonical: 'faqīh', confidence: 0.99, source: 'Current IJMES guide example' }] },
  { surface: 'تأملی', normalized: 'تأملی', readings: [{ canonical: 'taʾammulī', confidence: 0.9, source: 'Seed lexical reading; IJMES i/u convention applied' }] },
  { surface: 'درباره', normalized: 'درباره', readings: [
    { canonical: 'dar bāra-yi', confidence: 0.7, source: 'Persian lexical analysis; segmentation requires editorial review' },
    { canonical: 'darbāra-yi', confidence: 0.7, source: 'Alternative editorial joining; requires review' }
  ], notes: 'IJMES governs i/u and diacritics but does not settle this seed entry’s joining choice.' },
  { surface: 'ایران', normalized: 'ایران', readings: [{ canonical: 'īrān', confidence: 0.99, source: 'Reviewed proper-name seed entry' }] },
  { surface: 'مکتب', normalized: 'مکتب', readings: [{ canonical: 'maktab', confidence: 0.98, source: 'Reviewed seed lexicon' }] },
  { surface: 'تبریز', normalized: 'تبریز', readings: [{ canonical: 'tabrīz', confidence: 0.99, source: 'Reviewed place-name seed entry' }] },
  { surface: 'و', normalized: 'و', readings: [{ canonical: 'va', confidence: 0.98, source: 'Reviewed conjunction seed entry' }] },
  { surface: 'در', normalized: 'در', readings: [{ canonical: 'dar', confidence: 0.98, source: 'Reviewed preposition seed entry' }] },
  { surface: 'مبانی', normalized: 'مبانی', readings: [{ canonical: 'mabānī', confidence: 0.98, source: 'Reviewed seed lexicon' }] },
  { surface: 'تجددخواهی', normalized: 'تجددخواهی', readings: [
    { canonical: 'tajaddud-khvāhī', confidence: 0.72, source: 'Persian lexical reading; editorial hyphenation requires review' },
    { canonical: 'tajaddudkhvāhī', confidence: 0.72, source: 'Alternative editorial joining; requires review' }
  ], notes: 'The vowel u follows IJMES; compound joining remains an editorial question.' },
  { surface: 'کرم', normalized: 'کرم', readings: [
    { canonical: 'karam', confidence: 0.5, source: 'Ambiguity test lexicon: generosity reading' },
    { canonical: 'kirm', confidence: 0.5, source: 'Ambiguity test lexicon: worm reading' }
  ] },
  { surface: 'امر', normalized: 'امر', readings: [{ canonical: 'ʾamr', confidence: 0.95, source: 'Hamza behavior test entry' }] },
  { surface: 'علم', normalized: 'علم', readings: [{ canonical: 'ʿilm', confidence: 0.95, source: 'ʿAyn behavior test entry' }] },
  { surface: 'دور', normalized: 'دور', readings: [{ canonical: 'dūr', confidence: 0.9, source: 'Long-vowel behavior test entry' }] },
  { surface: 'الهلال', normalized: 'الهلال', readings: [{ canonical: 'al-hilāl', confidence: 0.9, source: 'Title article behavior test entry' }] },
  { surface: 'همکاری', normalized: 'همکاری', readings: [{ canonical: 'ham-kārī', confidence: 0.9, source: 'Hyphenated Persian compound behavior test entry' }] }
];
