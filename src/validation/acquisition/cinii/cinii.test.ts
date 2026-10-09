import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyScript, pairTitles } from './classification';
import { CiniiResearchClient, buildCiniiQueryUrl, retryAfterMs, safeRequestUrl } from './client';
import { runCiniiCli } from './cli';
import { toPhase8cReviewCandidates } from './converter';
import { parseCiniiItems } from './parser';
import { assignBibliographicRelationships, buildArtifact } from './pipeline';
import { ciniiEvidenceRecordSchema, ciniiQuerySchema, ciniiResponseSchema } from './schema';
import type { CiniiQueryConfig } from './types';

const ROOT = path.resolve(__dirname, '../../../..');
const FIXTURE_PATH = path.join(ROOT, 'validation/acquisition/cinii/mock-response.v1.json');
const QUERY: CiniiQueryConfig = { queryId: 'test-query', q: 'Persian', languageType: ['fa'], sortorder: 0, count: 2 };
const TIME = '2026-10-09T00:00:00.000Z';
const fixture = (): unknown => JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as unknown;

afterEach(() => vi.restoreAllMocks());

describe('CiNii query and client controls', () => {
  it('constructs documented v2 book queries and strips credentials from safe logs', () => {
    const url = buildCiniiQueryUrl(QUERY, 'secret-app-id', 3);
    expect(url.origin + url.pathname).toBe('https://cir.nii.ac.jp/opensearch/v2/books');
    expect(url.searchParams.get('languageType')).toBe('fa');
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.get('start')).toBe('3');
    expect(safeRequestUrl(url)).not.toContain('secret-app-id');
    expect(safeRequestUrl(url)).not.toContain('appid');
  });

  it('rejects undeclared searches and unsafe pilot budgets', () => {
    expect(() => ciniiQuerySchema.parse({ queryId: 'x', sortorder: 0, count: 1 })).toThrow();
    expect(() => new CiniiResearchClient({ appId: '', maxRecords: 1, maxRequests: 1, delayMs: 250 })).toThrow(/CINII_APP_ID/u);
    expect(() => new CiniiResearchClient({ appId: 'x', maxRecords: 101, maxRequests: 1, delayMs: 250 })).toThrow(/100/u);
    expect(() => new CiniiResearchClient({ appId: 'x', maxRecords: 1, maxRequests: 1, delayMs: 249 })).toThrow(/250/u);
  });

  it('parses Retry-After seconds and HTTP dates', () => {
    expect(retryAfterMs('2', 0)).toBe(2000);
    expect(retryAfterMs('Thu, 01 Jan 1970 00:00:03 GMT', 1000)).toBe(2000);
    expect(retryAfterMs('invalid', 0)).toBeNull();
  });

  it('paginates within record/request budgets', async () => {
    const pages = [
      { 'opensearch:totalResults': 3, 'opensearch:startIndex': 1, 'opensearch:itemsPerPage': 2, items: (fixture() as { items: unknown[] }).items.slice(0, 2) },
      { 'opensearch:totalResults': 3, 'opensearch:startIndex': 3, 'opensearch:itemsPerPage': 1, items: (fixture() as { items: unknown[] }).items.slice(2, 3) }
    ];
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(pages.shift()), { status: 200 }));
    const client = new CiniiResearchClient({ appId: 'secret', maxRecords: 3, maxRequests: 2, delayMs: 250, fetchImpl, sleep: async () => undefined });
    const result = await client.fetchPilot(QUERY);
    expect(result.items).toHaveLength(3); expect(result.requests).toBe(2); expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.requestUrls.every((url) => !url.includes('secret'))).toBe(true);
  });

  it('honors 429 Retry-After and bounded retry', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ 'opensearch:totalResults': 0, 'opensearch:startIndex': 1, 'opensearch:itemsPerPage': 0, items: [] }), { status: 200 }));
    const sleep = vi.fn(async () => undefined);
    const client = new CiniiResearchClient({ appId: 'secret', maxRecords: 1, maxRequests: 2, delayMs: 250, retries: 1, fetchImpl, sleep });
    const result = await client.fetchPilot(QUERY);
    expect(result.requests).toBe(2); expect(sleep).toHaveBeenCalledWith(2000);
  });
});

