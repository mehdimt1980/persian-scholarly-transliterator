import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  evaluateSingleCase,
  exactUnicodeMatch
} from './evaluateCase';
import {
  validateBibliographyCase,
  validateBibliographyCorpus,
  validateCorpusManifest,
  validateReleaseTarget,
  validateSingleCase,
  validateSingleCorpus
} from './schema';
import { runSingleCase } from './runSingleCase';
import { runBibliographyCase } from './runBibliographyCase';
import {
  computeBibliographyValidationMetrics,
  computeCombinedValidationMetrics,
  computeValidationMetrics
} from './metrics';
import { evaluateReleaseGates } from './releaseGate';
import { generateTextReport } from './report';
import { runCorpusValidation } from './cli';
import {
  BibliographyCaseEvaluationResult,
  BibliographyValidationCase,
  CaseEvaluationResult,
  ScholarlyValidationCase
} from './types';

describe('Phase 4.5 Scholarly Corpus Validation Framework', () => {
  describe('Exact Unicode Comparator (Section 10 & 25.6)', () => {
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

    it('does not trim leading or trailing whitespace (Section 10 & 25.6)', () => {
      expect(exactUnicodeMatch('kitāb', ' kitāb')).toBe(false);
      expect(exactUnicodeMatch('kitāb', 'kitāb ')).toBe(false);
      expect(exactUnicodeMatch(' kitāb', 'kitāb')).toBe(false);
      expect(exactUnicodeMatch('kitāb\n', 'kitāb')).toBe(false);
      expect(exactUnicodeMatch('kitāb', 'kitāb')).toBe(true);
    });
  });

  describe('Classification Engine & Authority Signal (Section 11 & 25.7-9)', () => {
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
          sources: [
            {
              kind: 'SCHOLARLY_DICTIONARY',
              citation: 'Steingass p. 1013'
            }
          ]
        }
      };

      const result = runSingleCase(testCase);
      expect(result.classification).toBe('CORRECT_AUTHORITATIVE');
      expect(result.actualCopyable).toBe(true);
      expect(result.actualOutput).toBe('kitāb');
    });

    it('treats copyable=true with AMBIGUOUS status as authoritative match if output matches gold (25.7)', () => {
      const testCase: ScholarlyValidationCase = {
        id: 'test-ambig-auth',
        input: 'کتاب',
        profile: 'ijmes_full',
        category: 'TERM',
        expected: {
          disposition: 'FINAL',
          canonical: 'kitāb'
        },
        provenance: {
          sources: [{ kind: 'PROJECT_REVIEW', citation: 'Authority test' }]
        }
      };

      const result = evaluateSingleCase(testCase, {
        originalInput: testCase.input,
        normalizedInput: testCase.input,
        normalizationChanges: [],
        profile: testCase.profile,
        output: 'kitāb',
        copyable: true,
        status: 'AMBIGUOUS',
        tokens: [],
        analyses: [],
        morphology: [],
        relations: [],
        reviewIssues: [],
        appliedDecisions: [],
        staleDecisions: [],
        reviewReasons: [],
        warnings: []
      });

      expect(result.classification).toBe('CORRECT_AUTHORITATIVE');
      expect(result.actualCopyable).toBe(true);
    });

    it('classifies copyable=true on expected REVIEW_REQUIRED as UNDER_BLOCKED regardless of status (25.8)', () => {
      const testCase: ScholarlyValidationCase = {
        id: 'test-under-blocked-rev',
        input: 'کرم',
        profile: 'ijmes_full',
        category: 'AMBIGUITY',
        expected: {
          disposition: 'REVIEW_REQUIRED'
        },
        provenance: {
          sources: [{ kind: 'PROJECT_REVIEW', citation: 'Safety test' }]
        }
      };

      const result = evaluateSingleCase(testCase, {
        originalInput: testCase.input,
        normalizedInput: testCase.input,
        normalizationChanges: [],
        profile: testCase.profile,
        output: 'kirm',
        copyable: true,
        status: 'AMBIGUOUS',
        tokens: [],
        analyses: [],
        morphology: [],
        relations: [],
        reviewIssues: [],
        appliedDecisions: [],
        staleDecisions: [],
        reviewReasons: [],
        warnings: []
      });

      expect(result.classification).toBe('UNDER_BLOCKED');
      expect(result.reasons[0]).toContain('engine produced copyable authoritative output');
    });

    it('classifies copyable=true on expected UNRESOLVED as UNDER_BLOCKED regardless of status (25.9)', () => {
      const testCase: ScholarlyValidationCase = {
        id: 'test-under-blocked-unres',
        input: 'ناشناخته',
        profile: 'ijmes_full',
        category: 'OTHER',
        expected: {
          disposition: 'UNRESOLVED'
        },
        provenance: {
          sources: [{ kind: 'PROJECT_REVIEW', citation: 'Safety test' }]
        }
      };

      const result = evaluateSingleCase(testCase, {
        originalInput: testCase.input,
        normalizedInput: testCase.input,
        normalizationChanges: [],
        profile: testCase.profile,
        output: 'nāshinākhta',
        copyable: true,
        status: 'UNRESOLVED',
        tokens: [],
        analyses: [],
        morphology: [],
        relations: [],
        reviewIssues: [],
        appliedDecisions: [],
        staleDecisions: [],
        reviewReasons: [],
        warnings: []
      });

      expect(result.classification).toBe('UNDER_BLOCKED');
      expect(result.reasons[0]).toContain('engine produced copyable authoritative output');
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
          sources: [
            {
              kind: 'PROJECT_REVIEW',
              citation: 'Deliberate mismatch fixture'
            }
          ]
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
          sources: [
            {
              kind: 'SCHOLARLY_DICTIONARY',
              citation: 'Steingass p. 1025',
              note: 'Ambiguous unvocalized token'
            }
          ]
        }
      };

      const result = runSingleCase(testCase);
      expect(result.classification).toBe('CORRECT_REVIEW_REQUIRED');
      expect(result.actualCopyable).toBe(false);
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
          sources: [
            {
              kind: 'SCHOLARLY_DICTIONARY',
              citation: 'Steingass p. 1025'
            }
          ]
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
          sources: [
            {
              kind: 'PROJECT_REVIEW',
              citation: 'Unreviewed stem fixture',
              note: 'Must remain unresolved'
            }
          ]
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
          sources: [
            {
              kind: 'SCHOLARLY_DICTIONARY',
              citation: 'Steingass p. 548'
            }
          ]
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
          sources: [
            {
              kind: 'PROJECT_REVIEW',
              citation: 'Issue type mismatch fixture',
              note: 'Expecting morphology ambiguity'
            }
          ]
        }
      };

      const result = runSingleCase(testCase);
      expect(result.classification).toBe('ISSUE_TYPE_MISMATCH');
      expect(result.reasons[0]).toContain('Missing required review issue type "MORPHOLOGY_AMBIGUITY"');
    });
  });

  describe('Safe Behavior Metrics (Section 12 & 25.10)', () => {
    it('does NOT count ISSUE_TYPE_MISMATCH as safe behavior (25.10)', () => {
      const results: CaseEvaluationResult[] = [
        {
          caseId: 'c1',
          input: 'کرم',
          profile: 'ijmes_full',
          category: 'AMBIGUITY',
          expectedDisposition: 'REVIEW_REQUIRED',
          expectedCanonicals: [],
          actualStatus: 'AMBIGUOUS',
          actualOutput: '',
          actualCopyable: false,
          actualReviewIssueTypes: ['LEXICAL_AMBIGUITY'],
          classification: 'ISSUE_TYPE_MISMATCH',
          reasons: ['Mismatch'],
          provenance: { sources: [{ kind: 'PROJECT_REVIEW', citation: 'Test' }] }
        },
        {
          caseId: 'c2',
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
          provenance: { sources: [{ kind: 'SCHOLARLY_DICTIONARY', citation: 'Steingass' }] }
        }
      ];

      const metrics = computeValidationMetrics(results);
      expect(metrics.total).toBe(2);
      expect(metrics.issueTypeMismatch).toBe(1);
      expect(metrics.correctAuthoritative).toBe(1);
      expect(metrics.safeBehaviorCount).toBe(1); // Only c2 is safe
      expect(metrics.safeBehaviorRate).toBe(0.5);
      expect(metrics.safeBehaviorRate).toBeLessThan(1.0);
    });
  });

  describe('Gold Data Integrity Validation (Section 13, 14 & 25.11-13, 25.21)', () => {
    it('rejects empty allowedCanonical in schema (25.11)', () => {
      expect(() => {
        validateSingleCase({
          id: 'case-empty-allowed',
          input: 'کتاب',
          profile: 'ijmes_full',
          category: 'TERM',
          expected: {
            disposition: 'FINAL',
            allowedCanonicals: ['']
          },
          provenance: {
            sources: [{ kind: 'SCHOLARLY_DICTIONARY', citation: 'Steingass' }]
          }
        });
      }).toThrow(/empty canonical string/);
    });

    it('rejects duplicate values in allowedCanonicals (25.12)', () => {
      expect(() => {
        validateSingleCase({
          id: 'case-dup-allowed',
          input: 'کتاب',
          profile: 'ijmes_full',
          category: 'TERM',
          expected: {
            disposition: 'FINAL',
            allowedCanonicals: ['kitāb', 'kitāb']
          },
          provenance: {
            sources: [{ kind: 'SCHOLARLY_DICTIONARY', citation: 'Steingass' }]
          }
        });
      }).toThrow(/duplicate allowedCanonical/);
    });

    it('rejects non-final allowedCanonicals under gold integrity policy (25.13)', () => {
      expect(() => {
        validateSingleCase({
          id: 'case-rev-allowed',
          input: 'کرم',
          profile: 'ijmes_full',
          category: 'AMBIGUITY',
          expected: {
            disposition: 'REVIEW_REQUIRED',
            allowedCanonicals: ['kirm']
          },
          provenance: {
            sources: [{ kind: 'SCHOLARLY_DICTIONARY', citation: 'Steingass' }]
          }
        });
      }).toThrow(/provides allowedCanonicals without an explanatory reviewNote/);
    });

    it('rejects metadata claiming HUMAN_REVIEWED without reviewer or reviewedAt (25.21)', () => {
      expect(() => {
        validateSingleCorpus({
          metadata: {
            id: 'unreviewed-corpus',
            version: '1.0',
            description: 'Invalid review metadata',
            tier: 'REAL_DISSERTATION',
            reviewStatus: 'HUMAN_REVIEWED'
            // Missing reviewer and reviewedAt
          },
          cases: [
            {
              id: 'c1',
              input: 'کتاب',
              profile: 'ijmes_full',
              category: 'TERM',
              expected: { disposition: 'FINAL', canonical: 'kitāb' },
              provenance: { sources: [{ kind: 'SCHOLARLY_DICTIONARY', citation: 'Steingass' }] }
            }
          ]
        });
      }).toThrow(/requires a non-empty reviewer field/);
    });
  });

  describe('Bibliography Schemas & Case Runner (Section 10-13, 20.12-16)', () => {
    it('rejects malformed bibliography record schema (25.14)', () => {
      expect(() => {
        validateBibliographyCase({
          id: 'b-bad-rec',
          record: {
            id: 'rec-1',
            // Missing required type and title
            authors: []
          },
          expected: {
            readiness: 'READY'
          },
          provenance: {
            sources: [{ kind: 'PROJECT_REVIEW', citation: 'Test' }]
          }
        });
      }).toThrow();
    });

    it('rejects bibliography field with disposition FINAL without finalText (20.13)', () => {
      expect(() => {
        validateBibliographyCase({
          id: 'b-missing-finaltext',
          record: {
            id: 'rec_1',
            type: 'BOOK',
            title: 'کتاب',
            authors: [],
            editors: [],
            translators: [],
            sourceRowIndex: 1,
            sourceColumns: [],
            passthrough: {}
          },
          expected: {
            readiness: 'READY',
            fields: {
              title: {
                disposition: 'FINAL'
                // Missing finalText
              }
            }
          },
          provenance: {
            sources: [{ kind: 'PROJECT_REVIEW', citation: 'Test' }]
          }
        });
      }).toThrow(/must specify a non-empty/);
    });

    it('rejects bibliography field with disposition PASSTHROUGH without finalText (20.14)', () => {
      expect(() => {
        validateBibliographyCase({
          id: 'b-missing-passthrough-text',
          record: {
            id: 'rec_1',
            type: 'BOOK',
            title: 'History',
            authors: [],
            editors: [],
            translators: [],
            sourceRowIndex: 1,
            sourceColumns: [],
            passthrough: {}
          },
          expected: {
            readiness: 'READY',
            fields: {
              title: {
                disposition: 'PASSTHROUGH'
                // Missing finalText
              }
            }
          },
          provenance: {
            sources: [{ kind: 'PROJECT_REVIEW', citation: 'Test' }]
          }
        });
      }).toThrow(/must specify a non-empty/);
    });


    it('rejects invalid action-specific ReviewDecision fixture payloads (20.15)', () => {
      // SELECT_LEXICAL_READING without selectedAlternativeId
      expect(() => {
        validateBibliographyCase({
          id: 'b-bad-action',
          record: {
            id: 'rec_1',
            type: 'BOOK',
            title: 'کتاب',
            authors: [],
            editors: [],
            translators: [],
            sourceRowIndex: 1,
            sourceColumns: [],
            passthrough: {}
          },
          reviewDecisions: [
            {
              recordId: 'rec_1',
              fieldPath: 'title',
              decision: {
                issueId: 'iss_1',
                action: 'SELECT_LEXICAL_READING'
                // missing selectedAlternativeId
              } as any
            }
          ],
          expected: {
            readiness: 'READY'
          },
          provenance: {
            sources: [{ kind: 'PROJECT_REVIEW', citation: 'Test' }]
          }
        });
      }).toThrow();

      // MANUAL_CANONICAL_OVERRIDE without manualCanonical
      expect(() => {
        validateBibliographyCase({
          id: 'b-bad-action-override',
          record: {
            id: 'rec_1',
            type: 'BOOK',
            title: 'کتاب',
            authors: [],
            editors: [],
            translators: [],
            sourceRowIndex: 1,
            sourceColumns: [],
            passthrough: {}
          },
          reviewDecisions: [
            {
              recordId: 'rec_1',
              fieldPath: 'title',
              decision: {
                issueId: 'iss_1',
                action: 'MANUAL_CANONICAL_OVERRIDE'
                // missing manualCanonical
              } as any
            }
          ],
          expected: {
            readiness: 'READY'
          },
          provenance: {
            sources: [{ kind: 'PROJECT_REVIEW', citation: 'Test' }]
          }
        });
      }).toThrow();
    });

    it('rejects invalid bibliography fieldPath (20.16)', () => {
      expect(() => {
        validateBibliographyCase({
          id: 'b-bad-path',
          record: {
            id: 'rec_1',
            type: 'BOOK',
            title: 'کتاب',
            authors: [],
            editors: [],
            translators: [],
            sourceRowIndex: 1,
            sourceColumns: [],
            passthrough: {}
          },
          reviewDecisions: [
            {
              recordId: 'rec_1',
              fieldPath: 'banana.invalid_field' as any,
              decision: {
                issueId: 'iss_1',
                action: 'ACCEPT_IZAFAT'
              }
            }
          ],
          expected: {
            readiness: 'READY'
          },
          provenance: {
            sources: [{ kind: 'PROJECT_REVIEW', citation: 'Test' }]
          }
        });
      }).toThrow(/Invalid bibliography fieldPath/);
    });

    it('classifies bibliography expected REVIEW_REQUIRED and actual INVALID as OVER_BLOCKED (20.12)', () => {
      const bCase: BibliographyValidationCase = {
        id: 'bib-test-invalid-readiness',
        record: {
          id: 'rec_invalid',
          type: 'BOOK',
          title: 'کرم',
          authors: [],
          editors: [],
          translators: [],
          sourceRowIndex: 1,
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
          sources: [{ kind: 'PROJECT_REVIEW', citation: 'Test' }]
        }
      };

      const result = runBibliographyCase(bCase);
      expect(result.actualReadiness).toBe('REVIEW_REQUIRED');
      expect(result.classification).toBe('CORRECT_REVIEW_REQUIRED');
    });

    it('classifies bibliography UNRESOLVED field becoming final as UNDER_BLOCKED (25.16)', () => {
      const bCase: BibliographyValidationCase = {
        id: 'bib-test-unres-fail',
        record: {
          id: 'rec_unres',
          type: 'BOOK',
          title: 'کتاب',
          authors: [],
          editors: [],
          translators: [],
          sourceRowIndex: 1,
          sourceColumns: [],
          passthrough: {}
        },
        expected: {
          readiness: 'REVIEW_REQUIRED',
          fields: {
            title: { disposition: 'UNRESOLVED' }
          }
        },
        provenance: {
          sources: [{ kind: 'PROJECT_REVIEW', citation: 'Test' }]
        }
      };

      // Since 'کتاب' deterministically transliterates to 'kitāb' with copyable=true, expecting UNRESOLVED must fail as UNDER_BLOCKED
      const result = runBibliographyCase(bCase);
      expect(result.classification).toBe('UNDER_BLOCKED');
      expect(result.reasons[0]).toContain('Expected UNRESOLVED');
    });

    it('does not assign fake BOOK_TITLE or ijmes_full to bibliography metrics (25.18)', () => {
      const bibResults: BibliographyCaseEvaluationResult[] = [
        {
          caseId: 'b1',
          recordId: 'rec_1',
          expectedReadiness: 'READY',
          actualReadiness: 'READY',
          classification: 'CORRECT_AUTHORITATIVE',
          reasons: [],
          provenance: { sources: [{ kind: 'PROJECT_REVIEW', citation: 'Bib' }] },
          fieldEvaluations: []
        }
      ];

      const singleResults: CaseEvaluationResult[] = [
        {
          caseId: 's1',
          input: 'ایران',
          profile: 'ijmes_full',
          category: 'PLACE',
          expectedDisposition: 'FINAL',
          expectedCanonicals: ['īrān'],
          actualStatus: 'DETERMINISTIC',
          actualOutput: 'īrān',
          actualCopyable: true,
          actualReviewIssueTypes: [],
          classification: 'CORRECT_AUTHORITATIVE',
          reasons: [],
          provenance: { sources: [{ kind: 'ENCYCLOPEDIA', citation: 'Iranica' }] }
        }
      ];

      const singleMetrics = computeValidationMetrics(singleResults);
      const bibMetrics = computeBibliographyValidationMetrics(bibResults);
      const combined = computeCombinedValidationMetrics(singleMetrics, bibMetrics);

      expect(combined.total).toBe(2);
      expect(combined.single.total).toBe(1);
      expect(combined.bibliography.total).toBe(1);
      expect(combined.single.byCategory['PLACE'].total).toBe(1);
      expect(combined.single.byCategory['BOOK_TITLE']).toBeUndefined();
    });
  });

  describe('Corpus Maturity, Release Targets & Lexicon Gates (Section 1-3, 7, 20.1-5)', () => {
    const validSingleCaseResult: CaseEvaluationResult = {
      caseId: 'c1',
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
      provenance: { sources: [{ kind: 'SCHOLARLY_DICTIONARY', citation: 'Steingass' }] }
    };

    it('returns safetyPassed=true but targetSatisfied=false when PILOT corpus targets RC (20.2)', () => {
      const metrics = computeValidationMetrics([validSingleCaseResult]);
      const gate = evaluateReleaseGates(metrics, {
        context: {
          corpusTier: 'PILOT',
          releaseTarget: 'RC',
          reviewStatus: 'SOURCE_BACKED_FIXTURE'
        }
      });

      expect(gate.safetyPassed).toBe(true);
      expect(gate.targetSatisfied).toBe(false);
      expect(gate.passed).toBe(false);
      expect(gate.readiness).toBe('REAL_CORPUS_REQUIRED');
      expect(gate.blockers[0]).toContain('REAL_CORPUS_REQUIRED');
    });

    it('returns safetyPassed=true and targetSatisfied=true when PILOT corpus targets PILOT', () => {
      const metrics = computeValidationMetrics([validSingleCaseResult]);
      const gate = evaluateReleaseGates(metrics, {
        context: {
          corpusTier: 'PILOT',
          releaseTarget: 'PILOT',
          reviewStatus: 'SOURCE_BACKED_FIXTURE'
        }
      });

      expect(gate.safetyPassed).toBe(true);
      expect(gate.targetSatisfied).toBe(true);
      expect(gate.passed).toBe(true);
      expect(gate.readiness).toBe('PILOT_PASS');
    });

    it('yields RC_READY with targetSatisfied=true on explicit non-empty HUMAN_REVIEWED real dissertation corpus (20.3)', () => {
      const metrics = computeValidationMetrics([validSingleCaseResult]);
      const gate = evaluateReleaseGates(metrics, {
        context: {
          corpusTier: 'REAL_DISSERTATION',
          releaseTarget: 'RC',
          reviewStatus: 'HUMAN_REVIEWED'
        }
      });

      expect(gate.safetyPassed).toBe(true);
      expect(gate.targetSatisfied).toBe(true);
      expect(gate.passed).toBe(true);
      expect(gate.readiness).toBe('RC_READY');
    });

    it('cannot become RC_READY with zero evaluated cases (20.4)', () => {
      const emptyMetrics = computeValidationMetrics([]);
      const gate = evaluateReleaseGates(emptyMetrics, {
        context: {
          corpusTier: 'REAL_DISSERTATION',
          releaseTarget: 'RC',
          reviewStatus: 'HUMAN_REVIEWED'
        }
      });

      expect(gate.targetSatisfied).toBe(false);
      expect(gate.passed).toBe(false);
      expect(gate.readiness).toBe('BLOCKED');
      expect(gate.blockers[0]).toContain('EMPTY_VALIDATION_CORPUS');
    });

    it('ensures SOURCE_BACKED_FIXTURE can never become RC_READY even on REAL_DISSERTATION tier', () => {
      const metrics = computeValidationMetrics([validSingleCaseResult]);
      const gate = evaluateReleaseGates(metrics, {
        context: {
          corpusTier: 'REAL_DISSERTATION',
          releaseTarget: 'RC',
          reviewStatus: 'SOURCE_BACKED_FIXTURE'
        }
      });

      expect(gate.safetyPassed).toBe(true);
      expect(gate.targetSatisfied).toBe(false);
      expect(gate.readiness).toBe('REAL_CORPUS_REQUIRED');
    });

    it('blocks validation if default lexicon integrity fails (25.20)', () => {
      const metrics = computeValidationMetrics([validSingleCaseResult]);
      const gate = evaluateReleaseGates(metrics, {
        context: {
          corpusTier: 'PILOT',
          releaseTarget: 'PILOT',
          reviewStatus: 'SOURCE_BACKED_FIXTURE',
          lexiconValid: false
        }
      });

      expect(gate.safetyPassed).toBe(false);
      expect(gate.targetSatisfied).toBe(false);
      expect(gate.passed).toBe(false);
      expect(gate.readiness).toBe('BLOCKED');
      expect(gate.violations[0]).toContain('DEFAULT LEXICON INTEGRITY FAILURE');
    });

    it('evaluating release gates without explicit context defaults safely to PILOT/SOURCE_BACKED_FIXTURE (20.5)', () => {
      const metrics = computeValidationMetrics([validSingleCaseResult]);
      const gate = evaluateReleaseGates(metrics);

      expect(gate.context.corpusTier).toBe('PILOT');
      expect(gate.context.releaseTarget).toBe('PILOT');
      expect(gate.context.reviewStatus).toBe('SOURCE_BACKED_FIXTURE');
      expect(gate.readiness).toBe('PILOT_PASS');
      expect(gate.readiness).not.toBe('RC_READY');
    });

    it('report distinguishes 46 single from 3 bibliography cases (25.19)', () => {
      const singleResults: CaseEvaluationResult[] = new Array(46).fill(null).map((_, i) => ({
        caseId: `s_${i}`,
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
        provenance: { sources: [{ kind: 'SCHOLARLY_DICTIONARY', citation: 'Steingass' }] }
      }));

      const bibResults: BibliographyCaseEvaluationResult[] = new Array(3).fill(null).map((_, i) => ({
        caseId: `b_${i}`,
        recordId: `rec_${i}`,
        expectedReadiness: 'READY',
        actualReadiness: 'READY',
        classification: 'CORRECT_AUTHORITATIVE',
        reasons: [],
        provenance: { sources: [{ kind: 'PROJECT_REVIEW', citation: 'Bib' }] },
        fieldEvaluations: []
      }));

      const singleMetrics = computeValidationMetrics(singleResults);
      const bibMetrics = computeBibliographyValidationMetrics(bibResults);
      const combined = computeCombinedValidationMetrics(singleMetrics, bibMetrics);
      const gateResult = evaluateReleaseGates(combined, {
        context: { corpusTier: 'PILOT', releaseTarget: 'PILOT', reviewStatus: 'SOURCE_BACKED_FIXTURE' }
      });

      const report = generateTextReport(
        {
          manifest: {
            id: 'pilot-v1',
            version: '1.0.0',
            description: 'Test',
            tier: 'PILOT',
            reviewStatus: 'SOURCE_BACKED_FIXTURE'
          },
          singleMetadata: {
            id: 'pilot.single',
            version: '1.0.0',
            description: 'Single',
            tier: 'PILOT',
            reviewStatus: 'SOURCE_BACKED_FIXTURE'
          },
          bibliographyMetadata: {
            id: 'pilot.bibliography',
            version: '1.0.0',
            description: 'Bib',
            tier: 'PILOT',
            reviewStatus: 'SOURCE_BACKED_FIXTURE'
          }
        },
        singleResults,
        combined,
        gateResult,
        bibResults
      );

      expect(report).toContain('Single corpus:       pilot.single / 46 cases');
      expect(report).toContain('Bibliography corpus: pilot.bibliography / 3 cases');
      expect(report).toContain('Combined Total:      49 cases');
      expect(report).toContain('Safety Gate:              PASS');
      expect(report).toContain('Target Satisfaction:      PASS');
      expect(report).toContain('Readiness State:          PILOT_PASS');
    });
  });

  describe('Generic Manifest & Coherence Hardening (Section 4-9, 20.6-11)', () => {
    it('rejects invalid CLI target runtime value (20.6)', () => {
      expect(() => validateReleaseTarget('banana')).toThrow();
      expect(validateReleaseTarget('PILOT')).toBe('PILOT');
      expect(validateReleaseTarget('RC')).toBe('RC');
    });

    it('rejects manifest that declares no corpus files (20.7)', () => {
      expect(() => {
        validateCorpusManifest({
          id: 'm-empty',
          version: '1.0',
          description: 'No files',
          tier: 'PILOT',
          reviewStatus: 'SOURCE_BACKED_FIXTURE'
        });
      }).toThrow(/Manifest must declare at least one corpus file/);
    });

    it('fails fatal when manifest declares missing single corpus file (20.8)', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'missing-corpus-'));
      try {
        const manifestFile = path.join(tempDir, 'manifest.json');
        fs.writeFileSync(
          manifestFile,
          JSON.stringify({
            id: 'm-test',
            version: '1.0',
            description: 'Missing file test',
            tier: 'PILOT',
            reviewStatus: 'SOURCE_BACKED_FIXTURE',
            single: 'does_not_exist.single.json'
          })
        );

        expect(() => runCorpusValidation({ manifestPath: manifestFile })).toThrow(
          /CORPUS_FILE_NOT_FOUND/
        );
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('fails fatal when manifest tier mismatches corpus metadata tier (20.9)', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier-mismatch-'));
      try {
        const manifestFile = path.join(tempDir, 'manifest.json');
        const singleFile = path.join(tempDir, 'test.single.json');

        fs.writeFileSync(
          manifestFile,
          JSON.stringify({
            id: 'm-upgrade-attack',
            version: '1.0',
            description: 'Upgrade attack test',
            tier: 'REAL_DISSERTATION',
            reviewStatus: 'HUMAN_REVIEWED',
            reviewer: 'Dr. Persianist',
            reviewedAt: '2026-10-04',
            single: 'test.single.json'
          })
        );

        fs.writeFileSync(
          singleFile,
          JSON.stringify({
            metadata: {
              id: 'test.single',
              version: '1.0',
              description: 'Pilot single file',
              tier: 'PILOT',
              reviewStatus: 'SOURCE_BACKED_FIXTURE'
            },
            cases: [
              {
                id: 'c1',
                input: 'کتاب',
                profile: 'ijmes_full',
                category: 'TERM',
                expected: { disposition: 'FINAL', canonical: 'kitāb' },
                provenance: { sources: [{ kind: 'SCHOLARLY_DICTIONARY', citation: 'Steingass' }] }
              }
            ]
          })
        );

        expect(() => runCorpusValidation({ manifestPath: manifestFile })).toThrow(
          /CORPUS_MANIFEST_METADATA_MISMATCH/
        );
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('fails fatal when manifest reviewStatus mismatches corpus reviewStatus (20.10)', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-mismatch-'));
      try {
        const manifestFile = path.join(tempDir, 'manifest.json');
        const singleFile = path.join(tempDir, 'test.single.json');

        fs.writeFileSync(
          manifestFile,
          JSON.stringify({
            id: 'm-status-mismatch',
            version: '1.0',
            description: 'Status mismatch test',
            tier: 'REAL_DISSERTATION',
            reviewStatus: 'HUMAN_REVIEWED',
            reviewer: 'Dr. Persianist',
            reviewedAt: '2026-10-04',
            single: 'test.single.json'
          })
        );

        fs.writeFileSync(
          singleFile,
          JSON.stringify({
            metadata: {
              id: 'test.single',
              version: '1.0',
              description: 'Status mismatch single file',
              tier: 'REAL_DISSERTATION',
              reviewStatus: 'SOURCE_BACKED_FIXTURE'
            },
            cases: [
              {
                id: 'c1',
                input: 'کتاب',
                profile: 'ijmes_full',
                category: 'TERM',
                expected: { disposition: 'FINAL', canonical: 'kitāb' },
                provenance: { sources: [{ kind: 'SCHOLARLY_DICTIONARY', citation: 'Steingass' }] }
              }
            ]
          })
        );

        expect(() => runCorpusValidation({ manifestPath: manifestFile })).toThrow(
          /CORPUS_MANIFEST_METADATA_MISMATCH/
        );
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('fails fatal when HUMAN_REVIEWED reviewer mismatches corpus reviewer (20.11)', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reviewer-mismatch-'));
      try {
        const manifestFile = path.join(tempDir, 'manifest.json');
        const singleFile = path.join(tempDir, 'test.single.json');

        fs.writeFileSync(
          manifestFile,
          JSON.stringify({
            id: 'm-reviewer-mismatch',
            version: '1.0',
            description: 'Reviewer mismatch test',
            tier: 'REAL_DISSERTATION',
            reviewStatus: 'HUMAN_REVIEWED',
            reviewer: 'Dr. Persianist',
            reviewedAt: '2026-10-04',
            single: 'test.single.json'
          })
        );

        fs.writeFileSync(
          singleFile,
          JSON.stringify({
            metadata: {
              id: 'test.single',
              version: '1.0',
              description: 'Different reviewer single file',
              tier: 'REAL_DISSERTATION',
              reviewStatus: 'HUMAN_REVIEWED',
              reviewer: 'Dr. Different Reviewer',
              reviewedAt: '2026-10-04'
            },
            cases: [
              {
                id: 'c1',
                input: 'کتاب',
                profile: 'ijmes_full',
                category: 'TERM',
                expected: { disposition: 'FINAL', canonical: 'kitāb' },
                provenance: { sources: [{ kind: 'SCHOLARLY_DICTIONARY', citation: 'Steingass' }] }
              }
            ]
          })
        );

        expect(() => runCorpusValidation({ manifestPath: manifestFile })).toThrow(
          /CORPUS_MANIFEST_METADATA_MISMATCH/
        );
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('CLI runner loads arbitrary manifest and corpus filenames without code modification (20.1)', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-test-'));
      try {
        const customSingleFile = path.join(tempDir, 'custom.dissertation.single.json');
        const customBibFile = path.join(tempDir, 'custom.dissertation.bib.json');
        const manifestFile = path.join(tempDir, 'dissertation.manifest.json');

        const singleData = {
          metadata: {
            id: 'dissertation.single',
            version: 'dissertation-v1',
            description: 'Dissertation single fixtures',
            tier: 'REAL_DISSERTATION',
            reviewStatus: 'HUMAN_REVIEWED',
            reviewer: 'Dr. Persianist',
            reviewedAt: '2026-10-04'
          },
          cases: [
            {
              id: 'case-diss-01',
              input: 'کتاب',
              profile: 'ijmes_full',
              category: 'TERM',
              expected: {
                disposition: 'FINAL',
                canonical: 'kitāb'
              },
              provenance: {
                sources: [{ kind: 'SCHOLARLY_DICTIONARY', citation: 'Steingass' }]
              }
            }
          ]
        };

        const bibData = {
          metadata: {
            id: 'dissertation.bibliography',
            version: 'dissertation-v1',
            description: 'Dissertation bibliography fixtures',
            tier: 'REAL_DISSERTATION',
            reviewStatus: 'HUMAN_REVIEWED',
            reviewer: 'Dr. Persianist',
            reviewedAt: '2026-10-04'
          },
          cases: []
        };

        const manifestData = {
          id: 'dissertation-v1',
          version: '1.0.0',
          description: 'Full dissertation corpus manifest',
          tier: 'REAL_DISSERTATION',
          reviewStatus: 'HUMAN_REVIEWED',
          reviewer: 'Dr. Persianist',
          reviewedAt: '2026-10-04',
          single: 'custom.dissertation.single.json',
          bibliography: 'custom.dissertation.bib.json'
        };

        fs.writeFileSync(customSingleFile, JSON.stringify(singleData, null, 2));
        fs.writeFileSync(customBibFile, JSON.stringify(bibData, null, 2));
        fs.writeFileSync(manifestFile, JSON.stringify(manifestData, null, 2));

        const result = runCorpusValidation({
          manifestPath: manifestFile,
          releaseTarget: 'RC'
        });

        expect(result.success).toBe(true);
        expect(result.gateResult.safetyPassed).toBe(true);
        expect(gateResultIsRcReady(result.gateResult)).toBe(true);
        expect(result.metrics.single.total).toBe(1);
        expect(result.metrics.bibliography.total).toBe(0);
        expect(result.report).toContain('Scholarly Corpus Validation — dissertation-v1');
        expect(result.report).toContain('Tier:          REAL_DISSERTATION');
        expect(result.report).toContain('Review Status: HUMAN_REVIEWED');
        expect(result.report).toContain('Safety Gate:              PASS');
        expect(result.report).toContain('Requested Target:         RC');
        expect(result.report).toContain('Target Satisfaction:      PASS');
        expect(result.report).toContain('Readiness State:          RC_READY');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('returns success=false when default pilot corpus is evaluated targeting RC (20.1)', () => {
      const result = runCorpusValidation({ releaseTarget: 'RC' });
      expect(result.success).toBe(false);
      expect(result.gateResult.safetyPassed).toBe(true);
      expect(result.gateResult.targetSatisfied).toBe(false);
      expect(result.gateResult.readiness).toBe('REAL_CORPUS_REQUIRED');
      expect(result.report).toContain('Safety Gate:              PASS');
      expect(result.report).toContain('Requested Target:         RC');
      expect(result.report).toContain('Target Satisfaction:      FAIL');
      expect(result.report).toContain('Readiness State:          REAL_CORPUS_REQUIRED');
    });
  });

  describe('Full Pilot Corpus Validation Runner', () => {
    it('executes the full reviewed pilot corpus hermetically with zero safety violations', () => {
      const { success, report, gateResult, metrics } = runCorpusValidation();
      expect(success).toBe(true);
      expect(gateResult.safetyPassed).toBe(true);
      expect(gateResult.targetSatisfied).toBe(true);
      expect(gateResult.readiness).toBe('PILOT_PASS');
      expect(metrics.total).toBe(49);
      expect(metrics.single.total).toBe(46);
      expect(metrics.bibliography.total).toBe(3);
      expect(metrics.falseAuthoritative).toBe(0);
      expect(metrics.underBlocked).toBe(0);
      expect(metrics.invalidGoldCases).toBe(0);
      expect(metrics.issueTypeMismatch).toBe(0);
      expect(metrics.safeBehaviorRate).toBe(1.0);
      expect(report).toContain('Scholarly Corpus Validation — pilot-v1 (1.0.0)');
      expect(report).toContain('Single corpus:       pilot.single / 46 cases');
      expect(report).toContain('Bibliography corpus: pilot.bibliography / 3 cases');
      expect(report).toContain('FALSE AUTHORITATIVE:    0  ✓');
      expect(report).toContain('UNDER-BLOCKED:          0  ✓');
      expect(report).toContain('Safety Gate:              PASS');
      expect(report).toContain('Requested Target:         PILOT');
      expect(report).toContain('Target Satisfaction:      PASS');
      expect(report).toContain('Readiness State:          PILOT_PASS');
    });
  });
});

function gateResultIsRcReady(gateResult: any): boolean {
  return gateResult.readiness === 'RC_READY' && gateResult.targetSatisfied === true;
}
