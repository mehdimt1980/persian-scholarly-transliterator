import type { ProfileId, ReviewDecision, ReviewActionType, AssistanceDecisionMetadata } from '../../domain/types';
import type { AcceptedPhraseDecision } from '../../domain/assistance/phraseTypes';
import type {
  BibliographyRecord,
  BibliographyRecordType,
  BibliographyReviewDecision,
  BibliographyFieldPath,
  BibliographyCreator,
  BibliographySourceCell
} from '../../domain/bibliography/types';
import type { ScholarlyExportMode } from '../../domain/bibliography/export/types';
import type {
  TransliterationWorkspaceV1,
  PersistedAcceptedPhraseDecisionV1,
  BibliographyWorkspaceV1,
  BibliographyFilterType,
  WorkspaceValidationResult
} from './types';
import {
  createDefaultTransliterationWorkspace,
  createDefaultBibliographyWorkspace
} from './defaults';
import { renderCanonicalForProfile } from '../../domain/profiles';
import { validateManualTransliteration } from '../../domain/review/validation';

const VALID_PROFILES = new Set<string>(['ijmes_full', 'ijmes_citation_title']);
const VALID_FILTERS = new Set<string>(['ALL', 'READY', 'REVIEW_REQUIRED', 'INVALID']);
const VALID_EXPORT_MODES = new Set<string>(['STRICT_ALL', 'READY_ONLY']);
const VALID_RECORD_TYPES = new Set<string>(['BOOK', 'JOURNAL_ARTICLE', 'BOOK_CHAPTER', 'THESIS', 'OTHER']);
const VALID_REVIEW_ACTIONS = new Set<string>([
  'SELECT_LEXICAL_READING',
  'MANUAL_CANONICAL_OVERRIDE',
  'ACCEPT_IZAFAT',
  'REJECT_IZAFAT',
  'SELECT_MORPHOLOGY'
]);

function isObject(val: unknown): val is Record<string, any> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isValidIsoDate(str: unknown): boolean {
  if (typeof str !== 'string' || str.trim().length === 0) return false;
  const time = Date.parse(str);
  return !Number.isNaN(time);
}

export function toPersistedAcceptedPhraseDecision(
  decision: AcceptedPhraseDecision | PersistedAcceptedPhraseDecisionV1
): PersistedAcceptedPhraseDecisionV1 {
  const {
    source,
    acceptance,
    originalInput,
    normalizedInput,
    profile,
    scholarlyCanonical,
    provider,
    model,
    promptVersion,
    requestFingerprint,
    modelConfidence,
    acceptedAt
  } = decision;

  return {
    source,
    acceptance,
    originalInput,
    normalizedInput,
    profile,
    scholarlyCanonical,
    provider,
    model,
    promptVersion,
    requestFingerprint,
    modelConfidence: typeof modelConfidence === 'number' && Number.isFinite(modelConfidence) ? modelConfidence : null,
    acceptedAt
  };
}

export function fromPersistedAcceptedPhraseDecision(
  persisted: PersistedAcceptedPhraseDecisionV1,
  currentProfile?: ProfileId
): AcceptedPhraseDecision {
  const profile = currentProfile ?? persisted.profile;
  return {
    ...persisted,
    profile,
    renderedOutput: renderCanonicalForProfile(persisted.scholarlyCanonical, profile)
  };
}

function validateAssistanceMetadata(a: unknown): AssistanceDecisionMetadata | null {
  if (!isObject(a)) return null;
  if (typeof a.suggestionId !== 'string' || a.suggestionId.trim().length === 0) return null;
  if (typeof a.provider !== 'string' || a.provider.trim().length === 0) return null;
  if (typeof a.model !== 'string' || a.model.trim().length === 0) return null;
  if (typeof a.promptVersion !== 'string' || a.promptVersion.trim().length === 0) return null;
  if (typeof a.requestFingerprint !== 'string' || a.requestFingerprint.trim().length === 0) return null;

  return {
    suggestionId: a.suggestionId,
    provider: a.provider,
    model: a.model,
    promptVersion: a.promptVersion,
    requestFingerprint: a.requestFingerprint
  };
}

