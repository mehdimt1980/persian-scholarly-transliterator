import type { ProfileId, ReviewDecision } from '../../domain/types';
import type { AcceptedPhraseDecision } from '../../domain/assistance/phraseTypes';
import type {
  BibliographyRecord,
  BibliographyReviewDecision
} from '../../domain/bibliography/types';
import type { ScholarlyExportMode } from '../../domain/bibliography/export/types';

export interface StoredWorkspaceEnvelope<T> {
  storageRevision: number;
  value: T;
}

export interface PersistedAcceptedPhraseDecisionV1 {
  source: 'AI_ASSISTED_PHRASE';
  acceptance:
    | 'HUMAN_ACCEPTED_AI_SUGGESTION'
    | 'HUMAN_EDITED_AI_SUGGESTION';

  originalInput: string;
  normalizedInput: string;
  profile: ProfileId;

  scholarlyCanonical: string;

  provider: string;
  model: string;
  promptVersion: string;
  requestFingerprint: string;
  /** Additive V2 identity excludes presentation-only profile/rendering changes. */
  readingFingerprint?: string;
  readingIdentityVersion?: '2';
  modelConfidence: number | null;
  acceptedAt: string;
}

export interface TransliterationWorkspaceV1 {
  schemaVersion: 1;
  updatedAt: string;
  input: string;
  profile: ProfileId;
  reviewDecisions: ReviewDecision[];
  acceptedPhraseDecision: PersistedAcceptedPhraseDecisionV1 | null;
}

export type BibliographyFilterType = 'ALL' | 'READY' | 'REVIEW_REQUIRED' | 'INVALID';

export interface BibliographyWorkspaceV1 {
  schemaVersion: 1;
  updatedAt: string;
  csvText: string;
  records: BibliographyRecord[];
  reviewDecisions: BibliographyReviewDecision[];
  selectedRecordId: string | null;
  filter: BibliographyFilterType;
  exportMode: ScholarlyExportMode;
}

export type WorkspacePersistenceStatus =
  | 'restoring'
  | 'saving'
  | 'saved'
  | 'unavailable'
  | 'error'
  | 'unsupported-schema'
  | 'conflict';

export type PersistenceStatus = WorkspacePersistenceStatus;

export type CrossTabConflictType = 'UPDATED' | 'CLEARED' | null;

export type WorkspaceLoadResult<T> =
  | { status: 'ok'; value: T | null; storageRevision: number | null }
  | { status: 'unavailable' }
  | { status: 'error'; error: unknown }
  | { status: 'unsupported-schema'; rawVersion: unknown };

export type WorkspaceSaveResult =
  | { status: 'saved'; revision: number }
  | { status: 'conflict'; actualRevision: number | null };

export type WorkspaceClearResult =
  | { status: 'cleared' }
  | { status: 'conflict'; actualRevision: number | null };

export type WorkspaceValidationResult<T> =
  | { success: true; data: T }
  | { success: false; reason: 'CORRUPTED_DATA' | 'UNSUPPORTED_SCHEMA'; rawVersion?: unknown };

export interface RuntimeTransliterationWorkspace {
  schemaVersion: 1;
  updatedAt: string;
  input: string;
  profile: ProfileId;
  reviewDecisions: ReviewDecision[];
  acceptedPhraseDecision: AcceptedPhraseDecision | null;
}

export interface ResearchWorkspaceContextValue {
  ready: boolean;
  persistenceStatus: {
    transliteration: WorkspacePersistenceStatus;
    bibliography: WorkspacePersistenceStatus;
  };

  transliteration: RuntimeTransliterationWorkspace;
  updateTransliteration: (
    updater:
      | Partial<Omit<RuntimeTransliterationWorkspace, 'schemaVersion' | 'updatedAt'>>
      | ((prev: RuntimeTransliterationWorkspace) => RuntimeTransliterationWorkspace)
  ) => void;
  resetTransliteration: () => Promise<void>;

  bibliography: BibliographyWorkspaceV1;
  updateBibliography: (
    updater:
      | Partial<Omit<BibliographyWorkspaceV1, 'schemaVersion' | 'updatedAt'>>
      | ((prev: BibliographyWorkspaceV1) => BibliographyWorkspaceV1)
  ) => void;
  resetBibliography: () => Promise<void>;

  crossTabConflict: {
    transliteration: CrossTabConflictType;
    bibliography: CrossTabConflictType;
  };
  resolveCrossTabConflict: (
    workspace: 'transliteration' | 'bibliography',
    resolution: 'reload' | 'keep'
  ) => Promise<void>;
}
