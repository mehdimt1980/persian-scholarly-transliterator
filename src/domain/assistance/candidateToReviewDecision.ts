import { ReviewDecision, ReviewIssue } from '../review/types';
import { AssistedCandidate, AssistedResolution } from './types';

export function candidateToReviewDecision(
  candidate: AssistedCandidate,
  resolution: AssistedResolution,
  issue: ReviewIssue
): ReviewDecision {
  if (issue.id !== resolution.issueId) {
    throw new Error(
      `Cannot create ReviewDecision: resolution issueId "${resolution.issueId}" does not match issue "${issue.id}".`
    );
  }

  const assistanceMetadata = {
    suggestionId: candidate.id,
    provider: resolution.provider,
    model: resolution.model,
    promptVersion: resolution.promptVersion
  };

  if (candidate.kind === 'EXISTING_LEXICAL_READING') {
    if (!issue.allowedActions.includes('SELECT_LEXICAL_READING')) {
      throw new Error(`Issue "${issue.id}" does not permit action "SELECT_LEXICAL_READING".`);
    }
    return {
      issueId: issue.id,
      action: 'SELECT_LEXICAL_READING',
      selectedAlternativeId: candidate.alternativeId,
      manualCanonicalTransliteration: candidate.canonical,
      assistance: assistanceMetadata
    };
  }

  if (candidate.kind === 'MANUAL_CANONICAL') {
    if (!issue.allowedActions.includes('MANUAL_CANONICAL_OVERRIDE')) {
      throw new Error(`Issue "${issue.id}" does not permit action "MANUAL_CANONICAL_OVERRIDE".`);
    }
    return {
      issueId: issue.id,
      action: 'MANUAL_CANONICAL_OVERRIDE',
      manualCanonicalTransliteration: candidate.canonical,
      assistance: assistanceMetadata
    };
  }

  if (candidate.kind === 'IZAFAT_DECISION') {
    if (!issue.allowedActions.includes(candidate.relationDecision)) {
      throw new Error(`Issue "${issue.id}" does not permit action "${candidate.relationDecision}".`);
    }
    return {
      issueId: issue.id,
      action: candidate.relationDecision,
      assistance: assistanceMetadata
    };
  }

  if (candidate.kind === 'MORPHOLOGY_BRANCH') {
    if (!issue.allowedActions.includes('SELECT_MORPHOLOGY')) {
      throw new Error(`Issue "${issue.id}" does not permit action "SELECT_MORPHOLOGY".`);
    }
    return {
      issueId: issue.id,
      action: 'SELECT_MORPHOLOGY',
      selectedAlternativeId: candidate.morphologyBranch,
      manualCanonicalTransliteration: candidate.canonical,
      assistance: assistanceMetadata
    };
  }

  throw new Error(`Unknown candidate kind "${(candidate as AssistedCandidate).kind}".`);
}
