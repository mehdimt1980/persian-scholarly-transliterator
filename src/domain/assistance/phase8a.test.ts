import { describe, expect, it } from 'vitest';
import { transliterate } from '../engine';
import {
  AcceptedPhraseDecision,
  PhraseResolution,
  buildPhraseResolverRequest,
  computePhraseRequestFingerprint,
  createAcceptedPhraseDecision,
  resolveUnifiedOutput,
  validatePhraseProviderResolution
} from './index';

describe('Phase 8A: AI Draft-First Transliteration Workspace', () => {
  const unresolvedMultiword = 'تأملی درباره ایران: مکتب تبریز';
  const unresolvedSingleWord = 'واژه';
  const fullyReviewedInput = 'کتاب';

  function createMockResolution(
    result: ReturnType<typeof transliterate>,
    overrides?: Partial<PhraseResolution>
  ): PhraseResolution {
    const request = buildPhraseResolverRequest(result);
    const fingerprint = computePhraseRequestFingerprint(request, 'openai', 'gpt-4o');
    return {
      disposition: 'PROPOSED',
      scholarlyCanonical: 'taʾammulī darbārah-i īrān: maktab-i tabrīz',
      renderedOutput: 'Taʾammulī Darbārah-i Īrān: Maktab-i Tabrīz',
      confidence: 0.88,
      basis: 'CONTEXTUAL_INFERENCE',
      rationale: 'Scholarly context-aware title proposal.',
      assumptions: ['Normalized classical/modern IJMES title reading.'],
      tokenReadings: [],
      warnings: [],
      provider: 'openai',
      model: 'gpt-4o',
      promptVersion: request.promptVersion,
      requestFingerprint: fingerprint,
      ...overrides
    };
  }

  describe('1. Precedence Hierarchy & Presentation Classification', () => {
    it('1. Reviewed deterministic input displays without AI and is verified copyable', () => {
      const result = transliterate(fullyReviewedInput, 'ijmes_full');
      expect(result.copyable).toBe(true);
      expect(result.reviewIssues).toHaveLength(0);

      const unified = resolveUnifiedOutput(result, null, null);
      expect(unified.presentation).toBe('DETERMINISTIC_VERIFIED');
      expect(unified.primary).toBe(result.output);
      expect(unified.isDraft).toBe(false);
      expect(unified.isVerifiedCopyable).toBe(true);
      expect(unified.isHumanAcceptedCopyable).toBe(false);
      expect(unified.isScholarlyAuthority).toBe(true);
      expect(unified.isFinalExportEligible).toBe(true);
      expect(unified.isCopyableDraft).toBe(false);
      expect(unified.badgeTone).toBe('ready');
    });

    it('2. Unknown multiword Persian title triggers AI draft presentation in the main output', () => {
      const result = transliterate(unresolvedMultiword, 'ijmes_citation_title');
      expect(result.copyable).toBe(false);
      expect(result.reviewIssues.length).toBeGreaterThan(0);

      const aiDraft = createMockResolution(result);
      const unified = resolveUnifiedOutput(result, null, aiDraft);

      expect(unified.presentation).toBe('AI_DRAFT');
      expect(unified.primary).toBe(aiDraft.renderedOutput);
      expect(unified.isDraft).toBe(true);
      expect(unified.isCopyableDraft).toBe(true);
      expect(unified.isVerifiedCopyable).toBe(false);
      expect(unified.badgeLabel).toBe('AI Draft — Not Verified');
      expect(unified.badgeTone).toBe('draft');
      expect(unified.activeAiDraft).toBe(aiDraft);
    });

    it('3. Unknown single Persian word also receives AI assistance and displays draft', () => {
      const result = transliterate(unresolvedSingleWord, 'ijmes_citation_title');
      expect(result.copyable).toBe(false);
      expect(result.reviewIssues.length).toBeGreaterThan(0);

      const aiDraft = createMockResolution(result, {
        scholarlyCanonical: 'vāzhah',
        renderedOutput: 'Vāzhah'
      });
      const unified = resolveUnifiedOutput(result, null, aiDraft);

      expect(unified.presentation).toBe('AI_DRAFT');
      expect(unified.primary).toBe('Vāzhah');
      expect(unified.isDraft).toBe(true);
      expect(unified.isCopyableDraft).toBe(true);
      expect(unified.isVerifiedCopyable).toBe(false);
    });

    it('4. Valid AI suggestion appears in main output before human acceptance', () => {
      const result = transliterate(unresolvedMultiword, 'ijmes_citation_title');
      const aiDraft = createMockResolution(result);

      // No human decision has been made yet (null)
      const unified = resolveUnifiedOutput(result, null, aiDraft);
      expect(unified.primary).toBe(aiDraft.renderedOutput);
      expect(unified.activePhraseDecision).toBeNull();
      expect(unified.presentation).toBe('AI_DRAFT');
    });

    it('5. Copy Draft is allowed for provisional drafts but verified copy remains false', () => {
      const result = transliterate(unresolvedMultiword, 'ijmes_citation_title');
      const aiDraft = createMockResolution(result);
      const unified = resolveUnifiedOutput(result, null, aiDraft);

      expect(unified.isCopyableDraft).toBe(true);
      expect(unified.isVerifiedCopyable).toBe(false);
      expect(unified.badgeLabel).toContain('Not Verified');
    });

    it('6. Verified export remains blocked without explicit human review or deterministic resolution', () => {
      const result = transliterate(unresolvedMultiword, 'ijmes_citation_title');
      const aiDraft = createMockResolution(result);
      const unified = resolveUnifiedOutput(result, null, aiDraft);

      expect(unified.isVerifiedCopyable).toBe(false);
      expect(result.copyable).toBe(false);
    });

    it('7. Human accepted decision takes strict precedence over AI draft', () => {
      const result = transliterate(unresolvedMultiword, 'ijmes_citation_title');
      const aiDraft = createMockResolution(result);

      const decision = createAcceptedPhraseDecision(
        aiDraft,
        result,
        aiDraft.scholarlyCanonical!,
        aiDraft.renderedOutput!
      );

      const unified = resolveUnifiedOutput(result, decision, aiDraft);
      expect(unified.presentation).toBe('HUMAN_ACCEPTED');
      expect(unified.primary).toBe(decision.renderedOutput);
      expect(unified.isDraft).toBe(false);
      expect(unified.isVerifiedCopyable).toBe(false);
      expect(unified.isHumanAcceptedCopyable).toBe(true);
      expect(unified.isScholarlyAuthority).toBe(false);
      expect(unified.isFinalExportEligible).toBe(false);
      expect(unified.badgeLabel).toBe('Human Accepted');
      expect(unified.badgeTone).toBe('override');
      expect(unified.activePhraseDecision).toBe(decision);
    });
  });

  describe('2. Draft-with-Review & Uncertainty Handling', () => {
    it('8. REVIEW_REQUIRED with provisional reading is presented as AI_DRAFT_NEEDS_REVIEW', () => {
      const result = transliterate(unresolvedMultiword, 'ijmes_citation_title');
      const aiDraft = createMockResolution(result, {
        disposition: 'REVIEW_REQUIRED',
        scholarlyCanonical: 'taʾammulī darbārah-i īrān',
        renderedOutput: 'Taʾammulī Darbārah-i Īrān',
        warnings: ['Multiple morphology segmentations plausible.']
      });

      const unified = resolveUnifiedOutput(result, null, aiDraft);
      expect(unified.presentation).toBe('AI_DRAFT_NEEDS_REVIEW');
      expect(unified.primary).toBe('Taʾammulī Darbārah-i Īrān');
      expect(unified.isDraft).toBe(true);
      expect(unified.isCopyableDraft).toBe(true);
      expect(unified.isVerifiedCopyable).toBe(false);
      expect(unified.badgeLabel).toBe('AI Draft — Needs Review');
      expect(unified.badgeTone).toBe('review');
    });

    it('9. REVIEW_REQUIRED without provisional reading falls back to UNRESOLVED_NO_DRAFT', () => {
      const result = transliterate(unresolvedMultiword, 'ijmes_citation_title');
      const aiDraft = createMockResolution(result, {
        disposition: 'REVIEW_REQUIRED',
        scholarlyCanonical: null,
        renderedOutput: null,
        warnings: ['Completely unsupported text.']
      });

      const unified = resolveUnifiedOutput(result, null, aiDraft);
      expect(unified.presentation).toBe('UNRESOLVED_NO_DRAFT');
      expect(unified.primary).toBe(result.output);
      expect(unified.isDraft).toBe(false);
      expect(unified.isCopyableDraft).toBe(false);
      expect(unified.isVerifiedCopyable).toBe(false);
    });

    it('10. Unsupported readings (Arabic script in Latin field) are rejected by validator', () => {
      const result = transliterate(unresolvedMultiword, 'ijmes_citation_title');
      const request = buildPhraseResolverRequest(result);

      const validation = validatePhraseProviderResolution(
        {
          disposition: 'PROPOSED',
          scholarlyCanonical: 'مکتب tabrīz',
          renderedOutput: 'مکتب Tabrīz',
          confidence: 0.5,
          basis: 'MODEL_INFERENCE',
          rationale: 'Invalid test reading.',
          assumptions: [],
          tokenReadings: [],
          warnings: []
        },
        request,
        'test-provider',
        'test-model'
      );

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('Persian or Arabic script'))).toBe(true);
    });
  });

  describe('3. Stale Response & Fingerprint Invalidation Protections', () => {
    it('11. Input change invalidates stale AI draft resolution', () => {
      const initialResult = transliterate(unresolvedMultiword, 'ijmes_citation_title');
      const aiDraft = createMockResolution(initialResult);

      // User modifies the input
      const modifiedResult = transliterate(unresolvedMultiword + ' و ادب', 'ijmes_citation_title');
      const unified = resolveUnifiedOutput(modifiedResult, null, aiDraft);

      // The old aiDraft does NOT match modifiedResult's fingerprint
      expect(unified.presentation).toBe('UNRESOLVED_NO_DRAFT');
      expect(unified.primary).toBe(modifiedResult.output);
      expect(unified.activeAiDraft).toBeNull();
    });

    it('12. Profile change invalidates stale AI draft resolution', () => {
      const citationResult = transliterate(unresolvedMultiword, 'ijmes_citation_title');
      const aiDraft = createMockResolution(citationResult);

      // User changes profile to ijmes_full
      const fullResult = transliterate(unresolvedMultiword, 'ijmes_full');
      const unified = resolveUnifiedOutput(fullResult, null, aiDraft);

      // The old citation aiDraft does NOT match fullResult's fingerprint
      expect(unified.presentation).toBe('UNRESOLVED_NO_DRAFT');
      expect(unified.activeAiDraft).toBeNull();
    });

    it('13. Human decision on modified input is rejected as stale', () => {
      const initialResult = transliterate(unresolvedMultiword, 'ijmes_citation_title');
      const aiDraft = createMockResolution(initialResult);
      const decision = createAcceptedPhraseDecision(
        aiDraft,
        initialResult,
        aiDraft.scholarlyCanonical!,
        aiDraft.renderedOutput!
      );

      // Apply to a different input
      const modifiedResult = transliterate('متن کاملا متفاوت', 'ijmes_citation_title');
      const unified = resolveUnifiedOutput(modifiedResult, decision, null);

      expect(unified.presentation).toBe('UNRESOLVED_NO_DRAFT');
      expect(unified.activePhraseDecision).toBeNull();
    });
  });

  describe('4. Human Decision Provenance & Governance', () => {
    it('14. Editing canonical before accepting preserves HUMAN_EDITED_AI_SUGGESTION provenance', () => {
      const result = transliterate(unresolvedMultiword, 'ijmes_citation_title');
      const aiDraft = createMockResolution(result);

      const customCanonical = 'taʾammulī darbāra-i īrān: maktab-i tabrīz';
      const decision = createAcceptedPhraseDecision(
        aiDraft,
        result,
        customCanonical
      );

      expect(decision.acceptance).toBe('HUMAN_EDITED_AI_SUGGESTION');
      expect(decision.scholarlyCanonical).toBe(customCanonical);
      expect(decision.provider).toBe('openai');
      expect(decision.model).toBe('gpt-4o');

      const unified = resolveUnifiedOutput(result, decision, aiDraft);
      expect(unified.presentation).toBe('HUMAN_ACCEPTED');
      expect(unified.scholarlyCanonical).toBe(customCanonical);
    });

    it('15. Provider failure leaves deterministic analysis fully functional', () => {
      const result = transliterate(unresolvedMultiword, 'ijmes_citation_title');
      // AI failed (null resolution)
      const unified = resolveUnifiedOutput(result, null, null);

      expect(unified.presentation).toBe('UNRESOLVED_NO_DRAFT');
      expect(unified.primary).toBe(result.output);
      expect(result.tokens.length).toBeGreaterThan(0);
      expect(result.reviewIssues.length).toBeGreaterThan(0);
    });
  });
});
