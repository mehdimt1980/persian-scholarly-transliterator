import type { TransliterationResult } from '../types';
import { renderCanonicalForProfile } from '../profiles';
import { validateManualTransliteration } from '../review/validation';
import { buildPhraseResolverRequest } from './buildPhraseResolverRequest';
import {
  checkAcceptedPhraseApplicability,
  computePhraseReadingFingerprintV2,
  computePhraseReadingFingerprintV3,
  computePhraseRequestFingerprint
} from './phraseIdentity';
import type {
  AcceptedPhraseDecision,
  PhraseContextKind,
  PhraseResolution
} from './phraseTypes';

export function createAcceptedPhraseDecision(
  resolution: PhraseResolution,
  result: TransliterationResult,
  scholarlyCanonical: string,
  renderedOutput?: string,
  acceptedAt: string = new Date().toISOString(),
  contextKind?: PhraseContextKind
): AcceptedPhraseDecision {
  if (!resolution.scholarlyCanonical) {
    throw new Error('Only a phrase resolution with a valid scholarly canonical transliteration can be accepted.');
  }

  const canonicalValidation = validateManualTransliteration(scholarlyCanonical);
  if (!canonicalValidation.valid || !canonicalValidation.normalized) {
    throw new Error(canonicalValidation.error ?? 'Invalid scholarly canonical transliteration.');
  }

  const derivedRendered = renderCanonicalForProfile(
    canonicalValidation.normalized,
    result.profile
  );

  const currentRequest = resolution.readingIdentityVersion
    ? buildPhraseResolverRequest(result, resolution.promptVersion, contextKind)
    : buildPhraseResolverRequest(result, resolution.promptVersion);
  const currentFingerprint = resolution.readingIdentityVersion === '3'
    ? computePhraseReadingFingerprintV3(currentRequest, resolution.provider, resolution.model)
    : resolution.readingIdentityVersion === '2'
      ? computePhraseReadingFingerprintV2(currentRequest, resolution.provider, resolution.model)
      : computePhraseRequestFingerprint(currentRequest, resolution.provider, resolution.model);
  const storedFingerprint = resolution.readingIdentityVersion
    ? resolution.readingFingerprint
    : resolution.requestFingerprint;

  if (!storedFingerprint || currentFingerprint !== storedFingerprint) {
    throw new Error('The phrase suggestion is stale. Request a fresh phrase analysis before accepting it.');
  }

  const edited = canonicalValidation.normalized !== resolution.scholarlyCanonical;

  return {
    source: 'AI_ASSISTED_PHRASE',
    acceptance: edited
      ? 'HUMAN_EDITED_AI_SUGGESTION'
      : 'HUMAN_ACCEPTED_AI_SUGGESTION',
    originalInput: result.originalInput,
    normalizedInput: result.normalizedInput,
    profile: result.profile,
    scholarlyCanonical: canonicalValidation.normalized,
    renderedOutput: derivedRendered,
    provider: resolution.provider,
    model: resolution.model,
    promptVersion: resolution.promptVersion,
    requestFingerprint: resolution.requestFingerprint,
    readingFingerprint: resolution.readingFingerprint ?? computePhraseReadingFingerprintV3(
      currentRequest,
      resolution.provider,
      resolution.model
    ),
    readingIdentityVersion: resolution.readingIdentityVersion ?? '3',
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
    primary: activePhraseDecision ? activePhraseDecision.renderedOutput : result.output,
    profileRendering: activePhraseDecision?.renderedOutput ?? null,
    copyable: Boolean(activePhraseDecision) || result.copyable,
    status: activePhraseDecision ? 'USER_OVERRIDE' : result.status
  };
}