function validateSingleReviewDecision(d: unknown): ReviewDecision | null {
  if (!isObject(d)) return null;
  if (typeof d.issueId !== 'string' || d.issueId.trim().length === 0) return null;
  if (typeof d.action !== 'string' || !VALID_REVIEW_ACTIONS.has(d.action)) return null;

  const action = d.action as ReviewActionType;

  // Validate assistance provenance when explicitly present
  let assistance: AssistanceDecisionMetadata | undefined = undefined;
  if (d.assistance !== undefined && d.assistance !== null) {
    const validAssistance = validateAssistanceMetadata(d.assistance);
    if (!validAssistance) {
      // Reject decision rather than silently stripping provenance
      return null;
    }
    assistance = validAssistance;
  }

  if (action === 'SELECT_LEXICAL_READING' || action === 'SELECT_MORPHOLOGY') {
    if (typeof d.selectedAlternativeId !== 'string' || d.selectedAlternativeId.trim().length === 0) {
      return null;
    }
    const res: ReviewDecision = {
      issueId: d.issueId,
      action,
      selectedAlternativeId: d.selectedAlternativeId
    };
    if (typeof d.note === 'string') res.note = d.note;
    if (assistance) res.assistance = assistance;
    return res;
  }

  if (action === 'MANUAL_CANONICAL_OVERRIDE') {
    if (typeof d.manualCanonicalTransliteration !== 'string') return null;
    const manualValidation = validateManualTransliteration(d.manualCanonicalTransliteration);
    if (!manualValidation.valid || !manualValidation.normalized) return null;

    const res: ReviewDecision = {
      issueId: d.issueId,
      action,
      manualCanonicalTransliteration: manualValidation.normalized
    };
    if (typeof d.note === 'string') res.note = d.note;
    if (assistance) res.assistance = assistance;
    return res;
  }

  if (action === 'ACCEPT_IZAFAT' || action === 'REJECT_IZAFAT') {
    const res: ReviewDecision = {
      issueId: d.issueId,
      action
    };
    if (typeof d.note === 'string') res.note = d.note;
    if (assistance) res.assistance = assistance;
    return res;
  }

  return null;
}

function validatePersistedAcceptedPhraseDecision(
  data: unknown
): PersistedAcceptedPhraseDecisionV1 | null {
  if (!isObject(data)) return null;

  if (data.source !== 'AI_ASSISTED_PHRASE') return null;
  if (
    data.acceptance !== 'HUMAN_ACCEPTED_AI_SUGGESTION' &&
    data.acceptance !== 'HUMAN_EDITED_AI_SUGGESTION'
  ) {
    return null;
  }

  // Identity fields must be non-empty strings — do NOT synthesize
  if (typeof data.originalInput !== 'string' || data.originalInput.trim().length === 0) {
    return null;
  }
  if (typeof data.normalizedInput !== 'string' || data.normalizedInput.trim().length === 0) {
    return null;
  }

  // Profile validation with legacy ijmes_title migration
  let profile: ProfileId;
  if (data.profile === 'ijmes_title') {
    profile = 'ijmes_citation_title';
  } else if (typeof data.profile === 'string' && VALID_PROFILES.has(data.profile)) {
    profile = data.profile as ProfileId;
  } else {
    return null;
  }

  if (typeof data.scholarlyCanonical !== 'string' || data.scholarlyCanonical.trim().length === 0) {
    return null;
  }
  const canonicalVal = validateManualTransliteration(data.scholarlyCanonical);
  if (!canonicalVal.valid || !canonicalVal.normalized) {
    return null;
  }

  // Provenance must NEVER be fabricated
  if (typeof data.provider !== 'string' || data.provider.trim().length === 0) return null;
  if (typeof data.model !== 'string' || data.model.trim().length === 0) return null;
  if (typeof data.promptVersion !== 'string' || data.promptVersion.trim().length === 0) return null;
  if (typeof data.requestFingerprint !== 'string' || data.requestFingerprint.trim().length === 0) return null;

  let modelConfidence: number | null = null;
  if (data.modelConfidence === null || data.modelConfidence === undefined) {
    modelConfidence = null;
  } else if (
    typeof data.modelConfidence === 'number' &&
    Number.isFinite(data.modelConfidence) &&
    data.modelConfidence >= 0 &&
    data.modelConfidence <= 1
  ) {
    modelConfidence = data.modelConfidence;
  } else {
    return null;
  }

  if (!isValidIsoDate(data.acceptedAt)) {
    return null;
  }

  return {
    source: 'AI_ASSISTED_PHRASE',
    acceptance: data.acceptance,
    originalInput: data.originalInput,
    normalizedInput: data.normalizedInput,
    profile,
    scholarlyCanonical: canonicalVal.normalized,
    provider: data.provider,
    model: data.model,
    promptVersion: data.promptVersion,
    requestFingerprint: data.requestFingerprint,
    modelConfidence,
    acceptedAt: data.acceptedAt
  };
}

