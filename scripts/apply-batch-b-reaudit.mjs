import fs from 'node:fs';

const path = 'validation/review/reaudit-worklist.v2.json';
const worklist = JSON.parse(fs.readFileSync(path, 'utf8'));

const reviewer = { name: 'OpenAI GPT-5.6 Sol', type: 'AI_SPECIALIST', reviewedAt: '2026-10-05' };
const ijmes = [{ source: 'IJMES', citation: 'IJMES Translation and Transliteration Guide (Cambridge University Press)', locator: 'Persian transliteration chart; technical terms; izafat rule' }];
const decision = (scholarlyCanonical, readingEvidence, reviewNote, renderingEvidence = ijmes) => ({
  disposition: 'FINAL',
  scholarlyCanonical,
  renderedOutput: scholarlyCanonical,
  readingEvidence,
  renderingEvidence,
  reviewNote,
  reviewer
});
const ev = (source, citation, locator) => [{ source, citation, locator }];

const decisions = {
  'cand-cmp-001': decision('jahān-gard', ev('Steingass', 'Steingass, Comprehensive Persian-English Dictionary (1892), p. 380', 'p. 380; جهانگرد'), 'Compound structure jahān + gard is preserved with the project canonical boundary hyphen.'),
  'cand-cmp-002': decision('sukhan-sanj', ev('Steingass', 'Steingass, Comprehensive Persian-English Dictionary (1892), p. 687', 'p. 687; سخن‌سنج'), 'Compound structure sukhan + sanj is preserved with the project canonical boundary hyphen.'),
  'cand-cmp-003': decision('dānish-pazhūh', ev('Dehkhoda', 'Loghatnameh-ye Dehkhoda (1998), entry دانش‌پژوه', 'entry دانش‌پژوه'), 'The ZWNJ-marked compound boundary is represented explicitly as dānish-pazhūh.'),
  'cand-cmp-004': decision('nāma-nigār', ev('Dehkhoda', 'Loghatnameh-ye Dehkhoda (1998), entry نامه‌نگار', 'entry نامه‌نگار'), 'The vowel-final first stem and compound structure are represented as nāma-nigār.'),
  'cand-cmp-005': decision('dast-nivīs', ev('Dehkhoda', 'Loghatnameh-ye Dehkhoda (1998), entry دست‌نویس', 'entry دست‌نویس'), 'The ZWNJ-marked compound is represented with an explicit canonical stem boundary.'),

  'cand-mrp-001': decision('kitāb-hā', ev('Lazard', 'Lazard, A Grammar of Contemporary Persian (1992), p. 45', 'p. 45; plural -hā'), 'Productive plural -hā is represented with an explicit morphological boundary.'),
  'cand-mrp-002': decision('nāma-hā-yi', ev('Lazard', 'Lazard, A Grammar of Contemporary Persian (1992), p. 47', 'p. 47; plural/linker morphology'), 'Plural -hā plus post-vocalic linker -yi is represented explicitly.'),
  'cand-mrp-003': decision('khiradmand-tar', ev('Lazard', 'Lazard, A Grammar of Contemporary Persian (1992), p. 62', 'p. 62; comparative -tar'), 'Comparative -tar remains a distinct productive morphological segment; IJMES Persian i gives khiradmand.'),
  'cand-mrp-004': decision('buzurg-tarīn', ev('Lazard', 'Lazard, A Grammar of Contemporary Persian (1992), p. 63', 'p. 63; superlative -tarīn'), 'Superlative -tarīn remains explicit; IJMES Persian u gives buzurg.'),
  'cand-mrp-005': decision('kitāb-am', ev('Windfuhr', 'Windfuhr, Persian Grammar: History and State of Its Study (1979), p. 34', 'p. 34; possessive enclitic'), 'First-person singular possessive enclitic -am is morphologically explicit.'),
  'cand-mrp-006': decision('khāna-at', ev('Windfuhr', 'Windfuhr, Persian Grammar (1979), p. 35', 'p. 35; possessive enclitic'), 'Vowel-final khāna plus second-person singular enclitic is represented khāna-at.'),
  'cand-mrp-007': decision('qalam-ash', ev('Windfuhr', 'Windfuhr, Persian Grammar (1979), p. 35', 'p. 35; possessive enclitic'), 'Third-person singular possessive enclitic -ash is morphologically explicit.'),
  'cand-mrp-008': decision('dīdgāh-hā-yi-shān', ev('Lazard', 'Lazard, A Grammar of Contemporary Persian (1992), p. 78', 'p. 78; plural/linker/enclitic chain'), 'The productive chain plural -hā + linker -yi + possessive -shān is represented segment by segment.'),
  'cand-mrp-009': decision('dānishmand-ān', ev('Lazard', 'Lazard, A Grammar of Contemporary Persian (1992), p. 46', 'p. 46; plural -ān'), 'Productive human plural -ān is represented with an explicit morphological boundary.'),
  'cand-mrp-010': decision('guzārish-hā-yi', ev('Lazard', 'Lazard, A Grammar of Contemporary Persian (1992), p. 50', 'p. 50; plural/linker morphology'), 'Plural -hā followed by the explicit linker -yi is preserved; IJMES Persian u gives guzārish.'),

  'cand-izf-001': decision('tārīkh-i adabīyāt', ev('Thackston + IJMES', 'Thackston, An Introduction to Persian (1993), p. 18; Cambridge IJMES Guide, izafat rule', 'p. 18; IJMES izafat rule'), 'Consonant-final host takes Persian izāfat -i.'),
  'cand-izf-002': decision('zabān-i mādarī', ev('Thackston', 'Thackston, An Introduction to Persian (1993), p. 19', 'p. 19; izafat'), 'Consonant-final zabān takes izāfat -i.'),
  'cand-izf-003': decision('ḥuqūq-i bashar', ev('Thackston', 'Thackston, An Introduction to Persian (1993), p. 21', 'p. 21; izafat'), 'Consonant-final ḥuqūq takes izāfat -i; technical scholarly consonantal diacritics are preserved.'),
  'cand-izf-004': decision('khāna-yi pidarī', ev('Thackston', 'Thackston, An Introduction to Persian (1993), p. 22', 'p. 22; vowel-final izafat'), 'Vowel-final khāna takes the project explicit post-vocalic linker -yi.'),
  'cand-izf-005': decision('ṣidā-yi bārān', ev('Thackston', 'Thackston, An Introduction to Persian (1993), p. 23', 'p. 23; vowel-final izafat'), 'Vowel-final ṣidā takes explicit post-vocalic -yi.'),
  'cand-izf-006': decision('nasīm-i ṣubḥ', ev('Thackston', 'Thackston, An Introduction to Persian (1993), p. 24', 'p. 24; izafat'), 'Consonant-final nasīm takes -i; the technical scholarly layer preserves ṣubḥ.'),
  'cand-izf-007': decision('dīvān-i ḥāfiẓ', [
    { source: 'Dehkhoda', citation: 'Loghatnameh-ye Dehkhoda (1998), entry دیوان حافظ', locator: 'entry دیوان حافظ' },
    { source: 'Iranica', citation: 'HAFEZ i. An Overview', locator: 'Dīvān-e Ḥāfeẓ reading/identity evidence' }
  ], 'Iranica -e is converted to IJMES Persian izāfat -i; the technical layer preserves ḥ/ẓ.'),
  'cand-izf-008': decision('dirakht-i dānish', ev('Thackston', 'Thackston, An Introduction to Persian (1993), p. 25', 'p. 25; izafat'), 'Consonant-final dirakht takes Persian izāfat -i; dānish preserves IJMES Persian i.')
};

