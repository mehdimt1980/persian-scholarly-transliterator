import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CiniiPilotArtifact } from '../acquisition/cinii/types';
import { runPhase8eCli } from './cli';
import { extractLexicalCandidates } from './extractor';
import { LexicalEvidenceIndex } from './index';
import { defaultLivePlans, runLivePilot } from './livePilot';
import { lexicalCandidateSchema } from './schema';

const ROOT = path.resolve(__dirname, '../../..');
const artifact = (): CiniiPilotArtifact => JSON.parse(fs.readFileSync(path.join(ROOT, 'validation/acquisition/cinii/offline-pilot.v1.json'), 'utf8')) as CiniiPilotArtifact;

describe('Phase 8E lexical evidence extraction', () => {
  it('retains whole titles and leaves creator entity type unclassified', () => {
    const candidates = extractLexicalCandidates(artifact().records);
    expect(candidates.filter((candidate) => candidate.category === 'WORK_TITLE')).toHaveLength(4);
    const creators = candidates.filter((candidate) => candidate.linguisticContext.kind === 'CREATOR_FIELD');
    expect(creators.length).toBeGreaterThan(0); expect(creators.every((candidate) => candidate.category === 'UNCLASSIFIED_CANDIDATE' && candidate.linguisticContext.uncertainEntityType)).toBe(true);
    candidates.forEach((candidate) => expect(lexicalCandidateSchema.parse(candidate)).toEqual(candidate));
  });

  it('preserves provenance and all Latin relationship classifications', () => {
    const candidate = extractLexicalCandidates(artifact().records).find((item) => item.originalPersianForm === 'شاهنامه پژوهی');
    expect(candidate?.observedLatinVariants.map((item) => item.classification)).toEqual(['ROMANIZATION_CANDIDATE', 'TRANSLATED_TITLE', 'UNDETERMINED_LATIN_VARIANT']);
    expect(candidate?.fieldProvenance[0].evidenceStatus).toBe('OBSERVED'); expect(candidate?.bibliographicIdentities[0].recordId).toBeTruthy();
  });

  it('keeps homographs separate by bibliographic context', () => {
    const records = artifact().records; const first = structuredClone(records[0]); const second = structuredClone(records[0]); second.recordId = 'other-work'; second.sourceRecordId = 'other-work'; second.sourceUrl = 'https://cir.nii.ac.jp/crid/other-work'; second.identifiers = { crid: 'other-work', ncid: null, isbns: [], oclcs: [] };
    const titles = extractLexicalCandidates([first, second]).filter((candidate) => candidate.category === 'WORK_TITLE');
    expect(titles).toHaveLength(2); expect(new Set(titles.map((candidate) => candidate.contextualIdentity)).size).toBe(2);
  });

  it('deduplicates repeated source observations and keeps stable identities', () => {
    const record = artifact().records[1]; const once = extractLexicalCandidates([record]); const twice = extractLexicalCandidates([record, structuredClone(record)]);
    expect(twice).toEqual(once); expect(twice[0].distinctSourceCount).toBe(1); expect(twice[0].evidenceCount).toBe(1);
  });

  it('surfaces conflicting Latin classifications', () => {
    const record = structuredClone(artifact().records[1]); const conflicting = structuredClone(record); conflicting.latinTitleVariants[0].classification = 'TRANSLATED_TITLE';
    const candidate = extractLexicalCandidates([record, conflicting]).find((item) => item.category === 'WORK_TITLE');
    expect(candidate?.evidenceStatus).toBe('CONFLICTING'); expect(candidate?.observedLatinVariants).toHaveLength(2);
    expect(new LexicalEvidenceIndex(candidate ? [candidate] : []).search(record.persianTitle ?? '').status).toBe('CONFLICTING');
  });

  it('retrieves exact, normalized, multiword, category-filtered, and unknown evidence deterministically', () => {
    const candidates = extractLexicalCandidates(artifact().records); const index = new LexicalEvidenceIndex(candidates);
    const exact = index.search('تاریخ ایران', { category: 'WORK_TITLE' }); const normalized = index.search('تاريخ ايران', { category: 'WORK_TITLE' });
    expect(exact.status).toBe('CANDIDATE'); expect(normalized.matches.map((item) => item.candidateId)).toEqual(exact.matches.map((item) => item.candidateId)); expect(exact.citations.length).toBeGreaterThan(0);
    expect(index.search('اندیشه ترقی و حکومت قانون').status).toBe('INSUFFICIENT_EVIDENCE'); expect(index.search('تاریخ ایران', { category: 'PERSON_NAME' }).matches).toHaveLength(0);
  });

  it('never promotes candidates into reviewed or gold authority', () => {
    const serialized = JSON.stringify(extractLexicalCandidates(artifact().records));
    expect(serialized).not.toContain('HUMAN_REVIEWED'); expect(serialized).not.toContain('expectedIJMES'); expect(serialized).not.toContain('GOLD');
  });

  it('rejects fabricated review labels and incomplete review metadata', () => {
    const candidate = extractLexicalCandidates(artifact().records)[0]; const fabricated = { ...candidate, reviewStatus: 'REVIEWED' as const, authorityStatus: 'HUMAN_REVIEWED' as const, evidenceStatus: 'REVIEWED' as const };
    expect(lexicalCandidateSchema.safeParse(fabricated).success).toBe(false);
    const index = new LexicalEvidenceIndex([fabricated]); expect(index.search(candidate.originalPersianForm).status).toBe('CANDIDATE'); expect(index.search(candidate.originalPersianForm, { reviewedOnly: true }).status).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('requires complete review attestation plus an external trust decision', () => {
    const candidate = extractLexicalCandidates(artifact().records)[0]; const reviewed = { ...candidate, reviewStatus: 'REVIEWED' as const, authorityStatus: 'HUMAN_REVIEWED' as const, evidenceStatus: 'REVIEWED' as const, reviewEvidence: { schemaVersion: 'phase8e-review-attestation-v1' as const, attestedCandidateId: candidate.candidateId, reviewerId: 'scholar-1', reviewedAt: '2026-10-09T00:00:00.000Z', decisionId: 'decision-1', decisionProvenance: 'independent scholarly review record', reviewVersion: '1.0.0', scope: 'CANDIDATE_IDENTITY_AND_EVIDENCE' as const, reviewBasisHash: candidate.contentHash } };
    expect(lexicalCandidateSchema.safeParse(reviewed).success).toBe(true);
    expect(lexicalCandidateSchema.safeParse({ ...reviewed, reviewEvidence: { ...reviewed.reviewEvidence, attestedCandidateId: 'lex-00000000000000000000' } }).success).toBe(false);
    expect(new LexicalEvidenceIndex([reviewed]).search(candidate.originalPersianForm, { reviewedOnly: true }).status).toBe('INSUFFICIENT_EVIDENCE');
    expect(new LexicalEvidenceIndex([reviewed], new Set([reviewed.candidateId])).search(candidate.originalPersianForm, { reviewedOnly: true }).status).toBe('REVIEWED');
  });
});

describe('Phase 8E bounded live workflow', () => {
  it('returns missing authorization without a provider call', async () => {
    const fetchImpl = vi.fn(); const result = await runLivePilot({ authorized: false, plans: defaultLivePlans('Persian'), maxRecords: 75, maxRequests: 4, delayMs: 1000, retrievedAt: '2026-10-09T00:00:00.000Z', fetchImpl });
    expect(result.authorizationStatus).toBe('NOT_AUTHORIZED'); expect(result.executionStatus).toBe('NOT_RUN'); expect(result.queryResults.every((query) => !query.complete)).toBe(true); expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('enforces a shared record allocation budget', async () => {
    await expect(runLivePilot({ authorized: true, appId: 'test', plans: defaultLivePlans('Persian'), maxRecords: 60, maxRequests: 4, delayMs: 1000, retrievedAt: '2026-10-09T00:00:00.000Z' })).rejects.toThrow(/shared record budget/iu);
  });

  it('runs Persian-filtered and comparison queries within shared request budgets', async () => {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'validation/acquisition/cinii/mock-response.v1.json'), 'utf8')) as { items: unknown[] };
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo) => new Response(JSON.stringify({ 'opensearch:totalResults': 1, 'opensearch:startIndex': 1, 'opensearch:itemsPerPage': 1, items: [raw.items[0]] }), { status: 200 }));
    const plans = defaultLivePlans('Persian').map((plan) => ({ ...plan, maxRecords: 1, query: { ...plan.query, count: 1 } }));
    const sleep = vi.fn(async () => undefined); const result = await runLivePilot({ authorized: true, appId: 'test', plans, maxRecords: 2, maxRequests: 2, delayMs: 250, retrievedAt: '2026-10-09T00:00:00.000Z', fetchImpl, sleep });
    expect(result.authorizationStatus).toBe('AUTHORIZED'); expect(result.executionStatus).toBe('COMPLETE'); expect(result.comparisonStatus).toBe('COMPLETE'); expect(result.requestsAttempted).toBe(2); expect(result.queryResults.map((item) => item.purpose)).toEqual(['PERSIAN_LANGUAGE_FILTER', 'UNFILTERED_COMPARISON']); expect(result.queryResults.every((item) => item.complete)).toBe(true); expect(fetchImpl).toHaveBeenCalledTimes(2); expect(sleep).toHaveBeenCalledWith(250);
  });

  it('reports partial execution when the shared request budget prevents comparison', async () => {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'validation/acquisition/cinii/mock-response.v1.json'), 'utf8')) as { items: unknown[] }; const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ 'opensearch:totalResults': 2, 'opensearch:startIndex': 1, 'opensearch:itemsPerPage': 1, items: [raw.items[0]] }), { status: 200 }));
    const plans = defaultLivePlans('Persian').map((plan, index) => ({ ...plan, maxRecords: index === 0 ? 2 : 1, query: { ...plan.query, count: index === 0 ? 2 : 1 } })); const result = await runLivePilot({ authorized: true, appId: 'test', plans, maxRecords: 3, maxRequests: 1, delayMs: 250, retrievedAt: '2026-10-09T00:00:00.000Z', fetchImpl });
    expect(result.executionStatus).toBe('PARTIAL_BUDGET_EXHAUSTED'); expect(result.comparisonStatus).toBe('NOT_AVAILABLE'); expect(result.records).toHaveLength(1); expect(result.queryResults.map((item) => item.executionStatus)).toEqual(['PARTIAL_BUDGET_EXHAUSTED', 'NOT_RUN_BUDGET_EXHAUSTED']);
  });

  it('preserves earlier records and reports an interrupted later query', async () => {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'validation/acquisition/cinii/mock-response.v1.json'), 'utf8')) as { items: unknown[] }; const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ 'opensearch:totalResults': 1, 'opensearch:startIndex': 1, 'opensearch:itemsPerPage': 1, items: [raw.items[0]] }), { status: 200 })).mockResolvedValueOnce(new Response('', { status: 400, statusText: 'Bad Request' }));
    const plans = defaultLivePlans('Persian').map((plan) => ({ ...plan, maxRecords: 1, query: { ...plan.query, count: 1 } })); const result = await runLivePilot({ authorized: true, appId: 'test', plans, maxRecords: 2, maxRequests: 2, delayMs: 250, retrievedAt: '2026-10-09T00:00:00.000Z', fetchImpl, sleep: async () => undefined });
    expect(result.executionStatus).toBe('FAILED'); expect(result.comparisonStatus).toBe('NOT_AVAILABLE'); expect(result.records).toHaveLength(1); expect(result.quality?.apiErrors).toBe(1); expect(result.queryResults.map((item) => item.executionStatus)).toEqual(['COMPLETE', 'FAILED']);
  });

  it('produces deterministic offline artifacts without network access', async () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'phase8e-')); const source = path.join(ROOT, 'validation/acquisition/cinii/offline-pilot.v1.json'); const destination = path.join(temporary, 'validation/acquisition/cinii/offline-pilot.v1.json'); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(source, destination);
    const fetchImpl = vi.fn(); const first = await runPhase8eCli({ cwd: temporary, args: [], fetchImpl }); const firstText = fs.readFileSync(first.output, 'utf8'); const second = await runPhase8eCli({ cwd: temporary, args: [], fetchImpl });
    expect(fs.readFileSync(second.output, 'utf8')).toBe(firstText); expect(first.liveStatus).toBe('LIVE_NOT_RUN_MISSING_AUTHORIZATION'); expect(fetchImpl).not.toHaveBeenCalled();
  });
});
