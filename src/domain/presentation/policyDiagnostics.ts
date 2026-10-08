import type { PhraseTokenEvidence } from '../assistance/phraseTypes';
import type { PresentationContentCategory, PresentationDiagnostic } from './types';

const GUIDE = 'IJMES Translation and Transliteration Guide, Detailed Guidelines';

export interface CanonicalPolicyDiagnosticInput {
  canonical: string;
  contentCategory: PresentationContentCategory;
  tokenEvidence?: PhraseTokenEvidence[];
  expectedCanonicalByToken?: Readonly<Record<number, string>>;
  verifiedWordListIdentity?: boolean;
}

export interface CanonicalPolicyDiagnosticResult {
  policyVersion: 'ijmes-canonical-diagnostics-v1';
  normalizedCanonical: string;
  diagnostics: PresentationDiagnostic[];
}

function item(id: string, severity: PresentationDiagnostic['severity'], message: string, ruleId: string, source = GUIDE): PresentationDiagnostic {
  return { id, severity, message, ruleId, source };
}

export function diagnoseScholarlyCanonical(input: CanonicalPolicyDiagnosticInput): CanonicalPolicyDiagnosticResult {
  const canonical = input.canonical.normalize('NFC');
  const diagnostics: PresentationDiagnostic[] = [];

  if (/[ʻʼ]/u.test(canonical) || /z\p{M}*̤/u.test(input.canonical.normalize('NFD'))) {
    diagnostics.push(item('IJMES_CANONICAL_UNSUPPORTED_ALA_LC_CHARACTER', 'BLOCK', 'Canonical IJMES output contains a scoped ALA-LC character sequence.', 'ALA-IJMES-COMPARE-01', 'ALA-LC Persian Romanization Tables (2012); project scheme registry'));
  }
  for (const word of canonical.match(/[\p{L}\p{M}ʿʾ-]+/gu) ?? []) {
    if (word.startsWith('ʾ')) diagnostics.push(item('IJMES_CANONICAL_INITIAL_HAMZA', 'REVIEW_REQUIRED', `Initial hamza in “${word}” conflicts with the IJMES initial-hamza rule.`, 'IJMES-HAMZA-01'));
    if (/[eo]/iu.test(word) && !input.verifiedWordListIdentity) {
      diagnostics.push(item('IJMES_PERSIAN_SHORT_VOWEL_SUSPECTED', 'REVIEW_REQUIRED', `The reading “${word}” contains e/o; lexical evidence is required before asserting or correcting a Persian short-vowel violation.`, 'IJMES-PERSIAN-VOWELS-01'));
    }
  }
  for (const [indexText, expected] of Object.entries(input.expectedCanonicalByToken ?? {})) {
    const index = Number(indexText);
    const observed = input.tokenEvidence?.find((token) => token.index === index)?.canonicalTransliteration;
    if (observed && observed !== expected) {
      diagnostics.push(item('IJMES_CANONICAL_DETERMINISTIC_CONFLICT', 'BLOCK', `Token ${index} conflicts with deterministic canonical evidence.`, 'PROJECT-DETERMINISTIC-EVIDENCE-01', 'Project deterministic evidence contract'));
    }
  }
  if ((input.contentCategory === 'PERSONAL_NAME' || input.contentCategory === 'PLACE_NAME') && !input.verifiedWordListIdentity) {
    diagnostics.push(item('IJMES_IDENTITY_SPELLING_UNVERIFIED', 'INFO', 'Mechanical formatting does not establish an accepted proper-name or Word List spelling.', 'IJMES-WORDLIST-01', 'IJMES Word List, Last Revised August 8, 2026'));
  }
  return { policyVersion: 'ijmes-canonical-diagnostics-v1', normalizedCanonical: canonical, diagnostics };
}
