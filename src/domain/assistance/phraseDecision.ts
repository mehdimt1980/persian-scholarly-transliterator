import type { TransliterationResult } from '../types';
import { validateManualTransliteration } from '../review/validation';
import { buildPhraseResolverRequest } from './buildPhraseResolverRequest';
import {
  checkAcceptedPhraseApplicability,
  computePhraseRequestFingerprint
} from './phraseIdentity';
import type {
  AcceptedPhraseDecision,
  PhraseResolution
} from './phraseTypes';

export function createAcceptedPhraseDecision(
  resolution: PhraseResolution,
  result: TransliterationResult,
  scholarlyCanonical: string,
  renderedOutput: string,
  acceptedAt: string = new Date().toISOString()
): AcceptedPhraseDecision {
  if (resolution.disposition !== 'PROPOSED' || !resolution.scholarlyCanonical || !resolution.renderedOutput) {
    throw new Error('Only a complete PROPOSED phrase resolution can be accepted.');
  }

  const canonicalValidation = validateManualTransliteration(scholarlyCanonical);
  if (!canonicalValidation.valid || !canonicalValidation.normalized) {
    throw new Error(canonicalValidation.error ?? 'Invalid scholarly canonical transliteration.');
  }

  const renderedValidation = validateManualTransliteration(renderedOutput);
  if (!renderedValidation.valid || !renderedValidation.normalized) {
    throw new Error(renderedValidation.error ?? 'Invalid rendered output.');
  }

  const currentRequest = buildPhraseResolverRequest(result, resolution.promptVersion);
  const currentFingerprint = computePhraseRequestFingerprint(
    currentRequest,
    resolution.provider,
    resolution.model
  );

  if (currentFingerprint !== resolution.requestFingerprint) {
    throw new Error('The phrase suggestion is stale. Request a fresh phrase analysis before accepting it.');
  }

  const edited =
    canonicalValidation.normalized !== resolution.scholarlyCanonical ||
    renderedValidation.normalized !== resolution.renderedOutput;

  return {
    source: 'AI_ASSISTED_PHRASE',
    acceptance: edited
      ? 'HUMAN_EDITED_AI_SUGGESTION'
      : 'HUMAN_ACCEPTED_AI_SUGGESTION',
    originalInput: result.originalInput,
    normalizedInput: result.normalizedInput,
    profile: result.profile,
    scholarlyCanonical: canonicalValidation.normalized,
    renderedOutput: renderedValidation.normalized,
    provider: resolution.provider,
    model: resolution.model,
    promptVersion: resolution.promptVersion,
    requestFingerprint: resolution.requestFingerprint,
    modelConfidence: resolution.confidence,
    acceptedAt
  };
}

export interface SelectedTransliteration {
  activePhraseDecision: AcceptedPhraseDecision | null;
  primary: string;
  profileRendering: string | null;
  copyable: boolean;
  status: TransliterationResult['status'];
}

export function resolveSelectedTransliteration(
  result: TransliterationResult,
  acceptedPhraseDecision: AcceptedPhraseDecision | null
): SelectedTransliteration {
  const activePhraseDecision =
    acceptedPhraseDecision && checkAcceptedPhraseApplicability(acceptedPhraseDecision, result).applicable
      ? acceptedPhraseDecision
      : null;

  return {
    activePhraseDecision,
    primary: activePhraseDecision?.scholarlyCanonical ?? result.output,
    profileRendering: activePhraseDecision?.renderedOutput ?? null,
    copyable: Boolean(activePhraseDecision) || result.copyable,
    status: activePhraseDecision ? 'USER_OVERRIDE' : result.status
  };
}