export function parseTransliterationWorkspace(
  data: unknown
): WorkspaceValidationResult<TransliterationWorkspaceV1> {
  if (!isObject(data)) {
    return { success: false, reason: 'CORRUPTED_DATA' };
  }

  // Explicit schemaVersion required
  if (data.schemaVersion === undefined || data.schemaVersion === null) {
    return { success: false, reason: 'CORRUPTED_DATA' };
  }
  if (typeof data.schemaVersion === 'number' && data.schemaVersion !== 1) {
    return {
      success: false,
      reason: 'UNSUPPORTED_SCHEMA',
      rawVersion: data.schemaVersion
    };
  }
  if (data.schemaVersion !== 1) {
    return { success: false, reason: 'CORRUPTED_DATA' };
  }

  if (!isValidIsoDate(data.updatedAt)) {
    return { success: false, reason: 'CORRUPTED_DATA' };
  }
  const updatedAt = data.updatedAt as string;

  if (typeof data.input !== 'string') {
    return { success: false, reason: 'CORRUPTED_DATA' };
  }
  const input = data.input;

  // Profile validation with legacy migration; unknown profiles fail validation
  let profile: ProfileId;
  if (data.profile === 'ijmes_title') {
    profile = 'ijmes_citation_title';
  } else if (typeof data.profile === 'string' && VALID_PROFILES.has(data.profile)) {
    profile = data.profile as ProfileId;
  } else {
    return { success: false, reason: 'CORRUPTED_DATA' };
  }

  // Review decisions
  const reviewDecisions: ReviewDecision[] = [];
  if (Array.isArray(data.reviewDecisions)) {
    for (const item of data.reviewDecisions) {
      const validated = validateSingleReviewDecision(item);
      if (validated) {
        reviewDecisions.push(validated);
      }
    }
  }

  // Accepted phrase decision: validated strictly without fabricating provenance or identity
  const acceptedPhraseDecision = data.acceptedPhraseDecision
    ? validatePersistedAcceptedPhraseDecision(data.acceptedPhraseDecision)
    : null;

  return {
    success: true,
    data: {
      schemaVersion: 1,
      updatedAt,
      input,
      profile,
      reviewDecisions,
      acceptedPhraseDecision
    }
  };
}

export function validateAndMigrateTransliterationWorkspace(
  data: unknown
): TransliterationWorkspaceV1 {
  const result = parseTransliterationWorkspace(data);
  if (result.success) {
    return result.data;
  }
  return createDefaultTransliterationWorkspace();
}

function validateBibliographyCreator(c: unknown): BibliographyCreator | null {
  if (!isObject(c)) return null;
  if (typeof c.literal !== 'string') return null;
  const creator: BibliographyCreator = { literal: c.literal };
  if (typeof c.given === 'string') creator.given = c.given;
  if (typeof c.family === 'string') creator.family = c.family;
  return creator;
}

function validateBibliographySourceCell(s: unknown): BibliographySourceCell | null {
  if (!isObject(s)) return null;
  if (typeof s.header !== 'string' || typeof s.value !== 'string') return null;
  return {
    header: s.header,
    value: s.value
  };
}

