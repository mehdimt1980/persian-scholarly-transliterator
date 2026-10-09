import { sha256 } from './identity';
import type { BibliographicIdentityStatus, CiniiEvidenceRecord, CiniiPilotArtifact, CiniiQualitySummary, CiniiQueryConfig } from './types';

export function assignBibliographicRelationships(records: CiniiEvidenceRecord[]): CiniiEvidenceRecord[] {
  return records.map((record, index) => {
    let status: BibliographicIdentityStatus = 'UNIQUE_RECORD'; const related = new Set<string>();
    for (let otherIndex = 0; otherIndex < records.length; otherIndex += 1) {
      if (otherIndex === index) continue; const other = records[otherIndex];
      if (record.sourceRecordId === other.sourceRecordId) { status = 'EXACT_DUPLICATE_RECORD'; related.add(other.recordId); continue; }
      const sharedStable = (record.identifiers.ncid && record.identifiers.ncid === other.identifiers.ncid) || record.identifiers.isbns.some((isbn) => other.identifiers.isbns.includes(isbn));
      if (sharedStable) { status = 'DUPLICATE_MANIFESTATION'; related.add(other.recordId); continue; }
      if (record.normalizedPersianTitle && record.normalizedPersianTitle === other.normalizedPersianTitle) {
        const editionEvidence = record.publicationMetadata.publicationYear !== other.publicationMetadata.publicationYear || record.publicationMetadata.publisher !== other.publicationMetadata.publisher;
        status = editionEvidence ? 'RELATED_EDITION' : 'SIMILAR_TITLE_ONLY'; related.add(other.recordId);
      }
    }
    const updated = { ...record, bibliographicIdentityStatus: status, relatedRecordIds: [...related].sort() };
    return { ...updated, contentHash: sha256({ ...updated, contentHash: undefined }) };
  });
}

export function summarize(records: CiniiEvidenceRecord[], attemptedRecords = records.length, apiErrors = 0): CiniiQualitySummary {
  return { attemptedRecords, receivedRecords: records.length, uniqueBibliographicIdentities: records.filter((record) => record.bibliographicIdentityStatus === 'UNIQUE_RECORD' || record.bibliographicIdentityStatus === 'RELATED_EDITION' || record.bibliographicIdentityStatus === 'SIMILAR_TITLE_ONLY').length, persianScriptTitles: records.filter((record) => record.persianTitle).length, observedRomanizationPairs: records.filter((record) => record.pairingStatus === 'PERSIAN_WITH_OBSERVED_ROMANIZATION' || record.pairingStatus === 'MULTIPLE_ROMANIZATION_VARIANTS').length, uncertainPairings: records.filter((record) => record.pairingStatus === 'UNCERTAIN_LANGUAGE_OR_PAIRING').length, scriptLanguageMismatches: records.filter((record) => record.languageEvidence.catalogLanguages.includes('fa') && !record.persianTitle).length, exactDuplicates: records.filter((record) => record.bibliographicIdentityStatus === 'EXACT_DUPLICATE_RECORD').length, duplicateManifestations: records.filter((record) => record.bibliographicIdentityStatus === 'DUPLICATE_MANIFESTATION').length, relatedEditions: records.filter((record) => record.bibliographicIdentityStatus === 'RELATED_EDITION').length, recordsMissingPublisher: records.filter((record) => !record.publicationMetadata.publisher).length, recordsMissingYear: records.filter((record) => !record.publicationMetadata.publicationYear).length, recordsMissingStableIdentifier: records.filter((record) => !record.identifiers.crid && !record.identifiers.ncid && record.identifiers.isbns.length === 0).length, reviewReadyCandidates: records.filter((record) => record.persianTitle && record.pairingStatus !== 'UNCERTAIN_LANGUAGE_OR_PAIRING').length, apiErrors };
}

export function buildArtifact(records: CiniiEvidenceRecord[], query: CiniiQueryConfig, retrievedAt: string, mode: CiniiPilotArtifact['mode']): CiniiPilotArtifact { const related = assignBibliographicRelationships(records); return { schemaVersion: 'phase8d-cinii-pilot-artifact-v1', datasetVersion: 'phase8d-cinii-pilot-v1', mode, retrievedAt, query, records: related, quality: summarize(related) }; }
