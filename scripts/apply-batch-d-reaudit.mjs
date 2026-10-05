import fs from 'node:fs';

const path = 'validation/review/reaudit-worklist.v2.json';
const worklist = JSON.parse(fs.readFileSync(path, 'utf8'));
const reviewer = { name: 'OpenAI GPT-5.6 Sol', type: 'AI_SPECIALIST', reviewedAt: '2026-10-05' };
const ijmesTitle = [{ source: 'IJMES', citation: 'IJMES Translation and Transliteration Guide (Cambridge University Press)', locator: 'book/article titles: IJMES spelling and English capitalization, no ordinary diacritics, preserve ayn/hamza; Persian i/u and izafat rules' }];
const final = (scholarlyCanonical, renderedOutput, readingEvidence, reviewNote, renderingEvidence = ijmesTitle) => ({ disposition: 'FINAL', scholarlyCanonical, renderedOutput, readingEvidence, renderingEvidence, reviewNote, reviewer });
const e = (...items) => items.map(([source, citation, locator]) => ({ source, citation, locator }));

const decisions = {
  'cand-book-001': final('Tārīkh-i Bīdārī-yi Īrānīyān', 'Tarikh-i Bidari-yi Iraniyan', e(['Dehkhoda','Loghatnameh-ye Dehkhoda (1998), entry تاریخ بیداری ایرانیان','entry تاریخ بیداری ایرانیان'],['Iranica','TĀRĪḴ-E BĪDĀRĪ-E ĪRĀNĪĀN','Tārīḵ-e Bīdārī-e Īrānīān']), 'Iranica supplies reading evidence; IJMES converts ḵ/e to kh/i and the vowel-final Bīdārī host takes explicit -yi.'),
  'cand-book-002': final('Siyāsat-nāma', 'Siyasat-nama', e(['Dehkhoda','Loghatnameh-ye Dehkhoda (1998), entry سیاست‌نامه','entry سیاست‌نامه'],['Iranica','SIĀSAT-NĀMA','Sīāsat-nāma reading/title evidence']), 'The established Persian reading is siyāsat; the compound title boundary is retained and title rendering removes ordinary diacritics.'),
  'cand-book-003': final('Qābūs-nāma', 'Qabus-nama', e(['Dehkhoda','Loghatnameh-ye Dehkhoda (1998), entry قابوس‌نامه','entry قابوس‌نامه'],['Iranica','QĀBUS-NĀMA','Qābūs-nāma']), 'Full scholarly vowels are preserved canonically; title rendering removes ordinary diacritics.'),
  'cand-book-004': final('Marzbān-nāma', 'Marzban-nama', e(['Dehkhoda','Loghatnameh-ye Dehkhoda (1998), entry مرزبان‌نامه','entry مرزبان‌نامه'],['Iranica','MARZBĀN-NĀMA','Marzbān-nāma']), 'The compound title boundary is preserved; title rendering removes ordinary diacritics.'),
  'cand-book-005': final('Safarnāma-yi Nāṣir-i Khusraw', 'Safarnama-yi Nasir-i Khusraw', e(['Dehkhoda','Loghatnameh-ye Dehkhoda (1998), entry سفرنامه ناصرخسرو','entry سفرنامه ناصرخسرو'],['Iranica','SAFARNĀMA','Safarnāma-ye Nāṣer-e Ḵosrow'],['Scholarly bibliography','Safarnāma-yi Nāṣir-i Khusraw','attested title/name construction with internal izafat']), 'Canonical preserves post-vocalic -yi after Safarnāma and the conventional internal izafat Nāṣir-i Khusraw; Iranica e/ḵ/o are converted to IJMES i/kh/u-aw.'),
  'cand-book-006': final('Kalīla va Dimna', 'Kalila va Dimna', e(['Dehkhoda','Loghatnameh-ye Dehkhoda (1998), entry کلیله و دمنه','entry کلیله و دمنه'],['Iranica','KALILA WA DEMNA','Kalīla va Demna in Persian reception']), 'Persian short e in Demna is converted to IJMES i, yielding Dimna; Persian conjunction is retained as va.'),
  'cand-book-007': final('Gulistān', 'Gulistan', e(['Steingass','Steingass, Comprehensive Persian-English Dictionary (1892), p. 1093','p. 1093; گلستان'],['Iranica','GOLESTĀN-E SAʿDĪ','Golestān reading evidence']), 'Iranica o/e are converted to IJMES Persian u/i: Gulistān.'),
  'cand-book-008': final('Būstān', 'Bustan', e(['Steingass','Steingass, Comprehensive Persian-English Dictionary (1892), p. 206','p. 206; بوستان'],['Iranica','BŪSTĀN','Būstān']), 'The attested long vowels are retained canonically; title rendering removes the macron.'),
  'cand-book-009': final('Savūshūn', 'Savushun', e(['Dehkhoda','Loghatnameh-ye Dehkhoda (1998), entry سووشون','entry سووشون'],['Iranica','DĀNEŠVAR, SĪMĪN','Savūšūn'],['Iranian Studies','Authorial title preference for Savūshūn','Daneshvar preference reported in scholarly discussion']), 'Savūshūn is retained as the reviewed literary-title reading; IJMES sh replaces Iranica š and title rendering removes macrons.'),
  'cand-book-010': final('Chashm-hā-yash', 'Chashm-ha-yash', e(['Dehkhoda','Loghatnameh-ye Dehkhoda (1998), entry چشم‌هایش','entry چشم‌هایش'],['Iranica','ʿALAVĪ, BOZORG','Čašmhāyeš title/reading evidence']), 'Canonical makes the productive plural -hā and possessive -yash morphology auditable with boundary hyphens. Rendering removes ordinary diacritics but does not erase those morphological boundaries.'),
  'cand-book-011': final('Ḥājī Āqā', 'Haji Aqa', e(['Dehkhoda','Loghatnameh-ye Dehkhoda (1998), entry حاجی آقا','entry حاجی آقا'],['Iranica','HEDAYAT, SADEQ i. LIFE AND WORK','Ḥājī Āqā']), 'Reading is directly attested; title rendering removes ordinary diacritics.'),
  'cand-book-012': final('Zimistān', 'Zimistan', e(['Steingass','Steingass, Comprehensive Persian-English Dictionary (1892), p. 622','p. 622; زمستان'],['Iranica','AḴAVĀN-E SĀLES, MEHDĪ','Zemestān title/reading evidence']), 'Iranica e is converted to IJMES Persian i, yielding Zimistān; title rendering removes the macron.')
};

