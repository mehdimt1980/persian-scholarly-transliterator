export function formatStatusLabel(status: string): string {
  switch (status.toUpperCase()) {
    case 'FINAL':
      return 'Ready';
    case 'REVIEW_REQUIRED':
      return 'Review needed';
    case 'UNRESOLVED':
      return 'Unresolved';
    case 'UNANIMOUS_DETERMINISTIC':
      return 'Evidence agrees';
    case 'CONFLICTING_DETERMINISTIC':
      return 'Evidence conflicts';
    case 'BLOCKED':
      return 'Human review needed';
    case 'NOT_PROMOTED':
    case 'NOT PROMOTED':
      return 'Not part of the reviewed lexicon';
    case 'NON-AUTHORITATIVE':
    case 'NON_AUTHORITATIVE':
      return 'Not authoritative';
    case 'DETERMINISTIC':
      return 'Deterministic';
    case 'LEXICON_RESOLVED':
      return 'Lexicon resolved';
    case 'USER_OVERRIDE':
      return 'User override';
    case 'PASSTHROUGH':
      return 'Passthrough';
    case 'INVALID':
      return 'Invalid';
    case 'CONFIRMED':
      return 'Confirmed';
    case 'CANDIDATE':
      return 'Candidate';
    case 'REJECTED':
      return 'Rejected';
    default:
      return status.replace(/_/g, ' ').toLowerCase();
  }
}

export function getStatusClass(status: string): string {
  const s = status.toUpperCase();
  if (['FINAL', 'READY', 'DETERMINISTIC', 'LEXICON_RESOLVED', 'CONFIRMED', 'UNANIMOUS_DETERMINISTIC'].includes(s)) {
    return 'status-ready';
  }
  if (['REVIEW_REQUIRED', 'AMBIGUOUS', 'CANDIDATE', 'CONFLICTING_DETERMINISTIC'].includes(s)) {
    return 'status-review';
  }
  if (['BLOCKED', 'INVALID', 'UNRESOLVED'].includes(s)) {
    return 'status-blocked';
  }
  if (['USER_OVERRIDE'].includes(s)) {
    return 'status-override';
  }
  return 'status-neutral';
}

export function formatIssueType(type: string): string {
  switch (type) {
    case 'MORPHOLOGY_AMBIGUITY':
      return 'Morphology ambiguity';
    case 'IZAFAT_CANDIDATE':
      return 'Possible izāfat relation';
    case 'LEXICAL_AMBIGUITY':
      return 'Multiple lexical readings';
    case 'UNRESOLVED_TOKEN':
      return 'Unresolved token';
    default:
      return type.replace(/_/g, ' ').toLowerCase();
  }
}
