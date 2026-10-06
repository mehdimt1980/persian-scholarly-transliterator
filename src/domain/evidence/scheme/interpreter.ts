/**
 * Pure interpreter for external romanization evidence observations.
 *
 * Core scholarly invariants:
 *   1. Interpretation is non-authoritative (produces target-scheme hypothesis only).
 *   2. Raw evidence is NEVER mutated (preserves original bytes/Unicode).
 *   3. Presentation normalization (lowercasing, NFC) is strictly distinguished from scholarly rules.
 *   4. Structural/grammatical markers (izāfat, prime, indefinite, final-heh) fail closed as CONTEXT_REQUIRED.
 *   5. Unicode-exact marker enforcement: visually similar punctuation (U+2018, U+2019, ASCII ') fails closed.
 *   6. Initial hamza fails closed as source-nonconformant / disallowed.
 *   7. No hardcoded lexical allowlists or circular engine/lexicon calls.
 */

import { LexicalEvidence } from '../types';
import { generateInterpretationId } from './identity';
import { SCHEME_RULESET_VERSION } from './rules';
import {
  SchemeInterpretation,
  SchemeInterpretationBlocker,
  SchemeInterpretationStatus
} from './types';

export const SCHEME_INTERPRETER_VERSION = '1.0.0';

export interface SchemeInterpretationOptions {
  candidateId?: string | null;
  interpreterVersion?: string;
  ruleSetVersion?: string;
  analyzedAt?: string;
}

/**
 * Interpret an individual LexicalEvidence record relative to the target scholarly IJMES scheme.
 */
