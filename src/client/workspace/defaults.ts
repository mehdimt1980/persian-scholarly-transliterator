import type { TransliterationWorkspaceV1, BibliographyWorkspaceV1 } from './types';

export const DEFAULT_TRANSLITERATION_INPUT = 'تأملی درباره ایران: مکتب تبریز و مبانی تجددخواهی';
export const DEFAULT_TRANSLITERATION_PROFILE = 'ijmes_citation_title';

export const DEFAULT_BIBLIOGRAPHY_CSV = `id,type,title,container_title,authors,year,publisher,place,doi
rec_1,BOOK,مشروطه,,شاه | صفوی,1380,دولت,تهران,
rec_2,JOURNAL_ARTICLE,دولت و جامعه,فرهنگ,شاه,1995,,,,10.1234/in.1995.13.3
rec_3,BOOK,کرم,,نویسنده,1400,انتشارات علم,تهران,
rec_4,BOOK,State and Society in Iran,,Homa Katouzian,2000,I.B. Tauris,London,10.5040/9780755609437`;

export function createDefaultTransliterationWorkspace(): TransliterationWorkspaceV1 {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    input: DEFAULT_TRANSLITERATION_INPUT,
    profile: DEFAULT_TRANSLITERATION_PROFILE,
    reviewDecisions: [],
    acceptedPhraseDecision: null
  };
}

export function createDefaultBibliographyWorkspace(): BibliographyWorkspaceV1 {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    csvText: DEFAULT_BIBLIOGRAPHY_CSV,
    records: [],
    reviewDecisions: [],
    selectedRecordId: null,
    filter: 'ALL',
    exportMode: 'STRICT_ALL'
  };
}
