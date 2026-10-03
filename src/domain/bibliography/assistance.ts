import {
  AssistedCandidate,
  AssistedResolution,
  AssistedResolverRequest,
  candidateToReviewDecision,
  validateAssistedApplicability
} from '../assistance';
import { ReviewIssue } from '../review/types';
import {
  BibliographyAssistanceState,
  BibliographyFieldPath,
  BibliographyReviewDecision
} from './types';

export interface BibliographyAssistedApplicabilityResult {
  applicable: boolean;
  reason?:
    | 'BIBLIOGRAPHY_SCOPE_MISMATCH'
    | 'STALE_ISSUE'
    | 'REQUEST_CHANGED'
    | 'CANDIDATE_NOT_IN_RESOLUTION'
    | 'ACTION_NOT_ALLOWED'
    | 'ISSUE_MISMATCH';
  fingerprint?: string;
  expectedFingerprint?: string;
}

export function validateBibliographyAssistanceApplicability(
  state: BibliographyAssistanceState,
  currentRecordId: string,
  currentFieldPath: BibliographyFieldPath,
  currentIssue: ReviewIssue,
  currentRequest: AssistedResolverRequest | null,
  candidateOrId: string | AssistedCandidate
): BibliographyAssistedApplicabilityResult {
  if (
    state.recordId !== currentRecordId ||
    state.fieldPath !== currentFieldPath ||
    state.issueId !== currentIssue.id ||
    state.resolution.issueId !== currentIssue.id
  ) {
    return {
      applicable: false,
      reason: 'BIBLIOGRAPHY_SCOPE_MISMATCH'
    };
  }

  return validateAssistedApplicability(
    candidateOrId,
    state.resolution,
    currentIssue,
    currentRequest
  );
}

export function candidateToBibliographyReviewDecision(
  candidateOrId: string | AssistedCandidate,
  assistanceState: BibliographyAssistanceState,
  currentRecordId: string,
  currentFieldPath: BibliographyFieldPath,
  currentIssue: ReviewIssue,
  currentRequest: AssistedResolverRequest | null
): BibliographyReviewDecision {
  const applicability = validateBibliographyAssistanceApplicability(
    assistanceState,
    currentRecordId,
    currentFieldPath,
    currentIssue,
    currentRequest,
    candidateOrId
  );

  if (!applicability.applicable) {
    throw new Error(
      `Cannot apply assisted candidate to bibliography record: ${applicability.reason || 'Invalid scope or stale suggestion.'}`
    );
  }

  const decision = candidateToReviewDecision(
    candidateOrId,
    assistanceState.resolution,
    currentIssue,
    currentRequest
  );

  return {
    recordId: currentRecordId,
    fieldPath: currentFieldPath,
    decision
  };
}