function validateBibliographyRecord(r: unknown): BibliographyRecord | null {
  if (!isObject(r)) return null;
  if (typeof r.id !== 'string' || r.id.trim().length === 0) return null;
  if (typeof r.type !== 'string' || !VALID_RECORD_TYPES.has(r.type)) return null;
  if (typeof r.title !== 'string') return null;
  if (typeof r.sourceRowIndex !== 'number' || !Number.isInteger(r.sourceRowIndex) || r.sourceRowIndex < 0) return null;

  const authors: BibliographyCreator[] = [];
  if (Array.isArray(r.authors)) {
    for (const a of r.authors) {
      const validCreator = validateBibliographyCreator(a);
      if (validCreator) authors.push(validCreator);
      else return null;
    }
  } else {
    return null;
  }

  const editors: BibliographyCreator[] = [];
  if (Array.isArray(r.editors)) {
    for (const e of r.editors) {
      const validCreator = validateBibliographyCreator(e);
      if (validCreator) editors.push(validCreator);
      else return null;
    }
  } else {
    return null;
  }

  const translators: BibliographyCreator[] = [];
  if (Array.isArray(r.translators)) {
    for (const t of r.translators) {
      const validCreator = validateBibliographyCreator(t);
      if (validCreator) translators.push(validCreator);
      else return null;
    }
  } else {
    return null;
  }

  const sourceColumns: BibliographySourceCell[] = [];
  if (Array.isArray(r.sourceColumns)) {
    for (const sc of r.sourceColumns) {
      const cell = validateBibliographySourceCell(sc);
      if (cell) sourceColumns.push(cell);
      else return null;
    }
  } else {
    return null;
  }

  // passthrough is strictly required to be a plain string-to-string dictionary
  if (!isObject(r.passthrough)) {
    return null;
  }
  const passthrough: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.passthrough)) {
    if (typeof v !== 'string') {
      return null;
    }
    passthrough[k] = v;
  }

  const record: BibliographyRecord = {
    id: r.id,
    type: r.type as BibliographyRecordType,
    title: r.title,
    authors,
    editors,
    translators,
    sourceRowIndex: r.sourceRowIndex,
    sourceColumns,
    passthrough
  };

  const optionalStringFields: Array<keyof BibliographyRecord> = [
    'containerTitle',
    'year',
    'publisher',
    'place',
    'volume',
    'issue',
    'pageStart',
    'pageEnd',
    'doi',
    'url',
    'isbn',
    'issn',
    'language',
    'notes'
  ];

  for (const field of optionalStringFields) {
    if (r[field] !== undefined) {
      if (typeof r[field] === 'string') {
        (record as any)[field] = r[field];
      } else {
        return null;
      }
    }
  }

  return record;
}

const FIELD_PATH_REGEX = /^(title|containerTitle|publisher|place|(authors|editors|translators)\.\d+\.literal)$/;

function validateBibliographyReviewDecision(d: unknown): BibliographyReviewDecision | null {
  if (!isObject(d)) return null;
  if (typeof d.recordId !== 'string' || d.recordId.trim().length === 0) return null;
  if (typeof d.fieldPath !== 'string' || !FIELD_PATH_REGEX.test(d.fieldPath)) return null;

  const validDecision = validateSingleReviewDecision(d.decision);
  if (!validDecision) return null;

  return {
    recordId: d.recordId,
    fieldPath: d.fieldPath as BibliographyFieldPath,
    decision: validDecision
  };
}

export function parseBibliographyWorkspace(
  data: unknown
): WorkspaceValidationResult<BibliographyWorkspaceV1> {
  if (!isObject(data)) {
    return { success: false, reason: 'CORRUPTED_DATA' };
  }

  // Explicit schemaVersion required
  if (data.schemaVersion === undefined || data.schemaVersion === null) {
    return { success: false, reason: 'CORRUPTED_DATA' };
  }
  if (typeof data.schemaVersion === 'number' && data.schemaVersion !== 1) {
    return {
      success: false,
      reason: 'UNSUPPORTED_SCHEMA',
      rawVersion: data.schemaVersion
    };
  }
  if (data.schemaVersion !== 1) {
    return { success: false, reason: 'CORRUPTED_DATA' };
  }

  if (!isValidIsoDate(data.updatedAt)) {
    return { success: false, reason: 'CORRUPTED_DATA' };
  }
  const updatedAt = data.updatedAt as string;

  if (typeof data.csvText !== 'string') {
    return { success: false, reason: 'CORRUPTED_DATA' };
  }
  const csvText = data.csvText;

  // Records validation: strict validation of each record
  const records: BibliographyRecord[] = [];
  if (Array.isArray(data.records)) {
    for (const r of data.records) {
      const validRecord = validateBibliographyRecord(r);
      if (validRecord) {
        records.push(validRecord);
      }
    }
  }

  // Review decisions validation
  const reviewDecisions: BibliographyReviewDecision[] = [];
  if (Array.isArray(data.reviewDecisions)) {
    for (const d of data.reviewDecisions) {
      const validReview = validateBibliographyReviewDecision(d);
      if (validReview) {
        reviewDecisions.push(validReview);
      }
    }
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
    success: true,
    data: {
      schemaVersion: 1,
      updatedAt,
      csvText,
      records,
      reviewDecisions,
      selectedRecordId,
      filter,
      exportMode
    }
  };
}

export function validateAndMigrateBibliographyWorkspace(
  data: unknown
): BibliographyWorkspaceV1 {
  const result = parseBibliographyWorkspace(data);
  if (result.success) {
    return result.data;
  }
  return createDefaultBibliographyWorkspace();
}
