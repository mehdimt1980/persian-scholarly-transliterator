import { ReviewDecision, ReviewIssue } from '../review/types';
import { computeRequestFingerprint } from './suggestionIdentity';
import {
  AssistedApplicabilityResult,
  AssistedCandidate,
  AssistedResolution,
  AssistedResolverRequest
} from './types';

export function validateAssistedApplicability(
  candidateOrId: string | AssistedCandidate,
  resolution: AssistedResolution,
  issue: ReviewIssue,
  currentRequest: AssistedResolverRequest | null
): AssistedApplicabilityResult {
  // 1. Issue ID match
  if (issue.id !== resolution.issueId) {
    return {
      applicable: false,
      reason: 'ISSUE_MISMATCH'
    };
  }

  // 2. Candidate membership in resolution & spoof check
  const candidateId = typeof candidateOrId === 'string' ? candidateOrId : candidateOrId.id;
  const storedCandidate = resolution.candidates.find((c) => c.id === candidateId);
  if (!storedCandidate) {
    return {
      applicable: false,
      reason: 'CANDIDATE_NOT_IN_RESOLUTION'
    };
  }

  // If caller provided a full candidate object, verify complete semantic parity with stored candidate
  if (typeof candidateOrId !== 'string') {
    if (
      candidateOrId.kind !== storedCandidate.kind ||
      candidateOrId.rank !== storedCandidate.rank ||
      candidateOrId.basis !== storedCandidate.basis
    ) {
      return {
        applicable: false,
        reason: 'CANDIDATE_NOT_IN_RESOLUTION'
      };
    }

    if (storedCandidate.kind === 'EXISTING_LEXICAL_READING') {
      const caller = candidateOrId as typeof storedCandidate;
      if (
        caller.alternativeId !== storedCandidate.alternativeId ||
        (caller.canonical ?? null) !== (storedCandidate.canonical ?? null)
      ) {
        return {
          applicable: false,
          reason: 'CANDIDATE_NOT_IN_RESOLUTION'
        };
      }
    } else if (storedCandidate.kind === 'MANUAL_CANONICAL') {
      const caller = candidateOrId as typeof storedCandidate;
      if (caller.canonical !== storedCandidate.canonical) {
        return {
          applicable: false,
          reason: 'CANDIDATE_NOT_IN_RESOLUTION'
        };
      }
    } else if (storedCandidate.kind === 'IZAFAT_DECISION') {
      const caller = candidateOrId as typeof storedCandidate;
      if (caller.relationDecision !== storedCandidate.relationDecision) {
        return {
          applicable: false,
          reason: 'CANDIDATE_NOT_IN_RESOLUTION'
        };
      }
    } else if (storedCandidate.kind === 'MORPHOLOGY_BRANCH') {
      const caller = candidateOrId as typeof storedCandidate;
      if (
        caller.morphologyBranch !== storedCandidate.morphologyBranch ||
        (caller.canonical ?? null) !== (storedCandidate.canonical ?? null)
      ) {
        return {
          applicable: false,
          reason: 'CANDIDATE_NOT_IN_RESOLUTION'
        };
      }
    }
  }

  // 3. Current request existence
  if (!currentRequest || currentRequest.issueId !== issue.id) {
    return {
      applicable: false,
      reason: 'STALE_ISSUE'
    };
  }

  // 4. Request fingerprint authority check
  const currentFingerprint = computeRequestFingerprint(
    currentRequest,
    resolution.provider,
    resolution.model
  );
  if (currentFingerprint !== resolution.requestFingerprint) {
    return {
      applicable: false,
      reason: 'REQUEST_CHANGED',
      fingerprint: resolution.requestFingerprint,
      expectedFingerprint: currentFingerprint
    };
  }

  // 5. Allowed actions check on stored candidate
  if (storedCandidate.kind === 'EXISTING_LEXICAL_READING') {
    if (!issue.allowedActions.includes('SELECT_LEXICAL_READING')) {
      return { applicable: false, reason: 'ACTION_NOT_ALLOWED' };
    }
  } else if (storedCandidate.kind === 'MANUAL_CANONICAL') {
    if (!issue.allowedActions.includes('MANUAL_CANONICAL_OVERRIDE')) {
      return { applicable: false, reason: 'ACTION_NOT_ALLOWED' };
    }
  } else if (storedCandidate.kind === 'IZAFAT_DECISION') {
    if (!issue.allowedActions.includes(storedCandidate.relationDecision)) {
      return { applicable: false, reason: 'ACTION_NOT_ALLOWED' };
    }
  } else if (storedCandidate.kind === 'MORPHOLOGY_BRANCH') {
    if (!issue.allowedActions.includes('SELECT_MORPHOLOGY')) {
      return { applicable: false, reason: 'ACTION_NOT_ALLOWED' };
    }
  }

  return { applicable: true };
}

export function candidateToReviewDecision(
  candidateOrId: string | AssistedCandidate,
  resolution: AssistedResolution,
  issue: ReviewIssue,
  currentRequest: AssistedResolverRequest | null
): ReviewDecision {
  const applicability = validateAssistedApplicability(
    candidateOrId,
    resolution,
    issue,
    currentRequest
  );

  if (!applicability.applicable) {
    throw new Error(
      `Cannot apply assisted candidate: ${applicability.reason || 'Suggestion is stale or inapplicable.'}`
    );
  }

  const candidateId = typeof candidateOrId === 'string' ? candidateOrId : candidateOrId.id;
  const candidate = resolution.candidates.find((c) => c.id === candidateId)!;

  const assistanceMetadata = {
    suggestionId: candidate.id,
    provider: resolution.provider,
    model: resolution.model,
    promptVersion: resolution.promptVersion,
    requestFingerprint: resolution.requestFingerprint
  };

  if (candidate.kind === 'EXISTING_LEXICAL_READING') {
    return {
      issueId: issue.id,
      action: 'SELECT_LEXICAL_READING',
      selectedAlternativeId: candidate.alternativeId,
      manualCanonicalTransliteration: candidate.canonical ?? undefined,
      assistance: assistanceMetadata
    };
  }

  if (candidate.kind === 'MANUAL_CANONICAL') {
    return {
      issueId: issue.id,
      action: 'MANUAL_CANONICAL_OVERRIDE',
      manualCanonicalTransliteration: candidate.canonical,
      assistance: assistanceMetadata
    };
  }

  if (candidate.kind === 'IZAFAT_DECISION') {
    return {
      issueId: issue.id,
      action: candidate.relationDecision,
      assistance: assistanceMetadata
    };
  }

  if (candidate.kind === 'MORPHOLOGY_BRANCH') {
    return {
      issueId: issue.id,
      action: 'SELECT_MORPHOLOGY',
      selectedAlternativeId: candidate.morphologyBranch,
      manualCanonicalTransliteration: candidate.canonical ?? undefined,
      assistance: assistanceMetadata
    };
  }

  throw new Error(`Unknown candidate kind "${(candidate as AssistedCandidate).kind}".`);
}