describe('CiNii parsing and evidence classification', () => {
  it('validates the response and rejects malformed records', () => {
    expect(ciniiResponseSchema.parse(fixture()).items).toHaveLength(7);
    expect(() => ciniiResponseSchema.parse({ items: [] })).toThrow();
    const invalid = fixture() as { items: Array<Record<string, unknown>> }; invalid.items[0] = { '@id': 'not-a-url', title: [] };
    expect(() => parseCiniiItems(invalid, QUERY, TIME)).toThrow();
  });

  it('classifies Persian, uncertain Arabic, mixed, and Latin scripts conservatively', () => {
    expect(classifyScript('پژوهش فارسی')).toBe('PERSIAN_SCRIPT');
    expect(classifyScript('كتاب التاريخ')).toBe('ARABIC_SCRIPT_UNCERTAIN_LANGUAGE');
    expect(classifyScript('Persian ایران')).toBe('MIXED_ARABIC_LATIN');
    expect(classifyScript('Persian studies')).toBe('LATIN_ONLY');
  });

  it('pairs only explicit same-record title variants', () => {
    expect(pairTitles([{ value: 'فرهنگ فارسی', sourceField: 'title' }, { value: 'Farhang-i Farsi', sourceField: 'title' }]).status).toBe('PERSIAN_WITH_OBSERVED_ROMANIZATION');
    expect(pairTitles([{ value: 'شاهنامه پژوهی', sourceField: 'title' }, { value: 'Shahnamah', sourceField: 'title' }, { value: 'Šāhnāme', sourceField: 'title' }]).status).toBe('MULTIPLE_ROMANIZATION_VARIANTS');
    expect(pairTitles([{ value: 'كتاب التاريخ', sourceField: 'title' }]).status).toBe('UNCERTAIN_LANGUAGE_OR_PAIRING');
  });

  it('normalizes NFC/NFD-equivalent Persian text to stable content', () => {
    const source = fixture() as { items: Array<Record<string, unknown>> };
    const nfc = structuredClone(source); const nfd = structuredClone(source);
    nfc.items[0].title = [{ '@value': 'آثار پژوهشی', '@language': 'fa' }];
    nfd.items[0].title = [{ '@value': 'آثار پژوهشی'.normalize('NFD'), '@language': 'fa' }];
    const [a] = parseCiniiItems(nfc, QUERY, TIME); const [b] = parseCiniiItems(nfd, QUERY, TIME);
    expect(a.normalizedPersianTitle).toBe(b.normalizedPersianTitle);
  });

  it('preserves provenance, stable hashes, and missing identifiers', () => {
    const first = parseCiniiItems(fixture(), QUERY, TIME); const second = parseCiniiItems(fixture(), QUERY, TIME);
    expect(first.map((record) => record.contentHash)).toEqual(second.map((record) => record.contentHash));
    expect(first[0].provenance.officialDocumentation).toContain('support.nii.ac.jp');
    expect(first[2].identifiers).toEqual({ crid: '100000000000003', ncid: null, isbns: [] });
    first.forEach((record) => expect(ciniiEvidenceRecordSchema.parse(record)).toEqual(record));
  });

  it('distinguishes shared identifiers from related editions', () => {
    const records = parseCiniiItems(fixture(), QUERY, TIME);
    const shared = structuredClone(records[1]); shared.sourceRecordId = 'another'; shared.recordId = 'another'; shared.identifiers.ncid = records[1].identifiers.ncid;
    expect(assignBibliographicRelationships([records[1], shared]).every((record) => record.bibliographicIdentityStatus === 'DUPLICATE_MANIFESTATION')).toBe(true);
    const related = assignBibliographicRelationships(records);
    expect(related[0].bibliographicIdentityStatus).toBe('RELATED_EDITION'); expect(related[6].bibliographicIdentityStatus).toBe('RELATED_EDITION');
  });
});

describe('offline acquisition and Phase 8C boundary', () => {
  it('is reproducible without network access', async () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cinii-offline-'));
    const directory = path.join(temporary, 'validation/acquisition/cinii'); fs.mkdirSync(directory, { recursive: true }); fs.copyFileSync(FIXTURE_PATH, path.join(directory, 'mock-response.v1.json'));
    const fetchImpl = vi.fn(async () => { throw new Error('network must not be called'); });
    const first = await runCiniiCli({ cwd: temporary, args: [], fetchImpl }); const firstText = fs.readFileSync(first.output, 'utf8');
    const second = await runCiniiCli({ cwd: temporary, args: [], fetchImpl }); const secondText = fs.readFileSync(second.output, 'utf8');
    expect(first.mode).toBe('OFFLINE_MOCKED'); expect(firstText).toBe(secondText); expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('requires explicit live confirmation and credentials', async () => {
    await expect(runCiniiCli({ args: ['--live'], env: { NODE_ENV: 'test' } })).rejects.toThrow(/confirm-live/u);
    await expect(runCiniiCli({ args: ['--live', '--confirm-live', '--query-id', 'x', '--query', 'y'], env: { NODE_ENV: 'test' } })).rejects.toThrow(/CINII_APP_ID/u);
  });

  it('exports review-only candidates and never creates gold references', () => {
    const artifact = buildArtifact(parseCiniiItems(fixture(), QUERY, TIME), QUERY, TIME, 'OFFLINE_MOCKED');
    const candidates = toPhase8cReviewCandidates(artifact.records); const serialized = JSON.stringify(candidates);
    expect(candidates.length).toBeGreaterThan(0); expect(candidates.every((candidate) => candidate.reviewStatus === 'REVIEW_PENDING')).toBe(true);
    expect(candidates.every((candidate) => candidate.authority === 'NON_AUTHORITATIVE_BIBLIOGRAPHIC_EVIDENCE')).toBe(true);
    expect(serialized).not.toContain('expectedIJMES'); expect(serialized).not.toContain('GOLD');
  });
});