const expectedIds = new Set(Object.keys(decisions));
if (expectedIds.size !== 23) throw new Error(`Expected 23 Batch B decisions, got ${expectedIds.size}`);
if (worklist.metadata.status !== 'BATCH_A_COMPLETED') throw new Error(`Unexpected starting status ${worklist.metadata.status}`);

let applied = 0;
for (const c of worklist.cases) {
  if (c.batch === 'B') {
    const d = decisions[c.id];
    if (!d) throw new Error(`Missing Batch B decision for ${c.id}`);
    if (c.reviewState !== 'PENDING' || c.decision !== null) throw new Error(`Batch B case not blank: ${c.id}`);
    c.reviewState = 'COMPLETED';
    c.decision = d;
    applied++;
  } else if (c.batch === 'A') {
    if (c.reviewState !== 'COMPLETED' || c.decision === null) throw new Error(`Batch A changed unexpectedly: ${c.id}`);
  } else {
    if (c.reviewState !== 'PENDING' || c.decision !== null) throw new Error(`Future batch contaminated: ${c.id}`);
  }
}
if (applied !== 23) throw new Error(`Applied ${applied} Batch B decisions`);

worklist.metadata.status = 'BATCH_B_COMPLETED';
worklist.summary.pending = 60;
worklist.summary.adjudicated = 48;
fs.writeFileSync(path, JSON.stringify(worklist, null, 2) + '\n', 'utf8');
console.log('Applied 23 Batch B decisions; 48 adjudicated / 60 pending.');
