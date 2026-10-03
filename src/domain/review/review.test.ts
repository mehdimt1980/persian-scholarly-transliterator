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

  describe('Lexical Ambiguity Resolution', () => {
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

    it('resolves lexical ambiguity when user explicitly selects a reading', () => {
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
      expect(token.automaticStatus).toBe('AMBIGUOUS');
      expect(token.canonicalTransliteration).toBe('kirm');
      expect(token.appliedRules.some((r) => r.id === 'USER-LEXICAL-READING-SELECTION')).toBe(true);
      expect(token.appliedRules.find((r) => r.id === 'USER-LEXICAL-READING-SELECTION')?.authority).toBe('user-decision');
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
      expect(resolved.tokens[0].automaticStatus).toBe('UNRESOLVED');
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

  describe('Izāfat Candidate Review', () => {
    it('generates IZAFAT_CANDIDATE issue for unmarked sequence "تاریخ ایران"', () => {
      const initial = transliterate('تاریخ ایران');
      expect(initial.copyable).toBe(false);
      expect(initial.reviewIssues.length).toBe(1);
      expect(initial.reviewIssues[0].type).toBe('IZAFAT_CANDIDATE');
    });

    it('accepts izāfat and renders -i with human confirmation provenance', () => {
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
      expect(resolved.relations[0].evidence.some((e) => e.rule.id === 'USER-IZAFAT-ACCEPT')).toBe(true);
      expect(resolved.tokens[0].appliedRules.some((r) => r.id === 'IJMES-P-IZAFAT-RENDER')).toBe(true);
    });

    it('rejects izāfat and omits -i while retaining rejection decision', () => {
      const initial = transliterate('تاریخ ایران');
      const issue = initial.reviewIssues[0];

      const decision: ReviewDecision = {
        issueId: issue.id,
        action: 'REJECT_IZAFAT'
      };

      const resolved = transliterate('تاریخ ایران', 'ijmes_full', [decision]);
      expect(resolved.copyable).toBe(true);
      expect(resolved.output).toBe('tārīkh īrān');
      expect(resolved.relations[0].evidence.some((e) => e.rule.id === 'USER-IZAFAT-REJECT')).toBe(true);
    });
  });

  describe('Multiple Issues and Copyability Contract', () => {
    it('remains non-copyable when only 1 of 2 issues is resolved', () => {
      const input = 'کرم تاریخ ایران'; // 1 lexical ambiguity ('کرم') + 1 izafat candidate ('تاریخ ایران')
      const initial = transliterate(input);
      expect(initial.copyable).toBe(false);
      expect(initial.reviewIssues.length).toBe(2);

      const decision1: ReviewDecision = {
        issueId: initial.reviewIssues[0].id,
        action: 'SELECT_LEXICAL_READING',
        selectedAlternativeId: 'kirm'
      };

      const partial = transliterate(input, 'ijmes_full', [decision1]);
      expect(partial.copyable).toBe(false);
      expect(partial.reviewIssues.length).toBe(1);
      expect(partial.appliedDecisions.length).toBe(1);

      const decision2: ReviewDecision = {
        issueId: partial.reviewIssues[0].id,
        action: 'ACCEPT_IZAFAT'
      };

      const full = transliterate(input, 'ijmes_full', [decision1, decision2]);
      expect(full.copyable).toBe(true);
      expect(full.reviewIssues.length).toBe(0);
      expect(full.output).toBe('kirm tārīkh-i īrān');
    });
  });

  describe('Stale Decision Protection', () => {
    it('safely ignores a decision created for a different input or shifted token', () => {
      const inputA = 'کرم';
      const resultA = transliterate(inputA);
      const decisionA: ReviewDecision = {
        issueId: resultA.reviewIssues[0].id,
        action: 'SELECT_LEXICAL_READING',
        selectedAlternativeId: 'kirm'
      };

      // Apply decisionA to completely different input
      const inputB = 'کتاب';
      const resultB = transliterate(inputB, 'ijmes_full', [decisionA]);
      expect(resultB.output).toBe('kitāb');
      expect(resultB.status).toBe('LEXICON_RESOLVED');
      expect(resultB.appliedDecisions.length).toBe(0);
      expect(resultB.staleDecisions.length).toBe(1);
    });
  });

  describe('Morphology Competition Resolution', () => {
    it('allows human reviewer to choose between whole-word and productive segmentation', () => {
      const customLexicon: LexicalEntry[] = [
        {
          id: 'lex:kitab',
          surface: 'کتاب',
          normalized: 'کتاب',
          category: 'noun',
          readings: [{ canonical: 'kitāb', confidence: 0.98, source: 'Noun stem' }]
        },
        {
          id: 'lex:kitabha-whole',
          surface: 'کتابها',
          normalized: 'کتابها',
          category: 'noun',
          readings: [{ canonical: 'kitābhā-special', confidence: 0.8, source: 'Whole-word lexical entry' }]
        }
      ];

      const repo = new LexiconRepository(customLexicon);
      const input = 'کتابها';

      // Automatic analysis should detect competition
      const initial = transliterate(input, 'ijmes_full', [], repo);
      expect(initial.copyable).toBe(false);
      expect(initial.status).toBe('AMBIGUOUS');
      expect(initial.reviewIssues.length).toBe(1);
      expect(initial.reviewIssues[0].type).toBe('MORPHOLOGY_AMBIGUITY');

      // Reviewer selects whole-word
      const decisionWhole: ReviewDecision = {
        issueId: initial.reviewIssues[0].id,
        action: 'SELECT_MORPHOLOGY',
        selectedAlternativeId: 'WHOLE_WORD'
      };

      const resolvedWhole = transliterate(input, 'ijmes_full', [decisionWhole], repo);
      expect(resolvedWhole.copyable).toBe(true);
      expect(resolvedWhole.status).toBe('USER_OVERRIDE');
      expect(resolvedWhole.output).toBe('kitābhā-special');
      expect(resolvedWhole.tokens[0].appliedRules.some((r) => r.id === 'USER-MORPHOLOGY-SELECTION')).toBe(true);

      // Reviewer selects productive segmentation
      const decisionProductive: ReviewDecision = {
        issueId: initial.reviewIssues[0].id,
        action: 'SELECT_MORPHOLOGY',
        selectedAlternativeId: 'PRODUCTIVE_SEGMENTATION'
      };

      const resolvedProductive = transliterate(input, 'ijmes_full', [decisionProductive], repo);
      expect(resolvedProductive.copyable).toBe(true);
      expect(resolvedProductive.status).toBe('USER_OVERRIDE');
      expect(resolvedProductive.output).toBe('kitāb-hā');
      expect(resolvedProductive.tokens[0].appliedRules.some((r) => r.id === 'USER-MORPHOLOGY-SELECTION')).toBe(true);
    });
  });
});
