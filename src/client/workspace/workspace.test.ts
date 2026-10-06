import { describe, expect, it } from 'vitest';
import {
  parseTransliterationWorkspace,
  parseBibliographyWorkspace,
  validateAndMigrateTransliterationWorkspace,
  validateAndMigrateBibliographyWorkspace,
  toPersistedAcceptedPhraseDecision,
  fromPersistedAcceptedPhraseDecision
} from './validation';
import {
  createDefaultTransliterationWorkspace,
  createDefaultBibliographyWorkspace
} from './defaults';
import { OperationQueue } from './operationQueue';
import { transliterationQueue, bibliographyQueue } from './workspaceRepository';
import { transliterate } from '../../domain/engine';
import {
  resolveSelectedTransliteration,
  buildPhraseResolverRequest,
  computePhraseRequestFingerprint
} from '../../domain/assistance';
import { processBibliographyBatch } from '../../domain/bibliography/processBatch';
import type { ReviewDecision } from '../../domain/types';
import type { AcceptedPhraseDecision } from '../../domain/assistance/phraseTypes';
import type { BibliographyRecord } from '../../domain/bibliography/types';
import type { PersistedAcceptedPhraseDecisionV1 } from './types';

describe('Local Research Workspace Persistence', () => {
  describe('Schema Validation, Versioning, and Strict Boundaries', () => {
    it('validates and round-trips a valid TransliterationWorkspaceV1', () => {
      const original = {
        schemaVersion: 1 as const,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'تاریخ بیداری ایرانیان',
        profile: 'ijmes_citation_title' as const,
        reviewDecisions: [
          {
            issueId: 'issue-1',
            action: 'SELECT_LEXICAL_READING' as const,
            selectedAlternativeId: 'alt-1'
          }
        ],
        acceptedPhraseDecision: null
      };

      const parseRes = parseTransliterationWorkspace(original);
      expect(parseRes.success).toBe(true);
      if (parseRes.success) {
        expect(parseRes.data).toEqual(original);
      }
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

    it('rejects unknown profile as CORRUPTED_DATA rather than silently defaulting', () => {
      const unknownProf = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'ایران',
        profile: 'unknown_custom_profile',
        reviewDecisions: [],
        acceptedPhraseDecision: null
      };

      const parseRes = parseTransliterationWorkspace(unknownProf);
      expect(parseRes.success).toBe(false);
      if (!parseRes.success) {
        expect(parseRes.reason).toBe('CORRUPTED_DATA');
      }
    });

    it('rejects missing schemaVersion as CORRUPTED_DATA', () => {
      const missingVersion = {
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'ایران',
        profile: 'ijmes_full',
        reviewDecisions: []
      };

      const parseRes = parseTransliterationWorkspace(missingVersion);
      expect(parseRes.success).toBe(false);
      if (!parseRes.success) {
        expect(parseRes.reason).toBe('CORRUPTED_DATA');
      }

      const bibMissingVersion = {
        updatedAt: '2026-10-06T12:00:00.000Z',
        csvText: 'something',
        records: []
      };
      const bibParseRes = parseBibliographyWorkspace(bibMissingVersion);
      expect(bibParseRes.success).toBe(false);
      if (!bibParseRes.success) {
        expect(bibParseRes.reason).toBe('CORRUPTED_DATA');
      }
    });

    it('does NOT coerce unknown future schemaVersion to V1 (returns UNSUPPORTED_SCHEMA)', () => {
      const futureWorkspace = {
        schemaVersion: 2,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'متن پیشرفته در نگارش ۲',
        profile: 'ijmes_full',
        futureField: 'special_metadata'
      };

      const parseRes = parseTransliterationWorkspace(futureWorkspace);
      expect(parseRes.success).toBe(false);
      if (!parseRes.success) {
        expect(parseRes.reason).toBe('UNSUPPORTED_SCHEMA');
        expect(parseRes.rawVersion).toBe(2);
      }

      const futureBib = {
        schemaVersion: 999,
        updatedAt: '2026-10-06T12:00:00.000Z',
        csvText: 'something'
      };

      const bibParseRes = parseBibliographyWorkspace(futureBib);
      expect(bibParseRes.success).toBe(false);
      if (!bibParseRes.success) {
        expect(bibParseRes.reason).toBe('UNSUPPORTED_SCHEMA');
        expect(bibParseRes.rawVersion).toBe(999);
      }
    });
  });

  describe('ReviewDecision Granular AI-Assistance Provenance', () => {
    it('preserves AI-assisted ReviewDecision metadata intact across persistence validation', () => {
      const decisionWithAssistance: ReviewDecision = {
        issueId: 'issue-lex-1',
        action: 'SELECT_LEXICAL_READING',
        selectedAlternativeId: 'alt-mihr',
        note: 'Accepted AI disambiguation',
        assistance: {
          suggestionId: 'sugg-001',
          provider: 'openai',
          model: 'gpt-4o',
          promptVersion: 'v1',
          requestFingerprint: 'fp-xyz-987'
        }
      };

      const workspace = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'مهر',
        profile: 'ijmes_full' as const,
        reviewDecisions: [decisionWithAssistance],
        acceptedPhraseDecision: null
      };

      const validated = validateAndMigrateTransliterationWorkspace(workspace);
      expect(validated.reviewDecisions).toHaveLength(1);
      expect(validated.reviewDecisions[0].assistance).toEqual({
        suggestionId: 'sugg-001',
        provider: 'openai',
        model: 'gpt-4o',
        promptVersion: 'v1',
        requestFingerprint: 'fp-xyz-987'
      });
    });

    it('rejects ReviewDecision when assistance metadata is malformed/incomplete (fails closed)', () => {
      const decisionWithBrokenAssistance = {
        issueId: 'issue-lex-1',
        action: 'SELECT_LEXICAL_READING',
        selectedAlternativeId: 'alt-mihr',
        assistance: {
          suggestionId: 'sugg-001',
          provider: 'openai'
          // missing model, promptVersion, requestFingerprint
        }
      };

      const workspace = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'مهر',
        profile: 'ijmes_full' as const,
        reviewDecisions: [decisionWithBrokenAssistance],
        acceptedPhraseDecision: null
      };

      const validated = validateAndMigrateTransliterationWorkspace(workspace);
      // Malformed AI decision is dropped, never converted into a fake manual decision
      expect(validated.reviewDecisions).toHaveLength(0);
    });

    it('preserves AI assistance metadata in BibliographyReviewDecision', () => {
      const bibDecision = {
        recordId: 'rec_101',
        fieldPath: 'title' as const,
        decision: {
          issueId: 'issue-title-1',
          action: 'SELECT_LEXICAL_READING' as const,
          selectedAlternativeId: 'alt-zaval',
          assistance: {
            suggestionId: 'sugg-bib-1',
            provider: 'openai',
            model: 'gpt-4o',
            promptVersion: 'v1',
            requestFingerprint: 'fp-bib-123'
          }
        }
      };

      const workspace = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        csvText: '',
        records: [],
        reviewDecisions: [bibDecision],
        selectedRecordId: null,
        filter: 'ALL' as const,
        exportMode: 'STRICT_ALL' as const
      };

      const validated = validateAndMigrateBibliographyWorkspace(workspace);
      expect(validated.reviewDecisions).toHaveLength(1);
      expect(validated.reviewDecisions[0].decision.assistance).toEqual({
        suggestionId: 'sugg-bib-1',
        provider: 'openai',
        model: 'gpt-4o',
        promptVersion: 'v1',
        requestFingerprint: 'fp-bib-123'
      });
    });
  });

  describe('Accepted Phrase Decision Strict Identity & Rendering Invariants', () => {
    it('persists AcceptedPhraseDecision without renderedOutput and recomputes rendering on hydration', () => {
      const runtimeDecision: AcceptedPhraseDecision = {
        source: 'AI_ASSISTED_PHRASE',
        acceptance: 'HUMAN_ACCEPTED_AI_SUGGESTION',
        originalInput: 'شبهای تیره در فراموشخانه اشباح',
        normalizedInput: 'شبهای تیره در فراموشخانه اشباح',
        profile: 'ijmes_citation_title',
        scholarlyCanonical: 'shabhā-yi tīra dar farāmūshkhāna-yi ashbāḥ',
        renderedOutput: 'OLD_STALE_CACHED_RENDERING_DO_NOT_PERSIST',
        provider: 'openai',
        model: 'gpt-4o',
        promptVersion: 'v1',
        requestFingerprint: 'fp-12345',
        modelConfidence: 0.95,
        acceptedAt: '2026-10-06T12:00:00.000Z'
      };

      const persisted = toPersistedAcceptedPhraseDecision(runtimeDecision);
      expect((persisted as any).renderedOutput).toBeUndefined();
      expect(persisted.scholarlyCanonical).toBe('shabhā-yi tīra dar farāmūshkhāna-yi ashbāḥ');

      const hydratedCitation = fromPersistedAcceptedPhraseDecision(persisted, 'ijmes_citation_title');
      expect(hydratedCitation.renderedOutput).toBe('Shabhā-yi Tīra Dar Farāmūshkhāna-yi Ashbāḥ');
      expect(hydratedCitation.renderedOutput).not.toBe('OLD_STALE_CACHED_RENDERING_DO_NOT_PERSIST');

      const hydratedFull = fromPersistedAcceptedPhraseDecision(persisted, 'ijmes_full');
      expect(hydratedFull.renderedOutput).toBe('shabhā-yi tīra dar farāmūshkhāna-yi ashbāḥ');
    });

    it('rejects accepted phrase decision when originalInput or normalizedInput is missing (never synthesizes identity)', () => {
      const missingOriginalInput = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'ایران',
        profile: 'ijmes_citation_title',
        reviewDecisions: [],
        acceptedPhraseDecision: {
          source: 'AI_ASSISTED_PHRASE',
          acceptance: 'HUMAN_ACCEPTED_AI_SUGGESTION',
          // originalInput missing!
          normalizedInput: 'ایران',
          profile: 'ijmes_citation_title',
          scholarlyCanonical: 'īrān',
          provider: 'openai',
          model: 'gpt-4o',
          promptVersion: 'v1',
          requestFingerprint: 'fp-123',
          acceptedAt: '2026-10-06T12:00:00.000Z'
        }
      };

      const validated1 = validateAndMigrateTransliterationWorkspace(missingOriginalInput);
      expect(validated1.acceptedPhraseDecision).toBeNull();

      const missingNormalizedInput = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'ایران',
        profile: 'ijmes_citation_title',
        reviewDecisions: [],
        acceptedPhraseDecision: {
          source: 'AI_ASSISTED_PHRASE',
          acceptance: 'HUMAN_ACCEPTED_AI_SUGGESTION',
          originalInput: 'ایران',
          // normalizedInput missing!
          profile: 'ijmes_citation_title',
          scholarlyCanonical: 'īrān',
          provider: 'openai',
          model: 'gpt-4o',
          promptVersion: 'v1',
          requestFingerprint: 'fp-123',
          acceptedAt: '2026-10-06T12:00:00.000Z'
        }
      };

      const validated2 = validateAndMigrateTransliterationWorkspace(missingNormalizedInput);
      expect(validated2.acceptedPhraseDecision).toBeNull();
    });
  });

  describe('Bibliography Workspace Strict Validation', () => {
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
          sourceColumns: [{ header: 'title', value: 'زوال اندیشه سیاسی در ایران' }],
          passthrough: { custom_note: 'attested in library catalog' }
        }
      ];

      const original = {
        schemaVersion: 1 as const,
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

    it('rejects record when passthrough is missing or not a string-to-string dictionary', () => {
      const recordMissingPassthrough = {
        id: 'rec_bad_1',
        type: 'BOOK',
        title: 'کتاب',
        authors: [],
        editors: [],
        translators: [],
        sourceRowIndex: 1,
        sourceColumns: []
        // missing passthrough
      };

      const recordNonStringPassthrough = {
        id: 'rec_bad_2',
        type: 'BOOK',
        title: 'کتاب ۲',
        authors: [],
        editors: [],
        translators: [],
        sourceRowIndex: 2,
        sourceColumns: [],
        passthrough: { count: 42 } // non-string value!
      };

      const workspace = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        csvText: '',
        records: [recordMissingPassthrough, recordNonStringPassthrough],
        reviewDecisions: [],
        selectedRecordId: null,
        filter: 'ALL',
        exportMode: 'STRICT_ALL'
      };

      const validated = validateAndMigrateBibliographyWorkspace(workspace);
      expect(validated.records).toHaveLength(0);
    });
  });

  describe('Production OperationQueue and Write Serialization', () => {
    it('guarantees sequential commit order with the production OperationQueue class', async () => {
      const queue = new OperationQueue();
      const events: string[] = [];

      const opA = queue.enqueue(async () => {
        await new Promise((r) => setTimeout(r, 40));
        events.push('COMMIT_A');
      });

      const opB = queue.enqueue(async () => {
        events.push('COMMIT_B');
      });

      await Promise.all([opA, opB]);
      expect(events).toEqual(['COMMIT_A', 'COMMIT_B']);
    });

    it('guarantees Clear Workspace wins over an in-flight delayed save with production queues', async () => {
      let durableState: string | null = null;

      const slowSave = transliterationQueue.enqueue(async () => {
        await new Promise((r) => setTimeout(r, 30));
        durableState = 'SAVED_WORK';
      });

      const clearOp = transliterationQueue.enqueue(async () => {
        durableState = null;
      });

      await Promise.all([slowSave, clearOp]);
      expect(durableState).toBeNull();
    });

    it('isolates transliteration and bibliography queues completely', async () => {
      const events: string[] = [];

      const transOp = transliterationQueue.enqueue(async () => {
        await new Promise((r) => setTimeout(r, 30));
        events.push('TRANS_DONE');
      });

      const bibOp = bibliographyQueue.enqueue(async () => {
        events.push('BIB_DONE');
      });

      await Promise.all([transOp, bibOp]);

      // Bibliography does not wait for transliteration queue
      expect(events[0]).toBe('BIB_DONE');
      expect(events[1]).toBe('TRANS_DONE');
    });
  });
});
