import {
  ExternalCorpusCandidate,
  ProvenanceAuditResult,
  ProvenanceDiagnostic,
  SourceVerification,
  SourceVerificationEntry,
  SourceVerificationLedger
} from './types';

export function auditProvenanceIntegrity(
  candidates: ExternalCorpusCandidate[],
  ledger?: SourceVerificationLedger
): ProvenanceAuditResult {
  const diagnostics: ProvenanceDiagnostic[] = [];
  let verifiedCount = 0;
  let unverifiedCount = 0;
  let rejectedCount = 0;

  // Build ledger map if ledger is supplied
  const ledgerMap = new Map<string, SourceVerificationEntry>();
  if (ledger) {
    for (const receipt of ledger.receipts || ledger.entries || []) {
      ledgerMap.set(`${receipt.candidateId}:${receipt.sourceIndex}`, receipt);
    }
  }

  for (const candidate of candidates) {
    if (candidate.independenceClass === 'REJECT_CIRCULAR') {
      rejectedCount++;
      diagnostics.push({
        code: 'CIRCULAR_PROVENANCE_REJECTED',
        candidateId: candidate.id,
        message: `Candidate "${candidate.id}" is marked as REJECT_CIRCULAR.`
      });
      continue;
    }

    const sources = candidate.sources;
    if (!sources || sources.length === 0) {
      unverifiedCount++;
      diagnostics.push({
        code: 'MISSING_SOURCES',
        candidateId: candidate.id,
        message: `Candidate "${candidate.id}" contains zero sources.`
      });
      continue;
    }

    // Resolve verification for each source either from candidate.source.verification or from ledger
    const sourceVerifications: {
      sourceIndex: number;
      source: (typeof sources)[0];
      verification?: SourceVerification;
      entry?: SourceVerificationEntry;
    }[] = sources.map((source, index) => {
      let verification = source.verification;
      const entry = ledger ? ledgerMap.get(`${candidate.id}:${index}`) : undefined;
      if (ledger) {
        if (entry) {
          verification = {
            status: entry.status,
            method: entry.verificationMethod,
            verifiedAt: entry.verifiedAt,
            verifiedClaims: entry.verifiedClaims,
            canonicalUrl: entry.canonicalUrl,
            observedSourceTitle: entry.observedSourceTitle,
            attestedSourceText: entry.attestedSourceText,
            attestedRomanization: entry.attestedRomanization,
            externalRecordId: entry.resolvedIdentifier || entry.externalRecordId,
            locator: entry.locator,
            note: entry.note
          };
        } else {
          verification = undefined;
        }
      }
      return { sourceIndex: index, source, verification, entry };
    });

    // Rule 12: candidate must contain at least one VERIFIED source
    const verifiedSources = sourceVerifications.filter((s) => s.verification?.status === 'VERIFIED');
    if (verifiedSources.length === 0) {
      unverifiedCount++;
      diagnostics.push({
        code: 'UNVERIFIED_ACQUISITION_SOURCE',
        candidateId: candidate.id,
        message: `Candidate "${candidate.id}" lacks any VERIFIED source.`
      });
      continue;
    }

    // Rule 3, 5, 12: at least one VERIFIED source directly attests candidate.sourceText
    const expectedNormalizedText = candidate.sourceText.trim().normalize('NFC');
    const sourceTextRoles = verifiedSources.filter((s) => s.source.evidenceRole === 'SOURCE_TEXT');

    let hasExactSourceTextAttestation = false;
    let hasSourceTextMismatch = false;

    for (const item of sourceTextRoles) {
      const attested = item.verification?.attestedSourceText?.trim().normalize('NFC');
      if (attested === expectedNormalizedText) {
        hasExactSourceTextAttestation = true;
      } else if (attested) {
        hasSourceTextMismatch = true;
        diagnostics.push({
          code: 'SOURCE_TEXT_ATTESTATION_MISMATCH',
          candidateId: candidate.id,
          message: `Candidate "${candidate.id}" sourceText "${candidate.sourceText}" does not match verified attestedSourceText "${attested}".`
        });
      }
    }

    if (!hasExactSourceTextAttestation && !hasSourceTextMismatch) {
      diagnostics.push({
        code: 'MISSING_SOURCE_TEXT_ATTESTATION',
        candidateId: candidate.id,
        message: `Candidate "${candidate.id}" lacks a VERIFIED source with evidenceRole: SOURCE_TEXT that directly attests Persian text "${candidate.sourceText}".`
      });
      unverifiedCount++;
      continue;
    } else if (hasSourceTextMismatch && !hasExactSourceTextAttestation) {
      unverifiedCount++;
      continue;
    }

    // Rule 6 & Verification Ledger checks: source title and canonical URL matching
    let sourceMatchValid = true;
    for (const item of verifiedSources) {
      if (item.source.url && item.verification?.canonicalUrl) {
        if (item.source.url !== item.verification.canonicalUrl) {
          diagnostics.push({
            code: 'SOURCE_URL_MISMATCH',
            candidateId: candidate.id,
            message: `Candidate "${candidate.id}" source URL "${item.source.url}" does not match verified canonicalUrl "${item.verification.canonicalUrl}".`
          });
          sourceMatchValid = false;
        }
      }
      if (item.source.title && item.verification?.observedSourceTitle) {
        if (item.source.title !== item.verification.observedSourceTitle) {
          diagnostics.push({
            code: 'SOURCE_TITLE_MISMATCH',
            candidateId: candidate.id,
            message: `Candidate "${candidate.id}" source title "${item.source.title}" does not match verified observedSourceTitle "${item.verification.observedSourceTitle}".`
          });
          sourceMatchValid = false;
        }
      }
    }

    // Rule 7 & Claims: For every retained observedRomanization, require matching attestedRomanization in verification with ROMANIZATION_EXACT claim
    let romValid = true;
    for (const item of sources) {
      if (item.observedRomanization) {
        const matchingVerified = verifiedSources.find((vs) => vs.source === item);
        const observedNorm = item.observedRomanization.trim().normalize('NFC');
        const attestedNorm = matchingVerified?.verification?.attestedRomanization?.trim().normalize('NFC');
        const hasClaim = matchingVerified?.verification?.verifiedClaims
          ? matchingVerified.verification.verifiedClaims.includes('ROMANIZATION_EXACT')
          : true;

        if (!attestedNorm || !hasClaim) {
          diagnostics.push({
            code: 'OBSERVED_ROMANIZATION_NOT_ATTESTED',
            candidateId: candidate.id,
            message: `Candidate "${candidate.id}" source "${item.title}" has observedRomanization "${item.observedRomanization}" without verified ROMANIZATION_EXACT claim.`
          });
          romValid = false;
        } else if (observedNorm !== attestedNorm) {
          diagnostics.push({
            code: 'OBSERVED_ROMANIZATION_NOT_ATTESTED',
            candidateId: candidate.id,
            message: `Candidate "${candidate.id}" source "${item.title}" observedRomanization "${item.observedRomanization}" does not match attestedRomanization "${matchingVerified?.verification?.attestedRomanization}".`
          });
          romValid = false;
        } else if (!matchingVerified?.verification?.locator) {
          diagnostics.push({
            code: 'OBSERVED_ROMANIZATION_NOT_ATTESTED',
            candidateId: candidate.id,
            message: `Candidate "${candidate.id}" source "${item.title}" observedRomanization "${item.observedRomanization}" lacks an exact locator.`
          });
          romValid = false;
        }
      }
    }

    // Rule 8 & 9: Work and Entity external IDs must be verified
    let extIdValid = true;
    const workDoi = candidate.workMetadata?.doi || candidate.bibliographicMetadata?.doi;
    const workOpenAlex = candidate.workMetadata?.openAlexId;
    if (workDoi || workOpenAlex) {
      const bibVerified = verifiedSources.some((s) => {
        const recId = s.verification?.externalRecordId || s.entry?.resolvedIdentifier;
        const reqId = s.entry?.requestedIdentifier;
        if (workDoi && reqId && reqId !== recId) return false;
        return (s.source.evidenceRole === 'BIBLIOGRAPHIC_METADATA' || s.source.evidenceRole === 'SOURCE_TEXT') && !!recId;
      });
      if (!bibVerified) {
        diagnostics.push({
          code: 'UNVERIFIED_EXTERNAL_IDENTIFIER',
          candidateId: candidate.id,
          message: `Candidate "${candidate.id}" has bibliographic metadata (DOI / OpenAlex) without verified external identifier receipt.`
        });
        extIdValid = false;
      }
    }

    if (candidate.entityMetadata?.authorityId) {
      const entityVerified = verifiedSources.some((s) => {
        const recId = s.verification?.externalRecordId || s.entry?.resolvedIdentifier;
        const reqId = s.entry?.requestedIdentifier || candidate.entityMetadata?.authorityId;
        if (reqId && recId && reqId !== recId) return false;
        return (
          (s.source.evidenceRole === 'IDENTITY' || s.source.evidenceRole === 'SOURCE_TEXT') &&
          recId === candidate.entityMetadata?.authorityId
        );
      });
      if (!entityVerified) {
        diagnostics.push({
          code: 'UNVERIFIED_EXTERNAL_IDENTIFIER',
          candidateId: candidate.id,
          message: `Candidate "${candidate.id}" has entity authorityId "${candidate.entityMetadata.authorityId}" without verified externalRecordId receipt.`
        });
        extIdValid = false;
      }
    }

    if (romValid && extIdValid && sourceMatchValid) {
      verifiedCount++;
    } else {
      unverifiedCount++;
    }
  }

  const passed = diagnostics.length === 0;

  return {
    passed,
    valid: passed,
    verifiedCount,
    verifiedCandidateCount: verifiedCount,
    unverifiedCount,
    rejectedCount,
    diagnostics,
    errors: diagnostics
  };
}
