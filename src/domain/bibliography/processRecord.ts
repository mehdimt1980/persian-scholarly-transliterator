import { transliterate } from '../engine';
import { LexiconRepository } from '../lexicon/repository';
import { ReviewDecision } from '../review/types';
import { getFieldPolicy } from './fieldPolicy';
import { containsArabicScript } from './scriptDetection';
import {
  BibliographyFieldPath,
  BibliographyFieldStatus,
  BibliographyRecord,
  BibliographyReviewDecision,
  ProcessedBibliographyField,
  ProcessedBibliographyRecord
} from './types';

export function processBibliographyField(
  recordId: string,
  fieldPath: BibliographyFieldPath,
  sourceText: string,
  reviewDecisions: BibliographyReviewDecision[] = [],
  lexicon?: LexiconRepository
): ProcessedBibliographyField {
  const policy = getFieldPolicy(fieldPath);

  if (!policy.isTransformable || !policy.profile || !sourceText || sourceText.trim().length === 0) {
    return {
      fieldPath,
      sourceText,
      profile: null,
      requiresTransliteration: false,
      finalText: sourceText,
      status: 'PASSTHROUGH',
      reviewIssues: []
    };
  }

  // If text contains no Arabic/Persian script, pass through untouched
  if (!containsArabicScript(sourceText)) {
    return {
      fieldPath,
      sourceText,
      profile: policy.profile,
      requiresTransliteration: false,
      finalText: sourceText,
      status: 'PASSTHROUGH',
      reviewIssues: []
    };
  }

  // Extract human decisions scoped strictly to this recordId + fieldPath
  const decisionsForField: ReviewDecision[] = reviewDecisions
    .filter((d) => d.recordId === recordId && d.fieldPath === fieldPath)
    .map((d) => d.decision);

  const result = transliterate(sourceText, policy.profile, decisionsForField, lexicon);

  let status: BibliographyFieldStatus;
  let finalText: string | null;

  if (result.copyable && result.status !== 'UNRESOLVED') {
    finalText = result.output;
    if (result.status === 'DETERMINISTIC') {
      status = 'DETERMINISTIC';
    } else if (result.status === 'LEXICON_RESOLVED') {
      status = 'LEXICON_RESOLVED';
    } else if (result.status === 'USER_OVERRIDE') {
      status = 'USER_OVERRIDE';
    } else {
      status = 'DETERMINISTIC';
    }
  } else {
    // Ambiguous or unresolved material is not copyable as final transliteration
    finalText = null;
    status = result.status === 'AMBIGUOUS' ? 'REVIEW_REQUIRED' : 'UNRESOLVED';
  }

  return {
    fieldPath,
    sourceText,
    profile: policy.profile,
    requiresTransliteration: true,
    transliterationResult: result,
    finalText,
    status,
    reviewIssues: result.reviewIssues
  };
}

export function processBibliographyRecord(
  record: BibliographyRecord,
  reviewDecisions: BibliographyReviewDecision[] = [],
  lexicon?: LexiconRepository
): ProcessedBibliographyRecord {
  const fields: Record<string, ProcessedBibliographyField> = {};
  const invalidReasons: string[] = [];

  // Required title validation
  if (!record.title || record.title.trim().length === 0) {
    invalidReasons.push('Record is missing a required title.');
  }

  // 1. Title
  fields['title'] = processBibliographyField(
    record.id,
    'title',
    record.title ?? '',
    reviewDecisions,
    lexicon
  );

  // 2. Container Title
  if (record.containerTitle !== undefined && record.containerTitle.trim().length > 0) {
    fields['containerTitle'] = processBibliographyField(
      record.id,
      'containerTitle',
      record.containerTitle,
      reviewDecisions,
      lexicon
    );
  }

  // 3. Authors
  record.authors.forEach((creator, idx) => {
    const path: BibliographyFieldPath = `authors.${idx}.literal`;
    fields[path] = processBibliographyField(
      record.id,
      path,
      creator.literal,
      reviewDecisions,
      lexicon
    );
  });

  // 4. Editors
  record.editors.forEach((creator, idx) => {
    const path: BibliographyFieldPath = `editors.${idx}.literal`;
    fields[path] = processBibliographyField(
      record.id,
      path,
      creator.literal,
      reviewDecisions,
      lexicon
    );
  });

  // 5. Translators
  record.translators.forEach((creator, idx) => {
    const path: BibliographyFieldPath = `translators.${idx}.literal`;
    fields[path] = processBibliographyField(
      record.id,
      path,
      creator.literal,
      reviewDecisions,
      lexicon
    );
  });

  // 6. Publisher
  if (record.publisher !== undefined && record.publisher.trim().length > 0) {
    fields['publisher'] = processBibliographyField(
      record.id,
      'publisher',
      record.publisher,
      reviewDecisions,
      lexicon
    );
  }

  // 7. Place
  if (record.place !== undefined && record.place.trim().length > 0) {
    fields['place'] = processBibliographyField(
      record.id,
      'place',
      record.place,
      reviewDecisions,
      lexicon
    );
  }

  // Aggregate issues and readiness
  let totalReviewIssues = 0;
  let hasReviewRequired = false;

  for (const field of Object.values(fields)) {
    totalReviewIssues += field.reviewIssues.length;
    if (field.requiresTransliteration && (field.status === 'REVIEW_REQUIRED' || field.status === 'UNRESOLVED')) {
      hasReviewRequired = true;
    }
  }

  let readiness: ProcessedBibliographyRecord['readiness'];
  if (invalidReasons.length > 0) {
    readiness = 'INVALID';
  } else if (hasReviewRequired || totalReviewIssues > 0) {
    readiness = 'REVIEW_REQUIRED';
  } else {
    readiness = 'READY';
  }

  return {
    record,
    fields,
    readiness,
    reviewIssueCount: totalReviewIssues,
    invalidReasons
  };
}
