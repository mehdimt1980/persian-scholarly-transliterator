import { DeduplicationResult, DuplicateFinding, ExternalCorpusCandidate } from './types';

export function deduplicateCandidates(candidates: ExternalCorpusCandidate[]): DeduplicationResult {
  const duplicateFindings: DuplicateFinding[] = [];
  const seenIds = new Map<string, ExternalCorpusCandidate>();
  const seenSurface = new Map<string, ExternalCorpusCandidate>();
  const seenNormalized = new Map<string, ExternalCorpusCandidate>();
  const seenDois = new Map<string, ExternalCorpusCandidate>();
  const seenOpenAlexIds = new Map<string, ExternalCorpusCandidate>();
  const seenAuthorityIds = new Map<string, ExternalCorpusCandidate>();

  for (const candidate of candidates) {
    // 1. Duplicate ID check (always blocking)
    if (seenIds.has(candidate.id)) {
      duplicateFindings.push({
        type: 'DUPLICATE_ID',
        candidateId: candidate.id,
        duplicateOfId: seenIds.get(candidate.id)!.id,
        detail: `Duplicate candidate ID "${candidate.id}" found.`,
        permittedWithDistinctEvidence: false
      });
    } else {
      seenIds.set(candidate.id, candidate);
    }

    // 2. Exact sourceText + proposedProfile check
    const surfaceKey = `${candidate.proposedProfile}::${candidate.sourceText}`;
    if (seenSurface.has(surfaceKey)) {
      const prior = seenSurface.get(surfaceKey)!;
      // Allow only if different categories or explicitly distinct entity/work senses
      const isDistinctSense =
        candidate.category !== prior.category ||
        (candidate.entityMetadata?.authorityId &&
          prior.entityMetadata?.authorityId &&
          candidate.entityMetadata.authorityId !== prior.entityMetadata.authorityId);

      duplicateFindings.push({
        type: 'EXACT_SURFACE',
        candidateId: candidate.id,
        duplicateOfId: prior.id,
        detail: `Identical surface form "${candidate.sourceText}" with profile "${candidate.proposedProfile}" matches candidate "${prior.id}".`,
        permittedWithDistinctEvidence: Boolean(isDistinctSense)
      });
    } else {
      seenSurface.set(surfaceKey, candidate);
    }

    // 3. Normalized surface check (NFC Unicode normalization)
    const normalizedText = candidate.sourceText.normalize('NFC');
    const normKey = `${candidate.proposedProfile}::${normalizedText}`;
    if (normKey !== surfaceKey && seenNormalized.has(normKey)) {
      const prior = seenNormalized.get(normKey)!;
      duplicateFindings.push({
        type: 'NORMALIZED_SURFACE',
        candidateId: candidate.id,
        duplicateOfId: prior.id,
        detail: `Unicode-normalized surface form matches candidate "${prior.id}".`,
        permittedWithDistinctEvidence: false
      });
    } else {
      seenNormalized.set(normKey, candidate);
    }

    // 4. DOI duplicate check
    if (candidate.workMetadata?.doi) {
      const doi = candidate.workMetadata.doi.toLowerCase().trim();
      if (seenDois.has(doi)) {
        const prior = seenDois.get(doi)!;
        duplicateFindings.push({
          type: 'WORK_IDENTIFIER',
          candidateId: candidate.id,
          duplicateOfId: prior.id,
          detail: `Same DOI "${doi}" already used by candidate "${prior.id}".`,
          permittedWithDistinctEvidence: false
        });
      } else {
        seenDois.set(doi, candidate);
      }
    }

    // 5. OpenAlex ID duplicate check
    if (candidate.workMetadata?.openAlexId) {
      const oaid = candidate.workMetadata.openAlexId.toLowerCase().trim();
      if (seenOpenAlexIds.has(oaid)) {
        const prior = seenOpenAlexIds.get(oaid)!;
        duplicateFindings.push({
          type: 'WORK_IDENTIFIER',
          candidateId: candidate.id,
          duplicateOfId: prior.id,
          detail: `Same OpenAlex ID "${oaid}" already used by candidate "${prior.id}".`,
          permittedWithDistinctEvidence: false
        });
      } else {
        seenOpenAlexIds.set(oaid, candidate);
      }
    }

    // 6. Authority ID duplicate check (e.g. VIAF, Wikidata, Iranica entity)
    if (candidate.entityMetadata?.authorityId) {
      const authId = candidate.entityMetadata.authorityId.toLowerCase().trim();
      if (seenAuthorityIds.has(authId)) {
        const prior = seenAuthorityIds.get(authId)!;
        duplicateFindings.push({
          type: 'ENTITY_IDENTIFIER',
          candidateId: candidate.id,
          duplicateOfId: prior.id,
          detail: `Same entity authority ID "${authId}" already used by candidate "${prior.id}".`,
          permittedWithDistinctEvidence: false
        });
      } else {
        seenAuthorityIds.set(authId, candidate);
      }
    }
  }

  const hasBlockingDuplicates = duplicateFindings.some((f) => !f.permittedWithDistinctEvidence);

  return {
    totalChecked: candidates.length,
    uniqueIds: seenIds.size,
    duplicateFindings,
    hasBlockingDuplicates
  };
}
