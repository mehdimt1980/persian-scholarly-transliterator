import { describe, expect, it } from 'vitest';
import {
  validateAndMigrateTransliterationWorkspace,
  validateAndMigrateBibliographyWorkspace
} from './validation';
import {
  createDefaultTransliterationWorkspace,
  createDefaultBibliographyWorkspace
} from './defaults';
import { transliterate } from '../../domain/engine';
import {
  resolveSelectedTransliteration,
  buildPhraseResolverRequest,
  computePhraseRequestFingerprint
} from '../../domain/assistance';
import type { ReviewDecision } from '../../domain/types';
import type { AcceptedPhraseDecision } from '../../domain/assistance/phraseTypes';
import type { BibliographyRecord } from '../../domain/bibliography/types';

describe('Local Research Workspace Persistence', () => {
  describe('Schema Validation and Safe Migration', () => {
    it('validates and round-trips a valid TransliterationWorkspaceV1', () => {
      const original = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'تاریخ بیداری ایرانیان',
        profile: 'ijmes_citation_title',
        reviewDecisions: [
          {
            issueId: 'issue-1',
            action: 'SELECT_LEXICAL_READING',
            selectedAlternativeId: 'alt-1'
          }
        ],
        acceptedPhraseDecision: null
      };

      const validated = validateAndMigrateTransliterationWorkspace(original);
      expect(validated).toEqual(original);
    });

    it('migrates legacy ijmes_title in stored workspace to ijmes_citation_title', () => {
      const legacy = {
        schemaVersion: 1,
        updatedAt: '2026-10-05T12:00:00.000Z',
        input: 'سیاست‌نامه',
        profile: 'ijmes_title',
        reviewDecisions: [],
        acceptedPhraseDecision: null
      };

      const validated = validateAndMigrateTransliterationWorkspace(legacy);
      expect(validated.profile).toBe('ijmes_citation_title');
    });

    it('falls back safely to default profile when an unknown profile is encountered', () => {
      const invalid = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'ایران',
        profile: 'unknown_custom_profile',
        reviewDecisions: [],
        acceptedPhraseDecision: null
      };

      const validated = validateAndMigrateTransliterationWorkspace(invalid);
      expect(validated.profile).toBe('ijmes_citation_title');
    });

    it('returns default transliteration workspace on null or corrupted input', () => {
      const def = createDefaultTransliterationWorkspace();
      expect(validateAndMigrateTransliterationWorkspace(null).input).toBe(def.input);
      expect(validateAndMigrateTransliterationWorkspace('corrupted-string').profile).toBe('ijmes_citation_title');
      expect(validateAndMigrateTransliterationWorkspace({}).input).toBe(def.input);
    });

    it('validates and round-trips a valid BibliographyWorkspaceV1', () => {
      const sampleRecords: BibliographyRecord[] = [
        {
          id: 'rec_101',
          type: 'BOOK',
          title: 'زوال اندیشه سیاسی در ایران',
          authors: [{ literal: 'سید جواد طباطبایی' }],
          editors: [],
          translators: [],
          sourceRowIndex: 1,
          sourceColumns: [],
          passthrough: {}
        }
      ];

      const original = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        csvText: 'id,type,title\nrec_101,BOOK,زوال اندیشه سیاسی در ایران',
        records: sampleRecords,
        reviewDecisions: [],
        selectedRecordId: 'rec_101',
        filter: 'ALL' as const,
        exportMode: 'STRICT_ALL' as const
      };

      const validated = validateAndMigrateBibliographyWorkspace(original);
      expect(validated).toEqual(original);
    });

    it('falls back safely on invalid bibliography filter or export mode', () => {
      const invalid = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        csvText: '',
        records: [],
        reviewDecisions: [],
        selectedRecordId: null,
        filter: 'INVALID_UNKNOWN_FILTER',
        exportMode: 'NON_EXISTENT_MODE'
      };

      const validated = validateAndMigrateBibliographyWorkspace(invalid);
      expect(validated.filter).toBe('ALL');
      expect(validated.exportMode).toBe('STRICT_ALL');
    });

    it('repairs missing or non-existent selectedRecordId to the first record or null', () => {
      const records: BibliographyRecord[] = [
        {
          id: 'rec_first',
          type: 'BOOK',
          title: 'کتاب اول',
          authors: [],
          editors: [],
          translators: [],
          sourceRowIndex: 1,
          sourceColumns: [],
          passthrough: {}
        },
        {
          id: 'rec_second',
          type: 'BOOK',
          title: 'کتاب دوم',
          authors: [],
          editors: [],
          translators: [],
          sourceRowIndex: 2,
          sourceColumns: [],
          passthrough: {}
        }
      ];

      // Missing selectedRecordId (pointing to non-existent ID)
      const withBrokenId = validateAndMigrateBibliographyWorkspace({
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        csvText: '',
        records,
        reviewDecisions: [],
        selectedRecordId: 'rec_non_existent',
        filter: 'ALL',
        exportMode: 'STRICT_ALL'
      });
      expect(withBrokenId.selectedRecordId).toBe('rec_first');

      // Empty records with non-null selection
      const emptyWithBrokenId = validateAndMigrateBibliographyWorkspace({
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        csvText: '',
        records: [],
        reviewDecisions: [],
        selectedRecordId: 'rec_non_existent',
        filter: 'ALL',
        exportMode: 'STRICT_ALL'
      });
      expect(emptyWithBrokenId.selectedRecordId).toBeNull();
    });

    it('safely handles corrupted records array', () => {
      const corrupted = validateAndMigrateBibliographyWorkspace({
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        csvText: 'some,csv',
        records: 'not-an-array',
        reviewDecisions: null,
        selectedRecordId: 'any',
        filter: 'ALL',
        exportMode: 'STRICT_ALL'
      });
      expect(corrupted.records).toEqual([]);
      expect(corrupted.reviewDecisions).toEqual([]);
      expect(corrupted.selectedRecordId).toBeNull();
    });
  });

  describe('Non-Persistence of Derived Results (No Stale Authority)', () => {
    it('ensures TransliterationWorkspace does not store derived TransliterationResult fields', () => {
      const workspace = createDefaultTransliterationWorkspace();
      const keys = Object.keys(workspace);

      expect(keys).not.toContain('output');
      expect(keys).not.toContain('copyable');
      expect(keys).not.toContain('status');
      expect(keys).not.toContain('tokens');
      expect(keys).not.toContain('reviewIssues');
      expect(keys).not.toContain('analyses');
      expect(keys).not.toContain('morphology');
      expect(keys).not.toContain('relations');
    });

    it('ensures BibliographyWorkspace does not store processedBatch or export reports', () => {
      const workspace = createDefaultBibliographyWorkspace();
      const keys = Object.keys(workspace);

      expect(keys).not.toContain('processedBatch');
      expect(keys).not.toContain('exportReport');
      expect(keys).not.toContain('downloadUrl');
    });
  });

  describe('Human Review Decision & Accepted Phrase Re-evaluation', () => {
    it('re-evaluates restored ReviewDecisions through the current deterministic engine', () => {
      // Source with lexical ambiguity for 'مهر' (mihr / muhr)
      const input = 'مهر';
      const initialResult = transliterate(input, 'ijmes_full');
      expect(initialResult.status).toBe('AMBIGUOUS');
      expect(initialResult.reviewIssues).toHaveLength(1);

      const issue = initialResult.reviewIssues[0];
      const decision: ReviewDecision = {
        issueId: issue.id,
        action: 'SELECT_LEXICAL_READING',
        selectedAlternativeId: issue.alternatives[0].id
      };

      // Simulated restore of workspace with persisted decision
      const persistedWorkspace = validateAndMigrateTransliterationWorkspace({
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input,
        profile: 'ijmes_full',
        reviewDecisions: [decision],
        acceptedPhraseDecision: null
      });

      // Rerun current engine on restored state
      const restoredResult = transliterate(
        persistedWorkspace.input,
        persistedWorkspace.profile,
        persistedWorkspace.reviewDecisions
      );

      expect(restoredResult.status).toBe('USER_OVERRIDE');
      expect(restoredResult.copyable).toBe(true);
      expect(restoredResult.output).toBe(issue.alternatives[0].canonical);
    });

    it('restored AcceptedPhraseDecision is active when matching current input/fingerprint but fails closed when input changes', () => {
      const input = 'تأملی درباره ایران: مکتب تبریز و مبانی تجددخواهی';
      const result = transliterate(input, 'ijmes_citation_title');
      expect(result.copyable).toBe(false);

      const request = buildPhraseResolverRequest(result, 'v1');
      const requestFingerprint = computePhraseRequestFingerprint(request, 'openai', 'gpt-4o');

      const acceptedDecision: AcceptedPhraseDecision = {
        source: 'AI_ASSISTED_PHRASE',
        acceptance: 'HUMAN_ACCEPTED_AI_SUGGESTION',
        originalInput: input,
        normalizedInput: result.normalizedInput,
        profile: 'ijmes_citation_title',
        scholarlyCanonical: 'taʾammulī darbārah-i īrān: maktab-i tabrīz va mabānī-yi tajaddudkhvāhī',
        renderedOutput: 'Taʾammulī Darbārah-i Īrān: Maktab-i Tabrīz Va Mabānī-yi Tajaddudkhvāhī',
        provider: 'openai',
        model: 'gpt-4o',
        promptVersion: 'v1',
        requestFingerprint,
        modelConfidence: 0.95,
        acceptedAt: '2026-10-06T12:00:00.000Z'
      };

      // 1. Same input: accepted decision is applicable and active
      const restoredActive = resolveSelectedTransliteration(result, acceptedDecision);
      expect(restoredActive.activePhraseDecision).not.toBeNull();
      expect(restoredActive.primary).toBe('Taʾammulī Darbārah-i Īrān: Maktab-i Tabrīz Va Mabānī-yi Tajaddudkhvāhī');
      expect(restoredActive.status).toBe('USER_OVERRIDE');

      // 2. Changed input: accepted decision is stale and fails closed
      const changedInputResult = transliterate('متن کاملا متفاوت دیگر', 'ijmes_citation_title');
      const restoredStale = resolveSelectedTransliteration(changedInputResult, acceptedDecision);
      expect(restoredStale.activePhraseDecision).toBeNull();
      expect(restoredStale.primary).toBe(changedInputResult.output);
    });
  });

  describe('Workspace Isolation & Restoration Barrier', () => {
    it('isolates transliteration workspace state from bibliography workspace state', () => {
      const trans = validateAndMigrateTransliterationWorkspace({
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'متن اختصاصی',
        profile: 'ijmes_full',
        reviewDecisions: [],
        acceptedPhraseDecision: null
      });

      const bib = validateAndMigrateBibliographyWorkspace({
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        csvText: 'id,type,title\n1,BOOK,کتاب',
        records: [
          {
            id: '1',
            type: 'BOOK',
            title: 'کتاب',
            authors: [],
            editors: [],
            translators: [],
            sourceRowIndex: 1,
            sourceColumns: [],
            passthrough: {}
          }
        ],
        reviewDecisions: [],
        selectedRecordId: '1',
        filter: 'READY',
        exportMode: 'STRICT_ALL'
      });

      // Resetting transliteration does not affect bibliography
      const defaultTrans = createDefaultTransliterationWorkspace();
      expect(defaultTrans.input).not.toBe(trans.input);
      expect(bib.records).toHaveLength(1);
      expect(bib.filter).toBe('READY');

      // Resetting bibliography does not affect transliteration
      const defaultBib = createDefaultBibliographyWorkspace();
      expect(defaultBib.records).toHaveLength(0);
      expect(trans.input).toBe('متن اختصاصی');
    });

    it('validates restoration barrier contract: defaults never overwrite stored work', () => {
      const storedWork = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'تحقیق سفارشی پژوهشگر',
        profile: 'ijmes_full' as const,
        reviewDecisions: [],
        acceptedPhraseDecision: null
      };

      // When stored work exists, validation preserves it completely
      const restored = validateAndMigrateTransliterationWorkspace(storedWork);
      expect(restored.input).toBe('تحقیق سفارشی پژوهشگر');
      expect(restored.profile).toBe('ijmes_full');

      // Default fixture is distinct from researcher's stored work
      const defaultWorkspace = createDefaultTransliterationWorkspace();
      expect(restored.input).not.toBe(defaultWorkspace.input);
    });
  });
});