if (Object.keys(decisions).length !== 12) throw new Error('Expected 12 Batch D decisions');
if (worklist.metadata.status !== 'BATCH_C_COMPLETED') throw new Error(`Unexpected starting status ${worklist.metadata.status}`);
let applied = 0;
for (const c of worklist.cases) {
  if (['A','B','C'].includes(c.batch)) {
    if (c.reviewState !== 'COMPLETED' || c.decision === null) throw new Error(`Prior batch changed unexpectedly: ${c.id}`);
  } else if (c.batch === 'D') {
    if (c.reviewState !== 'PENDING' || c.decision !== null) throw new Error(`Batch D case not blank: ${c.id}`);
    const d = decisions[c.id];
    if (!d) throw new Error(`Missing Batch D decision: ${c.id}`);
    c.reviewState = 'COMPLETED';
    c.decision = d;
    applied++;
  } else if (c.batch === 'E') {
    if (c.reviewState !== 'PENDING' || c.decision !== null) throw new Error(`Future batch contaminated: ${c.id}`);
  }
}
if (applied !== 12) throw new Error(`Applied ${applied} Batch D decisions`);
worklist.metadata.status = 'BATCH_D_COMPLETED';
worklist.summary.adjudicated = 96;
worklist.summary.pending = 12;
fs.writeFileSync(path, JSON.stringify(worklist, null, 2) + '\n', 'utf8');
console.log('Applied 12 Batch D decisions; 96 adjudicated / 12 pending.');
