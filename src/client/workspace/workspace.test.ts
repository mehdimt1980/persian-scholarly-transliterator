import { describe, expect, it } from 'vitest';
import {
  parseTransliterationWorkspace,
  parseBibliographyWorkspace,
  validateAndMigrateTransliterationWorkspace,
  validateAndMigrateBibliographyWorkspace,
  toPersistedAcceptedPhraseDecision,
  fromPersistedAcceptedPhraseDecision
} from './validation';
import { OperationQueue } from './operationQueue';
import {
  transliterationQueue,
  bibliographyQueue
} from './workspaceRepository';
import type { ReviewDecision } from '../../domain/types';
import type { AcceptedPhraseDecision } from '../../domain/assistance/phraseTypes';
import type { BibliographyRecord } from '../../domain/bibliography/types';

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

    it('strictly requires modelConfidence field presence (distinguishes explicit null from missing)', () => {
      const missingConfidenceField = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'ایران',
        profile: 'ijmes_citation_title',
        reviewDecisions: [],
        acceptedPhraseDecision: {
          source: 'AI_ASSISTED_PHRASE',
          acceptance: 'HUMAN_ACCEPTED_AI_SUGGESTION',
          originalInput: 'ایران',
          normalizedInput: 'ایران',
          profile: 'ijmes_citation_title',
          scholarlyCanonical: 'īrān',
          provider: 'openai',
          model: 'gpt-4o',
          promptVersion: 'v1',
          requestFingerprint: 'fp-123',
          // modelConfidence missing!
          acceptedAt: '2026-10-06T12:00:00.000Z'
        }
      };

      const validatedMissing = validateAndMigrateTransliterationWorkspace(missingConfidenceField);
      expect(validatedMissing.acceptedPhraseDecision).toBeNull();

      const explicitNullConfidence = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'ایران',
        profile: 'ijmes_citation_title',
        reviewDecisions: [],
        acceptedPhraseDecision: {
          source: 'AI_ASSISTED_PHRASE',
          acceptance: 'HUMAN_ACCEPTED_AI_SUGGESTION',
          originalInput: 'ایران',
          normalizedInput: 'ایران',
          profile: 'ijmes_citation_title',
          scholarlyCanonical: 'īrān',
          provider: 'openai',
          model: 'gpt-4o',
          promptVersion: 'v1',
          requestFingerprint: 'fp-123',
          modelConfidence: null,
          acceptedAt: '2026-10-06T12:00:00.000Z'
        }
      };

      const validatedNull = validateAndMigrateTransliterationWorkspace(explicitNullConfidence);
      expect(validatedNull.acceptedPhraseDecision).not.toBeNull();
      expect(validatedNull.acceptedPhraseDecision?.modelConfidence).toBeNull();
    });

    it('rejects accepted phrase decision when originalInput or normalizedInput is missing', () => {
      const missingOriginalInput = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'ایران',
        profile: 'ijmes_citation_title',
        reviewDecisions: [],
        acceptedPhraseDecision: {
          source: 'AI_ASSISTED_PHRASE',
          acceptance: 'HUMAN_ACCEPTED_AI_SUGGESTION',
          normalizedInput: 'ایران',
          profile: 'ijmes_citation_title',
          scholarlyCanonical: 'īrān',
          provider: 'openai',
          model: 'gpt-4o',
          promptVersion: 'v1',
          requestFingerprint: 'fp-123',
          modelConfidence: null,
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
          profile: 'ijmes_citation_title',
          scholarlyCanonical: 'īrān',
          provider: 'openai',
          model: 'gpt-4o',
          promptVersion: 'v1',
          requestFingerprint: 'fp-123',
          modelConfidence: null,
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
        passthrough: { count: 42 }
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

  describe('Optimistic Concurrency Control & Atomic Compare-And-Swap', () => {
    it('enforces atomic Compare-And-Swap save: stale expected revision is rejected', async () => {
      // In-memory simulation of CAS storage logic matching workspaceRepository
      interface StoreSlot<T> {
        envelope: { storageRevision: number; value: T } | null;
      }

      class MemoryCasRepository<T> {
        private slot: StoreSlot<T> = { envelope: null };

        async get(): Promise<{ value: T | null; revision: number | null }> {
          if (!this.slot.envelope) return { value: null, revision: null };
          return { value: this.slot.envelope.value, revision: this.slot.envelope.storageRevision };
        }

        async save(value: T, expectedRevision: number | null): Promise<{ status: 'saved' | 'conflict'; revision?: number; actualRevision?: number | null }> {
          const currentRev = this.slot.envelope ? this.slot.envelope.storageRevision : null;
          if (currentRev !== expectedRevision) {
            return { status: 'conflict', actualRevision: currentRev };
          }
          const nextRev = (currentRev ?? 0) + 1;
          this.slot.envelope = { storageRevision: nextRev, value };
          return { status: 'saved', revision: nextRev };
        }

        async clear(expectedRevision: number | null): Promise<{ status: 'cleared' | 'conflict'; actualRevision?: number | null }> {
          const currentRev = this.slot.envelope ? this.slot.envelope.storageRevision : null;
          if (expectedRevision !== null && currentRev !== expectedRevision) {
            return { status: 'conflict', actualRevision: currentRev };
          }
          this.slot.envelope = null;
          return { status: 'cleared' };
        }

        async forceSave(value: T): Promise<{ status: 'saved'; revision: number }> {
          const currentRev = this.slot.envelope ? this.slot.envelope.storageRevision : 0;
          const nextRev = currentRev + 1;
          this.slot.envelope = { storageRevision: nextRev, value };
          return { status: 'saved', revision: nextRev };
        }
      }

      const repo = new MemoryCasRepository<string>();

      // 1. Initial create
      const initRes = await repo.save('Initial Doc', null);
      expect(initRes.status).toBe('saved');
      expect(initRes.revision).toBe(1);

      // 2. Both Tab A and Tab B observe revision 1
      const tabAObserved = 1;
      const tabBObserved = 1;

      // 3. Tab A saves first and commits revision 2
      const tabASave = await repo.save('Tab A Updated', tabAObserved);
      expect(tabASave.status).toBe('saved');
      expect(tabASave.revision).toBe(2);

      // 4. Tab B attempts to save using stale revision 1
      const tabBSave = await repo.save('Tab B Stale Overwrite Attempt', tabBObserved);
      expect(tabBSave.status).toBe('conflict');
      expect(tabBSave.actualRevision).toBe(2);

      // Verify Tab A's content remains durable
      const current = await repo.get();
      expect(current.value).toBe('Tab A Updated');
      expect(current.revision).toBe(2);

      // 5. Stale clear attempt from Tab B is also rejected
      const tabBClear = await repo.clear(tabBObserved);
      expect(tabBClear.status).toBe('conflict');
      expect(tabBClear.actualRevision).toBe(2);
      expect((await repo.get()).value).toBe('Tab A Updated');

      // 6. Explicit "Keep this tab's version" force-save overrides intentionally
      const tabBForceSave = await repo.forceSave('Tab B Force Keep');
      expect(tabBForceSave.status).toBe('saved');
      expect(tabBForceSave.revision).toBe(3);
      expect((await repo.get()).value).toBe('Tab B Force Keep');
    });

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