export function interpretEvidenceScheme(
  evidence: LexicalEvidence,
  options?: SchemeInterpretationOptions
): SchemeInterpretation {
  const interpreterVersion = options?.interpreterVersion ?? SCHEME_INTERPRETER_VERSION;
  const ruleSetVersion = options?.ruleSetVersion ?? SCHEME_RULESET_VERSION;
  const candidateId = options?.candidateId ?? null;

  const id = generateInterpretationId({
    evidenceId: evidence.id,
    sourceScheme: evidence.romanizationScheme,
    targetScheme: 'IJMES',
    interpreterVersion,
    ruleSetVersion
  });

  const rawObserved = evidence.observedRomanization ?? '';

  // 1. Check for missing romanization
  if (!evidence.observedRomanization || evidence.observedRomanization.trim() === '') {
    return {
      id,
      candidateId,
      evidenceId: evidence.id,
      sourceScheme: evidence.romanizationScheme,
      targetScheme: 'IJMES',
      rawObservedRomanization: rawObserved,
      comparisonSourceForm: '',
      targetHypothesis: null,
      status: 'UNSUPPORTED',
      appliedRuleIds: [],
      blockers: [
        {
          kind: 'NO_ROMANIZATION',
          reason: 'Evidence has no observed romanization string.'
        }
      ],
      interpreterVersion,
      ruleSetVersion,
      analyzedAt: options?.analyzedAt
    };
  }

  // 2. Check for unsupported source scheme
  if (evidence.romanizationScheme !== 'ALA_LC') {
    return {
      id,
      candidateId,
      evidenceId: evidence.id,
      sourceScheme: evidence.romanizationScheme,
      targetScheme: 'IJMES',
      rawObservedRomanization: rawObserved,
      comparisonSourceForm: rawObserved.normalize('NFC').toLowerCase(),
      targetHypothesis: null,
      status: 'UNSUPPORTED',
      appliedRuleIds: [],
      blockers: [
        {
          kind: 'UNSUPPORTED_SCHEME',
          reason: `Scheme "${evidence.romanizationScheme}" is not supported by this interpreter (only ALA_LC is supported in Phase 5D).`
        }
      ],
      interpreterVersion,
      ruleSetVersion,
      analyzedAt: options?.analyzedAt
    };
  }

  const blockers: SchemeInterpretationBlocker[] = [];

  // 3. Check for unverified typographic punctuation variants (U+2018, U+2019, ASCII ', U+2032 prime)
  // Official ALA-LC uses:
  //   - 'ʻ' (U+02BB) for 'Ayn
  //   - 'ʼ' (U+02BC) for Hamzah
  //   - 'ʹ' (U+02B9) for affix prime
  if (/[\u2018\u2019\u0027\u2032]/.test(rawObserved)) {
    blockers.push({
      kind: 'UNVERIFIED_TYPOGRAPHIC_VARIANT',
      reason:
        'Contains ambiguous typographic quotation/prime characters (U+2018, U+2019, ASCII \', U+2032) rather than verified ALA-LC modifier letters (ʻ U+02BB, ʼ U+02BC, ʹ U+02B9).',
      token: rawObserved
    });
  }

  // 4. Check for initial hamza (ALA-LC and IJMES drop initial hamza; initial ʼ is source-nonconformant)
  if (/^[ʼ\u02BC]/i.test(rawObserved.trim())) {
    blockers.push({
      kind: 'INITIAL_HAMZA_DISALLOWED',
      reason:
        'Initial hamza marker (ʼ) is source-nonconformant in ALA-LC Persian and disallowed in IJMES word-initially.',
      token: rawObserved
    });
  }

  // 5. Check for structural izāfat vs generic hyphen context
  if (/-(i|ʼi|yi)$/i.test(rawObserved) || evidence.derivation?.exclusionReason?.includes('izāfat')) {
    blockers.push({
      kind: 'STRUCTURAL_IZAFAT',
      reason:
        'Contains ALA-LC structural izāfat ending (-i, -ʼi, -yi) requiring grammatical context.',
      token: rawObserved
    });
  } else if (
    evidence.derivation?.candidateEligibility === 'CONTEXT_BOUND' ||
    rawObserved.includes('-')
  ) {
    blockers.push({
      kind: 'HYPHEN_CONTEXT_BOUND',
      reason:
        evidence.derivation?.exclusionReason ??
        'Contains internal hyphen bound contextual marker (e.g. Arabic article) requiring grammatical context.',
      token: rawObserved
    });
  }

  // 6. Check for ALA-LC structural prime separator (affix / compound prime ʹ / U+02B9)
  if (/[ʹ\u02B9]/.test(rawObserved)) {
    blockers.push({
      kind: 'STRUCTURAL_PRIME',
      reason:
        'Contains ALA-LC structural affix/compound prime separator (ʹ) requiring grammatical/morphological unbinding context.',
      token: rawObserved
    });
  }

  // 7. Check for structural indefinite marker involving hamza-like notation (e.g. khānahʼi)
  if (!rawObserved.includes('-') && (/[ʼ\u02BC]i$/i.test(rawObserved) || /[ʼ\u02BC]ī$/i.test(rawObserved))) {
    blockers.push({
      kind: 'STRUCTURAL_INDEFINITE',
      reason:
        'Ends with structural indefinite marker pattern (ʼi) requiring grammatical/morphological context.',
      token: rawObserved
    });
  }

  // 8. Check for ambiguous final -ah / -eh (strict fail-closed, no lexical allowlist)
  if (/[aāeē]h$/i.test(rawObserved.trim())) {
    if (/[a]h$/i.test(rawObserved.trim())) {
      blockers.push({
        kind: 'AMBIGUOUS_FINAL_HEH',
        reason:
          'Contains ambiguous final -ah representation requiring script-conditioned / morphological unbinding context.',
        token: rawObserved
      });
    }
  }

  const comparisonSourceForm = rawObserved.normalize('NFC').toLowerCase();

  // If structural, typographic, or contextual blockers were detected, fail closed as CONTEXT_REQUIRED
  if (blockers.length > 0) {
    return {
      id,
      candidateId,
      evidenceId: evidence.id,
      sourceScheme: evidence.romanizationScheme,
      targetScheme: 'IJMES',
      rawObservedRomanization: rawObserved,
      comparisonSourceForm,
      targetHypothesis: null,
      status: 'CONTEXT_REQUIRED',
      appliedRuleIds: [],
      blockers,
      interpreterVersion,
      ruleSetVersion,
      analyzedAt: options?.analyzedAt
    };
  }

  // 9. Apply deterministic scholarly rules on presentation-normalized form
  let transformed = comparisonSourceForm;
  const appliedRuleIds: string[] = [];

  // A. ALA-LC ʿayn (ʻ / U+02BB) -> IJMES ʿ (U+02BF)
  if (/[ʻ\u02BB]/.test(transformed)) {
    transformed = transformed.replace(/[ʻ\u02BB]/g, 'ʿ');
    appliedRuleIds.push('ALA_LC_TO_IJMES_AYN');
  }

  // B. ALA-LC medial/final lexical hamza (ʼ / U+02BC) -> IJMES ʾ (U+02BE)
  if (/[ʼ\u02BC]/.test(transformed)) {
    transformed = transformed.replace(/[ʼ\u02BC]/g, 'ʾ');
    appliedRuleIds.push('ALA_LC_TO_IJMES_LEXICAL_HAMZA');
  }

  // C. ALA-LC Persian ض (z̤ / z\u0324) -> IJMES ż (\u017C)
  if (/z\u0324/i.test(transformed)) {
    transformed = transformed.replace(/z\u0324/gi, 'ż');
    appliedRuleIds.push('ALA_LC_TO_IJMES_DAD');
  }

  // Determine status: DIRECT_EQUIVALENT if no material scholarly rule was needed, else DETERMINISTIC_EQUIVALENT
  const status: SchemeInterpretationStatus =
    appliedRuleIds.length === 0 ? 'DIRECT_EQUIVALENT' : 'DETERMINISTIC_EQUIVALENT';

  return {
    id,
    candidateId,
    evidenceId: evidence.id,
    sourceScheme: evidence.romanizationScheme,
    targetScheme: 'IJMES',
    rawObservedRomanization: rawObserved,
    comparisonSourceForm,
    targetHypothesis: transformed,
    status,
    appliedRuleIds,
    blockers: [],
    interpreterVersion,
    ruleSetVersion,
    analyzedAt: options?.analyzedAt
  };
}
