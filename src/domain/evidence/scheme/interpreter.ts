/**
 * Pure interpreter for external romanization evidence observations.
 *
 * Core scholarly invariants:
 *   1. Interpretation is non-authoritative (produces target-scheme hypothesis only).
 *   2. Raw evidence is NEVER mutated (preserves original bytes/Unicode).
 *   3. Presentation normalization (lowercasing, NFC) is strictly distinguished from scholarly rules.
 *   4. Structural/grammatical markers (izāfat, prime, indefinite, final-heh) fail closed as CONTEXT_REQUIRED.
 *   5. No circular engine/lexicon calls or benchmark fitting.
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

  // 3. Check for hyphen-bound contextual marker (from Phase 5C derivation or internal hyphen)
  if (
    evidence.derivation?.candidateEligibility === 'CONTEXT_BOUND' ||
    rawObserved.includes('-')
  ) {
    blockers.push({
      kind: 'HYPHEN_CONTEXT_BOUND',
      reason:
        evidence.derivation?.exclusionReason ??
        'Contains internal hyphen bound contextual marker (e.g. izāfat or Arabic article) requiring grammatical context.',
      token: rawObserved
    });
  }

  // 4. Check for ALA-LC structural prime separator (affix / compound prime ʹ / U+02B9 / U+2032)
  if (/[ʹ\u02B9\u2032]/.test(rawObserved)) {
    blockers.push({
      kind: 'STRUCTURAL_PRIME',
      reason:
        'Contains ALA-LC structural affix/compound prime separator (ʹ) requiring grammatical/morphological unbinding context.',
      token: rawObserved
    });
  }

  // 5. Check for structural indefinite marker involving hamza-like notation (e.g. khānahʼi)
  if (/[ʼ']i$/i.test(rawObserved) || /[ʼ']ī$/i.test(rawObserved)) {
    blockers.push({
      kind: 'STRUCTURAL_INDEFINITE',
      reason:
        'Ends with structural indefinite marker pattern (-ʼi) requiring grammatical/morphological context.',
      token: rawObserved
    });
  }

  // 6. Check for ambiguous final -ah / -eh
  if (/([aāeē]h)$/i.test(rawObserved) && !/^(allāh|shāh|māh|gāh|rāh|chāh|panāh|sipāh|nigāh|dastgāh|pādishāh)$/i.test(rawObserved)) {
    // Unless proven purely consonantal root lexical item, ambiguous final -ah/-eh requires morphological context
    if (/([a]h)$/i.test(rawObserved)) {
      blockers.push({
        kind: 'AMBIGUOUS_FINAL_HEH',
        reason:
          'Contains ambiguous final -ah representation requiring script-conditioned / morphological unbinding context.',
        token: rawObserved
      });
    }
  }

  const comparisonSourceForm = rawObserved.normalize('NFC').toLowerCase();

  // If structural or contextual blockers were detected, fail closed as CONTEXT_REQUIRED
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

  // 7. Apply deterministic scholarly rules on presentation-normalized form
  let transformed = comparisonSourceForm;
  const appliedRuleIds: string[] = [];

  // A. ALA-LC ʿayn (ʻ / U+02BB or ‘ / U+2018) -> IJMES ʿ (U+02BF)
  if (/[ʻ\u02BB‘\u2018]/.test(transformed)) {
    transformed = transformed.replace(/[ʻ\u02BB‘\u2018]/g, 'ʿ');
    appliedRuleIds.push('ALA_LC_TO_IJMES_AYN');
  }

  // B. ALA-LC lexical hamza (ʼ / U+02BC) -> IJMES ʾ (U+02BE)
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
