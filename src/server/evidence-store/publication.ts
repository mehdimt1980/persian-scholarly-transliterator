import { createHash } from 'node:crypto';
import { adaptBsbRecord } from '../../validation/acquisition/bsb/adapter';
import { parseMarcCollection, parseSruMarcXml } from '../../validation/acquisition/bsb/marcxml';
import { lexicalCandidateSchema } from '../../validation/lexical-evidence/schema';
import type { WriteEnvironment } from './guard';
import type { NeonPublicationBundle } from './neon';

const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const stable = (value: unknown): string => JSON.stringify(value);
const recordsFromXml = (xml: string) => xml.includes('searchRetrieveResponse') ? parseSruMarcXml(xml).records : parseMarcCollection(xml);

export interface PreparedBsbPublication { body: Uint8Array; bundle: NeonPublicationBundle; blobPath: string; recordsObserved: number; }

export function prepareBsbPublication(options: { xml: string; environment: WriteEnvironment; now: string; queryPlan?: unknown; requestBudget?: number; recordBudget?: number }): PreparedBsbPublication {
  const body = new TextEncoder().encode(options.xml);
  const rawChecksum = sha(body);
  const runId = `run-${rawChecksum.slice(0, 20)}`;
  const blobPath = `evidence/${options.environment.namespace}/raw/sha256/${rawChecksum}.marcxml`;
  const records = recordsFromXml(options.xml);
  const versions = [];
  const projections = [];
  for (const record of records) {
    const sourceRecordId = record.controlfields.find((field) => field.tag === '001')?.value;
    if (!sourceRecordId) throw new Error('Record lacks provider identity');
    const recordChecksum = sha(record.rawXml);
    const versionId = `BSB_SRU_MARCXML:${sourceRecordId}:${recordChecksum}`;
    versions.push({ versionId, provider: 'BSB_SRU_MARCXML' as const, sourceRecordId, recordChecksum, rawChecksum, marc: record, languageEvidence: record.datafields.filter((field) => field.tag === '041').flatMap((field) => field.subfields.filter((subfield) => subfield.code === 'a').map((subfield) => subfield.value)), firstSeenAt: options.now, lastSeenAt: options.now, current: true });
    for (const candidate of adaptBsbRecord(record)) projections.push({ snapshotId: '', sourceVersionId: versionId, candidate: lexicalCandidateSchema.parse(candidate) });
  }
  const sourceVersionIds = versions.map((version) => version.versionId).sort();
  projections.sort((left, right) => left.candidate.candidateId.localeCompare(right.candidate.candidateId) || left.sourceVersionId.localeCompare(right.sourceVersionId));
  const manifest = { schemaVersion: 'phase8g-snapshot-v1', extractionVersion: 'phase8f-bsb-v1', sourceVersionIds, candidates: projections.map((item) => ({ candidateId: item.candidate.candidateId, contentHash: item.candidate.contentHash, sourceVersionId: item.sourceVersionId })) };
  const manifestChecksum = sha(stable(manifest));
  const snapshotId = `snapshot-${manifestChecksum.slice(0, 24)}`;
  for (const projection of projections) projection.snapshotId = snapshotId;
  return {
    body, blobPath, recordsObserved: records.length,
    bundle: {
      run: { runId, provider: 'BSB_SRU_MARCXML', queryPlan: options.queryPlan ?? { mode: 'AUTHENTIC_COMMITTED_FIXTURE' }, requestBudget: options.requestBudget ?? 0, recordBudget: options.recordBudget ?? records.length, status: 'COMPLETE', startedAt: options.now, endedAt: options.now, error: null },
      raw: { checksum: rawChecksum, provider: 'BSB_SRU_MARCXML', blobPath, contentLength: body.byteLength, contentType: 'application/marcxml+xml', retrievedAt: options.now, licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', runId },
      versions, projections,
      snapshot: { snapshotId, schemaVersion: 'phase8g-snapshot-v1', extractionVersion: 'phase8f-bsb-v1', sourceVersionIds, candidateCount: projections.length, manifestChecksum, manifest, status: 'VERIFIED', createdAt: options.now, activatedAt: options.now },
    },
  };
}
