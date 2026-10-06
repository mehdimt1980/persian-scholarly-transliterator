import { describe, it, expect } from 'vitest';
import * as validationRoot from '../index';
import {
  ScholarlyValidationCaseV2,
  SingleValidationCorpusV2
} from './types';
import {
  validateSingleCaseV2,
  validateSingleValidationCorpusV2,
  ScholarlyValidationCaseV2Schema
} from './schema';
import { deriveScholarlyCanonicalOutput } from './canonicalOutput';
import { evaluateSingleCaseV2 } from './evaluateCase';
import { TransliterationResult, TokenResult } from '../../domain/types';

/**
 * Validation V2 Unit Test Suite.
 *
 * GOVERNANCE NOTICE:
 * All test cases and token representations in this suite use purely SYNTHETIC, NON-ADJUDICATIVE
 * fixtures. They exist exclusively to test schema constraints, token derivation logic, and evaluation
 * mechanics. No fixture in this file establishes or adjudicates scholarly ground truth for any real
 * corpus candidate or person/book title awaiting Phase 4.6B re-audit.
 */
describe('Validation V2 Schema & Evaluator Suite', () => {
  const baseProvenance = {
    sources: [
      {
        kind: 'SCHOLARLY_DICTIONARY' as const,
        citation: 'Synthetic Non-Adjudicative Fixture Source',
        locator: 'p. 1'
      }
    ]
  };

  // 1. V2 schema accepts a valid FINAL case with separate canonical + rendered expectations.
  it('1. accepts a valid FINAL case with separate canonical + rendered expectations', () => {
    const validCase: ScholarlyValidationCaseV2 = {
      id: 'synth-case-01',
      input: 'تست',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'tast',
        renderedOutput: 'tast'
      },
      provenance: baseProvenance
    };

    expect(() => validateSingleCaseV2(validCase)).not.toThrow();
    const parsed = validateSingleCaseV2(validCase);
    expect(parsed.expected.scholarlyCanonical).toBe('tast');
    expect(parsed.expected.renderedOutput).toBe('tast');
  });

  // 2. V2 schema rejects FINAL without scholarly canonical expectation.
  it('2. rejects FINAL without scholarly canonical expectation', () => {
    const invalidCase = {
      id: 'synth-case-02',
      input: 'تست',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        renderedOutput: 'tast'
      },
      provenance: baseProvenance
    };

    expect(() => validateSingleCaseV2(invalidCase)).toThrow(
      /does not specify a scholarlyCanonical or allowedScholarlyCanonicals/
    );
  });

  // 3. V2 schema rejects FINAL without rendered expectation.
  it('3. rejects FINAL without rendered expectation', () => {
    const invalidCase = {
      id: 'synth-case-03',
      input: 'تست',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'tast'
      },
      provenance: baseProvenance
    };

    expect(() => validateSingleCaseV2(invalidCase)).toThrow(
      /does not specify a renderedOutput or allowedRenderedOutputs/
    );
  });

  // 4. V2 schema rejects both scholarlyCanonical and allowedScholarlyCanonicals simultaneously.
  it('4. rejects both scholarlyCanonical and allowedScholarlyCanonicals simultaneously', () => {
    const invalidCase = {
      id: 'synth-case-04',
      input: 'تست',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'tast',
        allowedScholarlyCanonicals: ['tast', 'test'],
        renderedOutput: 'tast'
      },
      provenance: baseProvenance
    };

    expect(() => validateSingleCaseV2(invalidCase)).toThrow(
      /specifies both scholarlyCanonical and allowedScholarlyCanonicals/
    );
  });

  // 5. V2 schema rejects both renderedOutput and allowedRenderedOutputs simultaneously.
  it('5. rejects both renderedOutput and allowedRenderedOutputs simultaneously', () => {
    const invalidCase = {
      id: 'synth-case-05',
      input: 'تست',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'tast',
        renderedOutput: 'tast',
        allowedRenderedOutputs: ['tast', 'Tast']
      },
      provenance: baseProvenance
    };

    expect(() => validateSingleCaseV2(invalidCase)).toThrow(
      /specifies both renderedOutput and allowedRenderedOutputs/
    );
  });

  // 6. V2 schema rejects Persian/Arabic script in expected Latin outputs.
  it('6. rejects Persian/Arabic script in expected Latin outputs', () => {
    const invalidCaseCanonical = {
      id: 'synth-case-06a',
      input: 'تست',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'تست',
        renderedOutput: 'tast'
      },
      provenance: baseProvenance
    };

    expect(() => validateSingleCaseV2(invalidCaseCanonical)).toThrow(
      /containing Persian\/Arabic script/
    );

    const invalidCaseRendered = {
      id: 'synth-case-06b',
      input: 'تست',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'tast',
        renderedOutput: 'تست'
      },
      provenance: baseProvenance
    };

    expect(() => validateSingleCaseV2(invalidCaseRendered)).toThrow(
      /containing Persian\/Arabic script/
    );
  });

  // 7. V2 schema rejects leading/trailing whitespace.
  it('7. rejects leading/trailing whitespace in expected outputs', () => {
    const invalidCaseWhitespace = {
      id: 'synth-case-07',
      input: 'تست',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: ' tast',
        renderedOutput: 'tast '
      },
      provenance: baseProvenance
    };

    expect(() => validateSingleCaseV2(invalidCaseWhitespace)).toThrow(
      /accidental leading or trailing whitespace/
    );
  });

  // 8. V2 REVIEW_REQUIRED rejects authoritative canonical/rendered gold fields.
  it('8. rejects authoritative canonical/rendered gold fields in REVIEW_REQUIRED', () => {
    const invalidCaseReviewCanonical = {
      id: 'synth-case-08a',
      input: 'چندمعنا',
      profile: 'ijmes_full',
      category: 'AMBIGUITY',
      expected: {
        disposition: 'REVIEW_REQUIRED',
        scholarlyCanonical: 'chand-maʿnā',
        requiredIssueTypes: ['LEXICAL_AMBIGUITY']
      },
      provenance: baseProvenance
    };

    expect(() => validateSingleCaseV2(invalidCaseReviewCanonical)).toThrow(
      /disposition .*REVIEW_REQUIRED.* specifies an authoritative scholarlyCanonical/
    );

    const invalidCaseReviewRendered = {
      id: 'synth-case-08b',
      input: 'چندمعنا',
      profile: 'ijmes_full',
      category: 'AMBIGUITY',
      expected: {
        disposition: 'REVIEW_REQUIRED',
        renderedOutput: 'chand-maʿnā',
        requiredIssueTypes: ['LEXICAL_AMBIGUITY']
      },
      provenance: baseProvenance
    };

    expect(() => validateSingleCaseV2(invalidCaseReviewRendered)).toThrow(
      /disposition .*REVIEW_REQUIRED.* specifies an authoritative renderedOutput/
    );
  });

  // 9. V2 UNRESOLVED rejects authoritative canonical/rendered gold fields.
  it('9. rejects authoritative canonical/rendered gold fields in UNRESOLVED', () => {
    const invalidCaseUnresolved = {
      id: 'synth-case-09',
      input: 'واژه_ناشناس',
      profile: 'ijmes_full',
      category: 'OTHER',
      expected: {
        disposition: 'UNRESOLVED',
        scholarlyCanonical: 'vāzhah-i nāshinās'
      },
      provenance: baseProvenance
    };

    expect(() => validateSingleCaseV2(invalidCaseUnresolved)).toThrow(
      /disposition .*UNRESOLVED.* specifies an authoritative scholarlyCanonical/
    );
  });

  // 10. Canonical derivation preserves scholarly token canonical values independently of title/profile rendering.
  it('10. canonical derivation preserves scholarly token canonical values independently of title/profile rendering', () => {
    const syntheticResult: TransliterationResult = {
      originalInput: 'واژه یک',
      normalizedInput: 'واژه یک',
      normalizationChanges: [],
      profile: 'ijmes_citation_title',
      output: 'Vāzhah Yak',
      copyable: true,
      status: 'DETERMINISTIC',
      tokens: [
        {
          normalizedSurface: 'واژه',
          tokenType: 'persian-word',
          canonicalTransliteration: 'vāzhah',
          rendered: 'Vazheh',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 4,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'vāzhah',
            rendered: 'Vazheh',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        },
        {
          normalizedSurface: ' ',
          tokenType: 'whitespace',
          canonicalTransliteration: ' ',
          rendered: ' ',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 4,
          normalizedEnd: 5,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: ' ',
            rendered: ' ',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        },
        {
          normalizedSurface: 'یک',
          tokenType: 'persian-word',
          canonicalTransliteration: 'yak',
          rendered: 'Yek',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 5,
          normalizedEnd: 7,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'yak',
            rendered: 'Yek',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        }
      ],
      analyses: [],
      morphology: [],
      relations: [],
      reviewIssues: [],
      appliedDecisions: [],
      staleDecisions: [],
      reviewReasons: [],
      warnings: []
    };

    const derivedCanonical = deriveScholarlyCanonicalOutput(syntheticResult);
    expect(derivedCanonical).toBe('vāzhah yak');
    expect(syntheticResult.output).toBe('Vāzhah Yak');
  });

  // 11. Canonical and rendered BOTH match: CORRECT_AUTHORITATIVE.
  it('11. returns CORRECT_AUTHORITATIVE when both canonical and rendered match', () => {
    const testCase: ScholarlyValidationCaseV2 = {
      id: 'case-synth-11',
      input: 'واژه یک',
      profile: 'ijmes_citation_title',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'vāzhah yak',
        renderedOutput: 'Vāzhah Yak'
      },
      provenance: baseProvenance
    };

    const result: TransliterationResult = {
      originalInput: 'واژه یک',
      normalizedInput: 'واژه یک',
      normalizationChanges: [],
      profile: 'ijmes_citation_title',
      output: 'Vāzhah Yak',
      copyable: true,
      status: 'DETERMINISTIC',
      tokens: [
        {
          normalizedSurface: 'واژه',
          tokenType: 'persian-word',
          canonicalTransliteration: 'vāzhah',
          rendered: 'Vazheh',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 4,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'vāzhah',
            rendered: 'Vazheh',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        },
        {
          normalizedSurface: ' ',
          tokenType: 'whitespace',
          canonicalTransliteration: ' ',
          rendered: ' ',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 4,
          normalizedEnd: 5,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: ' ',
            rendered: ' ',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        },
        {
          normalizedSurface: 'یک',
          tokenType: 'persian-word',
          canonicalTransliteration: 'yak',
          rendered: 'Yek',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 5,
          normalizedEnd: 7,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'yak',
            rendered: 'Yek',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        }
      ],
      analyses: [],
      morphology: [],
      relations: [],
      reviewIssues: [],
      appliedDecisions: [],
      staleDecisions: [],
      reviewReasons: [],
      warnings: []
    };

    const evalResult = evaluateSingleCaseV2(testCase, result);
    expect(evalResult.classification).toBe('CORRECT_AUTHORITATIVE');
    expect(evalResult.scholarlyCanonicalMatched).toBe(true);
    expect(evalResult.renderingMatched).toBe(true);
    expect(evalResult.reasons).toHaveLength(0);
  });

  // 12. Rendered output matches but scholarly canonical is wrong: FALSE_AUTHORITATIVE with CANONICAL_MISMATCH.
  it('12. returns FALSE_AUTHORITATIVE with CANONICAL_MISMATCH when rendered matches but canonical is wrong', () => {
    const testCase: ScholarlyValidationCaseV2 = {
      id: 'case-synth-12',
      input: 'واژه یک',
      profile: 'ijmes_citation_title',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'vāzhah yak',
        renderedOutput: 'Vāzhah Yak'
      },
      provenance: baseProvenance
    };

    const result: TransliterationResult = {
      originalInput: 'واژه یک',
      normalizedInput: 'واژه یک',
      normalizationChanges: [],
      profile: 'ijmes_citation_title',
      output: 'Vāzhah Yak',
      copyable: true,
      status: 'DETERMINISTIC',
      tokens: [
        {
          normalizedSurface: 'واژه',
          tokenType: 'persian-word',
          canonicalTransliteration: 'vazhah', // erroneous canonical (short a instead of ā)
          rendered: 'Vazheh',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 4,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'vazhah',
            rendered: 'Vazheh',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        },
        {
          normalizedSurface: ' ',
          tokenType: 'whitespace',
          canonicalTransliteration: ' ',
          rendered: ' ',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 4,
          normalizedEnd: 5,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: ' ',
            rendered: ' ',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        },
        {
          normalizedSurface: 'یک',
          tokenType: 'persian-word',
          canonicalTransliteration: 'yak',
          rendered: 'Yek',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 5,
          normalizedEnd: 7,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'yak',
            rendered: 'Yek',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        }
      ],
      analyses: [],
      morphology: [],
      relations: [],
      reviewIssues: [],
      appliedDecisions: [],
      staleDecisions: [],
      reviewReasons: [],
      warnings: []
    };

    const evalResult = evaluateSingleCaseV2(testCase, result);
    expect(evalResult.classification).toBe('FALSE_AUTHORITATIVE');
    expect(evalResult.scholarlyCanonicalMatched).toBe(false);
    expect(evalResult.renderingMatched).toBe(true);
    expect(evalResult.reasons.some((r) => r.includes('CANONICAL_MISMATCH'))).toBe(true);
    expect(evalResult.reasons.some((r) => r.includes('RENDERING_MISMATCH'))).toBe(false);
  });

  // 13. Scholarly canonical matches but rendered output is wrong: FALSE_AUTHORITATIVE with RENDERING_MISMATCH.
  it('13. returns FALSE_AUTHORITATIVE with RENDERING_MISMATCH when canonical matches but rendered is wrong', () => {
    const testCase: ScholarlyValidationCaseV2 = {
      id: 'case-synth-13',
      input: 'واژه یک',
      profile: 'ijmes_citation_title',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'vāzhah yak',
        renderedOutput: 'Vāzhah Yak'
      },
      provenance: baseProvenance
    };

    const result: TransliterationResult = {
      originalInput: 'واژه یک',
      normalizedInput: 'واژه یک',
      normalizationChanges: [],
      profile: 'ijmes_citation_title',
      output: 'Vāzhah Yik', // wrong rendered output
      copyable: true,
      status: 'DETERMINISTIC',
      tokens: [
        {
          normalizedSurface: 'واژه',
          tokenType: 'persian-word',
          canonicalTransliteration: 'vāzhah',
          rendered: 'Vazheh',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 4,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'vāzhah',
            rendered: 'Vazheh',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        },
        {
          normalizedSurface: ' ',
          tokenType: 'whitespace',
          canonicalTransliteration: ' ',
          rendered: ' ',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 4,
          normalizedEnd: 5,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: ' ',
            rendered: ' ',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        },
        {
          normalizedSurface: 'یک',
          tokenType: 'persian-word',
          canonicalTransliteration: 'yak',
          rendered: 'Yak',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 5,
          normalizedEnd: 7,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'yak',
            rendered: 'Yak',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        }
      ],
      analyses: [],
      morphology: [],
      relations: [],
      reviewIssues: [],
      appliedDecisions: [],
      staleDecisions: [],
      reviewReasons: [],
      warnings: []
    };

    const evalResult = evaluateSingleCaseV2(testCase, result);
    expect(evalResult.classification).toBe('FALSE_AUTHORITATIVE');
    expect(evalResult.scholarlyCanonicalMatched).toBe(true);
    expect(evalResult.renderingMatched).toBe(false);
    expect(evalResult.reasons.some((r) => r.includes('RENDERING_MISMATCH'))).toBe(true);
    expect(evalResult.reasons.some((r) => r.includes('CANONICAL_MISMATCH'))).toBe(false);
  });

  // 14. Both mismatch: FALSE_AUTHORITATIVE and both failure dimensions visible.
  it('14. returns FALSE_AUTHORITATIVE with both failure dimensions visible when both mismatch', () => {
    const testCase: ScholarlyValidationCaseV2 = {
      id: 'case-synth-14',
      input: 'تست',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'tast',
        renderedOutput: 'tast'
      },
      provenance: baseProvenance
    };

    const result: TransliterationResult = {
      originalInput: 'تست',
      normalizedInput: 'تست',
      normalizationChanges: [],
      profile: 'ijmes_full',
      output: 'wrong_rendered',
      copyable: true,
      status: 'DETERMINISTIC',
      tokens: [
        {
          normalizedSurface: 'تست',
          tokenType: 'persian-word',
          canonicalTransliteration: 'wrong_canonical',
          rendered: 'wrong_rendered',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 3,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'wrong_canonical',
            rendered: 'wrong_rendered',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        }
      ],
      analyses: [],
      morphology: [],
      relations: [],
      reviewIssues: [],
      appliedDecisions: [],
      staleDecisions: [],
      reviewReasons: [],
      warnings: []
    };

    const evalResult = evaluateSingleCaseV2(testCase, result);
    expect(evalResult.classification).toBe('FALSE_AUTHORITATIVE');
    expect(evalResult.scholarlyCanonicalMatched).toBe(false);
    expect(evalResult.renderingMatched).toBe(false);
    expect(evalResult.reasons.some((r) => r.includes('CANONICAL_MISMATCH'))).toBe(true);
    expect(evalResult.reasons.some((r) => r.includes('RENDERING_MISMATCH'))).toBe(true);
  });

  // 15. FINAL but non-copyable: OVER_BLOCKED.
  it('15. returns OVER_BLOCKED when expected is FINAL but engine is non-copyable', () => {
    const testCase: ScholarlyValidationCaseV2 = {
      id: 'case-synth-15',
      input: 'تست',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'tast',
        renderedOutput: 'tast'
      },
      provenance: baseProvenance
    };

    const result: TransliterationResult = {
      originalInput: 'تست',
      normalizedInput: 'تست',
      normalizationChanges: [],
      profile: 'ijmes_full',
      output: '⟦تست: unresolved⟧',
      copyable: false,
      status: 'UNRESOLVED',
      tokens: [
        {
          normalizedSurface: 'تست',
          tokenType: 'persian-word',
          canonicalTransliteration: null,
          rendered: '⟦تست: unresolved⟧',
          status: 'UNRESOLVED',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 3,
          automatic: {
            status: 'UNRESOLVED',
            canonicalTransliteration: null,
            rendered: '⟦تست: unresolved⟧',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        }
      ],
      analyses: [],
      morphology: [],
      relations: [],
      reviewIssues: [],
      appliedDecisions: [],
      staleDecisions: [],
      reviewReasons: [],
      warnings: []
    };

    const evalResult = evaluateSingleCaseV2(testCase, result);
    expect(evalResult.classification).toBe('OVER_BLOCKED');
  });

  // 16. REVIEW_REQUIRED but engine copyable: UNDER_BLOCKED.
  it('16. returns UNDER_BLOCKED when expected is REVIEW_REQUIRED but engine is copyable', () => {
    const testCase: ScholarlyValidationCaseV2 = {
      id: 'case-synth-16',
      input: 'چندمعنا',
      profile: 'ijmes_full',
      category: 'AMBIGUITY',
      expected: {
        disposition: 'REVIEW_REQUIRED',
        requiredIssueTypes: ['LEXICAL_AMBIGUITY']
      },
      provenance: baseProvenance
    };

    const result: TransliterationResult = {
      originalInput: 'چندمعنا',
      normalizedInput: 'چندمعنا',
      normalizationChanges: [],
      profile: 'ijmes_full',
      output: 'chand-maʿnā-1',
      copyable: true,
      status: 'DETERMINISTIC',
      tokens: [
        {
          normalizedSurface: 'چندمعنا',
          tokenType: 'persian-word',
          canonicalTransliteration: 'chand-maʿnā-1',
          rendered: 'chand-maʿnā-1',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 7,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'chand-maʿnā-1',
            rendered: 'chand-maʿnā-1',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        }
      ],
      analyses: [],
      morphology: [],
      relations: [],
      reviewIssues: [],
      appliedDecisions: [],
      staleDecisions: [],
      reviewReasons: [],
      warnings: []
    };

    const evalResult = evaluateSingleCaseV2(testCase, result);
    expect(evalResult.classification).toBe('UNDER_BLOCKED');
  });

  // 17. Safe REVIEW_REQUIRED behavior: CORRECT_REVIEW_REQUIRED.
  it('17. returns CORRECT_REVIEW_REQUIRED when expected is REVIEW_REQUIRED and engine safely blocks', () => {
    const testCase: ScholarlyValidationCaseV2 = {
      id: 'case-synth-17',
      input: 'چندمعنا',
      profile: 'ijmes_full',
      category: 'AMBIGUITY',
      expected: {
        disposition: 'REVIEW_REQUIRED',
        requiredIssueTypes: ['LEXICAL_AMBIGUITY']
      },
      provenance: baseProvenance
    };

    const result: TransliterationResult = {
      originalInput: 'چندمعنا',
      normalizedInput: 'چندمعنا',
      normalizationChanges: [],
      profile: 'ijmes_full',
      output: '⟦چندمعنا: ambiguous: reading-1 | reading-2⟧',
      copyable: false,
      status: 'AMBIGUOUS',
      tokens: [
        {
          normalizedSurface: 'چندمعنا',
          tokenType: 'persian-word',
          canonicalTransliteration: null,
          rendered: '⟦چندمعنا: ambiguous: reading-1 | reading-2⟧',
          status: 'AMBIGUOUS',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: ['reading-1', 'reading-2'],
          normalizedStart: 0,
          normalizedEnd: 7,
          automatic: {
            status: 'AMBIGUOUS',
            canonicalTransliteration: null,
            rendered: '⟦چندمعنا: ambiguous: reading-1 | reading-2⟧',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: ['reading-1', 'reading-2']
          }
        }
      ],
      analyses: [],
      morphology: [],
      relations: [],
      reviewIssues: [
        {
          id: 'issue-01',
          type: 'LEXICAL_AMBIGUITY',
          tokenIndexes: [0],
          surface: 'چندمعنا',
          description: 'Ambiguous readings',
          alternatives: [],
          allowedActions: ['SELECT_LEXICAL_READING']
        }
      ],
      appliedDecisions: [],
      staleDecisions: [],
      reviewReasons: ['Lexical ambiguity'],
      warnings: []
    };

    const evalResult = evaluateSingleCaseV2(testCase, result);
    expect(evalResult.classification).toBe('CORRECT_REVIEW_REQUIRED');
  });

  // 18. Safe UNRESOLVED behavior: CORRECT_UNRESOLVED.
  it('18. returns CORRECT_UNRESOLVED when expected is UNRESOLVED and engine safely blocks', () => {
    const testCase: ScholarlyValidationCaseV2 = {
      id: 'case-synth-18',
      input: 'واژه_ناشناس',
      profile: 'ijmes_full',
      category: 'OTHER',
      expected: {
        disposition: 'UNRESOLVED'
      },
      provenance: baseProvenance
    };

    const result: TransliterationResult = {
      originalInput: 'واژه_ناشناس',
      normalizedInput: 'واژه_ناشناس',
      normalizationChanges: [],
      profile: 'ijmes_full',
      output: '⟦واژه_ناشناس: unresolved⟧',
      copyable: false,
      status: 'UNRESOLVED',
      tokens: [
        {
          normalizedSurface: 'واژه_ناشناس',
          tokenType: 'persian-word',
          canonicalTransliteration: null,
          rendered: '⟦واژه_ناشناس: unresolved⟧',
          status: 'UNRESOLVED',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 11,
          automatic: {
            status: 'UNRESOLVED',
            canonicalTransliteration: null,
            rendered: '⟦واژه_ناشناس: unresolved⟧',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        }
      ],
      analyses: [],
      morphology: [],
      relations: [],
      reviewIssues: [],
      appliedDecisions: [],
      staleDecisions: [],
      reviewReasons: ['No lexical entry'],
      warnings: []
    };

    const evalResult = evaluateSingleCaseV2(testCase, result);
    expect(evalResult.classification).toBe('CORRECT_UNRESOLVED');
  });

  // 19. Latin/number/punctuation/whitespace tokens are preserved appropriately in derived canonical output.
  it('19. preserves Latin, number, punctuation, and whitespace tokens appropriately in derived canonical output', () => {
    const result: TransliterationResult = {
      originalInput: 'تست 123 (demo), بخش 2.',
      normalizedInput: 'تست 123 (demo), بخش 2.',
      normalizationChanges: [],
      profile: 'ijmes_full',
      output: 'tast 123 (demo), bakhsh 2.',
      copyable: true,
      status: 'DETERMINISTIC',
      tokens: [
        {
          normalizedSurface: 'تست',
          tokenType: 'persian-word',
          canonicalTransliteration: 'tast',
          rendered: 'tast',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 3,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'tast',
            rendered: 'tast',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        },
        {
          normalizedSurface: ' ',
          tokenType: 'whitespace',
          canonicalTransliteration: ' ',
          rendered: ' ',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 3,
          normalizedEnd: 4,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: ' ',
            rendered: ' ',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        },
        {
          normalizedSurface: '123',
          tokenType: 'number',
          canonicalTransliteration: '123',
          rendered: '123',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 4,
          normalizedEnd: 7,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: '123',
            rendered: '123',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        },
        {
          normalizedSurface: ' (',
          tokenType: 'punctuation',
          canonicalTransliteration: ' (',
          rendered: ' (',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 7,
          normalizedEnd: 9,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: ' (',
            rendered: ' (',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        },
        {
          normalizedSurface: 'demo',
          tokenType: 'latin',
          canonicalTransliteration: 'demo',
          rendered: 'demo',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 9,
          normalizedEnd: 13,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'demo',
            rendered: 'demo',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        },
        {
          normalizedSurface: '), ',
          tokenType: 'punctuation',
          canonicalTransliteration: '), ',
          rendered: '), ',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 13,
          normalizedEnd: 16,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: '), ',
            rendered: '), ',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        },
        {
          normalizedSurface: 'بخش',
          tokenType: 'persian-word',
          canonicalTransliteration: 'bakhsh',
          rendered: 'bakhsh',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 16,
          normalizedEnd: 19,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'bakhsh',
            rendered: 'bakhsh',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        },
        {
          normalizedSurface: ' 2.',
          tokenType: 'punctuation',
          canonicalTransliteration: ' 2.',
          rendered: ' 2.',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 19,
          normalizedEnd: 22,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: ' 2.',
            rendered: ' 2.',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        }
      ],
      analyses: [],
      morphology: [],
      relations: [],
      reviewIssues: [],
      appliedDecisions: [],
      staleDecisions: [],
      reviewReasons: [],
      warnings: []
    };

    const derived = deriveScholarlyCanonicalOutput(result);
    expect(derived).toBe('tast 123 (demo), bakhsh 2.');
  });

  // 20. Unknown/unresolved token state fails canonical derivation closed rather than inventing a string.
  it('20. fails canonical derivation closed (returns null) on unresolved or unknown token states', () => {
    // 20a: persian-word with null canonicalTransliteration
    const unresolvedPersianResult: TransliterationResult = {
      originalInput: 'تست ناشناس',
      normalizedInput: 'تست ناشناس',
      normalizationChanges: [],
      profile: 'ijmes_full',
      output: 'tast ⟦ناشناس: unresolved⟧',
      copyable: false,
      status: 'UNRESOLVED',
      tokens: [
        {
          normalizedSurface: 'تست',
          tokenType: 'persian-word',
          canonicalTransliteration: 'tast',
          rendered: 'tast',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 3,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'tast',
            rendered: 'tast',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        },
        {
          normalizedSurface: ' ',
          tokenType: 'whitespace',
          canonicalTransliteration: ' ',
          rendered: ' ',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 3,
          normalizedEnd: 4,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: ' ',
            rendered: ' ',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        },
        {
          normalizedSurface: 'ناشناس',
          tokenType: 'persian-word',
          canonicalTransliteration: null,
          rendered: '⟦ناشناس: unresolved⟧',
          status: 'UNRESOLVED',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 4,
          normalizedEnd: 10,
          automatic: {
            status: 'UNRESOLVED',
            canonicalTransliteration: null,
            rendered: '⟦ناشناس: unresolved⟧',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        }
      ],
      analyses: [],
      morphology: [],
      relations: [],
      reviewIssues: [],
      appliedDecisions: [],
      staleDecisions: [],
      reviewReasons: [],
      warnings: []
    };

    expect(deriveScholarlyCanonicalOutput(unresolvedPersianResult)).toBeNull();

    // 20b: token with unknown type
    const unknownTokenTypeResult: TransliterationResult = {
      originalInput: '???',
      normalizedInput: '???',
      normalizationChanges: [],
      profile: 'ijmes_full',
      output: '???',
      copyable: false,
      status: 'UNRESOLVED',
      tokens: [
        {
          normalizedSurface: '???',
          tokenType: 'unknown' as any,
          canonicalTransliteration: null,
          rendered: '???',
          status: 'UNRESOLVED',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 3,
          automatic: {
            status: 'UNRESOLVED',
            canonicalTransliteration: null,
            rendered: '???',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: []
          }
        }
      ],
      analyses: [],
      morphology: [],
      relations: [],
      reviewIssues: [],
      appliedDecisions: [],
      staleDecisions: [],
      reviewReasons: [],
      warnings: []
    };

    expect(deriveScholarlyCanonicalOutput(unknownTokenTypeResult)).toBeNull();
  });

  // 21. Fail-closed safety on unsafe Persian token status (even if canonicalTransliteration is non-null)
  describe('Fail-Closed Token Status Enforcement in Canonical Derivation', () => {
    it('returns null if a Persian token has status AMBIGUOUS even with a non-null canonicalTransliteration', () => {
      const ambiguousWithCanonical: TransliterationResult = {
        originalInput: 'تست',
        normalizedInput: 'تست',
        normalizationChanges: [],
        profile: 'ijmes_full',
        output: '⟦تست: ambiguous⟧',
        copyable: false,
        status: 'AMBIGUOUS',
        tokens: [
          {
            normalizedSurface: 'تست',
            tokenType: 'persian-word',
            canonicalTransliteration: 'tast', // non-null canonical on unsafe token status
            rendered: '⟦تست: ambiguous⟧',
            status: 'AMBIGUOUS',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: ['tast-1', 'tast-2'],
            normalizedStart: 0,
            normalizedEnd: 3,
            automatic: {
              status: 'AMBIGUOUS',
              canonicalTransliteration: 'tast',
              rendered: '⟦تست: ambiguous⟧',
              appliedRules: [],
              lexicalSources: [],
              warnings: [],
              alternatives: ['tast-1', 'tast-2']
            }
          }
        ],
        analyses: [],
        morphology: [],
        relations: [],
        reviewIssues: [],
        appliedDecisions: [],
        staleDecisions: [],
        reviewReasons: ['Ambiguous reading'],
        warnings: []
      };

      expect(deriveScholarlyCanonicalOutput(ambiguousWithCanonical)).toBeNull();
    });

    it('returns null if a Persian token has status UNRESOLVED even with a non-null canonicalTransliteration', () => {
      const unresolvedWithCanonical: TransliterationResult = {
        originalInput: 'تست',
        normalizedInput: 'تست',
        normalizationChanges: [],
        profile: 'ijmes_full',
        output: '⟦تست: unresolved⟧',
        copyable: false,
        status: 'UNRESOLVED',
        tokens: [
          {
            normalizedSurface: 'تست',
            tokenType: 'persian-word',
            canonicalTransliteration: 'tast', // non-null canonical on unsafe token status
            rendered: '⟦تست: unresolved⟧',
            status: 'UNRESOLVED',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: [],
            normalizedStart: 0,
            normalizedEnd: 3,
            automatic: {
              status: 'UNRESOLVED',
              canonicalTransliteration: 'tast',
              rendered: '⟦تست: unresolved⟧',
              appliedRules: [],
              lexicalSources: [],
              warnings: [],
              alternatives: []
            }
          }
        ],
        analyses: [],
        morphology: [],
        relations: [],
        reviewIssues: [],
        appliedDecisions: [],
        staleDecisions: [],
        reviewReasons: ['Unresolved entry'],
        warnings: []
      };

      expect(deriveScholarlyCanonicalOutput(unresolvedWithCanonical)).toBeNull();
    });

    it('derives canonical output normally for safe statuses: DETERMINISTIC, LEXICON_RESOLVED, and USER_OVERRIDE', () => {
      // Deterministic token
      const deterministicResult: TransliterationResult = {
        originalInput: 'تست',
        normalizedInput: 'تست',
        normalizationChanges: [],
        profile: 'ijmes_full',
        output: 'tast',
        copyable: true,
        status: 'DETERMINISTIC',
        tokens: [
          {
            normalizedSurface: 'تست',
            tokenType: 'persian-word',
            canonicalTransliteration: 'tast',
            rendered: 'tast',
            status: 'DETERMINISTIC',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: [],
            normalizedStart: 0,
            normalizedEnd: 3,
            automatic: {
              status: 'DETERMINISTIC',
              canonicalTransliteration: 'tast',
              rendered: 'tast',
              appliedRules: [],
              lexicalSources: [],
              warnings: [],
              alternatives: []
            }
          }
        ],
        analyses: [],
        morphology: [],
        relations: [],
        reviewIssues: [],
        appliedDecisions: [],
        staleDecisions: [],
        reviewReasons: [],
        warnings: []
      };
      expect(deriveScholarlyCanonicalOutput(deterministicResult)).toBe('tast');

      // Lexicon resolved token
      const lexiconResolvedResult: TransliterationResult = {
        ...deterministicResult,
        status: 'LEXICON_RESOLVED',
        tokens: [
          {
            ...deterministicResult.tokens[0],
            status: 'LEXICON_RESOLVED'
          }
        ]
      };
      expect(deriveScholarlyCanonicalOutput(lexiconResolvedResult)).toBe('tast');

      // User override token
      const userOverrideResult: TransliterationResult = {
        ...deterministicResult,
        status: 'USER_OVERRIDE',
        tokens: [
          {
            ...deterministicResult.tokens[0],
            status: 'USER_OVERRIDE',
            canonicalTransliteration: 'tast-override'
          }
        ]
      };
      expect(deriveScholarlyCanonicalOutput(userOverrideResult)).toBe('tast-override');
    });
  });

  // 22. Verification of module namespace isolation
  describe('V2 Module Namespace Isolation', () => {
    it('exposes V2 through explicit validationRoot.v2 namespace without leaking V2 symbols into root', () => {
      expect(validationRoot.v2).toBeDefined();
      expect(typeof validationRoot.v2.evaluateSingleCaseV2).toBe('function');
      expect(typeof validationRoot.v2.validateSingleCaseV2).toBe('function');
      expect(typeof validationRoot.v2.deriveScholarlyCanonicalOutput).toBe('function');

      // Ensure root validation namespace is not polluted with V2-only top-level exports
      expect((validationRoot as any).evaluateSingleCaseV2).toBeUndefined();
      expect((validationRoot as any).validateSingleCaseV2).toBeUndefined();
      expect((validationRoot as any).deriveScholarlyCanonicalOutput).toBeUndefined();
    });
  });
});
