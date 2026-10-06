import type { ProfileId } from '../../domain/types';
import type { AcceptedPhraseDecision } from '../../domain/assistance/phraseTypes';
import type {
  BibliographyRecord,
  BibliographyReviewDecision
} from '../../domain/bibliography/types';
import type { ScholarlyExportMode } from '../../domain/bibliography/export/types';
import type {
  TransliterationWorkspaceV1,
  BibliographyWorkspaceV1,
  BibliographyFilterType
} from './types';
import {
  createDefaultTransliterationWorkspace,
  createDefaultBibliographyWorkspace
} from './defaults';

const VALID_PROFILES = new Set<string>(['ijmes_full', 'ijmes_citation_title']);
const VALID_FILTERS = new Set<string>(['ALL', 'READY', 'REVIEW_REQUIRED', 'INVALID']);
const VALID_EXPORT_MODES = new Set<string>(['STRICT_ALL', 'READY_ONLY']);

function isObject(val: unknown): val is Record<string, any> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function validateAndMigrateTransliterationWorkspace(
  data: unknown
): TransliterationWorkspaceV1 {
  if (!isObject(data)) {
    return createDefaultTransliterationWorkspace();
  }

  // Schema version handling (currently v1)
  const schemaVersion = data.schemaVersion === 1 ? 1 : 1;

  const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString();
  const input = typeof data.input === 'string' ? data.input : createDefaultTransliterationWorkspace().input;

  // Profile migration: legacy ijmes_title -> ijmes_citation_title
  let profile: ProfileId = 'ijmes_citation_title';
  if (data.profile === 'ijmes_title') {
    profile = 'ijmes_citation_title';
  } else if (typeof data.profile === 'string' && VALID_PROFILES.has(data.profile)) {
    profile = data.profile as ProfileId;
  }

  // Review decisions
  const reviewDecisions = Array.isArray(data.reviewDecisions)
    ? data.reviewDecisions.filter(
        (d: any) =>
          isObject(d) &&
          typeof d.issueId === 'string' &&
          typeof d.action === 'string'
      )
    : [];

  // Accepted phrase decision
  let acceptedPhraseDecision: AcceptedPhraseDecision | null = null;
  if (
    isObject(data.acceptedPhraseDecision) &&
    typeof data.acceptedPhraseDecision.scholarlyCanonical === 'string' &&
    typeof data.acceptedPhraseDecision.renderedOutput === 'string' &&
    typeof data.acceptedPhraseDecision.requestFingerprint === 'string'
  ) {
    let decProfile: ProfileId = 'ijmes_citation_title';
    if (data.acceptedPhraseDecision.profile === 'ijmes_title') {
      decProfile = 'ijmes_citation_title';
    } else if (VALID_PROFILES.has(data.acceptedPhraseDecision.profile)) {
      decProfile = data.acceptedPhraseDecision.profile as ProfileId;
    }

    acceptedPhraseDecision = {
      source: 'AI_ASSISTED_PHRASE',
      acceptance:
        data.acceptedPhraseDecision.acceptance === 'HUMAN_EDITED_AI_SUGGESTION'
          ? 'HUMAN_EDITED_AI_SUGGESTION'
          : 'HUMAN_ACCEPTED_AI_SUGGESTION',
      originalInput: typeof data.acceptedPhraseDecision.originalInput === 'string' ? data.acceptedPhraseDecision.originalInput : input,
      normalizedInput: typeof data.acceptedPhraseDecision.normalizedInput === 'string' ? data.acceptedPhraseDecision.normalizedInput : input,
      profile: decProfile,
      scholarlyCanonical: data.acceptedPhraseDecision.scholarlyCanonical,
      renderedOutput: data.acceptedPhraseDecision.renderedOutput,
      provider: typeof data.acceptedPhraseDecision.provider === 'string' ? data.acceptedPhraseDecision.provider : 'openai',
      model: typeof data.acceptedPhraseDecision.model === 'string' ? data.acceptedPhraseDecision.model : 'gpt-4o',
      promptVersion: typeof data.acceptedPhraseDecision.promptVersion === 'string' ? data.acceptedPhraseDecision.promptVersion : 'v1',
      requestFingerprint: data.acceptedPhraseDecision.requestFingerprint,
      modelConfidence: typeof data.acceptedPhraseDecision.modelConfidence === 'number' ? data.acceptedPhraseDecision.modelConfidence : 1,
      acceptedAt: typeof data.acceptedPhraseDecision.acceptedAt === 'string' ? data.acceptedPhraseDecision.acceptedAt : updatedAt
    };
  }

  return {
    schemaVersion,
    updatedAt,
    input,
    profile,
    reviewDecisions,
    acceptedPhraseDecision
  };
}

export function validateAndMigrateBibliographyWorkspace(
  data: unknown
): BibliographyWorkspaceV1 {
  if (!isObject(data)) {
    return createDefaultBibliographyWorkspace();
  }

  const schemaVersion = data.schemaVersion === 1 ? 1 : 1;
  const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString();
  const csvText = typeof data.csvText === 'string' ? data.csvText : createDefaultBibliographyWorkspace().csvText;

  // Records validation
  let records: BibliographyRecord[] = [];
  if (Array.isArray(data.records)) {
    records = data.records.filter((r: any) => isObject(r) && typeof r.id === 'string' && typeof r.type === 'string');
  }

  // Review decisions
  let reviewDecisions: BibliographyReviewDecision[] = [];
  if (Array.isArray(data.reviewDecisions)) {
    reviewDecisions = data.reviewDecisions.filter(
      (d: any) =>
        isObject(d) &&
        typeof d.recordId === 'string' &&
        typeof d.fieldPath === 'string' &&
        isObject(d.decision) &&
        typeof d.decision.issueId === 'string'
    );
  }

  // Filter validation
  let filter: BibliographyFilterType = 'ALL';
  if (typeof data.filter === 'string' && VALID_FILTERS.has(data.filter)) {
    filter = data.filter as BibliographyFilterType;
  }

  // Export mode validation
  let exportMode: ScholarlyExportMode = 'STRICT_ALL';
  if (typeof data.exportMode === 'string' && VALID_EXPORT_MODES.has(data.exportMode)) {
    exportMode = data.exportMode as ScholarlyExportMode;
  }

  // Selected record ID validation & repair
  let selectedRecordId: string | null = null;
  if (typeof data.selectedRecordId === 'string') {
    const exists = records.some((r) => r.id === data.selectedRecordId);
    if (exists) {
      selectedRecordId = data.selectedRecordId;
    } else if (records.length > 0) {
      selectedRecordId = records[0].id;
    }
  } else if (records.length > 0) {
    selectedRecordId = records[0].id;
  }

  return {
    schemaVersion,
    updatedAt,
    csvText,
    records,
    reviewDecisions,
    selectedRecordId,
    filter,
    exportMode
  };
}
