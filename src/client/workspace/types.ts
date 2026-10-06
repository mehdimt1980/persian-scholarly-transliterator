import type { ProfileId, ReviewDecision } from '../../domain/types';
import type { AcceptedPhraseDecision } from '../../domain/assistance/phraseTypes';
import type {
  BibliographyRecord,
  BibliographyReviewDecision
} from '../../domain/bibliography/types';
import type { ScholarlyExportMode } from '../../domain/bibliography/export/types';

export interface TransliterationWorkspaceV1 {
  schemaVersion: 1;
  updatedAt: string;
  input: string;
  profile: ProfileId;
  reviewDecisions: ReviewDecision[];
  acceptedPhraseDecision: AcceptedPhraseDecision | null;
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

export type PersistenceStatus = 'restoring' | 'saved' | 'saving' | 'error';

export interface ResearchWorkspaceContextValue {
  ready: boolean;
  persistenceStatus: PersistenceStatus;

  transliteration: TransliterationWorkspaceV1;
  updateTransliteration: (
    updater:
      | Partial<Omit<TransliterationWorkspaceV1, 'schemaVersion' | 'updatedAt'>>
      | ((prev: TransliterationWorkspaceV1) => TransliterationWorkspaceV1)
  ) => void;
  resetTransliteration: () => Promise<void>;

  bibliography: BibliographyWorkspaceV1;
  updateBibliography: (
    updater:
      | Partial<Omit<BibliographyWorkspaceV1, 'schemaVersion' | 'updatedAt'>>
      | ((prev: BibliographyWorkspaceV1) => BibliographyWorkspaceV1)
  ) => void;
  resetBibliography: () => Promise<void>;

  crossTabNotice: {
    transliteration: boolean;
    bibliography: boolean;
  };
  dismissCrossTabNotice: (workspace: 'transliteration' | 'bibliography') => void;
  reloadFromStorage: (workspace: 'transliteration' | 'bibliography') => Promise<void>;
}
