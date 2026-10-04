import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { computeAcquisitionCoverage } from './coverage';
import { deduplicateCandidates } from './deduplicate';
import { auditProjectOverlap } from './overlapAudit';
import { auditProvenanceIntegrity } from './provenanceAudit';
import { generateAcquisitionReport } from './report';
import { generateReviewSheetCsv } from './reviewSheet';
import {
  AcquisitionManifestSchema,
  AcquisitionSourceSchema,
  ExternalCorpusCandidateSchema,
  SourceVerificationEntrySchema,
  SourceVerificationLedgerSchema,
  SourceVerificationSchema,
  validateAcquisitionCorpusData,
  validateAcquisitionManifest,
  validateCandidate
} from './schema';
import { ExternalCorpusCandidate, SourceVerificationLedger } from './types';
import { validateAcquisitionCandidates } from './validateCandidates';
import { runAcquisitionCli } from './cli';

describe('Phase 4.6A External Benchmark Corpus Acquisition Framework', () => {
  const validCandidate: ExternalCorpusCandidate = {
    id: 'cand-test-01',
    sourceText: 'مشروطه',
    proposedProfile: 'ijmes_full',
    category: 'TERM',
    reviewStatus: 'PENDING_HUMAN_REVIEW',
    independenceClass: 'FULLY_EXTERNAL',
    sources: [
      {
        kind: 'ACADEMIC_DICTIONARY',
        title: 'Dehkhoda Dictionary',
        citation: 'Loghatnāmeh-ye Dehkhodā, Headword: مشروطه',
        accessedAt: '2026-10-04',
        evidenceRole: 'SOURCE_TEXT',
        verification: {
          status: 'VERIFIED',
          method: 'DICTIONARY_PAGE',
          verifiedAt: '2026-10-04T10:00:00Z',
          verifiedClaims: ['SOURCE_TEXT_EXACT', 'SOURCE_TITLE'],
          observedSourceTitle: 'Dehkhoda Dictionary',
          attestedSourceText: 'مشروطه',
          locator: 'Headword: مشروطه'
        }
      },
      {
        kind: 'ENCYCLOPAEDIA_IRANICA',
        title: 'CONSTITUTIONAL REVOLUTION',
        url: 'https://www.iranicaonline.org/articles/constitutional-revolution-index',
        accessedAt: '2026-10-04',
        evidenceRole: 'IDENTITY',
        observedRomanization: 'mašrūṭa',
        romanizationSystem: 'IRANICA',
        verification: {
          status: 'VERIFIED',
          method: 'URL_CONTENT',
          verifiedAt: '2026-10-04T10:00:00Z',
          verifiedClaims: ['ENTITY_IDENTITY', 'ROMANIZATION_EXACT', 'SOURCE_TITLE'],
          canonicalUrl: 'https://www.iranicaonline.org/articles/constitutional-revolution-index',
          observedSourceTitle: 'CONSTITUTIONAL REVOLUTION',
          locator: 'opening sentence',
          attestedRomanization: 'mašrūṭa'
        }
      }
    ]
  };

  const validLedger: SourceVerificationLedger = {
    version: '1.0.0',
    generatedAt: '2026-10-04T10:00:00Z',
    verifiedCount: 2,
    rejectedCount: 0,
    unverifiedCount: 0,
    receipts: [
      {
        candidateId: 'cand-test-01',
        sourceIndex: 0,
        status: 'VERIFIED',
        verificationMethod: 'DICTIONARY_PAGE',
        verifiedAt: '2026-10-04T10:00:00Z',
        verifiedClaims: ['SOURCE_TEXT_EXACT', 'SOURCE_TITLE'],
        observedSourceTitle: 'Dehkhoda Dictionary',
        attestedSourceText: 'مشروطه',
        locator: 'Headword: مشروطه'
      },
      {
        candidateId: 'cand-test-01',
        sourceIndex: 1,
        status: 'VERIFIED',
        verificationMethod: 'URL_CONTENT',
        verifiedAt: '2026-10-04T10:00:00Z',
        verifiedClaims: ['ENTITY_IDENTITY', 'ROMANIZATION_EXACT', 'SOURCE_TITLE'],
        canonicalUrl: 'https://www.iranicaonline.org/articles/constitutional-revolution-index',
        observedSourceTitle: 'CONSTITUTIONAL REVOLUTION',
        locator: 'opening sentence',
        attestedRomanization: 'mašrūṭa'
      }
    ]
  };

  it('1. rejects candidate containing expected canonical or gold output fields', () => {
    expect(() => {
      validateCandidate({
        ...validCandidate,
        expected: { canonical: 'mašrūṭah' }
      } as any);
    }).toThrow(/unrecognized_key|Unrecognized key|expected output/);

    expect(() => {
      validateCandidate({
        ...validCandidate,
        canonical: 'mašrūṭah'
      } as any);
    }).toThrow(/unrecognized_key|Unrecognized key|expected output/);

    expect(() => {
      validateCandidate({
        ...validCandidate,
        finalText: 'mašrūṭah'
      } as any);
    }).toThrow(/unrecognized_key|Unrecognized key|expected output/);
  });

  it('2. requires at least one external source per candidate', () => {
    expect(() => {
      validateCandidate({
        ...validCandidate,
        sources: []
      });
    }).toThrow(/At least one independent acquisition source/);
  });

  it('3. rejects invalid or relative URL when URL is supplied', () => {
    expect(() => {
      validateCandidate({
        ...validCandidate,
        sources: [
          {
            kind: 'ENCYCLOPAEDIA_IRANICA',
            title: 'Iranica article',
            url: 'not-a-valid-url',
            accessedAt: '2026-10-04',
            evidenceRole: 'IDENTITY'
          }
        ]
      });
    }).toThrow(/valid URL string/);
  });

  it('4. rejects candidate with empty or whitespace-only sourceText', () => {
    expect(() => {
      validateCandidate({
        ...validCandidate,
        sourceText: ''
      });
    }).toThrow(/sourceText must not be empty/);

    expect(() => {
      validateCandidate({
        ...validCandidate,
        sourceText: ' مشروطه '
      });
    }).toThrow(/accidental leading or trailing whitespace/);
  });

  it('5. candidate status must remain PENDING_HUMAN_REVIEW', () => {
    expect(() => {
      validateCandidate({
        ...validCandidate,
        reviewStatus: 'HUMAN_REVIEWED' as any
      });
    }).toThrow(/PENDING_HUMAN_REVIEW/);
  });

  it('6. detects duplicate normalized source/profile', () => {
    const candidateA: ExternalCorpusCandidate = {
      ...validCandidate,
      id: 'cand-dup-1',
      sourceText: 'کتاب'
    };
    const candidateB: ExternalCorpusCandidate = {
      ...validCandidate,
      id: 'cand-dup-2',
      sourceText: 'کتاب'
    };

    const dedup = deduplicateCandidates([candidateA, candidateB]);
    expect(dedup.hasBlockingDuplicates).toBe(true);
    expect(dedup.duplicateFindings[0].type).toBe('EXACT_SURFACE');
  });

  it('7. allows same surface form when distinct identity/sense is documented with different authority', () => {
    const placeCandidate: ExternalCorpusCandidate = {
      ...validCandidate,
      id: 'cand-sense-place',
      sourceText: 'پارس',
      category: 'PLACE',
      entityMetadata: {
        authorityId: 'GeoNames:123',
        englishLabel: 'Pars (Fars)',
        entityType: 'PLACE'
      }
    };
    const personCandidate: ExternalCorpusCandidate = {
      ...validCandidate,
      id: 'cand-sense-person',
      sourceText: 'پارس',
      category: 'PERSON',
      entityMetadata: {
        authorityId: 'VIAF:456',
        englishLabel: 'Pars (Family Name)',
        entityType: 'PERSON'
      }
    };

    const dedup = deduplicateCandidates([placeCandidate, personCandidate]);
    expect(dedup.hasBlockingDuplicates).toBe(false);
    expect(dedup.duplicateFindings[0].permittedWithDistinctEvidence).toBe(true);
  });

  it('8. requires romanizationSystem = IRANICA when Encyclopaedia Iranica source has observedRomanization', () => {
    expect(() => {
      AcquisitionSourceSchema.parse({
        kind: 'ENCYCLOPAEDIA_IRANICA',
        title: 'CONSTITUTIONAL REVOLUTION',
        url: 'https://www.iranicaonline.org/articles/constitutional-revolution-index',
        accessedAt: '2026-10-04',
        evidenceRole: 'IDENTITY',
        observedRomanization: 'mašrūṭa'
        // missing romanizationSystem
      });
    }).toThrow(/declare romanizationSystem/);

    expect(() => {
      AcquisitionSourceSchema.parse({
        kind: 'ENCYCLOPAEDIA_IRANICA',
        title: 'CONSTITUTIONAL REVOLUTION',
        url: 'https://www.iranicaonline.org/articles/constitutional-revolution-index',
        accessedAt: '2026-10-04',
        evidenceRole: 'IDENTITY',
        observedRomanization: 'mašrūṭa',
        romanizationSystem: 'IRANICA'
      });
    }).not.toThrow();
  });

  it('9. IJMES source normally uses RENDERING_POLICY and rejects SOURCE_TEXT for vocabulary', () => {
    expect(() => {
      AcquisitionSourceSchema.parse({
        kind: 'CAMBRIDGE_IJMES',
        title: 'Cambridge IJMES Guide',
        accessedAt: '2026-10-04',
        citation: 'Cambridge IJMES Guide, p. 2',
        evidenceRole: 'SOURCE_TEXT'
      });
    }).toThrow(/RENDERING_POLICY/);

    expect(() => {
      AcquisitionSourceSchema.parse({
        kind: 'CAMBRIDGE_IJMES',
        title: 'Cambridge IJMES Guide',
        accessedAt: '2026-10-04',
        citation: 'Cambridge IJMES Guide, p. 2',
        evidenceRole: 'RENDERING_POLICY'
      });
    }).not.toThrow();
  });

  it('10. classifies dissertation / project sources as REJECT_CIRCULAR', () => {
    expect(() => {
      validateCandidate({
        ...validCandidate,
        independenceClass: 'FULLY_EXTERNAL',
        sources: [
          {
            kind: 'OTHER_SCHOLARLY',
            title: 'Divine Law and Human Legislation Dissertation',
            citation: 'Author Dissertation, Chapter 2',
            accessedAt: '2026-10-04',
            evidenceRole: 'SOURCE_TEXT'
          }
        ]
      });
    }).toThrow(/REJECT_CIRCULAR/);
  });

  it('11. rejects existing pilot fixture import claiming fully external independence', () => {
    expect(() => {
      validateCandidate({
        ...validCandidate,
        independenceClass: 'FULLY_EXTERNAL',
        sources: [
          {
            kind: 'OTHER_SCHOLARLY',
            title: 'pilot.single.json fixture test',
            citation: 'From pilot.single.json',
            accessedAt: '2026-10-04',
            evidenceRole: 'SOURCE_TEXT'
          }
        ]
      });
    }).toThrow(/REJECT_CIRCULAR/);
  });

  it('12. review-sheet CSV export leaves all human decision fields blank', () => {
    const csv = generateReviewSheetCsv([validCandidate]);
    const lines = csv.split('\n');
    expect(lines.length).toBe(2);

    const headers = lines[0].split(',');
    expect(headers).toContain('reviewDecision');
    expect(headers).toContain('reviewedIjmesCanonical');
    expect(headers).toContain('reviewNotes');
    expect(headers).toContain('reviewer');
    expect(headers).toContain('reviewedAt');

    // The data row ends with 5 empty fields: ,,,,
    expect(lines[1].endsWith(',,,,')).toBe(true);
  });

  it('13. acquisition validation performs no transliteration engine execution', () => {
    const manifest = {
      id: 'test-manifest',
      version: '1.0.0',
      status: 'PENDING_HUMAN_REVIEW' as const,
      sourcePolicy: 'INDEPENDENT_EXTERNAL' as const,
      candidateFile: 'test.json',
      acquiredAt: '2026-10-04',
      description: 'Test'
    };

    const res = validateAcquisitionCandidates(manifest, [validCandidate]);
    expect(res.success).toBe(true);
    expect(res.candidates.length).toBe(1);
    expect((res.candidates[0] as any).output).toBeUndefined();
  });

  it('14. report clearly distinguishes acquisition integrity from engine accuracy and displays no gate claims', () => {
    const manifest = {
      id: 'test-manifest',
      version: '1.0.0',
      status: 'PENDING_HUMAN_REVIEW' as const,
      sourcePolicy: 'INDEPENDENT_EXTERNAL' as const,
      candidateFile: 'test.json',
      acquiredAt: '2026-10-04',
      description: 'Test'
    };

    const coverage = computeAcquisitionCoverage([validCandidate]);
    const dedup = deduplicateCandidates([validCandidate]);
    const overlap = auditProjectOverlap([validCandidate]);
    const report = generateAcquisitionReport(manifest, coverage, dedup, overlap);

    expect(report).toContain('Acquisition Integrity:       PASS');
    expect(report).toContain('Human Review Required:       YES');
    expect(report).toContain('Engine Evaluation Performed: NO');

    // Must never contain release gate claims for unevaluated candidates
    expect(report).not.toContain('FALSE_AUTHORITATIVE');
    expect(report).not.toContain('UNDER_BLOCKED');
    expect(report).not.toContain('PILOT_PASS');
    expect(report).not.toContain('RC_READY');
  });

  it('15. project overlap audit is strictly non-mutating', () => {
    const candidateCopy = JSON.parse(JSON.stringify(validCandidate));
    const audit = auditProjectOverlap([candidateCopy]);

    expect(audit.candidateCount).toBe(1);
    expect(audit.outOfSampleCount).toBeGreaterThanOrEqual(0);
    expect(validCandidate).toEqual(candidateCopy);
  });

  it('16. acquisition manifest cannot claim HUMAN_REVIEWED or RC_READY', () => {
    expect(() => {
      validateAcquisitionManifest({
        id: 'test-man',
        version: '1.0.0',
        status: 'HUMAN_REVIEWED',
        sourcePolicy: 'INDEPENDENT_EXTERNAL',
        candidateFile: 'candidates.json',
        acquiredAt: '2026-10-04',
        description: 'Test'
      });
    }).toThrow(/PENDING_HUMAN_REVIEW/);

    expect(() => {
      validateAcquisitionManifest({
        id: 'test-man',
        version: '1.0.0',
        status: 'PENDING_HUMAN_REVIEW',
        sourcePolicy: 'INDEPENDENT_EXTERNAL',
        candidateFile: 'candidates.json',
        acquiredAt: '2026-10-04',
        description: 'Test',
        tier: 'REAL_DISSERTATION'
      });
    }).toThrow(/unrecognized_key|Unrecognized key|REAL_DISSERTATION/);
  });

  it('17. malformed generic source citations fail closed', () => {
    expect(() => {
      AcquisitionSourceSchema.parse({
        kind: 'OTHER_SCHOLARLY',
        title: 'Google',
        accessedAt: '2026-10-04',
        evidenceRole: 'SOURCE_TEXT'
      });
    }).toThrow(/generic source title/);

    expect(() => {
      AcquisitionSourceSchema.parse({
        kind: 'OTHER_SCHOLARLY',
        title: 'web search',
        accessedAt: '2026-10-04',
        evidenceRole: 'SOURCE_TEXT'
      });
    }).toThrow(/generic source title/);

    expect(() => {
      AcquisitionSourceSchema.parse({
        kind: 'OTHER_SCHOLARLY',
        title: 'some dictionary',
        accessedAt: '2026-10-04',
        evidenceRole: 'SOURCE_TEXT'
      });
    }).toThrow(/generic source title/);
  });

  // --- Provenance Integrity & Claim Authority Focus Tests ---

  it('18. accepted candidate requires at least one VERIFIED source in verification ledger', () => {
    const emptyLedger: SourceVerificationLedger = {
      version: '1.0.0',
      generatedAt: '2026-10-04T10:00:00Z',
      verifiedCount: 0,
      rejectedCount: 0,
      unverifiedCount: 0,
      receipts: []
    };
    const audit = auditProvenanceIntegrity([validCandidate], emptyLedger);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'UNVERIFIED_ACQUISITION_SOURCE')).toBe(true);
  });

  it('19. accepted candidate requires direct sourceText attestation in verified receipt', () => {
    const noSourceTextLedger: SourceVerificationLedger = {
      version: '1.0.0',
      generatedAt: '2026-10-04T10:00:00Z',
      verifiedCount: 1,
      rejectedCount: 0,
      unverifiedCount: 0,
      receipts: [
        {
          candidateId: 'cand-test-01',
          sourceIndex: 1,
          status: 'VERIFIED',
          verificationMethod: 'URL_CONTENT',
          verifiedAt: '2026-10-04T10:00:00Z',
          verifiedClaims: ['ENTITY_IDENTITY', 'ROMANIZATION_EXACT', 'SOURCE_TITLE'],
          canonicalUrl: 'https://www.iranicaonline.org/articles/constitutional-revolution-index',
          observedSourceTitle: 'CONSTITUTIONAL REVOLUTION',
          locator: 'opening sentence',
          attestedRomanization: 'mašrūṭa'
        }
      ]
    };
    const audit = auditProvenanceIntegrity([validCandidate], noSourceTextLedger);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'MISSING_SOURCE_TEXT_ATTESTATION')).toBe(true);
  });

  it('20. attestedSourceText must equal candidate sourceText exactly after Unicode normalization', () => {
    const mismatchLedger: SourceVerificationLedger = {
      version: '1.0.0',
      generatedAt: '2026-10-04T10:00:00Z',
      verifiedCount: 1,
      rejectedCount: 0,
      unverifiedCount: 0,
      receipts: [
        {
          candidateId: 'cand-test-01',
          sourceIndex: 0,
          status: 'VERIFIED',
          verificationMethod: 'DICTIONARY_PAGE',
          verifiedAt: '2026-10-04T10:00:00Z',
          verifiedClaims: ['SOURCE_TEXT_EXACT', 'SOURCE_TITLE'],
          observedSourceTitle: 'Dehkhoda Dictionary',
          attestedSourceText: 'مشروطیت' // Mismatched text
        }
      ]
    };
    const audit = auditProvenanceIntegrity([validCandidate], mismatchLedger);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'SOURCE_TEXT_ATTESTATION_MISMATCH')).toBe(true);
  });

  it('21. IDENTITY-only candidate cannot satisfy sourceText requirement', () => {
    const identityOnlyCandidate: ExternalCorpusCandidate = {
      id: 'cand-identity-only',
      sourceText: 'نوسازی',
      proposedProfile: 'ijmes_full',
      category: 'TERM',
      reviewStatus: 'PENDING_HUMAN_REVIEW',
      independenceClass: 'FULLY_EXTERNAL',
      sources: [
        {
          kind: 'ENCYCLOPAEDIA_IRANICA',
          title: 'CITIES iv. Modern Urbanization and Modernization in Persia',
          url: 'https://www.iranicaonline.org/articles/cities-iv',
          accessedAt: '2026-10-04',
          evidenceRole: 'IDENTITY'
        }
      ]
    };

    const identityLedger: SourceVerificationLedger = {
      version: '1.0.0',
      generatedAt: '2026-10-04T10:00:00Z',
      verifiedCount: 1,
      rejectedCount: 0,
      unverifiedCount: 0,
      receipts: [
        {
          candidateId: 'cand-identity-only',
          sourceIndex: 0,
          status: 'VERIFIED',
          verificationMethod: 'URL_CONTENT',
          verifiedAt: '2026-10-04T10:00:00Z',
          verifiedClaims: ['ENTITY_IDENTITY', 'SOURCE_TITLE'],
          canonicalUrl: 'https://www.iranicaonline.org/articles/cities-iv',
          observedSourceTitle: 'CITIES iv. Modern Urbanization and Modernization in Persia'
        }
      ]
    };

    const audit = auditProvenanceIntegrity([identityOnlyCandidate], identityLedger);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'MISSING_SOURCE_TEXT_ATTESTATION')).toBe(true);
  });

  it('22. Latin observedRomanization alone cannot establish Persian sourceText', () => {
    const latinSourceLedger: SourceVerificationLedger = {
      version: '1.0.0',
      generatedAt: '2026-10-04T10:00:00Z',
      verifiedCount: 1,
      rejectedCount: 0,
      unverifiedCount: 0,
      receipts: [
        {
          candidateId: 'cand-test-01',
          sourceIndex: 0,
          status: 'VERIFIED',
          verificationMethod: 'URL_CONTENT',
          verifiedAt: '2026-10-04T10:00:00Z',
          verifiedClaims: ['ROMANIZATION_EXACT', 'SOURCE_TITLE'],
          locator: 'opening sentence',
          attestedRomanization: 'mašrūṭa'
        }
      ]
    };
    const audit = auditProvenanceIntegrity([validCandidate], latinSourceLedger);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'MISSING_SOURCE_TEXT_ATTESTATION')).toBe(true);
  });

  it('23. UNVERIFIED source cannot freeze candidate', () => {
    const unverifiedLedger: SourceVerificationLedger = {
      version: '1.0.0',
      generatedAt: '2026-10-04T10:00:00Z',
      verifiedCount: 0,
      rejectedCount: 0,
      unverifiedCount: 1,
      receipts: [
        {
          candidateId: 'cand-test-01',
          sourceIndex: 0,
          status: 'UNVERIFIED',
          verificationMethod: 'DICTIONARY_PAGE',
          verifiedAt: '2026-10-04T10:00:00Z',
          attestedSourceText: 'مشروطه'
        }
      ]
    };
    const audit = auditProvenanceIntegrity([validCandidate], unverifiedLedger);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'UNVERIFIED_ACQUISITION_SOURCE')).toBe(true);
  });

  it('24. malformed verification receipt rejected by schema', () => {
    expect(() => {
      SourceVerificationEntrySchema.parse({
        candidateId: 'cand-1',
        sourceIndex: 0,
        status: 'UNKNOWN_STATUS',
        verificationMethod: 'URL_CONTENT',
        verifiedAt: '2026-10-04'
      });
    }).toThrow();

    expect(() => {
      SourceVerificationLedgerSchema.parse({
        version: '1.0.0',
        generatedAt: '2026-10-04',
        receipts: [
          {
            candidateId: 'cand-1',
            sourceIndex: -1,
            status: 'VERIFIED',
            verificationMethod: 'URL_CONTENT',
            verifiedAt: '2026-10-04',
            verifiedClaims: ['SOURCE_TEXT_EXACT'],
            attestedSourceText: 'تست'
          }
        ]
      });
    }).toThrow();
  });

  it('25. verified DOI/OpenAlex metadata fixture requires matching returned title', () => {
    const bibCandidate: ExternalCorpusCandidate = {
      id: 'cand-bib-01',
      sourceText: 'تاریخ بیداری ایرانیان',
      proposedProfile: 'ijmes_title',
      category: 'BOOK_TITLE',
      reviewStatus: 'PENDING_HUMAN_REVIEW',
      independenceClass: 'FULLY_EXTERNAL',
      bibliographicMetadata: {
        doi: '10.1000/182',
        title: 'Tārīkh-i Bīdārī-yi Īrāniyān'
      },
      sources: [
        {
          kind: 'PEER_REVIEWED_PUBLICATION',
          title: 'Article referencing book',
          citation: 'Article referencing book, DOI: 10.1000/182',
          accessedAt: '2026-10-04',
          evidenceRole: 'SOURCE_TEXT'
        }
      ]
    };

    const mismatchedDoiLedger: SourceVerificationLedger = {
      version: '1.0.0',
      generatedAt: '2026-10-04T10:00:00Z',
      verifiedCount: 1,
      rejectedCount: 0,
      unverifiedCount: 0,
      receipts: [
        {
          candidateId: 'cand-bib-01',
          sourceIndex: 0,
          status: 'VERIFIED',
          verificationMethod: 'API_RECORD',
          verifiedAt: '2026-10-04T10:00:00Z',
          verifiedClaims: ['SOURCE_TEXT_EXACT', 'EXTERNAL_IDENTIFIER', 'SOURCE_TITLE'],
          requestedIdentifier: '10.1000/182',
          resolvedIdentifier: '10.1000/182',
          observedSourceTitle: 'Unrelated Article Title',
          attestedSourceText: 'تاریخ بیداری ایرانیان'
        }
      ]
    };

    const audit = auditProvenanceIntegrity([bibCandidate], mismatchedDoiLedger);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'SOURCE_TITLE_MISMATCH')).toBe(true);
  });

  it('26. wrong external identifier blocks candidate', () => {
    const entityCandidate: ExternalCorpusCandidate = {
      id: 'cand-ent-01',
      sourceText: 'مصدق',
      proposedProfile: 'ijmes_full',
      category: 'PERSON',
      reviewStatus: 'PENDING_HUMAN_REVIEW',
      independenceClass: 'FULLY_EXTERNAL',
      entityMetadata: {
        authorityId: 'VIAF:12345',
        englishLabel: 'Mohammad Mossadegh',
        entityType: 'PERSON'
      },
      sources: [
        {
          kind: 'AUTHORITY_FILE',
          title: 'VIAF Record',
          url: 'https://viaf.org/viaf/12345',
          accessedAt: '2026-10-04',
          evidenceRole: 'SOURCE_TEXT'
        }
      ]
    };

    const idMismatchLedger: SourceVerificationLedger = {
      version: '1.0.0',
      generatedAt: '2026-10-04T10:00:00Z',
      verifiedCount: 1,
      rejectedCount: 0,
      unverifiedCount: 0,
      receipts: [
        {
          candidateId: 'cand-ent-01',
          sourceIndex: 0,
          status: 'VERIFIED',
          verificationMethod: 'AUTHORITY_RECORD',
          verifiedAt: '2026-10-04T10:00:00Z',
          verifiedClaims: ['SOURCE_TEXT_EXACT', 'EXTERNAL_IDENTIFIER', 'SOURCE_TITLE'],
          requestedIdentifier: 'VIAF:12345',
          resolvedIdentifier: 'VIAF:99999', // Identifier mismatch
          observedSourceTitle: 'VIAF Record',
          attestedSourceText: 'مصدق'
        }
      ]
    };

    const audit = auditProvenanceIntegrity([entityCandidate], idMismatchLedger);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'UNVERIFIED_EXTERNAL_IDENTIFIER')).toBe(true);
  });

  it('27. observedRomanization must be attested if retained', () => {
    const mismatchRomLedger: SourceVerificationLedger = {
      version: '1.0.0',
      generatedAt: '2026-10-04T10:00:00Z',
      verifiedCount: 2,
      rejectedCount: 0,
      unverifiedCount: 0,
      receipts: [
        {
          candidateId: 'cand-test-01',
          sourceIndex: 0,
          status: 'VERIFIED',
          verificationMethod: 'DICTIONARY_PAGE',
          verifiedAt: '2026-10-04T10:00:00Z',
          verifiedClaims: ['SOURCE_TEXT_EXACT', 'SOURCE_TITLE'],
          observedSourceTitle: 'Dehkhoda Dictionary',
          attestedSourceText: 'مشروطه'
        },
        {
          candidateId: 'cand-test-01',
          sourceIndex: 1,
          status: 'VERIFIED',
          verificationMethod: 'URL_CONTENT',
          verifiedAt: '2026-10-04T10:00:00Z',
          verifiedClaims: ['ENTITY_IDENTITY', 'ROMANIZATION_EXACT', 'SOURCE_TITLE'],
          canonicalUrl: 'https://www.iranicaonline.org/articles/constitutional-revolution-index',
          observedSourceTitle: 'CONSTITUTIONAL REVOLUTION',
          locator: 'opening sentence',
          attestedRomanization: 'mashrooteh' // Mismatches mašrūṭa
        }
      ]
    };

    const audit = auditProvenanceIntegrity([validCandidate], mismatchRomLedger);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'OBSERVED_ROMANIZATION_NOT_ATTESTED')).toBe(true);
  });

  it('28. wrong source title / canonical URL verification fails closed', () => {
    const wrongUrlLedger: SourceVerificationLedger = {
      version: '1.0.0',
      generatedAt: '2026-10-04T10:00:00Z',
      verifiedCount: 2,
      rejectedCount: 0,
      unverifiedCount: 0,
      receipts: [
        {
          candidateId: 'cand-test-01',
          sourceIndex: 0,
          status: 'VERIFIED',
          verificationMethod: 'DICTIONARY_PAGE',
          verifiedAt: '2026-10-04T10:00:00Z',
          verifiedClaims: ['SOURCE_TEXT_EXACT', 'SOURCE_TITLE'],
          observedSourceTitle: 'Dehkhoda Dictionary',
          attestedSourceText: 'مشروطه'
        },
        {
          candidateId: 'cand-test-01',
          sourceIndex: 1,
          status: 'VERIFIED',
          verificationMethod: 'URL_CONTENT',
          verifiedAt: '2026-10-04T10:00:00Z',
          verifiedClaims: ['ENTITY_IDENTITY', 'ROMANIZATION_EXACT', 'SOURCE_TITLE'],
          canonicalUrl: 'https://www.iranicaonline.org/articles/wrong-page', // Mismatched URL
          observedSourceTitle: 'CONSTITUTIONAL REVOLUTION',
          locator: 'opening sentence',
          attestedRomanization: 'mašrūṭa'
        }
      ]
    };

    const audit = auditProvenanceIntegrity([validCandidate], wrongUrlLedger);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'SOURCE_URL_MISMATCH')).toBe(true);
  });

  it('29. review sheet excludes unverified candidates', () => {
    const unverifiedCandidate: ExternalCorpusCandidate = {
      ...validCandidate,
      id: 'cand-unverified-01',
      reviewStatus: 'UNVERIFIED' as any
    };

    const csv = generateReviewSheetCsv([validCandidate, unverifiedCandidate]);
    const lines = csv.trim().split('\n');
    // Header + 1 valid candidate = 2 lines (unverified skipped)
    expect(lines.length).toBe(2);
    expect(csv).toContain('cand-test-01');
    expect(csv).not.toContain('cand-unverified-01');
  });

  it('30. acquisition integrity fails if even one frozen candidate lacks source-text verification', () => {
    const candidateA = { ...validCandidate, id: 'cand-pass' };
    const candidateB = { ...validCandidate, id: 'cand-missing-src', sourceText: 'مشروطیت' };

    const partialLedger: SourceVerificationLedger = {
      version: '1.0.0',
      generatedAt: '2026-10-04T10:00:00Z',
      verifiedCount: 1,
      rejectedCount: 0,
      unverifiedCount: 0,
      receipts: [
        {
          candidateId: 'cand-pass',
          sourceIndex: 0,
          status: 'VERIFIED',
          verificationMethod: 'DICTIONARY_PAGE',
          verifiedAt: '2026-10-04T10:00:00Z',
          verifiedClaims: ['SOURCE_TEXT_EXACT', 'SOURCE_TITLE'],
          observedSourceTitle: 'Dehkhoda Dictionary',
          attestedSourceText: 'مشروطه'
        }
      ]
    };

    const audit = auditProvenanceIntegrity([candidateA, candidateB], partialLedger);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.candidateId === 'cand-missing-src')).toBe(true);
  });

  it('31. validates the committed independent external candidate dataset and ledger cleanly', () => {
    const result = runAcquisitionCli();
    expect(result.success).toBe(true);
    expect(result.candidates.length).toBe(108);
    expect(result.coverage.totalCandidates).toBe(108);
    expect(result.overlapAudit.outOfSamplePercent).toBeGreaterThanOrEqual(70.0);
    expect(result.deduplication.hasBlockingDuplicates).toBe(false);
    expect(result.provenanceAudit.passed).toBe(true);
    expect(result.provenanceAudit.verifiedCandidateCount).toBe(108);
    expect(result.report).toContain('Acquisition Integrity:       PASS');
    expect(result.report).toContain('Provenance Integrity:        PASS');
  });

  it('32. topic-only source can be VERIFIED IDENTITY evidence without claiming romanization attestation', () => {
    const topicOnlyCandidate: ExternalCorpusCandidate = {
      id: 'cand-topic-only',
      sourceText: 'نوسازی',
      proposedProfile: 'ijmes_full',
      category: 'TERM',
      reviewStatus: 'PENDING_HUMAN_REVIEW',
      independenceClass: 'FULLY_EXTERNAL',
      sources: [
        {
          kind: 'ACADEMIC_DICTIONARY',
          title: 'Dehkhoda Dictionary',
          citation: 'Loghatnāmeh-ye Dehkhodā, Headword: نوسازی',
          accessedAt: '2026-10-04',
          evidenceRole: 'SOURCE_TEXT',
          verification: {
            status: 'VERIFIED',
            method: 'DICTIONARY_PAGE',
            verifiedAt: '2026-10-04',
            verifiedClaims: ['SOURCE_TEXT_EXACT', 'SOURCE_TITLE'],
            observedSourceTitle: 'Dehkhoda Dictionary',
            attestedSourceText: 'نوسازی',
            locator: 'entry نوسازی'
          }
        },
        {
          kind: 'ENCYCLOPAEDIA_IRANICA',
          title: 'CITIES iv. Modern Urbanization and Modernization in Persia',
          url: 'https://www.iranicaonline.org/articles/cities-iv',
          accessedAt: '2026-10-04',
          evidenceRole: 'IDENTITY',
          // No observedRomanization
          verification: {
            status: 'VERIFIED',
            method: 'URL_CONTENT',
            verifiedAt: '2026-10-04',
            verifiedClaims: ['ENTITY_IDENTITY', 'SOURCE_TITLE'],
            canonicalUrl: 'https://www.iranicaonline.org/articles/cities-iv',
            observedSourceTitle: 'CITIES iv. Modern Urbanization and Modernization in Persia'
          }
        }
      ]
    };

    const audit = auditProvenanceIntegrity([topicOnlyCandidate]);
    expect(audit.passed).toBe(true);
    expect(audit.diagnostics.length).toBe(0);
  });

  // --- Section 12 Required Regression Tests ---

  it('33. SOURCE_TEXT with matching attested text but no SOURCE_TEXT_EXACT claim fails closed', () => {
    const candidateWithoutExactClaim: ExternalCorpusCandidate = {
      id: 'cand-no-exact-claim',
      sourceText: 'مشروطه',
      proposedProfile: 'ijmes_full',
      category: 'TERM',
      reviewStatus: 'PENDING_HUMAN_REVIEW',
      independenceClass: 'FULLY_EXTERNAL',
      sources: [
        {
          kind: 'ACADEMIC_DICTIONARY',
          title: 'Dehkhoda Dictionary',
          citation: 'Loghatnāmeh-ye Dehkhodā, Headword: مشروطه',
          accessedAt: '2026-10-04',
          evidenceRole: 'SOURCE_TEXT',
          verification: {
            status: 'VERIFIED',
            method: 'DICTIONARY_PAGE',
            verifiedAt: '2026-10-04',
            verifiedClaims: ['SOURCE_TITLE'], // Missing SOURCE_TEXT_EXACT
            attestedSourceText: 'مشروطه'
          }
        }
      ]
    };

    const audit = auditProvenanceIntegrity([candidateWithoutExactClaim]);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'MISSING_SOURCE_TEXT_EXACT_CLAIM')).toBe(true);
  });

  it('34. observedRomanization with matching attested string but no ROMANIZATION_EXACT claim fails closed', () => {
    const missingRomExactClaimCandidate: ExternalCorpusCandidate = {
      id: 'cand-claim-missing',
      sourceText: 'مشروطه',
      proposedProfile: 'ijmes_full',
      category: 'TERM',
      reviewStatus: 'PENDING_HUMAN_REVIEW',
      independenceClass: 'FULLY_EXTERNAL',
      sources: [
        {
          kind: 'ACADEMIC_DICTIONARY',
          title: 'Dehkhoda Dictionary',
          citation: 'Loghatnāmeh-ye Dehkhodā, Headword: مشروطه',
          accessedAt: '2026-10-04',
          evidenceRole: 'SOURCE_TEXT',
          verification: {
            status: 'VERIFIED',
            method: 'DICTIONARY_PAGE',
            verifiedAt: '2026-10-04',
            verifiedClaims: ['SOURCE_TEXT_EXACT', 'SOURCE_TITLE'],
            attestedSourceText: 'مشروطه'
          }
        },
        {
          kind: 'ENCYCLOPAEDIA_IRANICA',
          title: 'CONSTITUTIONAL REVOLUTION',
          url: 'https://www.iranicaonline.org/articles/constitutional-revolution-index',
          accessedAt: '2026-10-04',
          evidenceRole: 'IDENTITY',
          observedRomanization: 'mašrūṭa',
          romanizationSystem: 'IRANICA',
          verification: {
            status: 'VERIFIED',
            method: 'URL_CONTENT',
            verifiedAt: '2026-10-04',
            verifiedClaims: ['ENTITY_IDENTITY', 'SOURCE_TITLE'], // Lacks ROMANIZATION_EXACT
            canonicalUrl: 'https://www.iranicaonline.org/articles/constitutional-revolution-index',
            observedSourceTitle: 'CONSTITUTIONAL REVOLUTION',
            locator: 'opening sentence',
            attestedRomanization: 'mašrūṭa'
          }
        }
      ]
    };

    const audit = auditProvenanceIntegrity([missingRomExactClaimCandidate]);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'OBSERVED_ROMANIZATION_NOT_ATTESTED')).toBe(true);
  });

  it('35. VERIFIED receipt with no verifiedClaims fails schema validation', () => {
    expect(() => {
      SourceVerificationSchema.parse({
        status: 'VERIFIED',
        method: 'DICTIONARY_PAGE',
        verifiedAt: '2026-10-04',
        verifiedClaims: [] // Empty claims
      });
    }).toThrow(/VERIFIED verification requires at least one verifiedClaim/);

    expect(() => {
      SourceVerificationEntrySchema.parse({
        candidateId: 'cand-1',
        sourceIndex: 0,
        status: 'VERIFIED',
        verificationMethod: 'DICTIONARY_PAGE',
        verifiedAt: '2026-10-04',
        verifiedClaims: [] // Empty claims
      });
    }).toThrow(/VERIFIED verification entry requires at least one verifiedClaim/);
  });

  it('36. EXTERNAL_IDENTIFIER field without EXTERNAL_IDENTIFIER claim fails closed', () => {
    const candidateWithoutIdClaim: ExternalCorpusCandidate = {
      id: 'cand-no-id-claim',
      sourceText: 'مصدق',
      proposedProfile: 'ijmes_full',
      category: 'PERSON',
      reviewStatus: 'PENDING_HUMAN_REVIEW',
      independenceClass: 'FULLY_EXTERNAL',
      entityMetadata: {
        authorityId: 'VIAF:12345',
        englishLabel: 'Mohammad Mossadegh',
        entityType: 'PERSON'
      },
      sources: [
        {
          kind: 'AUTHORITY_FILE',
          title: 'VIAF Record',
          url: 'https://viaf.org/viaf/12345',
          accessedAt: '2026-10-04',
          evidenceRole: 'SOURCE_TEXT',
          externalId: 'VIAF:12345',
          verification: {
            status: 'VERIFIED',
            method: 'AUTHORITY_RECORD',
            verifiedAt: '2026-10-04',
            verifiedClaims: ['SOURCE_TEXT_EXACT', 'SOURCE_TITLE'], // Missing EXTERNAL_IDENTIFIER claim
            externalRecordId: 'VIAF:12345',
            attestedSourceText: 'مصدق'
          }
        }
      ]
    };

    const audit = auditProvenanceIntegrity([candidateWithoutIdClaim]);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'UNVERIFIED_EXTERNAL_IDENTIFIER')).toBe(true);
  });

  it('37. article headword locator with a different string fails closed', () => {
    const wrongHeadwordCandidate: ExternalCorpusCandidate = {
      id: 'cand-wrong-headword',
      sourceText: 'شاهنشاهی',
      proposedProfile: 'ijmes_full',
      category: 'TERM',
      reviewStatus: 'PENDING_HUMAN_REVIEW',
      independenceClass: 'FULLY_EXTERNAL',
      sources: [
        {
          kind: 'ACADEMIC_DICTIONARY',
          title: 'Dehkhoda Dictionary',
          citation: 'Loghatnāmeh-ye Dehkhodā, Headword: شاهنشاهی',
          accessedAt: '2026-10-04',
          evidenceRole: 'SOURCE_TEXT',
          verification: {
            status: 'VERIFIED',
            method: 'DICTIONARY_PAGE',
            verifiedAt: '2026-10-04',
            verifiedClaims: ['SOURCE_TEXT_EXACT', 'SOURCE_TITLE'],
            attestedSourceText: 'شاهنشاهی'
          }
        },
        {
          kind: 'ENCYCLOPAEDIA_IRANICA',
          title: 'ŠĀHANŠĀH',
          url: 'https://www.iranicaonline.org/articles/sahansah',
          accessedAt: '2026-10-04',
          evidenceRole: 'IDENTITY',
          observedRomanization: 'šāhanšāhī',
          romanizationSystem: 'IRANICA',
          verification: {
            status: 'VERIFIED',
            method: 'URL_CONTENT',
            verifiedAt: '2026-10-04',
            verifiedClaims: ['ENTITY_IDENTITY', 'ROMANIZATION_EXACT', 'SOURCE_TITLE'],
            canonicalUrl: 'https://www.iranicaonline.org/articles/sahansah',
            observedSourceTitle: 'ŠĀHANŠĀH',
            locator: 'article headword',
            attestedRomanization: 'šāhanšāh' // Mismatches observed šāhanšāhī
          }
        }
      ]
    };

    const audit = auditProvenanceIntegrity([wrongHeadwordCandidate]);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'OBSERVED_ROMANIZATION_NOT_ATTESTED')).toBe(true);
  });

  it('38. lowercase/uppercase difference does not count as ROMANIZATION_EXACT', () => {
    const caseMismatchCandidate: ExternalCorpusCandidate = {
      id: 'cand-case-mismatch',
      sourceText: 'تجدد',
      proposedProfile: 'ijmes_full',
      category: 'TERM',
      reviewStatus: 'PENDING_HUMAN_REVIEW',
      independenceClass: 'FULLY_EXTERNAL',
      sources: [
        {
          kind: 'ACADEMIC_DICTIONARY',
          title: 'Dehkhoda Dictionary',
          citation: 'Loghatnāmeh-ye Dehkhodā, Headword: تجدد',
          accessedAt: '2026-10-04',
          evidenceRole: 'SOURCE_TEXT',
          verification: {
            status: 'VERIFIED',
            method: 'DICTIONARY_PAGE',
            verifiedAt: '2026-10-04',
            verifiedClaims: ['SOURCE_TEXT_EXACT', 'SOURCE_TITLE'],
            attestedSourceText: 'تجدد'
          }
        },
        {
          kind: 'ENCYCLOPAEDIA_IRANICA',
          title: 'TAJADDOD',
          url: 'https://www.iranicaonline.org/articles/tajaddod-journal',
          accessedAt: '2026-10-04',
          evidenceRole: 'IDENTITY',
          observedRomanization: 'tajaddod',
          romanizationSystem: 'IRANICA',
          verification: {
            status: 'VERIFIED',
            method: 'URL_CONTENT',
            verifiedAt: '2026-10-04',
            verifiedClaims: ['ENTITY_IDENTITY', 'ROMANIZATION_EXACT', 'SOURCE_TITLE'],
            canonicalUrl: 'https://www.iranicaonline.org/articles/tajaddod-journal',
            observedSourceTitle: 'TAJADDOD',
            locator: 'article headword',
            attestedRomanization: 'TAJADDOD' // Case mismatch with tajaddod
          }
        }
      ]
    };

    const audit = auditProvenanceIntegrity([caseMismatchCandidate]);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'OBSERVED_ROMANIZATION_NOT_ATTESTED')).toBe(true);
  });

  it('39. valid exact romanization + truthful locator passes cleanly', () => {
    const exactRomCandidate: ExternalCorpusCandidate = {
      id: 'cand-exact-rom',
      sourceText: 'مشروطه',
      proposedProfile: 'ijmes_full',
      category: 'TERM',
      reviewStatus: 'PENDING_HUMAN_REVIEW',
      independenceClass: 'FULLY_EXTERNAL',
      sources: [
        {
          kind: 'ACADEMIC_DICTIONARY',
          title: 'Dehkhoda Dictionary',
          citation: 'Loghatnāmeh-ye Dehkhodā, Headword: مشروطه',
          accessedAt: '2026-10-04',
          evidenceRole: 'SOURCE_TEXT',
          verification: {
            status: 'VERIFIED',
            method: 'DICTIONARY_PAGE',
            verifiedAt: '2026-10-04',
            verifiedClaims: ['SOURCE_TEXT_EXACT', 'SOURCE_TITLE'],
            observedSourceTitle: 'Dehkhoda Dictionary',
            attestedSourceText: 'مشروطه',
            locator: 'Headword: مشروطه'
          }
        },
        {
          kind: 'ENCYCLOPAEDIA_IRANICA',
          title: 'CONSTITUTIONAL REVOLUTION',
          url: 'https://www.iranicaonline.org/articles/constitutional-revolution-index',
          accessedAt: '2026-10-04',
          evidenceRole: 'IDENTITY',
          observedRomanization: 'mašrūṭa',
          romanizationSystem: 'IRANICA',
          verification: {
            status: 'VERIFIED',
            method: 'URL_CONTENT',
            verifiedAt: '2026-10-04',
            verifiedClaims: ['ENTITY_IDENTITY', 'ROMANIZATION_EXACT', 'SOURCE_TITLE'],
            canonicalUrl: 'https://www.iranicaonline.org/articles/constitutional-revolution-index',
            observedSourceTitle: 'CONSTITUTIONAL REVOLUTION',
            locator: 'opening sentence',
            attestedRomanization: 'mašrūṭa'
          }
        }
      ]
    };

    const audit = auditProvenanceIntegrity([exactRomCandidate]);
    expect(audit.passed).toBe(true);
    expect(audit.diagnostics.length).toBe(0);
  });

  it('40. candidate-local and ledger claim disagreement fails closed', () => {
    const candidateLocal: ExternalCorpusCandidate = {
      ...validCandidate,
      sources: [
        {
          ...validCandidate.sources[0],
          verification: {
            ...validCandidate.sources[0].verification!,
            verifiedClaims: ['SOURCE_TEXT_EXACT', 'SOURCE_TITLE']
          }
        },
        validCandidate.sources[1]
      ]
    };

    const disagreeingLedger: SourceVerificationLedger = {
      version: '1.0.0',
      generatedAt: '2026-10-04T10:00:00Z',
      verifiedCount: 2,
      rejectedCount: 0,
      unverifiedCount: 0,
      receipts: [
        {
          candidateId: 'cand-test-01',
          sourceIndex: 0,
          status: 'VERIFIED',
          verificationMethod: 'DICTIONARY_PAGE',
          verifiedAt: '2026-10-04T10:00:00Z',
          verifiedClaims: ['SOURCE_TEXT_EXACT'], // Disagrees with local claims
          observedSourceTitle: 'Dehkhoda Dictionary',
          attestedSourceText: 'مشروطه',
          locator: 'Headword: مشروطه'
        },
        validLedger.receipts![1]
      ]
    };

    const audit = auditProvenanceIntegrity([candidateLocal], disagreeingLedger);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'LEDGER_CLAIM_DISAGREEMENT')).toBe(true);
  });

  it('41. observedSourceTitle without SOURCE_TITLE claim fails audit and schema', () => {
    const noTitleClaimCandidate: ExternalCorpusCandidate = {
      ...validCandidate,
      sources: [
        {
          ...validCandidate.sources[0],
          verification: {
            status: 'VERIFIED',
            method: 'DICTIONARY_PAGE',
            verifiedAt: '2026-10-04',
            verifiedClaims: ['SOURCE_TEXT_EXACT'], // Missing SOURCE_TITLE
            observedSourceTitle: 'Dehkhoda Dictionary',
            attestedSourceText: 'مشروطه'
          }
        },
        validCandidate.sources[1]
      ]
    };

    const audit = auditProvenanceIntegrity([noTitleClaimCandidate]);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'MISSING_SOURCE_TITLE_CLAIM')).toBe(true);

    expect(() => {
      SourceVerificationSchema.parse({
        status: 'VERIFIED',
        method: 'DICTIONARY_PAGE',
        verifiedAt: '2026-10-04',
        verifiedClaims: ['SOURCE_TEXT_EXACT'],
        observedSourceTitle: 'Dehkhoda Dictionary',
        attestedSourceText: 'مشروطه'
      });
    }).toThrow(/requires SOURCE_TITLE claim/);
  });

  it('42. SOURCE_TITLE claim without observedSourceTitle fails audit and schema', () => {
    const missingTitleCandidate: ExternalCorpusCandidate = {
      ...validCandidate,
      sources: [
        {
          ...validCandidate.sources[0],
          verification: {
            status: 'VERIFIED',
            method: 'DICTIONARY_PAGE',
            verifiedAt: '2026-10-04',
            verifiedClaims: ['SOURCE_TEXT_EXACT', 'SOURCE_TITLE'],
            attestedSourceText: 'مشروطه'
            // observedSourceTitle omitted
          }
        },
        validCandidate.sources[1]
      ]
    };

    const audit = auditProvenanceIntegrity([missingTitleCandidate]);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'MISSING_OBSERVED_SOURCE_TITLE')).toBe(true);

    expect(() => {
      SourceVerificationSchema.parse({
        status: 'VERIFIED',
        method: 'DICTIONARY_PAGE',
        verifiedAt: '2026-10-04',
        verifiedClaims: ['SOURCE_TEXT_EXACT', 'SOURCE_TITLE'],
        attestedSourceText: 'مشروطه'
      });
    }).toThrow(/requires observedSourceTitle/);
  });

  it('43. local canonicalUrl differs from ledger canonicalUrl fails closed', () => {
    const disagreeingUrlLedger: SourceVerificationLedger = {
      ...validLedger,
      receipts: [
        validLedger.receipts![0],
        {
          ...validLedger.receipts![1],
          canonicalUrl: 'https://www.iranicaonline.org/articles/different-url'
        }
      ]
    };

    const audit = auditProvenanceIntegrity([validCandidate], disagreeingUrlLedger);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'LEDGER_CLAIM_DISAGREEMENT')).toBe(true);
  });

  it('44. local locator differs from ledger locator fails closed', () => {
    const disagreeingLocLedger: SourceVerificationLedger = {
      ...validLedger,
      receipts: [
        {
          ...validLedger.receipts![0],
          locator: 'entry مشروطه (differing)'
        },
        validLedger.receipts![1]
      ]
    };

    const audit = auditProvenanceIntegrity([validCandidate], disagreeingLocLedger);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'LEDGER_CLAIM_DISAGREEMENT')).toBe(true);
  });

  it('45. local observedSourceTitle differs from ledger title fails closed', () => {
    const disagreeingTitleLedger: SourceVerificationLedger = {
      ...validLedger,
      receipts: [
        {
          ...validLedger.receipts![0],
          observedSourceTitle: 'Different Dictionary Title'
        },
        validLedger.receipts![1]
      ]
    };

    const audit = auditProvenanceIntegrity([validCandidate], disagreeingTitleLedger);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'LEDGER_CLAIM_DISAGREEMENT')).toBe(true);
  });

  it('46. local verification method differs from ledger method fails closed', () => {
    const disagreeingMethodLedger: SourceVerificationLedger = {
      ...validLedger,
      receipts: [
        {
          ...validLedger.receipts![0],
          verificationMethod: 'URL_CONTENT' // Differs from DICTIONARY_PAGE
        },
        validLedger.receipts![1]
      ]
    };

    const audit = auditProvenanceIntegrity([validCandidate], disagreeingMethodLedger);
    expect(audit.passed).toBe(false);
    expect(audit.diagnostics.some(d => d.code === 'LEDGER_CLAIM_DISAGREEMENT')).toBe(true);
  });

  it('47. fully matching local + ledger receipt passes cleanly', () => {
    const audit = auditProvenanceIntegrity([validCandidate], validLedger);
    expect(audit.passed).toBe(true);
    expect(audit.diagnostics.length).toBe(0);
    expect(audit.verifiedCandidateCount).toBe(1);
  });
});
