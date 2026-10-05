import fs from 'node:fs';

const path = 'validation/review/reaudit-worklist.v2.json';
const worklist = JSON.parse(fs.readFileSync(path, 'utf8'));
const c = worklist.cases.find((x) => x.id === 'cand-pers-004');
if (!c) throw new Error('cand-pers-004 not found');
if (c.reviewState !== 'COMPLETED' || !c.decision || c.decision.disposition !== 'FINAL') throw new Error('cand-pers-004 unexpected state');
if (c.decision.scholarlyCanonical !== 'Malik al-Shuʿarāʾ Bahār') throw new Error(`Unexpected canonical: ${c.decision.scholarlyCanonical}`);

c.decision.scholarlyCanonical = 'Malik al-Shuʿarā-yi Bahār';
c.decision.renderedOutput = 'Malek al-Shoʿara Bahar';
c.decision.readingEvidence = [
  { source: 'VIAF', citation: 'VIAF authority record for Mohammad-Taqi Bahar', locator: 'identity evidence' },
  { source: 'Iranica', citation: 'BAHĀR, MOḤAMMAD-TAQĪ', locator: 'Malek-al-Šoʿarāʾ Bahār as established name/title evidence' },
  { source: 'CiNii', citation: 'Dīvān-i ashʿār-i Malik al-Shuʿarā-yi Bahār', locator: 'explicit Persian izafat transcription -yi in the supplied surface pattern' }
];
c.decision.reviewNote = 'The exact supplied string contains explicit Persian yeh marking izafat in الشعرای; canonical therefore preserves -yi: Malik al-Shuʿarā-yi Bahār. Publication rendering follows the established English-facing Malek al-Shoʿara Bahar form without ordinary diacritics.';

fs.writeFileSync(path, JSON.stringify(worklist, null, 2) + '\n', 'utf8');
console.log('Corrected cand-pers-004 canonical/rendering.');
