import {
  AcquisitionCategory,
  AcquisitionCoverageMetrics,
  AcquisitionSourceKind,
  ExternalCorpusCandidate,
  IndependenceClass,
  ProposedProfile,
  SourceVerificationLedger
} from './types';

const ALL_CATEGORIES: AcquisitionCategory[] = [
  'TERM',
  'LEGAL_TERM',
  'RELIGIOUS_TERM',
  'PERSON',
  'PLACE',
  'INSTITUTION',
  'BOOK_TITLE',
  'ARTICLE_TITLE',
  'COMPOUND',
  'MORPHOLOGY',
  'IZAFAT',
  'AMBIGUITY',
  'MIXED_SCRIPT',
  'OTHER'
];

const ALL_PROFILES: ProposedProfile[] = [
  'ijmes_full',
  'ijmes_title'
];

const ALL_SOURCE_KINDS: AcquisitionSourceKind[] = [
  'CAMBRIDGE_IJMES',
  'ENCYCLOPAEDIA_IRANICA',
  'OPENALEX',
  'CROSSREF',
  'LIBRARY_CATALOG',
  'AUTHORITY_FILE',
  'ACADEMIC_DICTIONARY',
  'PEER_REVIEWED_PUBLICATION',
  'CRITICAL_EDITION',
  'OTHER_SCHOLARLY'
];

const ALL_INDEPENDENCE_CLASSES: IndependenceClass[] = [
  'FULLY_EXTERNAL',
  'EXTERNAL_SOURCE_PROJECT_TOPIC_OVERLAP',
  'REJECT_CIRCULAR'
];

export function computeAcquisitionCoverage(
  candidates: ExternalCorpusCandidate[],
  ledger?: SourceVerificationLedger
): AcquisitionCoverageMetrics {
  const categories = Object.fromEntries(ALL_CATEGORIES.map((c) => [c, 0])) as Record<AcquisitionCategory, number>;
  const profiles = Object.fromEntries(ALL_PROFILES.map((p) => [p, 0])) as Record<ProposedProfile, number>;
  const sourceKinds = Object.fromEntries(ALL_SOURCE_KINDS.map((s) => [s, 0])) as Record<AcquisitionSourceKind, number>;
  const independenceClasses = Object.fromEntries(ALL_INDEPENDENCE_CLASSES.map((i) => [i, 0])) as Record<IndependenceClass, number>;

  let multiSourceCount = 0;
  let observedRomanizationCount = 0;
  let workMetadataCount = 0;
  let entityMetadataCount = 0;
  let iranicaCount = 0;
  let bibliographicSourceCount = 0;
  let rejectedCircularCount = 0;

  let verifiedCandidateCount = 0;
  let unverifiedCandidateCount = 0;
  let sourceTextAttestedCount = 0;
  let verifiedExternalIdCount = 0;
  let verifiedIranicaCount = 0;
  let verifiedExactIranicaRomanizationCount = 0;
  let verifiedExactOtherRomanizationCount = 0;
  let removedUnsupportedRomanizationCount = 0;
  let verifiedDoiCount = 0;
  let verifiedOpenAlexCount = 0;

  let totalVerificationReceipts = 0;

  for (const candidate of candidates) {
    if (categories[candidate.category] !== undefined) {
      categories[candidate.category]++;
    }
    if (profiles[candidate.proposedProfile] !== undefined) {
      profiles[candidate.proposedProfile]++;
    }
    if (independenceClasses[candidate.independenceClass] !== undefined) {
      independenceClasses[candidate.independenceClass]++;
    }

    if (candidate.independenceClass === 'REJECT_CIRCULAR') {
      rejectedCircularCount++;
    }

    if (candidate.sources.length > 1) {
      multiSourceCount++;
    }

    let hasObservedRom = false;
    let hasIranica = false;
    let hasBib = false;
    let isCandidateVerified = false;
    let hasSourceTextAttestation = false;

    for (const source of candidate.sources) {
      if (sourceKinds[source.kind] !== undefined) {
        sourceKinds[source.kind]++;
      }
      if (source.observedRomanization) {
        hasObservedRom = true;
      }
      if (source.kind === 'ENCYCLOPAEDIA_IRANICA') {
        hasIranica = true;
        if (source.verification?.status === 'VERIFIED') {
          verifiedIranicaCount++;
          if (source.observedRomanization && source.verification.attestedRomanization) {
            verifiedExactIranicaRomanizationCount++;
          }
        }
      } else if (source.verification?.status === 'VERIFIED' && source.observedRomanization && source.verification.attestedRomanization) {
        verifiedExactOtherRomanizationCount++;
      }

      if (source.kind === 'OPENALEX' || source.kind === 'CROSSREF' || source.kind === 'LIBRARY_CATALOG') {
        hasBib = true;
      }

      if (source.verification?.status === 'VERIFIED') {
        totalVerificationReceipts++;
        isCandidateVerified = true;
        if (source.evidenceRole === 'SOURCE_TEXT' && source.verification.attestedSourceText) {
          hasSourceTextAttestation = true;
        }
        if (source.verification.externalRecordId) {
          verifiedExternalIdCount++;
        }
      }
    }

    if (isCandidateVerified) {
      verifiedCandidateCount++;
    } else {
      unverifiedCandidateCount++;
    }

    if (hasSourceTextAttestation) {
      sourceTextAttestedCount++;
    }

    if (hasObservedRom) observedRomanizationCount++;
    if (hasIranica) iranicaCount++;
    if (hasBib) bibliographicSourceCount++;
    if (candidate.workMetadata) {
      workMetadataCount++;
      if (candidate.workMetadata.doi) verifiedDoiCount++;
      if (candidate.workMetadata.openAlexId) verifiedOpenAlexCount++;
    }
    if (candidate.entityMetadata) entityMetadataCount++;
  }

  const committedVerificationReceiptsCount = ledger?.entries?.length || ledger?.receipts?.length || totalVerificationReceipts;

  // Compute how many unsupported romanization claims were audited and removed (e.g. topic-only Iranica entries)
  removedUnsupportedRomanizationCount = Math.max(0, iranicaCount - verifiedExactIranicaRomanizationCount);

  return {
    totalCandidates: candidates.length,
    categories,
    profiles,
    sourceKinds,
    independenceClasses,
    multiSourceCount,
    observedRomanizationCount,
    workMetadataCount,
    entityMetadataCount,
    iranicaCount,
    bibliographicSourceCount,
    rejectedCircularCount,
    verifiedCandidateCount,
    unverifiedCandidateCount,
    sourceTextAttestedCount,
    verifiedExternalIdCount,
    verifiedIranicaCount,
    verifiedExactIranicaRomanizationCount,
    verifiedExactOtherRomanizationCount,
    removedUnsupportedRomanizationCount,
    committedVerificationReceiptsCount,
    verifiedDoiCount,
    verifiedOpenAlexCount
  };
}
