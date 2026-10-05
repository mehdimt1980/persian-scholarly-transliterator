import fs from 'node:fs';

const path = 'validation/review/reaudit-worklist.v2.json';
const worklist = JSON.parse(fs.readFileSync(path, 'utf8'));
const reviewer = { name: 'OpenAI GPT-5.6 Sol', type: 'AI_SPECIALIST', reviewedAt: '2026-10-05' };
const ijmes = [{ source: 'IJMES', citation: 'IJMES Translation and Transliteration Guide and Persian Transliteration Chart (Cambridge University Press)', locator: 'Persian i/u, consonant mappings, and written-form transliteration rules' }];
const ev = (page, sourceText) => [{ source: 'Steingass', citation: `Steingass, Comprehensive Persian-English Dictionary (1892), p. ${page}`, locator: `p. ${page}; ${sourceText}` }];
const final = (scholarlyCanonical, page, sourceText, reviewNote) => ({
  disposition: 'FINAL', scholarlyCanonical, renderedOutput: scholarlyCanonical,
  readingEvidence: ev(page, sourceText), renderingEvidence: ijmes, reviewNote, reviewer
});
const review = (alternatives, page, sourceText, reviewNote) => ({
  disposition: 'REVIEW_REQUIRED',
  nonAuthoritativeAlternatives: alternatives.map((reading) => ({ reading, source: `Steingass p. ${page}` })),
  readingEvidence: ev(page, sourceText), renderingEvidence: ijmes, reviewNote, reviewer
});

const decisions = {
  'cand-amb-001': review(['mihr','muhr'], '1353', 'مهر', 'The unvocalized source supports materially distinct readings: mihr (love/sun/Mithra-related senses) and muhr (seal/stamp). Context is required; no single authoritative canonical is safe.'),
  'cand-amb-002': final('shīr', '773', 'شیر', 'Steingass attests semantic/historical pronunciation distinctions (including lion vs milk), but under the project IJMES Persian system the material benchmark output collapses to shīr; no transliteration-level choice remains.'),
  'cand-amb-003': review(['sar','sirr'], '671', 'سر', 'The same Persian surface can represent native Persian sar (head/top) or Arabic-derived sirr (secret). These remain materially distinct in IJMES, so context is required.'),
  'cand-amb-004': final('bād', '138', 'باد', 'Distinct senses/grammatical uses share the same scholarly transliteration bād; semantic ambiguity does not create a transliteration-level ambiguity.'),
  'cand-amb-005': final('bār', '142', 'بار', 'The attested senses share the same scholarly transliteration bār; no output-level ambiguity remains.'),
  'cand-amb-006': final('dād', '496', 'داد', 'Noun and verbal/past-stem readings represented by this surface converge on dād in the benchmark transliteration system.'),
  'cand-amb-007': review(['gul','gil'], '1092', 'گل', 'The unvocalized surface represents at least gul (flower/rose) and gil (clay/mud). IJMES preserves the u/i distinction, so context is required.'),
  'cand-amb-008': final('gūsh', '1105', 'گوش', 'Attested senses represented by this surface retain the same scholarly reading gūsh; no transliteration-level ambiguity remains.'),
  'cand-amb-009': review(['shūr','shawr'], '764', 'شور', 'The surface can represent Persian shūr (salty/excitement/modal-system senses) and the distinct counsel/consultation reading represented as shawr under the project IJMES written-diphthong policy. Context is required.'),
  'cand-amb-010': final('rāst', '563', 'راست', 'Directional, adjectival, truth-related, and modal senses share the same scholarly reading rāst; semantic breadth alone does not require review.'),
  'cand-amb-011': review(['rūy','ravī'], '598', 'روی', 'The unvocalized surface supports rūy (face/on/zinc and related native readings) and Arabic-derived ravī (rhyme-letter/related reading). These remain materially distinct in IJMES, so context is required.'),
  'cand-amb-012': final('gāv', '1078', 'گاو', 'The attested lexical senses share the scholarly reading gāv; no transliteration-level ambiguity remains.')
};

if (Object.keys(decisions).length !== 12) throw new Error('Expected 12 Batch E decisions');
if (worklist.metadata.status !== 'BATCH_D_COMPLETED') throw new Error(`Unexpected starting status ${worklist.metadata.status}`);
let applied = 0;
for (const c of worklist.cases) {
  if (['A','B','C','D'].includes(c.batch)) {
    if (c.reviewState !== 'COMPLETED' || c.decision === null) throw new Error(`Prior batch changed unexpectedly: ${c.id}`);
  } else if (c.batch === 'E') {
    if (c.reviewState !== 'PENDING' || c.decision !== null) throw new Error(`Batch E case not blank: ${c.id}`);
    const d = decisions[c.id];
    if (!d) throw new Error(`Missing Batch E decision: ${c.id}`);
    c.reviewState = 'COMPLETED';
    c.decision = d;
    applied++;
  }
}
if (applied !== 12) throw new Error(`Applied ${applied} Batch E decisions`);
worklist.metadata.status = 'BATCH_E_COMPLETED';
worklist.summary.adjudicated = 108;
worklist.summary.pending = 0;
fs.writeFileSync(path, JSON.stringify(worklist, null, 2) + '\n', 'utf8');
console.log('Applied 12 Batch E decisions; 108 adjudicated / 0 pending.');
