import { describe, expect, it } from 'vitest';
import {
  evaluateSingleCase,
  exactUnicodeMatch
} from './evaluateCase';
import {
  validateSingleCase,
  validateSingleCorpus,
  validateBibliographyCorpus
} from './schema';
import { runSingleCase } from './runSingleCase';
import { runBibliographyCase } from './runBibliographyCase';
import { computeValidationMetrics } from './metrics';
import { evaluateReleaseGates } from './releaseGate';
import { runCorpusValidation } from './cli';
import { ScholarlyValidationCase, BibliographyValidationCase, CaseEvaluationResult } from './types';

describe('Phase 4.5 Scholarly Corpus Validation Framework', () => {
  describe('Exact Unicode Comparator', () => {
    it('requires exact Unicode character and diacritic equivalence', () => {
      expect(exactUnicodeMatch('kitāb', 'kitāb')).toBe(true);
      expect(exactUnicodeMatch('kitāb', 'kitab')).toBe(false);
      expect(exactUnicodeMatch('ṣadr', 'sadr')).toBe(false);
      expect(exactUnicodeMatch('ṭālib', 'talib')).toBe(false);
      expect(exactUnicodeMatch('ẓafar', 'zafar')).toBe(false);
      expect(exactUnicodeMatch('ʿilm', "'ilm")).toBe(false);
      expect(exactUnicodeMatch('taʾrīkh', "ta'rikh")).toBe(false);
      expect(exactUnicodeMatch('dīn', 'din')).toBe(false);
      expect(exactUnicodeMatch('nūr', 'nur')).toBe(false);
    });

    it('matches canonically equivalent NFC representations while preserving distinct letters', () => {
      // Decomposed a + combining macron vs precomposed ā
      const decomposed = 'kita\u0304b';
      const precomposed = 'kitāb';
      expect(exactUnicodeMatch(decomposed, precomposed)).toBe(true);
    });
  });

  describe('Classification Engine (Section 9)', () => {
    it('classifies exact match on expected FINAL as CORRECT_AUTHORITATIVE', () => {
      const testCase: ScholarlyValidationCase = {
        id: 'test-1',
        input: 'کتاب',
        profile: 'ijmes_full',
        category: 'TERM',
        expected: {
          disposition: 'FINAL',
          canonical: 'kitāb'
        },
        provenance: {
          kind: 'SCHOLARLY_DICTIONARY',
          citation: 'Steingass p. 1013'
        }
      };

      const result = runSingleCase(testCase);
      expect(result.classification).toBe('CORRECT_AUTHORITATIVE');
      expect(result.actualCopyable).toBe(true);
      expect(result.actualOutput).toBe('kitāb');
    });

    it('classifies wrong copyable output as FALSE_AUTHORITATIVE (critical safety failure)', () => {
      const testCase: ScholarlyValidationCase = {
        id: 'test-false-auth',
        input: 'کتاب',
        profile: 'ijmes_full',
        category: 'TERM',
        expected: {
          disposition: 'FINAL',
          canonical: 'wrong_expected_kitab'
        },
        provenance: {
          kind: 'PROJECT_REVIEW',
          citation: 'Deliberate mismatch fixture'
        }
      };

      const result = runSingleCase(testCase);
      expect(result.classification).toBe('FALSE_AUTHORITATIVE');
      expect(result.reasons[0]).toContain('conflicts with expected gold canonical');
    });

    it('classifies expected REVIEW_REQUIRED blocked by engine as CORRECT_REVIEW_REQUIRED', () => {
      const testCase: ScholarlyValidationCase = {
        id: 'test-rev-req',
        input: 'کرم',
        profile: 'ijmes_full',
        category: 'AMBIGUITY',
        expected: {
          disposition: 'REVIEW_REQUIRED',
          requiredIssueTypes: ['LEXICAL_AMBIGUITY']
        },
        provenance: {
          kind: 'SCHOLARLY_DICTIONARY',
          citation: 'Steingass p. 1025',
          note: 'Ambiguous unvocalized token'
        }
      };

      const result = runSingleCase(testCase);
      expect(result.classification).toBe('CORRECT_REVIEW_REQUIRED');
      expect(result.actualCopyable).toBe(false);
    });

    it('classifies expected REVIEW_REQUIRED resolved copyably by engine as UNDER_BLOCKED (critical safety failure)', () => {
      const testCase: ScholarlyValidationCase = {
        id: 'test-under-blocked',
        input: 'ایران',
        profile: 'ijmes_full',
        category: 'AMBIGUITY',
        expected: {
          disposition: 'REVIEW_REQUIRED'
        },
        provenance: {
          kind: 'PROJECT_REVIEW',
          citation: 'Artificial under-blocked fixture',
          note: 'Testing under-blocked detection'
        }
      };

      const result = runSingleCase(testCase);
      expect(result.classification).toBe('UNDER_BLOCKED');
      expect(result.reasons[0]).toContain('engine produced copyable authoritative output');
    });

    it('classifies expected FINAL blocked by engine as OVER_BLOCKED (coverage limitation)', () => {
      const testCase: ScholarlyValidationCase = {
        id: 'test-over-blocked',
        input: 'کرم',
        profile: 'ijmes_full',
        category: 'TERM',
        expected: {
          disposition: 'FINAL',
          canonical: 'kirm'
        },
        provenance: {
          kind: 'SCHOLARLY_DICTIONARY',
          citation: 'Steingass p. 1025'
        }
      };

      const result = runSingleCase(testCase);
      expect(result.classification).toBe('OVER_BLOCKED');
      expect(result.actualCopyable).toBe(false);
    });

    it('classifies expected UNRESOLVED preserved as noncopyable as CORRECT_UNRESOLVED', () => {
      const testCase: ScholarlyValidationCase = {
        id: 'test-unresolved',
        input: 'ناشناخته‌ها',
        profile: 'ijmes_full',
        category: 'OTHER',
        expected: {
          disposition: 'UNRESOLVED'
        },
        provenance: {
          kind: 'PROJECT_REVIEW',
          citation: 'Unreviewed stem fixture',
          note: 'Must remain unresolved'
        }
      };

      const result = runSingleCase(testCase);
      expect(result.classification).toBe('CORRECT_UNRESOLVED');
      expect(result.actualCopyable).toBe(false);
    });

    it('accepts any variant from allowedCanonicals list', () => {
      const testCase: ScholarlyValidationCase = {
        id: 'test-multi-canonical',
        input: 'دولت',
        profile: 'ijmes_full',
        category: 'TERM',
        expected: {
          disposition: 'FINAL',
          allowedCanonicals: ['dowlat', 'daulat', 'dawlat']
        },
        provenance: {
          kind: 'SCHOLARLY_DICTIONARY',
          citation: 'Steingass p. 548'
        }
      };

      const result = runSingleCase(testCase);
      expect(result.classification).toBe('CORRECT_AUTHORITATIVE');
    });

    it('detects ISSUE_TYPE_MISMATCH when required review issue type is not emitted', () => {
      const testCase: ScholarlyValidationCase = {
        id: 'test-issue-mismatch',
        input: 'کرم',
        profile: 'ijmes_full',
        category: 'AMBIGUITY',
        expected: {
          disposition: 'REVIEW_REQUIRED',
          requiredIssueTypes: ['MORPHOLOGY_AMBIGUITY'] // Actual issue is LEXICAL_AMBIGUITY
        },
        provenance: {
          kind: 'PROJECT_REVIEW',
          citation: 'Issue type mismatch fixture',
          note: 'Expecting morphology ambiguity'
        }
      };

      const result = runSingleCase(testCase);
      expect(result.classification).toBe('ISSUE_TYPE_MISMATCH');
      expect(result.reasons[0]).toContain('Missing required review issue type "MORPHOLOGY_AMBIGUITY"');
    });
  });

  describe('Gold Data Integrity Validation (Section 12)', () => {
    it('fails closed when disposition FINAL lacks canonical and allowedCanonicals', () => {
      expect(() => {
        validateSingleCase({
          id: 'case-invalid-final',
          input: 'کتاب',
          profile: 'ijmes_full',
          category: 'TERM',
          expected: {
            disposition: 'FINAL'
          },
          provenance: {
            kind: 'SCHOLARLY_DICTIONARY',
            citation: 'Steingass'
          }
        });
      }).toThrow(/does not specify a canonical or allowedCanonicals/);
    });

    it('fails closed when canonical contains Persian/Arabic script letters', () => {
      expect(() => {
        validateSingleCase({
          id: 'case-persian-canonical',
          input: 'کتاب',
          profile: 'ijmes_full',
          category: 'TERM',
          expected: {
            disposition: 'FINAL',
            canonical: 'کتاب'
          },
          provenance: {
            kind: 'SCHOLARLY_DICTIONARY',
            citation: 'Steingass'
          }
        });
      }).toThrow(/specifies a canonical containing Persian\/Arabic script/);
    });

    it('fails closed when corpus contains duplicate case IDs', () => {
      expect(() => {
        validateSingleCorpus({
          metadata: {
            id: 'test-corpus',
            version: '1.0',
            description: 'Test corpus'
          },
          cases: [
            {
              id: 'case-dup',
              input: 'کتاب',
              profile: 'ijmes_full',
              category: 'TERM',
              expected: { disposition: 'FINAL', canonical: 'kitāb' },
              provenance: { kind: 'SCHOLARLY_DICTIONARY', citation: 'Steingass' }
            },
            {
              id: 'case-dup',
              input: 'شاه',
              profile: 'ijmes_full',
              category: 'TERM',
              expected: { disposition: 'FINAL', canonical: 'shāh' },
              provenance: { kind: 'SCHOLARLY_DICTIONARY', citation: 'Steingass' }
            }
          ]
        });
      }).toThrow(/Duplicate case ID.*case-dup/);
    });

    it('fails closed when case input is empty', () => {
      expect(() => {
        validateSingleCase({
          id: 'case-empty',
          input: '',
          profile: 'ijmes_full',
          category: 'TERM',
          expected: { disposition: 'FINAL', canonical: 'kitāb' },
          provenance: { kind: 'SCHOLARLY_DICTIONARY', citation: 'Steingass' }
        });
      }).toThrow(/Input must not be empty/);
    });
  });

  describe('Bibliography Case Runner (Section 17 & 18)', () => {
    it('validates a READY record and confirms exportability across CSV, RIS, and BibTeX', () => {
      const bCase: BibliographyValidationCase = {
        id: 'bib-test-ready',
        record: {
          id: 'rec_1',
          type: 'BOOK',
          title: 'تاریخِ مشروطه',
          authors: [{ literal: 'سیاست' }],
          editors: [],
          translators: [],
          year: '1995',
          publisher: 'دولت',
          place: 'تهران',
          sourceRowIndex: 1,
          sourceColumns: [],
          passthrough: {}
        },
        expected: {
          readiness: 'READY',
          fields: {
            title: { disposition: 'FINAL', finalText: 'Tarikh-i Mashruta' },
            'authors.0.literal': { disposition: 'FINAL', finalText: 'siyāsat' }
          }
        },
        provenance: {
          kind: 'ACADEMIC_SOURCE',
          citation: 'Monograph fixture'
        }
      };

      const result = runBibliographyCase(bCase);
      expect(result.classification).toBe('CORRECT_AUTHORITATIVE');
      expect(result.actualReadiness).toBe('READY');
      expect(result.reasons.length).toBe(0);
    });

    it('blocks export on REVIEW_REQUIRED bibliography record', () => {
      const bCase: BibliographyValidationCase = {
        id: 'bib-test-review',
        record: {
          id: 'rec_2',
          type: 'BOOK',
          title: 'کرم',
          authors: [],
          editors: [],
          translators: [],
          sourceRowIndex: 2,
          sourceColumns: [],
          passthrough: {}
        },
        expected: {
          readiness: 'REVIEW_REQUIRED',
          fields: {
            title: { disposition: 'REVIEW_REQUIRED' }
          }
        },
        provenance: {
          kind: 'PROJECT_REVIEW',
          citation: 'Ambiguous title fixture',
          note: 'Unresolved issue blocks export'
        }
      };

      const result = runBibliographyCase(bCase);
      expect(result.classification).toBe('CORRECT_REVIEW_REQUIRED');
      expect(result.actualReadiness).toBe('REVIEW_REQUIRED');
    });
  });

  describe('Release Gates & Metrics (Sections 10 & 11)', () => {
    it('fails release gate when falseAuthoritative > 0', () => {
      const mockResults: CaseEvaluationResult[] = [
        {
          caseId: 'c1',
          input: 'کتاب',
          profile: 'ijmes_full',
          category: 'TERM',
          expectedDisposition: 'FINAL',
          expectedCanonicals: ['wrong_expected'],
          actualStatus: 'DETERMINISTIC',
          actualOutput: 'kitāb',
          actualCopyable: true,
          actualReviewIssueTypes: [],
          classification: 'FALSE_AUTHORITATIVE',
          reasons: ['Output mismatch'],
          provenance: { kind: 'PROJECT_REVIEW', citation: 'Test' }
        }
      ];

      const metrics = computeValidationMetrics(mockResults);
      expect(metrics.falseAuthoritative).toBe(1);
      expect(metrics.safeBehaviorCount).toBe(0);

      const gate = evaluateReleaseGates(metrics);
      expect(gate.passed).toBe(false);
      expect(gate.readiness).toBe('BLOCKED');
      expect(gate.violations[0]).toContain('CRITICAL SAFETY FAILURE');
    });

    it('fails release gate when underBlocked > 0', () => {
      const mockResults: CaseEvaluationResult[] = [
        {
          caseId: 'c2',
          input: 'کرم',
          profile: 'ijmes_full',
          category: 'AMBIGUITY',
          expectedDisposition: 'REVIEW_REQUIRED',
          expectedCanonicals: [],
          actualStatus: 'DETERMINISTIC',
          actualOutput: 'karam',
          actualCopyable: true,
          actualReviewIssueTypes: [],
          classification: 'UNDER_BLOCKED',
          reasons: ['Made copyable'],
          provenance: { kind: 'PROJECT_REVIEW', citation: 'Test' }
        }
      ];

      const metrics = computeValidationMetrics(mockResults);
      expect(metrics.underBlocked).toBe(1);

      const gate = evaluateReleaseGates(metrics);
      expect(gate.passed).toBe(false);
      expect(gate.readiness).toBe('BLOCKED');
    });

    it('returns PILOT_PASS when safety gates pass for pilot corpus', () => {
      const mockResults: CaseEvaluationResult[] = [
        {
          caseId: 'c3',
          input: 'کتاب',
          profile: 'ijmes_full',
          category: 'TERM',
          expectedDisposition: 'FINAL',
          expectedCanonicals: ['kitāb'],
          actualStatus: 'DETERMINISTIC',
          actualOutput: 'kitāb',
          actualCopyable: true,
          actualReviewIssueTypes: [],
          classification: 'CORRECT_AUTHORITATIVE',
          reasons: [],
          provenance: { kind: 'SCHOLARLY_DICTIONARY', citation: 'Steingass' }
        }
      ];

      const metrics = computeValidationMetrics(mockResults);
      const gate = evaluateReleaseGates(metrics, { isPilot: true });
      expect(gate.passed).toBe(true);
      expect(gate.readiness).toBe('PILOT_PASS');
    });
  });

  describe('Full Pilot Corpus Validation Runner (Section 16 & 28)', () => {
    it('executes the full reviewed pilot corpus hermetically with zero safety violations', () => {
      const { success, report } = runCorpusValidation();
      expect(success).toBe(true);
      expect(report).toContain('Scholarly Corpus Validation — pilot.single (pilot-v1)');
      expect(report).toContain('FALSE AUTHORITATIVE:    0');
      expect(report).toContain('UNDER-BLOCKED:          0');
      expect(report).toContain('Release Gate Status:      PASS (PILOT_PASS)');
    });
  });
});
