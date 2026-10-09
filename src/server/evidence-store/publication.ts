import { createHash } from 'node:crypto';
import { adaptBsbRecord } from '../../validation/acquisition/bsb/adapter';
import { parseMarcCollection, parseSruMarcXml } from '../../validation/acquisition/bsb/marcxml';
import { lexicalCandidateSchema } from '../../validation/lexical-evidence/schema';
import { sha256 } from '../../validation/acquisition/cinii/identity';
import type { LexicalCandidate } from '../../validation/lexical-evidence/types';
import type { WriteEnvironment } from './guard';
import type { NeonPublicationBundle } from './neon';
import type { CandidateProjection, RecordVersion, RetrievalSnapshot, SnapshotUpdateMode } from './types';

const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const recordsFromXml = (xml: string) => xml.includes('searchRetrieveResponse') ? parseSruMarcXml(xml).records : parseMarcCollection(xml);

export function assertCandidateContentHash(candidate: LexicalCandidate): void {
  const expected = sha256({ ...candidate, contentHash: undefined });
  if (candidate.contentHash !== expected) throw new Error(`Candidate content hash mismatch: ${candidate.candidateId}`);
}

export function buildSnapshot(projectionsInput: CandidateProjection[], schemaVersion: RetrievalSnapshot['schemaVersion'] = 'phase8g-snapshot-v1', extractionVersion: RetrievalSnapshot['extractionVersion'] = 'phase8f-bsb-v1', createdAt: string, additionalSourceVersionIds: string[] = []): { snapshot: RetrievalSnapshot; projections: CandidateProjection[] } {
  const unique = new Map<string, CandidateProjection>();
  for (const projection of projectionsInput) unique.set(`${projection.candidate.candidateId}\n${projection.sourceVersionId}`, { ...projection });
  const projections = [...unique.values()].sort((left, right) => left.candidate.candidateId.localeCompare(right.candidate.candidateId) || left.sourceVersionId.localeCompare(right.sourceVersionId));
  const sourceVersionIds = [...new Set([...additionalSourceVersionIds, ...projections.map((item) => item.sourceVersionId)])].sort();
  const candidates = projections.map((item) => ({ candidateId: item.candidate.candidateId, contentHash: item.candidate.contentHash, sourceVersionId: item.sourceVersionId }));
  const manifest = { schemaVersion, extractionVersion, sourceVersionIds, candidates };
  const canonical = [schemaVersion, extractionVersion, sourceVersionIds.join('\n'), candidates.map((item) => `${item.candidateId}\t${item.contentHash}\t${item.sourceVersionId}`).join('\n')].join('\n');
  const manifestChecksum = sha(canonical);
  const snapshotId = `snapshot-${manifestChecksum.slice(0, 24)}`;
  for (const projection of projections) projection.snapshotId = snapshotId;
  return { projections, snapshot: { snapshotId, schemaVersion, extractionVersion, sourceVersionIds, candidateCount: projections.length, manifestChecksum, manifest, status: 'VERIFIED', createdAt, activatedAt: createdAt } };
}

export function retainActiveEvidence(state: { candidates: Map<string, CandidateProjection>; versions: Map<string, RecordVersion>; snapshots: Map<string, RetrievalSnapshot>; activeSnapshotId: string | null }, incomingVersions: RecordVersion[], mode: SnapshotUpdateMode): { projections: CandidateProjection[]; sourceVersionIds: string[] } {
  if (mode === 'FULL_REBUILD' || !state.activeSnapshotId) return { projections: [], sourceVersionIds: [] };
  const replaced = new Set(incomingVersions.map((version) => `${version.provider}\n${version.sourceRecordId}`));
  const sourceVersionIds = (state.snapshots.get(state.activeSnapshotId)?.sourceVersionIds ?? []).filter((versionId) => { const version = state.versions.get(versionId); return Boolean(version && !replaced.has(`${version.provider}\n${version.sourceRecordId}`)); });
  const retainedIds = new Set(sourceVersionIds);
  return { sourceVersionIds, projections: [...state.candidates.values()].filter((projection) => projection.snapshotId === state.activeSnapshotId && retainedIds.has(projection.sourceVersionId)) };
}

export interface PreparedBsbPublication { body: Uint8Array; bundle: NeonPublicationBundle; blobPath: string; recordsObserved: number; }

export function prepareBsbPublication(options: { xml: string; environment: WriteEnvironment; now: string; queryPlan?: unknown; requestBudget?: number; recordBudget?: number; mode?: SnapshotUpdateMode }): PreparedBsbPublication {
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
    for (const candidate of adaptBsbRecord(record)) { const parsed = lexicalCandidateSchema.parse(candidate); assertCandidateContentHash(parsed); projections.push({ snapshotId: '', sourceVersionId: versionId, candidate: parsed }); }
  }
  const built = buildSnapshot(projections, 'phase8g-snapshot-v1', 'phase8f-bsb-v1', options.now, versions.map((version) => version.versionId));
  return {
    body, blobPath, recordsObserved: records.length,
    bundle: {
      mode: options.mode ?? 'INCREMENTAL',
      run: { runId, provider: 'BSB_SRU_MARCXML', queryPlan: options.queryPlan ?? { mode: 'AUTHENTIC_COMMITTED_FIXTURE', snapshotUpdateMode: options.mode ?? 'INCREMENTAL' }, requestBudget: options.requestBudget ?? 0, recordBudget: options.recordBudget ?? records.length, status: 'COMPLETE', startedAt: options.now, endedAt: options.now, error: null },
      raw: { checksum: rawChecksum, provider: 'BSB_SRU_MARCXML', blobPath, contentLength: body.byteLength, contentType: 'application/marcxml+xml', retrievedAt: options.now, licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', runId },
      versions, projections: built.projections, snapshot: built.snapshot,
    },
  };
}
