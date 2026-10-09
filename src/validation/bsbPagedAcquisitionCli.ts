/** Phase 8I: strictly bounded, read-only BSB SRU harvest.
 * Produces source-verifiable evidence and review files, never a database import.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { adaptBsbRecord } from './acquisition/bsb/adapter';
import { buildSruUrl, fetchSruPage } from './acquisition/bsb/client';
import type { LexicalCandidate } from './lexical-evidence/types';

const QUERY = { index: 'all_for_ui', relation: 'all' as const, term: 'فارسی' };
const CHECKSUM = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const MAX_ALLOWED_PAGES = 5;
const MAX_ALLOWED_PAGE_SIZE = 10;

export interface PagedEvidenceManifest {
  schemaVersion: 'phase8i-paged-bsb-v1';
  provider: 'BSB_SRU_MARCXML';
  query: typeof QUERY;
  limits: { maxPages: number; pageSize: number; maximumRequests: number; maximumRecords: number };
  pages: Array<{ startRecord: number; file: string; sourceUrl: string; rawSha256: string; recordsReceived: number; totalReported: number; nextRecordPosition: number | null }>;
  records: Array<{ id: string; firstPage: number; recordSha256: string; has880: boolean; candidateIds: string[] }>;
  reviewCandidates: Array<{ id: string; contentHash: string; recordId: string; category: string; persianForm: string; latinVariants: Array<{ value: string; classification: string }>; reviewStatus: 'UNREVIEWED'; authorityStatus: 'NON_AUTHORITATIVE_CANDIDATE' }>;
  metrics: { observed: number; unique: number; duplicateRecords: number; recordsWith880: number; eligibleRecords: number; candidateCount: number; romanizationProposals: number; candidateCategories: Record<string, number> };
  nextStartRecord: number | null;
  budgetExhausted: boolean;
  sourceComplete: boolean;
  persisted: false;
  authorityPromoted: false;
  warning: string;
}

export async function collectBsbPagedEvidence(options: {
  fetcher?: typeof fetch; maxPages?: number; pageSize?: number;
} = {}): Promise<{ manifest: PagedEvidenceManifest; rawPages: Array<{ file: string; xml: string }> }> {
  const maxPages = options.maxPages ?? MAX_ALLOWED_PAGES;
  const pageSize = options.pageSize ?? MAX_ALLOWED_PAGE_SIZE;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > MAX_ALLOWED_PAGES
    || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_ALLOWED_PAGE_SIZE) {
    throw new Error('Bounded BSB harvest limits exceeded');
  }

  const pages: PagedEvidenceManifest['pages'] = [];
  const records: PagedEvidenceManifest['records'] = [];
  const reviewCandidates: PagedEvidenceManifest['reviewCandidates'] = [];
  const rawPages: Array<{ file: string; xml: string }> = [];
  const recordChecksums = new Map<string, string>();
  const candidateHashes = new Map<string, string>();
  const categories: Record<string, number> = {};
  let observed = 0;
  let duplicates = 0;
  let with880 = 0;
  let eligible = 0;
  let proposals = 0;
  let start = 1;
  let expectedTotal: number | null = null;
  let sourceComplete = false;

  for (let attempt = 0; attempt < maxPages; attempt += 1) {
    const url = buildSruUrl(QUERY, start, pageSize);
    const { page, xml } = await fetchSruPage(url, options.fetcher ?? fetch);
    if (expectedTotal !== null && expectedTotal !== page.numberOfRecords) {
      throw new Error('BSB result count changed during paging; discard inconsistent batch');
    }
    expectedTotal = page.numberOfRecords;
    if (page.records.length && page.recordPositions[0] !== start) {
      throw new Error('BSB SRU page starts at unexpected record position');
    }
    if (!page.records.length && start <= page.numberOfRecords) {
      throw new Error('Empty BSB page before reported end of results');
    }
    if (page.records.length > pageSize) throw new Error('BSB exceeded requested page size');
    if (page.nextRecordPosition !== null && page.nextRecordPosition !== start + page.records.length) {
      throw new Error('Unexpected BSB pagination cursor');
    }
    const file = `page-${String(pages.length + 1).padStart(3, '0')}.xml`;
    pages.push({
      startRecord: start, file, sourceUrl: url.toString(), rawSha256: CHECKSUM(xml),
      recordsReceived: page.records.length, totalReported: page.numberOfRecords,
      nextRecordPosition: page.nextRecordPosition,
    });
    rawPages.push({ file, xml });
    for (const record of page.records) {
      observed++;
      const id = record.controlfields.find((field) => field.tag === '001')?.value;
      if (!id) throw new Error('Record without MARC 001');
      const checksum = CHECKSUM(record.rawXml);
      const priorChecksum = recordChecksums.get(id);
      if (priorChecksum) {
        if (checksum !== priorChecksum) throw new Error('Conflicting MARC content for repeated 001; abort batch');
        duplicates++;
        continue;
      }
      recordChecksums.set(id, checksum);
      const candidates: LexicalCandidate[] = adaptBsbRecord(record);
      if (record.datafields.some((field) => field.tag === '880')) with880++;
      if (candidates.length) eligible++;
      const candidateIds: string[] = [];
      for (const candidate of candidates) {
        if (candidate.reviewStatus !== 'UNREVIEWED'
          || candidate.authorityStatus !== 'NON_AUTHORITATIVE_CANDIDATE'
          || candidate.evidenceStatus !== 'CANDIDATE') throw new Error('Unexpected authority/review promotion');
        if (candidate.sourceRecordIds.length !== 1 || candidate.sourceRecordIds[0] !== id)
          throw new Error('Candidate has inconsistent source identity');
        const oldHash = candidateHashes.get(candidate.candidateId);
        if (oldHash) {
          if (oldHash !== candidate.contentHash) throw new Error('Candidate identity collision with different content');
          throw new Error('Duplicate candidate identity within the bounded batch');
        }
        candidateHashes.set(candidate.candidateId, candidate.contentHash);
        candidateIds.push(candidate.candidateId);
        categories[candidate.category] = (categories[candidate.category] ?? 0) + 1;
        proposals += candidate.observedLatinVariants.filter((variant) => variant.classification === 'ROMANIZATION_CANDIDATE').length;
        reviewCandidates.push({
          id: candidate.candidateId, contentHash: candidate.contentHash, recordId: id,
          category: candidate.category, persianForm: candidate.originalPersianForm,
          latinVariants: candidate.observedLatinVariants.map((variant) => ({
            value: variant.value, classification: variant.classification,
          })), reviewStatus: 'UNREVIEWED', authorityStatus: 'NON_AUTHORITATIVE_CANDIDATE',
        });
      }
      records.push({ id, firstPage: start, recordSha256: checksum,
        has880: record.datafields.some((field) => field.tag === '880'), candidateIds });
    }
    const seenPosition = start + page.records.length - 1;
    if (seenPosition >= page.numberOfRecords || page.numberOfRecords === 0) {
      if (page.nextRecordPosition !== null && page.nextRecordPosition <= page.numberOfRecords) {
        throw new Error('Conflicting SRU continuation after end of results');
      }
      sourceComplete = true;
      break;
    }
    if (page.nextRecordPosition === null) {
      throw new Error('Missing SRU continuation before end of results');
    }
    if (page.nextRecordPosition <= start) throw new Error('Non-progressing BSB cursor');
    start = page.nextRecordPosition;
  }
  const nextStartRecord = sourceComplete ? null : start;
  return {
    manifest: {
      schemaVersion: 'phase8i-paged-bsb-v1', provider: 'BSB_SRU_MARCXML', query: QUERY,
      limits: { maxPages, pageSize, maximumRequests: maxPages, maximumRecords: maxPages * pageSize },
      pages, records, reviewCandidates,
      metrics: {
        observed, unique: records.length, duplicateRecords: duplicates, recordsWith880: with880,
        eligibleRecords: eligible, candidateCount: reviewCandidates.length,
        romanizationProposals: proposals, candidateCategories: categories,
      },
      nextStartRecord, budgetExhausted: !sourceComplete, sourceComplete,
      persisted: false, authorityPromoted: false,
      warning: 'Catalogue romanizations are UNREVIEWED candidates, not verified IJMES scholarly transliterations.',
    },
    rawPages,
  };
}

if (process.argv[1]?.endsWith('bsbPagedAcquisitionCli.ts')) {
  collectBsbPagedEvidence().then(({manifest,rawPages}) => {
    const dir = path.join(process.cwd(), 'artifacts', 'phase8i-bsb-paged');
    fs.mkdirSync(dir, {recursive:true});
    for (const page of rawPages) {
      if (CHECKSUM(page.xml) !== manifest.pages.find((item)=>item.file===page.file)?.rawSha256)
        throw new Error('Raw SRU page checksum mismatch');
      fs.writeFileSync(path.join(dir, page.file), page.xml, {flag:'wx'});
    }
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest,null,2)+'\n', {flag:'wx'});
    console.log(JSON.stringify({
      status: 'BOUNDED_BSB_REVIEW_PACKAGE_READY',
      pages: manifest.pages.length, totalReported: manifest.pages[0]?.totalReported ?? 0,
      ...manifest.metrics, budgetExhausted: manifest.budgetExhausted,
      nextStartRecord: manifest.nextStartRecord, archiveDirectory: dir,
      persisted: false, authorityPromoted: false,
    },null,2));
  }).catch((error:unknown) => {
    console.error(error instanceof Error ? error.message : 'BSB acquisition failed');
    process.exitCode = 1;
  });
}
