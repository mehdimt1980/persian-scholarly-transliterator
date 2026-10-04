import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { computeAcquisitionCoverage } from './coverage';
import { deduplicateCandidates } from './deduplicate';
import { auditProjectOverlap } from './overlapAudit';
import { generateAcquisitionReport } from './report';
import { generateReviewSheetCsv } from './reviewSheet';
import {
  AcquisitionManifestSchema,
  AcquisitionSourceSchema,
  ExternalCorpusCandidateSchema,
  validateAcquisitionCorpusData,
  validateAcquisitionManifest,
  validateCandidate
} from './schema';
import { ExternalCorpusCandidate } from './types';
import { validateAcquisitionCandidates } from './validateCandidates';
import { runAcquisitionCli } from './cli';

describe('Phase 4.6A External Benchmark Corpus Acquisition Framework', () => {
  const validCandidate: ExternalCorpusCandidate = {
    id: 'cand-test-01',
    sourceText: 'نوسازی',
    proposedProfile: 'ijmes_full',
    category: 'TERM',
    reviewStatus: 'PENDING_HUMAN_REVIEW',
    independenceClass: 'FULLY_EXTERNAL',
    sources: [
      {
        kind: 'ENCYCLOPAEDIA_IRANICA',
        title: 'MODERNIZATION IN PERSIA',
        url: 'https://www.iranicaonline.org/articles/modernization-in-persia',
        accessedAt: '2026-10-04',
        evidenceRole: 'IDENTITY',
        observedRomanization: 'now-sāzī',
        romanizationSystem: 'IRANICA'
      }
    ]
  };

  it('1. rejects candidate containing expected canonical or gold output fields', () => {
    expect(() => {
      validateCandidate({
        ...validCandidate,
        expected: { canonical: 'nowsāzī' }
      } as any);
    }).toThrow(/unrecognized_key|Unrecognized key|expected output/);

    expect(() => {
      validateCandidate({
        ...validCandidate,
        canonical: 'nowsāzī'
      } as any);
    }).toThrow(/unrecognized_key|Unrecognized key|expected output/);

    expect(() => {
      validateCandidate({
        ...validCandidate,
        finalText: 'nowsāzī'
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
        sourceText: ' نوسازی '
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
        title: 'IRANICA ARTICLE',
        url: 'https://www.iranicaonline.org/articles/sample',
        accessedAt: '2026-10-04',
        evidenceRole: 'IDENTITY',
        observedRomanization: 'now-sāzī'
        // missing romanizationSystem
      });
    }).toThrow(/declare romanizationSystem/);

    expect(() => {
      AcquisitionSourceSchema.parse({
        kind: 'ENCYCLOPAEDIA_IRANICA',
        title: 'IRANICA ARTICLE',
        url: 'https://www.iranicaonline.org/articles/sample',
        accessedAt: '2026-10-04',
        evidenceRole: 'IDENTITY',
        observedRomanization: 'now-sāzī',
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
    // Validating candidates should be pure data validation without invoking the transliterator engine
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
    // No output or transliteration artifact attached
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

  it('18. validates the committed independent external candidate dataset cleanly', () => {
    const result = runAcquisitionCli();
    expect(result.success).toBe(true);
    expect(result.candidates.length).toBe(160);
    expect(result.coverage.totalCandidates).toBe(160);
    expect(result.overlapAudit.outOfSamplePercent).toBeGreaterThanOrEqual(70.0);
    expect(result.deduplication.hasBlockingDuplicates).toBe(false);
    expect(result.report).toContain('Acquisition Integrity:       PASS');
  });
});
