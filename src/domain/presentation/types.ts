export type PresentationContentCategory =
  | 'BOOK_OR_ARTICLE_TITLE'
  | 'PERSONAL_NAME'
  | 'PLACE_NAME'
  | 'TECHNICAL_TERM'
  | 'GENERAL_SCHOLARLY_TEXT';

export type PresentationProfileId =
  | 'full_scholarly_v1'
  | 'ijmes_publication_v1'
  | 'custom_scholarly_v1';

export type PresentationDiagnosticSeverity = 'BLOCK' | 'REVIEW_REQUIRED' | 'INFO';

export interface PresentationDiagnostic {
  id: string;
  severity: PresentationDiagnosticSeverity;
  message: string;
  ruleId: string;
  source: string;
}

export interface CustomScholarlyV1Options {
  diacritics: 'FULL' | 'PUBLICATION';
  capitalization: 'PRESERVE' | 'ENGLISH_TITLE';
  contentCategory: PresentationContentCategory;
}

export type PresentationProfile =
  | { id: 'full_scholarly_v1' }
  | { id: 'ijmes_publication_v1' }
  | { id: 'custom_scholarly_v1'; options: CustomScholarlyV1Options };

export interface PresentationContext {
  contentCategory?: PresentationContentCategory;
}

export interface ScholarlyRenderingResult {
  ok: boolean;
  profileId: PresentationProfileId | 'unsupported';
  canonical: string;
  output: string | null;
  appliedRuleIds: string[];
  diagnostics: PresentationDiagnostic[];
}
