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
    let ledgerAgreementValid = true;
    const sourceVerifications: {
      sourceIndex: number;
      source: (typeof sources)[0];
      verification?: SourceVerification;
      entry?: SourceVerificationEntry;
    }[] = sources.map((source, index) => {
      let verification = source.verification;
      const entry = ledger ? ledgerMap.get(`${candidate.id}:${index}`) : undefined;

      if (ledger && source.verification && entry) {
        // Cross-check candidate-local verification vs ledger receipt agreement
        const localClaims = [...(source.verification.verifiedClaims || [])].sort().join(',');
        const entryClaims = [...(entry.verifiedClaims || [])].sort().join(',');
        if (
          source.verification.status !== entry.status ||
          localClaims !== entryClaims ||
          source.verification.attestedSourceText !== entry.attestedSourceText ||
          source.verification.attestedRomanization !== entry.attestedRomanization ||
          (source.verification.externalRecordId || undefined) !== (entry.resolvedIdentifier || entry.externalRecordId || undefined)
        ) {
          diagnostics.push({
            code: 'LEDGER_CLAIM_DISAGREEMENT',
            candidateId: candidate.id,
            message: `Candidate "${candidate.id}" source index ${index} local verification disagrees with ledger receipt.`
          });
          ledgerAgreementValid = false;
        }
      }

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

    // Rule 2: at least one VERIFIED source directly attests candidate.sourceText with explicit SOURCE_TEXT_EXACT claim
    const expectedNormalizedText = candidate.sourceText.trim().normalize('NFC');
    const sourceTextRoles = verifiedSources.filter((s) => s.source.evidenceRole === 'SOURCE_TEXT');

    let hasExactSourceTextAttestation = false;
    let hasSourceTextMismatch = false;
    let hasMissingClaim = false;

    for (const item of sourceTextRoles) {
      const attested = item.verification?.attestedSourceText?.trim().normalize('NFC');
      const hasClaim = item.verification?.verifiedClaims?.includes('SOURCE_TEXT_EXACT') === true;

      if (attested === expectedNormalizedText) {
        if (hasClaim) {
          hasExactSourceTextAttestation = true;
        } else {
          hasMissingClaim = true;
          diagnostics.push({
            code: 'MISSING_SOURCE_TEXT_EXACT_CLAIM',
            candidateId: candidate.id,
            message: `Candidate "${candidate.id}" source "${item.source.title}" attests source text but lacks required SOURCE_TEXT_EXACT claim.`
          });
        }
      } else if (attested) {
        hasSourceTextMismatch = true;
        diagnostics.push({
          code: 'SOURCE_TEXT_ATTESTATION_MISMATCH',
          candidateId: candidate.id,
          message: `Candidate "${candidate.id}" sourceText "${candidate.sourceText}" does not match verified attestedSourceText "${attested}".`
        });
      }
    }

    if (!hasExactSourceTextAttestation && !hasSourceTextMismatch && !hasMissingClaim) {
      diagnostics.push({
        code: 'MISSING_SOURCE_TEXT_ATTESTATION',
        candidateId: candidate.id,
        message: `Candidate "${candidate.id}" lacks a VERIFIED source with evidenceRole: SOURCE_TEXT that directly attests Persian text "${candidate.sourceText}".`
      });
      unverifiedCount++;
      continue;
    } else if ((hasSourceTextMismatch || hasMissingClaim) && !hasExactSourceTextAttestation) {
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
        const observedNorm = item.observedRomanization.normalize('NFC');
        const attestedNorm = matchingVerified?.verification?.attestedRomanization?.normalize('NFC');
        const hasClaim = matchingVerified?.verification?.verifiedClaims?.includes('ROMANIZATION_EXACT') === true;

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

    // Rule 8 & 9: Work and Entity external IDs must be verified with EXTERNAL_IDENTIFIER claim
    let extIdValid = true;
    const workDoi = candidate.workMetadata?.doi || candidate.bibliographicMetadata?.doi;
    const workOpenAlex = candidate.workMetadata?.openAlexId;
    if (workDoi || workOpenAlex) {
      const bibVerified = verifiedSources.some((s) => {
        const hasClaim = s.verification?.verifiedClaims?.includes('EXTERNAL_IDENTIFIER') === true;
        const recId = s.verification?.externalRecordId || s.entry?.resolvedIdentifier;
        const reqId = s.entry?.requestedIdentifier;
        if (workDoi && reqId && reqId !== recId) return false;
        return hasClaim && (s.source.evidenceRole === 'BIBLIOGRAPHIC_METADATA' || s.source.evidenceRole === 'SOURCE_TEXT') && !!recId;
      });
      if (!bibVerified) {
        diagnostics.push({
          code: 'UNVERIFIED_EXTERNAL_IDENTIFIER',
          candidateId: candidate.id,
          message: `Candidate "${candidate.id}" has bibliographic metadata (DOI / OpenAlex) without verified EXTERNAL_IDENTIFIER claim receipt.`
        });
        extIdValid = false;
      }
    }

    if (candidate.entityMetadata?.authorityId) {
      const entityVerified = verifiedSources.some((s) => {
        const hasClaim = s.verification?.verifiedClaims?.includes('EXTERNAL_IDENTIFIER') === true;
        const recId = s.verification?.externalRecordId || s.entry?.resolvedIdentifier;
        const reqId = s.entry?.requestedIdentifier || candidate.entityMetadata?.authorityId;
        if (reqId && recId && reqId !== recId) return false;
        return (
          hasClaim &&
          (s.source.evidenceRole === 'IDENTITY' || s.source.evidenceRole === 'SOURCE_TEXT') &&
          recId === candidate.entityMetadata?.authorityId
        );
      });
      if (!entityVerified) {
        diagnostics.push({
          code: 'UNVERIFIED_EXTERNAL_IDENTIFIER',
          candidateId: candidate.id,
          message: `Candidate "${candidate.id}" has entity authorityId "${candidate.entityMetadata.authorityId}" without verified EXTERNAL_IDENTIFIER claim receipt.`
        });
        extIdValid = false;
      }
    }

    if (romValid && extIdValid && sourceMatchValid && ledgerAgreementValid) {
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
