import { describe, it, expect } from 'vitest';
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

describe('Validation V2 Schema & Evaluator Suite', () => {
  const baseProvenance = {
    sources: [
      {
        kind: 'SCHOLARLY_DICTIONARY' as const,
        citation: 'Synthetic Test Dictionary',
        locator: 'p. 1'
      }
    ]
  };

  // 1. V2 schema accepts a valid FINAL case with separate canonical + rendered expectations.
  it('1. accepts a valid FINAL case with separate canonical + rendered expectations', () => {
    const validCase: ScholarlyValidationCaseV2 = {
      id: 'synth-case-01',
      input: 'کتاب',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'kitāb',
        renderedOutput: 'kitāb'
      },
      provenance: baseProvenance
    };

    expect(() => validateSingleCaseV2(validCase)).not.toThrow();
    const parsed = validateSingleCaseV2(validCase);
    expect(parsed.expected.scholarlyCanonical).toBe('kitāb');
    expect(parsed.expected.renderedOutput).toBe('kitāb');
  });

  // 2. V2 schema rejects FINAL without scholarly canonical expectation.
  it('2. rejects FINAL without scholarly canonical expectation', () => {
    const invalidCase = {
      id: 'synth-case-02',
      input: 'کتاب',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        renderedOutput: 'kitāb'
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
      input: 'کتاب',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'kitāb'
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
      input: 'کتاب',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'kitāb',
        allowedScholarlyCanonicals: ['kitāb', 'ketāb'],
        renderedOutput: 'kitāb'
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
      input: 'کتاب',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'kitāb',
        renderedOutput: 'kitāb',
        allowedRenderedOutputs: ['kitāb', 'Kitab']
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
      input: 'کتاب',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'کتاب',
        renderedOutput: 'kitāb'
      },
      provenance: baseProvenance
    };

    expect(() => validateSingleCaseV2(invalidCaseCanonical)).toThrow(
      /containing Persian\/Arabic script/
    );

    const invalidCaseRendered = {
      id: 'synth-case-06b',
      input: 'کتاب',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'kitāb',
        renderedOutput: 'کتاب'
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
      input: 'کتاب',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: ' kitāb',
        renderedOutput: 'kitāb '
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
      input: 'کرم',
      profile: 'ijmes_full',
      category: 'AMBIGUITY',
      expected: {
        disposition: 'REVIEW_REQUIRED',
        scholarlyCanonical: 'karm',
        requiredIssueTypes: ['LEXICAL_AMBIGUITY']
      },
      provenance: baseProvenance
    };

    expect(() => validateSingleCaseV2(invalidCaseReviewCanonical)).toThrow(
      /disposition .*REVIEW_REQUIRED.* specifies an authoritative scholarlyCanonical/
    );

    const invalidCaseReviewRendered = {
      id: 'synth-case-08b',
      input: 'کرم',
      profile: 'ijmes_full',
      category: 'AMBIGUITY',
      expected: {
        disposition: 'REVIEW_REQUIRED',
        renderedOutput: 'karm',
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
      input: 'ناشناخته',
      profile: 'ijmes_full',
      category: 'OTHER',
      expected: {
        disposition: 'UNRESOLVED',
        scholarlyCanonical: 'nāshinākhtah'
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
      originalInput: 'صادق هدایت',
      normalizedInput: 'صادق هدایت',
      normalizationChanges: [],
      profile: 'ijmes_title',
      output: 'Sadeq Hedayat',
      copyable: true,
      status: 'DETERMINISTIC',
      tokens: [
        {
          normalizedSurface: 'صادق',
          tokenType: 'persian-word',
          canonicalTransliteration: 'ṣādiq',
          rendered: 'Sadeq',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 4,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'ṣādiq',
            rendered: 'Sadeq',
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
          normalizedSurface: 'هدایت',
          tokenType: 'persian-word',
          canonicalTransliteration: 'hidāyat',
          rendered: 'Hedayat',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 5,
          normalizedEnd: 10,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'hidāyat',
            rendered: 'Hedayat',
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
    expect(derivedCanonical).toBe('ṣādiq hidāyat');
    expect(syntheticResult.output).toBe('Sadeq Hedayat');
  });

  // 11. Canonical and rendered BOTH match: CORRECT_AUTHORITATIVE.
  it('11. returns CORRECT_AUTHORITATIVE when both canonical and rendered match', () => {
    const testCase: ScholarlyValidationCaseV2 = {
      id: 'case-synth-11',
      input: 'صادق هدایت',
      profile: 'ijmes_title',
      category: 'PERSON',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'ṣādiq hidāyat',
        renderedOutput: 'Sadeq Hedayat'
      },
      provenance: baseProvenance
    };

    const result: TransliterationResult = {
      originalInput: 'صادق هدایت',
      normalizedInput: 'صادق هدایت',
      normalizationChanges: [],
      profile: 'ijmes_title',
      output: 'Sadeq Hedayat',
      copyable: true,
      status: 'DETERMINISTIC',
      tokens: [
        {
          normalizedSurface: 'صادق',
          tokenType: 'persian-word',
          canonicalTransliteration: 'ṣādiq',
          rendered: 'Sadeq',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 4,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'ṣādiq',
            rendered: 'Sadeq',
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
          normalizedSurface: 'هدایت',
          tokenType: 'persian-word',
          canonicalTransliteration: 'hidāyat',
          rendered: 'Hedayat',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 5,
          normalizedEnd: 10,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'hidāyat',
            rendered: 'Hedayat',
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
      input: 'صادق هدایت',
      profile: 'ijmes_title',
      category: 'PERSON',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'ṣādiq hidāyat', // expected
        renderedOutput: 'Sadeq Hedayat'
      },
      provenance: baseProvenance
    };

    const result: TransliterationResult = {
      originalInput: 'صادق هدایت',
      normalizedInput: 'صادق هدایت',
      normalizationChanges: [],
      profile: 'ijmes_title',
      output: 'Sadeq Hedayat',
      copyable: true,
      status: 'DETERMINISTIC',
      tokens: [
        {
          normalizedSurface: 'صادق',
          tokenType: 'persian-word',
          canonicalTransliteration: 'sādiq', // erroneous canonical (s instead of ṣ)
          rendered: 'Sadeq',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 4,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'sādiq',
            rendered: 'Sadeq',
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
          normalizedSurface: 'هدایت',
          tokenType: 'persian-word',
          canonicalTransliteration: 'hidāyat',
          rendered: 'Hedayat',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 5,
          normalizedEnd: 10,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'hidāyat',
            rendered: 'Hedayat',
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
      input: 'صادق هدایت',
      profile: 'ijmes_title',
      category: 'PERSON',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'ṣādiq hidāyat',
        renderedOutput: 'Sadeq Hedayat'
      },
      provenance: baseProvenance
    };

    const result: TransliterationResult = {
      originalInput: 'صادق هدایت',
      normalizedInput: 'صادق هدایت',
      normalizationChanges: [],
      profile: 'ijmes_title',
      output: 'Sadeq Hidayat', // wrong rendered output
      copyable: true,
      status: 'DETERMINISTIC',
      tokens: [
        {
          normalizedSurface: 'صادق',
          tokenType: 'persian-word',
          canonicalTransliteration: 'ṣādiq',
          rendered: 'Sadeq',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 4,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'ṣādiq',
            rendered: 'Sadeq',
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
          normalizedSurface: 'هدایت',
          tokenType: 'persian-word',
          canonicalTransliteration: 'hidāyat',
          rendered: 'Hidayat',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 5,
          normalizedEnd: 10,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'hidāyat',
            rendered: 'Hidayat',
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
      input: 'کتاب',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'kitāb',
        renderedOutput: 'kitāb'
      },
      provenance: baseProvenance
    };

    const result: TransliterationResult = {
      originalInput: 'کتاب',
      normalizedInput: 'کتاب',
      normalizationChanges: [],
      profile: 'ijmes_full',
      output: 'wrong_rendered',
      copyable: true,
      status: 'DETERMINISTIC',
      tokens: [
        {
          normalizedSurface: 'کتاب',
          tokenType: 'persian-word',
          canonicalTransliteration: 'wrong_canonical',
          rendered: 'wrong_rendered',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 4,
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
      input: 'کتاب',
      profile: 'ijmes_full',
      category: 'TERM',
      expected: {
        disposition: 'FINAL',
        scholarlyCanonical: 'kitāb',
        renderedOutput: 'kitāb'
      },
      provenance: baseProvenance
    };

    const result: TransliterationResult = {
      originalInput: 'کتاب',
      normalizedInput: 'کتاب',
      normalizationChanges: [],
      profile: 'ijmes_full',
      output: '⟦کتاب: unresolved⟧',
      copyable: false,
      status: 'UNRESOLVED',
      tokens: [
        {
          normalizedSurface: 'کتاب',
          tokenType: 'persian-word',
          canonicalTransliteration: null,
          rendered: '⟦کتاب: unresolved⟧',
          status: 'UNRESOLVED',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 4,
          automatic: {
            status: 'UNRESOLVED',
            canonicalTransliteration: null,
            rendered: '⟦کتاب: unresolved⟧',
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
      input: 'کرم',
      profile: 'ijmes_full',
      category: 'AMBIGUITY',
      expected: {
        disposition: 'REVIEW_REQUIRED',
        requiredIssueTypes: ['LEXICAL_AMBIGUITY']
      },
      provenance: baseProvenance
    };

    const result: TransliterationResult = {
      originalInput: 'کرم',
      normalizedInput: 'کرم',
      normalizationChanges: [],
      profile: 'ijmes_full',
      output: 'karam',
      copyable: true,
      status: 'DETERMINISTIC',
      tokens: [
        {
          normalizedSurface: 'کرم',
          tokenType: 'persian-word',
          canonicalTransliteration: 'karam',
          rendered: 'karam',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 3,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'karam',
            rendered: 'karam',
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
      input: 'کرم',
      profile: 'ijmes_full',
      category: 'AMBIGUITY',
      expected: {
        disposition: 'REVIEW_REQUIRED',
        requiredIssueTypes: ['LEXICAL_AMBIGUITY']
      },
      provenance: baseProvenance
    };

    const result: TransliterationResult = {
      originalInput: 'کرم',
      normalizedInput: 'کرم',
      normalizationChanges: [],
      profile: 'ijmes_full',
      output: '⟦کرم: ambiguous: karam | kirm⟧',
      copyable: false,
      status: 'AMBIGUOUS',
      tokens: [
        {
          normalizedSurface: 'کرم',
          tokenType: 'persian-word',
          canonicalTransliteration: null,
          rendered: '⟦کرم: ambiguous: karam | kirm⟧',
          status: 'AMBIGUOUS',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: ['karam', 'kirm'],
          normalizedStart: 0,
          normalizedEnd: 3,
          automatic: {
            status: 'AMBIGUOUS',
            canonicalTransliteration: null,
            rendered: '⟦کرم: ambiguous: karam | kirm⟧',
            appliedRules: [],
            lexicalSources: [],
            warnings: [],
            alternatives: ['karam', 'kirm']
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
          surface: 'کرم',
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
      input: 'ناشناخته',
      profile: 'ijmes_full',
      category: 'OTHER',
      expected: {
        disposition: 'UNRESOLVED'
      },
      provenance: baseProvenance
    };

    const result: TransliterationResult = {
      originalInput: 'ناشناخته',
      normalizedInput: 'ناشناخته',
      normalizationChanges: [],
      profile: 'ijmes_full',
      output: '⟦ناشناخته: unresolved⟧',
      copyable: false,
      status: 'UNRESOLVED',
      tokens: [
        {
          normalizedSurface: 'ناشناخته',
          tokenType: 'persian-word',
          canonicalTransliteration: null,
          rendered: '⟦ناشناخته: unresolved⟧',
          status: 'UNRESOLVED',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 8,
          automatic: {
            status: 'UNRESOLVED',
            canonicalTransliteration: null,
            rendered: '⟦ناشناخته: unresolved⟧',
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
      originalInput: 'کتاب 123 (test), جلد 2.',
      normalizedInput: 'کتاب 123 (test), جلد 2.',
      normalizationChanges: [],
      profile: 'ijmes_full',
      output: 'kitāb 123 (test), jild 2.',
      copyable: true,
      status: 'DETERMINISTIC',
      tokens: [
        {
          normalizedSurface: 'کتاب',
          tokenType: 'persian-word',
          canonicalTransliteration: 'kitāb',
          rendered: 'kitāb',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 4,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'kitāb',
            rendered: 'kitāb',
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
          normalizedSurface: '123',
          tokenType: 'number',
          canonicalTransliteration: '123',
          rendered: '123',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 5,
          normalizedEnd: 8,
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
          normalizedStart: 8,
          normalizedEnd: 10,
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
          normalizedSurface: 'test',
          tokenType: 'latin',
          canonicalTransliteration: 'test',
          rendered: 'test',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 10,
          normalizedEnd: 14,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'test',
            rendered: 'test',
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
          normalizedStart: 14,
          normalizedEnd: 17,
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
          normalizedSurface: 'جلد',
          tokenType: 'persian-word',
          canonicalTransliteration: 'jild',
          rendered: 'jild',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 17,
          normalizedEnd: 20,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'jild',
            rendered: 'jild',
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
          normalizedStart: 20,
          normalizedEnd: 23,
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
    expect(derived).toBe('kitāb 123 (test), jild 2.');
  });

  // 20. Unknown/unresolved token state fails canonical derivation closed rather than inventing a string.
  it('20. fails canonical derivation closed (returns null) on unresolved or unknown token states', () => {
    // 20a: persian-word with null canonicalTransliteration
    const unresolvedPersianResult: TransliterationResult = {
      originalInput: 'کتاب ناشناخته',
      normalizedInput: 'کتاب ناشناخته',
      normalizationChanges: [],
      profile: 'ijmes_full',
      output: 'kitāb ⟦ناشناخته: unresolved⟧',
      copyable: false,
      status: 'UNRESOLVED',
      tokens: [
        {
          normalizedSurface: 'کتاب',
          tokenType: 'persian-word',
          canonicalTransliteration: 'kitāb',
          rendered: 'kitāb',
          status: 'DETERMINISTIC',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 0,
          normalizedEnd: 4,
          automatic: {
            status: 'DETERMINISTIC',
            canonicalTransliteration: 'kitāb',
            rendered: 'kitāb',
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
          normalizedSurface: 'ناشناخته',
          tokenType: 'persian-word',
          canonicalTransliteration: null,
          rendered: '⟦ناشناخته: unresolved⟧',
          status: 'UNRESOLVED',
          appliedRules: [],
          lexicalSources: [],
          warnings: [],
          alternatives: [],
          normalizedStart: 5,
          normalizedEnd: 13,
          automatic: {
            status: 'UNRESOLVED',
            canonicalTransliteration: null,
            rendered: '⟦ناشناخته: unresolved⟧',
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
});
