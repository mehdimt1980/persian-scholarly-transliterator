import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assessLanguageEvidence, classifyScript, pairTitles } from './classification';
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

  it('rejects invalid and stalled pagination metadata', async () => {
    expect(() => ciniiResponseSchema.parse({ 'opensearch:totalResults': 'NaN', 'opensearch:startIndex': 1, 'opensearch:itemsPerPage': 0, items: [] })).toThrow();
    expect(() => ciniiResponseSchema.parse({ 'opensearch:totalResults': -1, 'opensearch:startIndex': 1, 'opensearch:itemsPerPage': 0, items: [] })).toThrow();
    const item = (fixture() as { items: unknown[] }).items[0];
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ 'opensearch:totalResults': 1, 'opensearch:startIndex': 1, 'opensearch:itemsPerPage': 0, items: [item] }), { status: 200 }));
    const client = new CiniiResearchClient({ appId: 'secret', maxRecords: 1, maxRequests: 1, delayMs: 250, fetchImpl });
    await expect(client.fetchPilot(QUERY)).rejects.toThrow(/itemsPerPage is zero/u);
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
    expect(assessLanguageEvidence([{ value: 'علم و دین', language: 'fa', sourceField: 'title' }], ['fa']).assessment).toBe('POSITIVE_PERSIAN_EVIDENCE');
    expect(assessLanguageEvidence([{ value: 'كتاب التاريخ', language: 'ar', sourceField: 'title' }], ['ar']).assessment).toBe('AMBIGUOUS');
    expect(assessLanguageEvidence([{ value: 'كتاب التاريخ', language: 'ar', sourceField: 'title' }], ['fa']).assessment).toBe('CONTRADICTORY');
  });

  it('separates romanizations, translations, and undetermined Latin variants', () => {
    const romanized = pairTitles([{ value: 'فرهنگ فارسی', sourceField: 'title' }, { value: 'Farhang-i Farsi', sourceField: 'title', explicitRelationship: 'ROMANIZATION' }]);
    expect(romanized.status).toBe('PERSIAN_WITH_OBSERVED_ROMANIZATION'); expect(romanized.latinVariants[0].classification).toBe('ROMANIZATION_CANDIDATE');
    const translated = pairTitles([{ value: 'تاریخ ایران', sourceField: 'title' }, { value: 'History of Iran', sourceField: 'title', explicitRelationship: 'TRANSLATION' }]);
    expect(translated.status).toBe('UNCERTAIN_LANGUAGE_OR_PAIRING'); expect(translated.latinVariants[0].classification).toBe('TRANSLATED_TITLE');
    const ambiguous = pairTitles([{ value: 'تاریخ ایران', sourceField: 'title' }, { value: 'Tarikh-i Iran', sourceField: 'title' }]);
    expect(ambiguous.latinVariants[0].classification).toBe('UNDETERMINED_LATIN_VARIANT');
    const multiple = pairTitles([{ value: 'شاهنامه پژوهی', sourceField: 'title' }, { value: 'Shahnamah', sourceField: 'title', explicitRelationship: 'ROMANIZATION' }, { value: 'Shahnameh Studies', sourceField: 'title', explicitRelationship: 'TRANSLATION' }]);
    expect(multiple.status).toBe('MULTIPLE_ROMANIZATION_VARIANTS'); expect(multiple.latinVariants.map((item) => item.classification)).toEqual(['ROMANIZATION_CANDIDATE', 'TRANSLATED_TITLE']);
    expect(pairTitles([{ value: 'كتاب التاريخ', sourceField: 'title' }]).status).toBe('UNCERTAIN_LANGUAGE_OR_PAIRING');
  });

  it('extracts metadata-supported Persian titles without distinctive letters', () => {
    const response = { 'opensearch:totalResults': 1, 'opensearch:startIndex': 1, 'opensearch:itemsPerPage': 1, items: [{ '@id': 'https://cir.nii.ac.jp/crid/100000000000099', title: [{ '@value': 'علم و ادب', '@language': 'fa' }], 'dc:language': ['fa'] }] };
    const [record] = parseCiniiItems(response, QUERY, TIME);
    expect(record.scriptClassification).toBe('ARABIC_SCRIPT_UNCERTAIN_LANGUAGE'); expect(record.persianTitle).toBe('علم و ادب'); expect(record.languageEvidence.assessment).toBe('POSITIVE_PERSIAN_EVIDENCE');
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
    expect(first[2].identifiers).toEqual({ crid: '100000000000003', ncid: null, isbns: [], oclcs: ['123456789'] });
    first.forEach((record) => expect(ciniiEvidenceRecordSchema.parse(record)).toEqual(record));
  });

  it('preserves explicit WorldCat links without constructing identities', () => {
    const records = parseCiniiItems(fixture(), QUERY, TIME); expect(records[2].crossCatalogReferences).toEqual([{ catalog: 'WORLDCAT', oclc: '123456789', url: 'https://www.worldcat.org/oclc/123456789', sourceField: 'rdfs:seeAlso', relationship: 'CROSS_CATALOG_LINK_UNVERIFIED' }]);
    const malformed = fixture() as { items: Array<Record<string, unknown>> }; malformed.items[2]['rdfs:seeAlso'] = ['not-a-url', 'https://example.org/oclc/99999', 'https://worldcat.org/title/no-oclc'];
    const [,, record] = parseCiniiItems(malformed, QUERY, TIME); expect(record.identifiers.oclcs).toEqual([]); expect(record.crossCatalogReferences).toHaveLength(1); expect(record.crossCatalogReferences[0].oclc).toBeNull();
  });

  it('distinguishes shared identifiers from related editions', () => {
    const records = parseCiniiItems(fixture(), QUERY, TIME);
    const shared = structuredClone(records[1]); shared.sourceRecordId = 'another'; shared.recordId = 'another'; shared.identifiers.ncid = records[1].identifiers.ncid;
    expect(assignBibliographicRelationships([records[1], shared]).every((record) => record.bibliographicIdentityStatus === 'DUPLICATE_MANIFESTATION')).toBe(true);
    const worldcatShared = structuredClone(records[2]); worldcatShared.sourceRecordId = 'worldcat-shared'; worldcatShared.recordId = 'worldcat-shared'; worldcatShared.identifiers.crid = 'worldcat-shared';
    expect(assignBibliographicRelationships([records[2], worldcatShared]).every((record) => record.bibliographicIdentityStatus === 'DUPLICATE_MANIFESTATION')).toBe(true);
    const related = assignBibliographicRelationships(records);
    expect(related[0].bibliographicIdentityStatus).toBe('RELATED_EDITION'); expect(related[6].bibliographicIdentityStatus).toBe('RELATED_EDITION');
  });

  it('does not promote same-title evidence without a shared work basis', () => {
    const [base] = parseCiniiItems(fixture(), QUERY, TIME); const differentAuthor = structuredClone(base); differentAuthor.recordId = 'different-author'; differentAuthor.sourceRecordId = 'different-author'; differentAuthor.identifiers = { crid: 'different-author', ncid: null, isbns: [], oclcs: [] }; differentAuthor.authors = ['دیگری'];
    expect(assignBibliographicRelationships([base, differentAuthor]).every((record) => record.bibliographicIdentityStatus === 'SIMILAR_TITLE_ONLY')).toBe(true);
    const missing = structuredClone(base); missing.recordId = 'missing'; missing.sourceRecordId = 'missing'; missing.identifiers = { crid: 'missing', ncid: null, isbns: [], oclcs: [] }; missing.publicationMetadata = { publisher: null, publicationYear: null };
    expect(assignBibliographicRelationships([base, missing]).every((record) => record.bibliographicIdentityStatus === 'UNCERTAIN_RELATIONSHIP')).toBe(true);
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
