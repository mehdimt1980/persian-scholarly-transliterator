import { describe, expect, it } from 'vitest';
import { transliterate } from '../engine';
import { validateManualTransliteration } from './validation';
import { ReviewDecision } from './types';
import { LexicalEntry } from '../lexicon/types';
import { LexiconRepository } from '../lexicon/repository';

describe('Human Review and Override Workflow', () => {
  describe('Structural Safety Validator for Manual Canonical Overrides', () => {
    it('accepts valid transliteration with scholarly diacritics', () => {
      const validStrings = [
        'mashrūṭa-khvāhī',
        'ā ī ū ḥ ṣ ṭ ẓ ż ʿ ʾ',
        'tihrān',
        'ʿulamā-yi aʿlām'
      ];
      for (const str of validStrings) {
        const result = validateManualTransliteration(str);
        expect(result.valid).toBe(true);
        expect(result.normalized).toBe(str);
      }
    });

    it('rejects empty or whitespace-only inputs', () => {
      expect(validateManualTransliteration('').valid).toBe(false);
      expect(validateManualTransliteration('   ').valid).toBe(false);
      expect(validateManualTransliteration(undefined).valid).toBe(false);
    });

    it('rejects Persian and Arabic script in canonical transliteration', () => {
      expect(validateManualTransliteration('مشروطه').valid).toBe(false);
      expect(validateManualTransliteration('mashrūṭa مشروطه').valid).toBe(false);
      expect(validateManualTransliteration('ء').valid).toBe(false);
    });

    it('rejects control characters and newlines', () => {
      expect(validateManualTransliteration('mashrūṭa\nkhvāhī').valid).toBe(false);
      expect(validateManualTransliteration('test\u0000').valid).toBe(false);
      expect(validateManualTransliteration('test\rline').valid).toBe(false);
    });
  });

  describe('Lexical Ambiguity Resolution and Automatic Evidence Preservation', () => {
    it('produces an explicit review issue for ambiguous token "کرم" and requires review', () => {
      const result = transliterate('کرم');
      expect(result.copyable).toBe(false);
      expect(result.status).toBe('AMBIGUOUS');
      expect(result.reviewIssues.length).toBe(1);
      const issue = result.reviewIssues[0];
      expect(issue.type).toBe('LEXICAL_AMBIGUITY');
      expect(issue.surface).toBe('کرم');
      expect(issue.alternatives.map((a) => a.canonical)).toEqual(['karam', 'kirm']);
    });

    it('resolves lexical ambiguity when user explicitly selects a reading and preserves automatic evidence', () => {
      const initial = transliterate('کرم');
      const issue = initial.reviewIssues[0];

      const decision: ReviewDecision = {
        issueId: issue.id,
        action: 'SELECT_LEXICAL_READING',
        selectedAlternativeId: 'kirm'
      };

      const resolved = transliterate('کرم', 'ijmes_full', [decision]);
      expect(resolved.copyable).toBe(true);
      expect(resolved.status).toBe('USER_OVERRIDE');
      expect(resolved.output).toBe('kirm');
      expect(resolved.reviewIssues.length).toBe(0);
      expect(resolved.appliedDecisions.length).toBe(1);

      const token = resolved.tokens[0];
      expect(token.status).toBe('USER_OVERRIDE');
      expect(token.canonicalTransliteration).toBe('kirm');
      expect(token.appliedRules.some((r) => r.id === 'USER-LEXICAL-READING-SELECTION')).toBe(true);
      expect(token.appliedRules.find((r) => r.id === 'USER-LEXICAL-READING-SELECTION')?.authority).toBe('user-decision');

      // Requirement #8: Automatic evidence snapshot is fully preserved
      expect(token.automatic.status).toBe('AMBIGUOUS');
      expect(token.automatic.alternatives).toEqual(['karam', 'kirm']);
      expect(token.automatic.canonicalTransliteration).toBeNull();
      expect(token.automaticStatus).toBe('AMBIGUOUS');
    });

    it('returns to ambiguous and non-copyable when decision is cleared', () => {
      const cleared = transliterate('کرم', 'ijmes_full', []);
      expect(cleared.copyable).toBe(false);
      expect(cleared.status).toBe('AMBIGUOUS');
      expect(cleared.reviewIssues.length).toBe(1);
    });
  });

  describe('Unknown Token Manual Canonical Override', () => {
    it('generates an UNKNOWN_TOKEN issue and resolves via manual override', () => {
      const input = 'مشروطهخواهی';
      const initial = transliterate(input);
      expect(initial.copyable).toBe(false);
      expect(initial.status).toBe('UNRESOLVED');
      expect(initial.reviewIssues.length).toBe(1);
      expect(initial.reviewIssues[0].type).toBe('UNKNOWN_TOKEN');

      const issue = initial.reviewIssues[0];
      const decision: ReviewDecision = {
        issueId: issue.id,
        action: 'MANUAL_CANONICAL_OVERRIDE',
        manualCanonicalTransliteration: 'mashrūṭa-khvāhī',
        note: 'Manual scholarly transliteration by reviewer'
      };

      const resolved = transliterate(input, 'ijmes_full', [decision]);
      expect(resolved.copyable).toBe(true);
      expect(resolved.status).toBe('USER_OVERRIDE');
      expect(resolved.output).toBe('mashrūṭa-khvāhī');
      expect(resolved.tokens[0].status).toBe('USER_OVERRIDE');
      expect(resolved.tokens[0].automatic.status).toBe('UNRESOLVED');
      expect(resolved.tokens[0].appliedRules.some((r) => r.id === 'USER-MANUAL-CANONICAL-OVERRIDE')).toBe(true);
      expect(resolved.tokens[0].appliedRules.find((r) => r.id === 'USER-MANUAL-CANONICAL-OVERRIDE')?.authority).toBe('user-decision');
    });

    it('rejects invalid manual override values and keeps issue open', () => {
      const input = 'مشروطهخواهی';
      const initial = transliterate(input);
      const issue = initial.reviewIssues[0];

      const badDecision: ReviewDecision = {
        issueId: issue.id,
        action: 'MANUAL_CANONICAL_OVERRIDE',
        manualCanonicalTransliteration: 'مشروطه' // Arabic script not allowed
      };

      const result = transliterate(input, 'ijmes_full', [badDecision]);
      expect(result.copyable).toBe(false);
      expect(result.reviewIssues.length).toBe(1);
      expect(result.staleDecisions.length).toBe(1);
    });
  });

  describe('Izāfat Candidate Review & Typed State', () => {
    it('generates IZAFAT_CANDIDATE issue for unmarked sequence "تاریخ ایران"', () => {
      const initial = transliterate('تاریخ ایران');
      expect(initial.copyable).toBe(false);
      expect(initial.reviewIssues.length).toBe(1);
      expect(initial.reviewIssues[0].type).toBe('IZAFAT_CANDIDATE');
    });

    it('accepts izāfat and renders -i with typed ACCEPTED disposition', () => {
      const initial = transliterate('تاریخ ایران');
      const issue = initial.reviewIssues[0];

      const decision: ReviewDecision = {
        issueId: issue.id,
        action: 'ACCEPT_IZAFAT'
      };

      const resolved = transliterate('تاریخ ایران', 'ijmes_full', [decision]);
      expect(resolved.copyable).toBe(true);
      expect(resolved.status).toBe('USER_OVERRIDE');
      expect(resolved.output).toBe('tārīkh-i īrān');
      expect(resolved.relations[0].disposition).toBe('ACCEPTED');
      expect(resolved.relations[0].evidence.some((e) => e.rule.id === 'USER-IZAFAT-ACCEPT')).toBe(true);
      expect(resolved.tokens[0].appliedRules.some((r) => r.id === 'IJMES-P-IZAFAT-RENDER')).toBe(true);
    });

    it('rejects izāfat and omits -i while retaining typed REJECTED disposition', () => {
      const initial = transliterate('تاریخ ایران');
      const issue = initial.reviewIssues[0];

      const decision: ReviewDecision = {
        issueId: issue.id,
        action: 'REJECT_IZAFAT'
      };

      const resolved = transliterate('تاریخ ایران', 'ijmes_full', [decision]);
      expect(resolved.copyable).toBe(true);
      expect(resolved.output).toBe('tārīkh īrān');
      expect(resolved.relations[0].disposition).toBe('REJECTED');
      expect(resolved.relations[0].evidence.some((e) => e.rule.id === 'USER-IZAFAT-REJECT')).toBe(true);
    });

    it('rejects stale relation decisions where token indexes match but surfaces changed', () => {
      const inputA = 'تاریخ ایران';
      const initialA = transliterate(inputA);
      const decisionA: ReviewDecision = {
        issueId: initialA.reviewIssues[0].id,
        action: 'ACCEPT_IZAFAT'
      };

      // Input B occupies the exact same token indexes [0] and [2] (with whitespace at [1]) but has different words
      const inputB = 'دولت ایران';
      const resultB = transliterate(inputB, 'ijmes_full', [decisionA]);

      // Decision A should NOT apply to Input B
      expect(resultB.appliedDecisions.length).toBe(0);
      expect(resultB.staleDecisions.length).toBe(1);
      expect(resultB.reviewIssues.length).toBe(1);
      expect(resultB.reviewIssues[0].surface).toBe('دولت ایران');
    });
  });

  describe('Decision Authorization and Alternative Membership Enforcement', () => {
    it('rejects a decision whose action is disallowed by the issue', () => {
      const input = 'تاریخ ایران'; // IZAFAT_CANDIDATE allows only ACCEPT_IZAFAT and REJECT_IZAFAT
      const initial = transliterate(input);
      const issue = initial.reviewIssues[0];

      const disallowedDecision: ReviewDecision = {
        issueId: issue.id,
        action: 'MANUAL_CANONICAL_OVERRIDE',
        manualCanonicalTransliteration: 'invalid-attempt'
      };

      const result = transliterate(input, 'ijmes_full', [disallowedDecision]);
      expect(result.copyable).toBe(false);
      expect(result.appliedDecisions.length).toBe(0);
      expect(result.staleDecisions.length).toBe(1);
      expect(result.reviewIssues.length).toBe(1);
    });

    it('rejects lexical selection that is not in the issue alternatives (e.g. excluded conflict reading)', () => {
      // Vocalized token 'کِرم' conflicts with 'karam' and allows only 'kirm'
      const input = 'کِرم';
      const initial = transliterate(input);
      // 'کِرم' is deterministic single reading 'kirm'
      expect(initial.output).toBe('kirm');

      // For ambiguous 'کرم', issue alternatives are ['karam', 'kirm']
      const ambig = transliterate('کرم');
      const issue = ambig.reviewIssues[0];

      const invalidSelection: ReviewDecision = {
        issueId: issue.id,
        action: 'SELECT_LEXICAL_READING',
        selectedAlternativeId: 'non_existent_reading'
      };

      const result = transliterate('کرم', 'ijmes_full', [invalidSelection]);
      expect(result.copyable).toBe(false);
      expect(result.appliedDecisions.length).toBe(0);
      expect(result.staleDecisions.length).toBe(1);
      expect(result.reviewIssues.length).toBe(1);
    });

    it('rejects morphology selection that is not in the issue alternatives', () => {
      const customLexicon: LexicalEntry[] = [
        { id: 'lex:kitab', surface: 'کتاب', normalized: 'کتاب', category: 'noun', readings: [{ canonical: 'kitāb', confidence: 0.98, source: 'Noun stem' }] },
        { id: 'lex:kitabha-whole', surface: 'کتابها', normalized: 'کتابها', category: 'noun', readings: [{ canonical: 'kitābhā-special', confidence: 0.8, source: 'Whole-word entry' }] }
      ];
      const repo = new LexiconRepository(customLexicon);
      const initial = transliterate('کتابها', 'ijmes_full', [], repo);
      const issue = initial.reviewIssues[0];

      const invalidMorphDecision: ReviewDecision = {
        issueId: issue.id,
        action: 'SELECT_MORPHOLOGY',
        selectedAlternativeId: 'ARBITRARY_NON_ALTERNATIVE'
      };

      const result = transliterate('کتابها', 'ijmes_full', [invalidMorphDecision], repo);
      expect(result.copyable).toBe(false);
      expect(result.appliedDecisions.length).toBe(0);
      expect(result.staleDecisions.length).toBe(1);
      expect(result.reviewIssues.length).toBe(1);
    });
  });

  describe('Structured Review Reasons: Vocalization and Combining Marks', () => {
    it('generates INSUFFICIENT_VOCALIZATION issue when lexical vocalization metadata is missing', () => {
      // 'کِتاب' has explicit kasra on 'ک', but 'کتاب' lexical entry does not have explicit vocalization metadata
      const result = transliterate('کِتاب');
      expect(result.copyable).toBe(false);
      expect(result.status).toBe('UNRESOLVED');
      expect(result.reviewIssues.length).toBe(1);
      expect(result.reviewIssues[0].type).toBe('INSUFFICIENT_VOCALIZATION');
    });

    it('generates UNSUPPORTED_ORTHOGRAPHIC_EVIDENCE issue for tokens with shadda', () => {
      const result = transliterate('کتّاب');
      expect(result.copyable).toBe(false);
      expect(result.status).toBe('UNRESOLVED');
      expect(result.reviewIssues.length).toBe(1);
      expect(result.reviewIssues[0].type).toBe('UNSUPPORTED_ORTHOGRAPHIC_EVIDENCE');
    });
  });

  describe('Token Analysis Map Lookup After Punctuation and Whitespace', () => {
    it('correctly maps token analyses after leading whitespace and structural punctuation', () => {
      const input = '،   کرم';
      const result = transliterate(input);
      expect(result.tokens[0].tokenType).toBe('punctuation');
      expect(result.tokens[1].tokenType).toBe('whitespace');
      expect(result.tokens[2].tokenType).toBe('persian-word');
      expect(result.tokens[2].normalizedSurface).toBe('کرم');
      expect(result.reviewIssues.length).toBe(1);
      expect(result.reviewIssues[0].tokenIndexes).toEqual([2]);
      expect(result.reviewIssues[0].type).toBe('LEXICAL_AMBIGUITY');

      const decision: ReviewDecision = {
        issueId: result.reviewIssues[0].id,
        action: 'SELECT_LEXICAL_READING',
        selectedAlternativeId: 'kirm'
      };

      const resolved = transliterate(input, 'ijmes_full', [decision]);
      expect(resolved.copyable).toBe(true);
      expect(resolved.tokens[2].canonicalTransliteration).toBe('kirm');
      expect(resolved.output).toBe('، kirm');
    });
  });

  describe('Morphology Review without readings[0] Authority and Post-Decision Issue Recomputation', () => {
    it('keeps whole-word morphology branch review-required when whole-word entry has multiple readings', () => {
      const customLexicon: LexicalEntry[] = [
        { id: 'lex:stem', surface: 'کتاب', normalized: 'کتاب', category: 'noun', readings: [{ canonical: 'kitāb', confidence: 0.98, source: 'Stem' }] },
        {
          id: 'lex:whole-multi',
          surface: 'کتابها',
          normalized: 'کتابها',
          category: 'noun',
          readings: [
            { canonical: 'reading_alpha', confidence: 0.5, source: 'Reading Alpha' },
            { canonical: 'reading_beta', confidence: 0.5, source: 'Reading Beta' }
          ]
        }
      ];
      const repo = new LexiconRepository(customLexicon);
      const input = 'کتابها';

      const initial = transliterate(input, 'ijmes_full', [], repo);
      expect(initial.reviewIssues.length).toBe(1);
      expect(initial.reviewIssues[0].type).toBe('MORPHOLOGY_AMBIGUITY');

      // User selects WHOLE_WORD branch
      const decisionWhole: ReviewDecision = {
        issueId: initial.reviewIssues[0].id,
        action: 'SELECT_MORPHOLOGY',
        selectedAlternativeId: 'WHOLE_WORD'
      };

      const postMorph = transliterate(input, 'ijmes_full', [decisionWhole], repo);
      // Morphology competition is resolved, but whole-word lexical ambiguity is recomputed!
      expect(postMorph.copyable).toBe(false);
      expect(postMorph.status).toBe('AMBIGUOUS');
      expect(postMorph.reviewIssues.length).toBe(1);
      expect(postMorph.reviewIssues[0].type).toBe('LEXICAL_AMBIGUITY');
      expect(postMorph.reviewIssues[0].alternatives.map((a) => a.canonical)).toEqual(['reading_alpha', 'reading_beta']);

      // User then resolves the newly exposed lexical ambiguity
      const decisionLexical: ReviewDecision = {
        issueId: postMorph.reviewIssues[0].id,
        action: 'SELECT_LEXICAL_READING',
        selectedAlternativeId: 'reading_beta'
      };

      const finalResolved = transliterate(input, 'ijmes_full', [decisionWhole, decisionLexical], repo);
      expect(finalResolved.copyable).toBe(true);
      expect(finalResolved.status).toBe('USER_OVERRIDE');
      expect(finalResolved.output).toBe('reading_beta');
    });

    it('keeps productive morphology branch review-required when stem has multiple readings', () => {
      const customLexicon: LexicalEntry[] = [
        {
          id: 'lex:stem-multi',
          surface: 'کتاب',
          normalized: 'کتاب',
          category: 'noun',
          readings: [
            { canonical: 'stem_alpha', confidence: 0.5, source: 'Stem Alpha' },
            { canonical: 'stem_beta', confidence: 0.5, source: 'Stem Beta' }
          ]
        },
        { id: 'lex:whole-single', surface: 'کتابها', normalized: 'کتابها', category: 'noun', readings: [{ canonical: 'whole_single', confidence: 0.8, source: 'Whole' }] }
      ];
      const repo = new LexiconRepository(customLexicon);
      const input = 'کتابها';

      const initial = transliterate(input, 'ijmes_full', [], repo);
      const decisionProductive: ReviewDecision = {
        issueId: initial.reviewIssues[0].id,
        action: 'SELECT_MORPHOLOGY',
        selectedAlternativeId: 'PRODUCTIVE_SEGMENTATION'
      };

      const postMorph = transliterate(input, 'ijmes_full', [decisionProductive], repo);
      // Morphology competition is resolved, but stem lexical ambiguity is recomputed!
      expect(postMorph.copyable).toBe(false);
      expect(postMorph.status).toBe('AMBIGUOUS');
      expect(postMorph.reviewIssues.length).toBe(1);
      expect(postMorph.reviewIssues[0].type).toBe('LEXICAL_AMBIGUITY');
    });
  });
});
