/**
 * Pure presentation selection and view model for Phase 8A: AI Draft-First Transliteration Workspace.
 *
 * Precedence Policy:
 *   Applicable human-accepted result (HUMAN_ACCEPTED)
 *       ↓
 *   Existing fully resolved deterministic result (DETERMINISTIC_VERIFIED)
 *       ↓
 *   Current validated AI draft (AI_DRAFT or AI_DRAFT_NEEDS_REVIEW)
 *       ↓
 *   Explicit unresolved / no-draft state (UNRESOLVED_NO_DRAFT)
 *
 * Scholarly Invariant:
 *   Presentation classification is distinct from underlying domain authority statuses.
 *   AI draft is NEVER automatically authoritative or gold.
 */

import type { ResultStatus, TransliterationResult } from '../types';
import { checkAcceptedPhraseApplicability, computePhraseRequestFingerprint } from './phraseIdentity';
import { buildPhraseResolverRequest } from './buildPhraseResolverRequest';
import type { AcceptedPhraseDecision, PhraseResolution } from './phraseTypes';

export type OutputPresentation =
  | 'DETERMINISTIC_VERIFIED'
  | 'AI_DRAFT'
  | 'AI_DRAFT_NEEDS_REVIEW'
  | 'HUMAN_ACCEPTED'
  | 'UNRESOLVED_NO_DRAFT';

export interface UnifiedOutputViewModel {
  /** High-level presentation classification for UI badges and copying controls */
  presentation: OutputPresentation;

  /** Primary text to display in the main transliteration output panel */
  primary: string;

  /** Canonical scholarly transliteration (if available) */
  scholarlyCanonical: string | null;

  /** Profile-rendered output (if available) */
  profileRendering: string | null;

  /** True if the displayed output is a provisional AI draft */
  isDraft: boolean;

  /** True if the user can copy the provisional draft */
  isCopyableDraft: boolean;

  /** True if the output is verified/reviewed and copyable as scholarly authority */
  isVerifiedCopyable: boolean;

  /** Active applicable human phrase decision, if any */
  activePhraseDecision: AcceptedPhraseDecision | null;

  /** Active applicable AI draft resolution, if any */
  activeAiDraft: PhraseResolution | null;

  /** Underlying deterministic status or USER_OVERRIDE */
  status: ResultStatus | 'USER_OVERRIDE';

  /** Human-readable status badge label */
  badgeLabel: string;

  /** Semantic badge styling tone */
  badgeTone: 'ready' | 'draft' | 'review' | 'blocked' | 'override';

  /** Contextual guidance / warning note */
  noticeText: string | null;
}

/**
 * Pure function determining the primary output and presentation view model according
 * to the strict 4-tier precedence hierarchy.
 */
export function resolveUnifiedOutput(
  result: TransliterationResult,
  acceptedPhraseDecision: AcceptedPhraseDecision | null,
  aiDraft: PhraseResolution | null
): UnifiedOutputViewModel {
  // 1. Applicable human-accepted result (highest precedence)
  if (acceptedPhraseDecision) {
    const applicability = checkAcceptedPhraseApplicability(acceptedPhraseDecision, result);
    if (applicability.applicable) {
      return {
        presentation: 'HUMAN_ACCEPTED',
        primary: acceptedPhraseDecision.renderedOutput,
        scholarlyCanonical: acceptedPhraseDecision.scholarlyCanonical,
        profileRendering: acceptedPhraseDecision.renderedOutput,
        isDraft: false,
        isCopyableDraft: false,
        isVerifiedCopyable: true,
        activePhraseDecision: acceptedPhraseDecision,
        activeAiDraft: null,
        status: 'USER_OVERRIDE',
        badgeLabel: 'Human Accepted',
        badgeTone: 'override',
        noticeText: 'Context-aware phrase proposal accepted by human reviewer.'
      };
    }
  }

  // 2. Existing fully resolved deterministic result
  if (result.copyable && result.output.length > 0 && result.reviewIssues.length === 0) {
    return {
      presentation: 'DETERMINISTIC_VERIFIED',
      primary: result.output,
      scholarlyCanonical: result.tokens.every((t) => t.canonicalTransliteration !== null)
        ? result.tokens.map((t) => t.canonicalTransliteration ?? t.rendered).join('')
        : null,
      profileRendering: result.output,
      isDraft: false,
      isCopyableDraft: false,
      isVerifiedCopyable: true,
      activePhraseDecision: null,
      activeAiDraft: null,
      status: result.status,
      badgeLabel: result.status === 'LEXICON_RESOLVED' || result.status === 'DETERMINISTIC'
        ? 'Verified'
        : 'Resolved',
      badgeTone: 'ready',
      noticeText: null
    };
  }

  // 3. Current validated AI draft (matching current request fingerprint)
  if (aiDraft && aiDraft.scholarlyCanonical && aiDraft.renderedOutput) {
    const currentRequest = buildPhraseResolverRequest(result, aiDraft.promptVersion);
    const expectedFingerprint = computePhraseRequestFingerprint(
      currentRequest,
      aiDraft.provider,
      aiDraft.model
    );

    if (aiDraft.requestFingerprint === expectedFingerprint) {
      if (aiDraft.disposition === 'PROPOSED') {
        return {
          presentation: 'AI_DRAFT',
          primary: aiDraft.renderedOutput,
          scholarlyCanonical: aiDraft.scholarlyCanonical,
          profileRendering: aiDraft.renderedOutput,
          isDraft: true,
          isCopyableDraft: true,
          isVerifiedCopyable: false,
          activePhraseDecision: null,
          activeAiDraft: aiDraft,
          status: result.status,
          badgeLabel: 'AI Draft — Not Verified',
          badgeTone: 'draft',
          noticeText: 'AI Draft — Not Verified · Provisional context-aware reading (not scholarly reviewed authority).'
        };
      }

      if (aiDraft.disposition === 'REVIEW_REQUIRED') {
        return {
          presentation: 'AI_DRAFT_NEEDS_REVIEW',
          primary: aiDraft.renderedOutput,
          scholarlyCanonical: aiDraft.scholarlyCanonical,
          profileRendering: aiDraft.renderedOutput,
          isDraft: true,
          isCopyableDraft: true,
          isVerifiedCopyable: false,
          activePhraseDecision: null,
          activeAiDraft: aiDraft,
          status: result.status,
          badgeLabel: 'AI Draft — Needs Review',
          badgeTone: 'review',
          noticeText: 'AI Draft — Needs Review · Contains model-identified uncertainty or multiple plausible readings.'
        };
      }
    }
  }

  // 4. Explicit unresolved / no-draft state
  const isEvidenceProposalOnly =
    result.tokens.some((t) => t.evidenceDerivedProposal && t.status === 'UNRESOLVED');

  const defaultNotice = isEvidenceProposalOnly
    ? `${result.tokens.filter((t) => t.evidenceDerivedProposal && t.status === 'UNRESOLVED').length} evidence-derived reading(s) shown · review required before final copying.`
    : result.reviewIssues.length > 0
      ? 'Human review needed. Ambiguous or unresolved material is intentionally held for review before final copy.'
      : null;

  return {
    presentation: 'UNRESOLVED_NO_DRAFT',
    primary: result.output,
    scholarlyCanonical: null,
    profileRendering: null,
    isDraft: false,
    isCopyableDraft: false,
    isVerifiedCopyable: false,
    activePhraseDecision: null,
    activeAiDraft: null,
    status: result.status,
    badgeLabel: result.status === 'AMBIGUOUS' ? 'Review needed' : 'Unresolved',
    badgeTone: result.status === 'AMBIGUOUS' ? 'review' : 'blocked',
    noticeText: defaultNotice
  };
}
