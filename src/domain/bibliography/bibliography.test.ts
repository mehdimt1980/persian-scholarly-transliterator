import { describe, expect, it } from 'vitest';
import {
  importBibliographyFromCsv,
  validateFileSize,
  processBibliographyBatch,
  exportReviewCsv,
  exportFinalCsv,
  exportToRis,
  exportToBibTeX,
  containsArabicScript,
  generateFallbackRecordId,
  computeRecordContentFingerprint,
  makeBibliographyIssueScopeKey,
  sanitizeBibTeXKey,
  BibliographyRecord,
  BibliographyReviewDecision,
  ProcessedBibliographyRecord
} from './index';
import {
  AssistedResolution,
  buildResolverRequest,
  candidateToReviewDecision,
  computeRequestFingerprint,
  validateAssistedApplicability
} from '../assistance';

describe('Phase 4 Batch Bibliography Processing and Scholarly Exports', () => {
  describe('Script Detection (Section 20)', () => {
    it('accurately identifies Arabic/Persian letter/mark material and ignores punctuation alone', () => {
      expect(containsArabicScript('تاریخ ایران')).toBe(true);
      expect(containsArabicScript('Homa Katouzian')).toBe(false);
      expect(containsArabicScript('Iran and دولت')).toBe(true);
      expect(containsArabicScript('1921-1979')).toBe(false);
      expect(containsArabicScript('10.1017/S002074380000000X')).toBe(false);
      // Arabic comma '،' alone must NOT trigger transliteration on Latin metadata
      expect(containsArabicScript('Iran، 1906')).toBe(false);
      expect(containsArabicScript('Tehran؛ 1399')).toBe(false);
    });
  });

  describe('Record Identity & Fingerprinting (Section 9, 22)', () => {
    it('computes deterministic 64-bit content fingerprints independent of row index', () => {
      const recA: Omit<BibliographyRecord, 'id' | 'sourceRowIndex' | 'sourceColumns'> = {
        type: 'BOOK',
        title: 'تاریخ ایران',
        authors: [{ literal: 'پیرنیا' }],
        editors: [],
        translators: [],
        passthrough: {}
      };
      const recB: Omit<BibliographyRecord, 'id' | 'sourceRowIndex' | 'sourceColumns'> = {
        type: 'BOOK',
        title: 'تاریخ ایران',
        authors: [{ literal: 'پیرنیا' }],
        editors: [],
        translators: [],
        passthrough: {}
      };

      const fpA = computeRecordContentFingerprint(recA);
      const fpB = computeRecordContentFingerprint(recB);
      expect(fpA).toBe(fpB);
      expect(fpA.length).toBe(16); // 64-bit hex is 16 chars
      expect(generateFallbackRecordId(recA, 1)).toBe(`record:${fpA}:1`);
      expect(generateFallbackRecordId(recB, 2)).toBe(`record:${fpB}:2`);
    });

    it('sanitizes BibTeX citation keys to pst_<safeId>', () => {
      expect(sanitizeBibTeXKey('record:abcdef0123456789:1')).toBe('pst_record_abcdef0123456789_1');
      expect(sanitizeBibTeXKey('my-article-2020')).toBe('pst_my_article_2020');
      expect(sanitizeBibTeXKey('pst_already_prefixed')).toBe('pst_already_prefixed');
    });
  });

  describe('CSV Parser & Importer Robustness (Sections 1, 3, 5, 6, 7, 8, 25)', () => {
    it('parses standard CSV with UTF-8 BOM, Persian script, and literal creators', () => {
      const csv = `\uFEFFid,type,title,authors,year,publisher\nr1,BOOK,تاریخ ایران,حسن پیرنیا | عباس اقبال,1380,نشر علم`;
      const result = importBibliographyFromCsv(csv);
      expect(result.success).toBe(true);
      expect(result.records.length).toBe(1);
      const rec = result.records[0];
      expect(rec.id).toBe('r1');
      expect(rec.type).toBe('BOOK');
      expect(rec.title).toBe('تاریخ ایران');
      expect(rec.authors).toEqual([{ literal: 'حسن پیرنیا' }, { literal: 'عباس اقبال' }]);
      expect(rec.year).toBe('1380');
      expect(rec.publisher).toBe('نشر علم');
    });

    it('handles quoted commas, quoted newlines, and doubled quotes', () => {
      const csv = `id,type,title,notes\n"rec-1",BOOK,"History, State, and ""Society"" in Iran","Line 1\nLine 2 with, comma"`;
      const result = importBibliographyFromCsv(csv);
      expect(result.success).toBe(true);
      expect(result.records.length).toBe(1);
      expect(result.records[0].title).toBe('History, State, and "Society" in Iran');
      expect(result.records[0].notes).toBe('Line 1\nLine 2 with, comma');
    });

    it('rejects unexpected quote inside unquoted field with CSV_PARSE_ERROR', () => {
      const csv = `id,title\nr1,abc"def"\n`;
      const result = importBibliographyFromCsv(csv);
      expect(result.success).toBe(false);
      expect(result.diagnostics.some((d) => d.code === 'CSV_PARSE_ERROR')).toBe(true);
    });

    it('rejects unexpected characters after closing quote with CSV_PARSE_ERROR', () => {
      const csv = `id,title\nr1,"abc"x,y\n`;
      const result = importBibliographyFromCsv(csv);
      expect(result.success).toBe(false);
      expect(result.diagnostics.some((d) => d.code === 'CSV_PARSE_ERROR')).toBe(true);
    });

    it('rejects unclosed quote with CSV_PARSE_ERROR and fails import', () => {
      const csv = `id,title\nr1,"unclosed title\n`;
      const result = importBibliographyFromCsv(csv);
      expect(result.success).toBe(false);
      expect(result.diagnostics.some((d) => d.code === 'CSV_PARSE_ERROR')).toBe(true);
    });

    it('emits ROW_WIDTH_MISMATCH diagnostic on column count discrepancy', () => {
      const csv = `id,type,title\nr1,BOOK,کتاب,extra_col`;
      const result = importBibliographyFromCsv(csv);
      expect(result.diagnostics.some((d) => d.code === 'ROW_WIDTH_MISMATCH')).toBe(true);
    });

    it('maps booktitle strictly to containerTitle and not to item title', () => {
      const csv = `id,type,title,booktitle\nr1,BOOK_CHAPTER,فصل اول,تاریخ ایران`;
      const result = importBibliographyFromCsv(csv);
      expect(result.success).toBe(true);
      expect(result.records[0].title).toBe('فصل اول');
      expect(result.records[0].containerTitle).toBe('تاریخ ایران');
    });

    it('detects ambiguous duplicate canonical headers and fails import', () => {
      const csv = `id,title,article_title\nr1,عنوان یک,عنوان دو`;
      const result = importBibliographyFromCsv(csv);
      expect(result.success).toBe(false);
      expect(result.diagnostics.some((d) => d.code === 'AMBIGUOUS_HEADER_MAPPING')).toBe(true);
    });

    it('preserves exact raw source cells and column order in record.sourceColumns', () => {
      const csv = `CustomID,OriginalTitle,Author\n   r_1  ,  عنوان کتاب   ,  نویسنده  `;
      const result = importBibliographyFromCsv(csv);
      expect(result.success).toBe(true);
      expect(result.records[0].sourceColumns).toEqual([
        { header: 'CustomID', value: '   r_1  ' },
        { header: 'OriginalTitle', value: '  عنوان کتاب   ' },
        { header: 'Author', value: '  نویسنده  ' }
      ]);
    });

    it('pre-read file size validation helper rejects oversized files', () => {
      const valid = validateFileSize(1000, 5000);
      expect(valid.valid).toBe(true);
      const invalid = validateFileSize(6000, 5000);
      expect(invalid.valid).toBe(false);
      expect(invalid.diagnostic?.code).toBe('FILE_SIZE_EXCEEDED');
    });

    it('field length limit is fatal and fails import', () => {
      const hugeCsv = `title\n` + 'A'.repeat(60000);
      const result = importBibliographyFromCsv(hugeCsv, {
        maxFileSize: 100000,
        maxRowCount: 10,
        maxFieldLength: 1000
      });
      expect(result.success).toBe(false);
      expect(result.diagnostics.some((d) => d.code === 'FIELD_LENGTH_EXCEEDED')).toBe(true);
    });

    it('emits error diagnostic on missing required title', () => {
      const csv = `id,type,title\nr1,BOOK,\nr2,BOOK,  `;
      const result = importBibliographyFromCsv(csv);
      expect(result.diagnostics.filter((d) => d.code === 'MISSING_TITLE').length).toBe(2);
    });

    it('emits warning diagnostic on unrecognized record type and falls back to OTHER', () => {
      const csv = `id,type,title\nr1,UNKNOWN_CUSTOM_TYPE,کتاب`;
      const result = importBibliographyFromCsv(csv);
      expect(result.records[0].type).toBe('OTHER');
      expect(result.diagnostics.some((d) => d.code === 'UNKNOWN_RECORD_TYPE')).toBe(true);
    });
  });

  describe('Duplicate Record ID Fail-Closed Strategy (Section 1)', () => {
    it('duplicate supplied IDs fail closed in importBibliographyFromCsv', () => {
      const csv = `id,type,title\nr1,BOOK,کتاب الف\nr1,BOOK,کتاب ب`;
      const result = importBibliographyFromCsv(csv);
      expect(result.success).toBe(false);
      expect(result.diagnostics.some((d) => d.code === 'DUPLICATE_ID')).toBe(true);
    });

    it('duplicate record IDs fail closed independently in processBibliographyBatch', () => {
      const recA: BibliographyRecord = {
        id: 'r1',
        type: 'BOOK',
        title: 'کرم',
        authors: [],
        editors: [],
        translators: [],
        sourceRowIndex: 2,
        sourceColumns: [],
        passthrough: {}
      };
      const recB: BibliographyRecord = {
        id: 'r1',
        type: 'BOOK',
        title: 'کرم',
        authors: [],
        editors: [],
        translators: [],
        sourceRowIndex: 3,
        sourceColumns: [],
        passthrough: {}
      };

      const batch = processBibliographyBatch([recA, recB]);
      expect(batch.records[0].readiness).toBe('INVALID');
      expect(batch.records[1].readiness).toBe('INVALID');
      expect(batch.diagnostics.some((d) => d.code === 'DUPLICATE_RECORD_ID')).toBe(true);

      // Even if a review decision is passed for r1, it must NOT be applied to duplicate records
      const decisions: BibliographyReviewDecision[] = [
        {
          recordId: 'r1',
          fieldPath: 'title',
          decision: {
            issueId: 'any_issue',
            action: 'MANUAL_CANONICAL_OVERRIDE',
            manualCanonicalTransliteration: 'kirm'
          }
        }
      ];
      const batchWithDecisions = processBibliographyBatch([recA, recB], decisions);
      expect(batchWithDecisions.records[0].readiness).toBe('INVALID');
      expect(batchWithDecisions.records[1].readiness).toBe('INVALID');
    });
  });

  describe('Pure Batch Processor & Multi-Record Scoping (Sections 10, 11, 13, 14, 15, 16, 39, 40, 41)', () => {
    it('39. processes multi-record batch independently and computes deterministic readiness', () => {
      const csv = `id,type,title,authors\nr1,BOOK,ایران,شاه\nr2,BOOK,کتاب,دانشجو\nr3,JOURNAL_ARTICLE,کرم,نویسنده`;
      const imported = importBibliographyFromCsv(csv);
      const batch = processBibliographyBatch(imported.records);

      expect(batch.records.length).toBe(3);
      expect(batch.summary.total).toBe(3);

      // r1: "ایران" is in lexicon (īrān -> Iran in title), "شاه" is in lexicon (shāh) -> READY
      const r1 = batch.records.find((r) => r.record.id === 'r1')!;
      expect(r1.fields['title'].finalText).toBe('Iran');
      expect(r1.readiness).toBe('READY');

      // r3: "کرم" is ambiguous (karm / kirm / karam) -> REVIEW_REQUIRED
      const r3 = batch.records.find((r) => r.record.id === 'r3')!;
      expect(r3.fields['title'].status).toBe('REVIEW_REQUIRED');
      expect(r3.fields['title'].finalText).toBeNull();
      expect(r3.readiness).toBe('REVIEW_REQUIRED');

      expect(batch.summary.ready).toBe(1);
      expect(batch.summary.reviewRequired).toBe(2);

      // STRICT_ALL export should fail
      const exportStrict = exportToRis(batch, 'STRICT_ALL');
      expect(exportStrict.success).toBe(false);
      expect(exportStrict.diagnostics.some((d) => d.code === 'UNREADY_RECORD_BLOCKS_STRICT_EXPORT')).toBe(true);

      // Now resolve r2 author and r3 title with human review decisions
      const r2AuthorIssue = batch.records[1].fields['authors.0.literal'].reviewIssues[0];
      const r3TitleIssue = batch.records[2].fields['title'].reviewIssues[0];
      const r3AuthorIssue = batch.records[2].fields['authors.0.literal'].reviewIssues[0];

      const reviewDecisions: BibliographyReviewDecision[] = [
        {
          recordId: 'r2',
          fieldPath: 'authors.0.literal',
          decision: {
            issueId: r2AuthorIssue.id,
            action: 'MANUAL_CANONICAL_OVERRIDE',
            manualCanonicalTransliteration: 'dānishjū'
          }
        },
        {
          recordId: 'r3',
          fieldPath: 'title',
          decision: {
            issueId: r3TitleIssue.id,
            action: 'MANUAL_CANONICAL_OVERRIDE',
            manualCanonicalTransliteration: 'karam'
          }
        },
        {
          recordId: 'r3',
          fieldPath: 'authors.0.literal',
          decision: {
            issueId: r3AuthorIssue.id,
            action: 'MANUAL_CANONICAL_OVERRIDE',
            manualCanonicalTransliteration: 'nivīsanda'
          }
        }
      ];

      const resolvedBatch = processBibliographyBatch(imported.records, reviewDecisions);
      expect(resolvedBatch.summary.ready).toBe(3);
      expect(resolvedBatch.summary.reviewRequired).toBe(0);

      const resolvedExport = exportToRis(resolvedBatch, 'STRICT_ALL');
      expect(resolvedExport.success).toBe(true);
      expect(resolvedExport.exportedRecordIds).toEqual(['r1', 'r2', 'r3']);
    });

    it('40. decision for r1/title does not resolve r2/title even if Persian text and issue IDs match', () => {
      const csv = `id,type,title\nr1,BOOK,کرم\nr2,BOOK,کرم`;
      const imported = importBibliographyFromCsv(csv);
      const initial = processBibliographyBatch(imported.records);

      const r1Issue = initial.records[0].fields['title'].reviewIssues[0];
      const r2Issue = initial.records[1].fields['title'].reviewIssues[0];
      expect(r1Issue).toBeDefined();
      expect(r2Issue).toBeDefined();

      const decisions: BibliographyReviewDecision[] = [
        {
          recordId: 'r1',
          fieldPath: 'title',
          decision: {
            issueId: r1Issue.id,
            action: 'MANUAL_CANONICAL_OVERRIDE',
            manualCanonicalTransliteration: 'kirm'
          }
        }
      ];

      const processed = processBibliographyBatch(imported.records, decisions);
      const pr1 = processed.records.find((r) => r.record.id === 'r1')!;
      const pr2 = processed.records.find((r) => r.record.id === 'r2')!;

      expect(pr1.readiness).toBe('READY');
      expect(pr1.fields['title'].finalText).toBe('Kirm');
      expect(pr1.fields['title'].status).toBe('USER_OVERRIDE');

      expect(pr2.readiness).toBe('REVIEW_REQUIRED');
      expect(pr2.fields['title'].finalText).toBeNull();
      expect(pr2.fields['title'].status).toBe('REVIEW_REQUIRED');
    });

    it('41. decision applied to author field does not resolve another author in separate record', () => {
      const csv = `id,type,title,authors\nr1,BOOK,کتاب,کرم\nr2,BOOK,کتاب,کرم`;
      const imported = importBibliographyFromCsv(csv);
      const initial = processBibliographyBatch(imported.records);

      const r1AuthorIssue = initial.records[0].fields['authors.0.literal'].reviewIssues[0];
      expect(r1AuthorIssue).toBeDefined();

      const decisions: BibliographyReviewDecision[] = [
        {
          recordId: 'r1',
          fieldPath: 'authors.0.literal',
          decision: {
            issueId: r1AuthorIssue.id,
            action: 'MANUAL_CANONICAL_OVERRIDE',
            manualCanonicalTransliteration: 'karam'
          }
        }
      ];

      const processed = processBibliographyBatch(imported.records, decisions);
      const pr1 = processed.records.find((r) => r.record.id === 'r1')!;
      const pr2 = processed.records.find((r) => r.record.id === 'r2')!;

      expect(pr1.fields['authors.0.literal'].finalText).toBe('karam');
      expect(pr2.fields['authors.0.literal'].finalText).toBeNull();
      expect(pr2.readiness).toBe('REVIEW_REQUIRED');
    });
  });

  describe('Passthrough & Mixed Script (Sections 42, 43)', () => {
    it('43. Latin-only record passes through byte-equivalent with zero Persian engine mutation', () => {
      const csv = `id,type,title,authors,year,doi\nr1,BOOK,State and Society in Iran,Homa Katouzian,2000,10.5040/9780755609437`;
      const imported = importBibliographyFromCsv(csv);
      const batch = processBibliographyBatch(imported.records);

      expect(batch.records[0].readiness).toBe('READY');
      expect(batch.records[0].fields['title'].status).toBe('PASSTHROUGH');
      expect(batch.records[0].fields['title'].finalText).toBe('State and Society in Iran');
      expect(batch.records[0].fields['authors.0.literal'].status).toBe('PASSTHROUGH');
      expect(batch.records[0].fields['authors.0.literal'].finalText).toBe('Homa Katouzian');

      const ris = exportToRis(batch, 'STRICT_ALL');
      expect(ris.success).toBe(true);
      expect(ris.content).toContain('TI  - State and Society in Iran');
      expect(ris.content).toContain('AU  - Homa Katouzian');
      expect(ris.content).toContain('PY  - 2000');
      expect(ris.content).toContain('DO  - 10.5040/9780755609437');
    });

    it('42. preserves mixed script content without dropping Latin segments', () => {
      const csv = `id,type,title\nr1,BOOK,Iran and دولت`;
      const imported = importBibliographyFromCsv(csv);
      const batch = processBibliographyBatch(imported.records);
      const pr = batch.records[0];

      expect(pr.fields['title'].sourceText).toBe('Iran and دولت');
      expect(pr.fields['title'].finalText).toContain('Daulat');
      expect(pr.fields['title'].finalText).toMatch(/Iran/i);
    });
  });

  describe('Source-Preserving & Creator Completeness in Review CSV (Sections 4, 11)', () => {
    it('review CSV preserves original source column names and order', () => {
      const csv = `Record_ID,Article_Title,Author,My_Custom_Column\nr1,کتاب,نویسنده,Val1`;
      const imported = importBibliographyFromCsv(csv);
      const batch = processBibliographyBatch(imported.records);
      const review = exportReviewCsv(batch);

      expect(review.success).toBe(true);
      const firstLine = review.content.split('\r\n')[0];
      expect(firstLine).toMatch(/^Record_ID,Article_Title,Author,My_Custom_Column,translit_title/);
      expect(review.content).toContain('Val1');
    });

    it('partially unresolved creator list leaves derived review cell empty and never partially complete', () => {
      const csv = `id,type,title,authors\nr1,BOOK,کتاب,شاه | کرم`;
      const imported = importBibliographyFromCsv(csv);
      const batch = processBibliographyBatch(imported.records);

      const review = exportReviewCsv(batch);
      expect(review.success).toBe(true);

      const lines = review.content.split('\r\n');
      const headerCols = lines[0].split(',');
      const rowCols = lines[1].split(',');
      const translitAuthorsIdx = headerCols.indexOf('translit_authors');
      expect(translitAuthorsIdx).toBeGreaterThan(-1);
      expect(rowCols[translitAuthorsIdx]).toBe('');
    });
  });

  describe('Export Modes: STRICT_ALL vs READY_ONLY (Sections 18, 19, 45, 46)', () => {
    it('45. rejects STRICT_ALL exports when any record is unresolved; diagnostic placeholders never leak', () => {
      const csv = `id,type,title\nr1,BOOK,کرم`;
      const imported = importBibliographyFromCsv(csv);
      const batch = processBibliographyBatch(imported.records);

      const ris = exportToRis(batch, 'STRICT_ALL');
      expect(ris.success).toBe(false);
      expect(ris.content).toBe('');
      expect(ris.content).not.toContain('⟦');

      const bib = exportToBibTeX(batch, 'STRICT_ALL');
      expect(bib.success).toBe(false);
      expect(bib.content).toBe('');

      const csvFinal = exportFinalCsv(batch, 'STRICT_ALL');
      expect(csvFinal.success).toBe(false);
      expect(csvFinal.content).toBe('');
    });

    it('46. READY_ONLY exports only READY records and explicitly reports skipped records', () => {
      const csv = `id,type,title\nr1,BOOK,کتاب\nr2,BOOK,کرم\nr3,BOOK,ایران`;
      const imported = importBibliographyFromCsv(csv);
      const batch = processBibliographyBatch(imported.records);

      const ris = exportToRis(batch, 'READY_ONLY');
      expect(ris.success).toBe(true);
      expect(ris.exportedRecordIds).toEqual(['r1', 'r3']);
      expect(ris.skippedRecordIds).toEqual(['r2']);
      expect(ris.skipReasons['r2']).toBeDefined();
      expect(ris.content).toContain('TI  - Kitab');
      expect(ris.content).toContain('TI  - Iran');
      expect(ris.content).not.toContain('کرم');
      expect(ris.content).not.toContain('⟦');
    });

    it('transformable final field with finalText=null fails final export even if record is marked READY', () => {
      const processedRec: ProcessedBibliographyRecord = {
        record: {
          id: 'r_fake',
          type: 'BOOK',
          title: 'دولت',
          authors: [],
          editors: [],
          translators: [],
          sourceRowIndex: 2,
          sourceColumns: [],
          passthrough: {}
        },
        fields: {
          title: {
            fieldPath: 'title',
            sourceText: 'دولت',
            profile: 'ijmes_title',
            requiresTransliteration: true,
            finalText: null,
            status: 'UNRESOLVED',
            reviewIssues: []
          }
        },
        readiness: 'READY',
        reviewIssueCount: 0,
        invalidReasons: []
      };

      const inconsistentBatch = {
        records: [processedRec],
        summary: { total: 1, ready: 1, reviewRequired: 0, invalid: 0 },
        diagnostics: []
      };

      expect(exportToRis(inconsistentBatch, 'STRICT_ALL').success).toBe(false);
      expect(exportToBibTeX(inconsistentBatch, 'STRICT_ALL').success).toBe(false);
      expect(exportFinalCsv(inconsistentBatch, 'STRICT_ALL').success).toBe(false);
    });
  });

  describe('Field-Scoped Assistance Isolation (Sections 12-16)', () => {
    it('makeBibliographyIssueScopeKey creates unique composite key for record + field + issue', () => {
      const key1 = makeBibliographyIssueScopeKey('r1', 'title', 'issue:123');
      const key2 = makeBibliographyIssueScopeKey('r2', 'title', 'issue:123');
      const key3 = makeBibliographyIssueScopeKey('r1', 'containerTitle', 'issue:123');
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
    });

    it('assisted suggestion for r1/title cannot apply to r2/title due to request fingerprint validation', () => {
      const csv = `id,type,title\nr1,BOOK,کرم\nr2,BOOK,کرم`;
      const imported = importBibliographyFromCsv(csv);
      const batch = processBibliographyBatch(imported.records);

      const pr1 = batch.records[0];
      const pr2 = batch.records[1];
      const issue1 = pr1.fields['title'].reviewIssues[0];

      const req1 = buildResolverRequest(pr1.fields['title'].transliterationResult!, issue1.id)!;
      const fp1 = computeRequestFingerprint(req1, 'openai', 'gpt-4o-mini');

      const resolutionForR1: AssistedResolution = {
        issueId: issue1.id,
        provider: 'openai',
        model: 'gpt-4o-mini',
        promptVersion: '1.0.0',
        requestFingerprint: fp1,
        warnings: [],
        candidates: [
          {
            id: 'sugg_1',
            kind: 'EXISTING_LEXICAL_READING',
            rank: 1,
            alternativeId: issue1.alternatives[0]?.id,
            canonical: 'kirm',
            basis: 'EXISTING_EVIDENCE',
            evidenceRefs: [],
            rationale: 'Scholarly reading'
          }
        ]
      };

      const applicabilityR1 = validateAssistedApplicability(
        resolutionForR1.candidates[0],
        resolutionForR1,
        issue1,
        req1
      );
      expect(applicabilityR1.applicable).toBe(true);

      const decision = candidateToReviewDecision(
        'sugg_1',
        resolutionForR1,
        issue1,
        req1
      );
      expect(decision.action).toBe('SELECT_LEXICAL_READING');

      const batchDecisions: BibliographyReviewDecision[] = [
        {
          recordId: 'r1',
          fieldPath: 'title',
          decision
        }
      ];

      const processed = processBibliographyBatch(imported.records, batchDecisions);
      expect(processed.records[0].readiness).toBe('READY');
      expect(processed.records[1].readiness).toBe('REVIEW_REQUIRED');
    });
  });

  describe('RIS Golden Tests (Sections 21, 22, 23, 47)', () => {
    it('47A. serializes book with multiple authors, editors, scholarly diacritics, and CRLF', () => {
      const csv = `id,type,title,authors,editors,year,publisher,place,isbn\nr_book,BOOK,مشروطه,شاه | صفوی,قاجار,1380,دولت,تهران,978-964-405-000-0`;
      const imported = importBibliographyFromCsv(csv);
      const batch = processBibliographyBatch(imported.records);

      const report = exportToRis(batch, 'STRICT_ALL');
      expect(report.success).toBe(true);
      expect(report.content).toContain('\r\n');

      const expected = [
        'TY  - BOOK',
        'TI  - Mashruta',
        'AU  - shāh',
        'AU  - ṣafavī',
        'ED  - qājār',
        'PY  - 1380',
        'PB  - daulat',
        'CY  - tihrān',
        'SN  - 978-964-405-000-0',
        'ER  - '
      ].join('\r\n');

      expect(report.content).toContain(expected);
    });

    it('47B. serializes journal article with container title, volume, issue, pages, and DOI', () => {
      const csv = `id,type,title,container_title,authors,year,volume,issue,page_start,page_end,doi\nr_art,JOURNAL_ARTICLE,دولت و جامعه,فرهنگ,شاه,1995,13,3,321,345,10.1234/in.1995.13.3`;
      const imported = importBibliographyFromCsv(csv);
      const initial = processBibliographyBatch(imported.records);

      const report = exportToRis(initial, 'STRICT_ALL');
      expect(report.success).toBe(true);
      expect(report.content).toContain('TY  - JOUR');
      expect(report.content).toContain('TI  - Daulat va Jamiʿa');
      expect(report.content).toContain('T2  - Farhang');
      expect(report.content).toContain('AU  - shāh');
      expect(report.content).toContain('VL  - 13');
      expect(report.content).toContain('IS  - 3');
      expect(report.content).toContain('SP  - 321');
      expect(report.content).toContain('EP  - 345');
      expect(report.content).toContain('DO  - 10.1234/in.1995.13.3');
    });

    it('47C. sanitizes internal newlines in RIS fields and emits diagnostic', () => {
      const csv = `id,type,title,notes\nr_nl,BOOK,کتاب,"First line\nSecond line"`;
      const imported = importBibliographyFromCsv(csv);
      const batch = processBibliographyBatch(imported.records);

      const report = exportToRis(batch, 'STRICT_ALL');
      expect(report.success).toBe(true);
      expect(report.content).toContain('N1  - First line Second line');
      expect(report.diagnostics.some((d) => d.code === 'RIS_LINEBREAK_NORMALIZED')).toBe(true);
    });

    it('47D. preserves both ISBN and ISSN when present', () => {
      const csv = `id,type,title,isbn,issn\nr1,BOOK,کتاب,978-1-234-56789-0,1234-567X`;
      const imported = importBibliographyFromCsv(csv);
      const batch = processBibliographyBatch(imported.records);

      const report = exportToRis(batch, 'STRICT_ALL');
      expect(report.success).toBe(true);
      expect(report.content).toContain('SN  - 978-1-234-56789-0\r\nSN  - 1234-567X');
    });
  });

  describe('BibTeX Golden Tests (Sections 22, 24, 25, 26, 27, 28, 48)', () => {
    it('48A. serializes book with authors joined by "and", UTF-8 Unicode, and deterministic key', () => {
      const csv = `id,type,title,authors,year,publisher,place\nr_book_1,BOOK,مشروطه,شاه | صفوی,1380,دولت,تهران`;
      const imported = importBibliographyFromCsv(csv);
      const batch = processBibliographyBatch(imported.records);

      const report = exportToBibTeX(batch, 'STRICT_ALL');
      expect(report.success).toBe(true);

      const expected = `@book{pst_r_book_1,
  title = {Mashruta},
  author = {shāh and ṣafavī},
  year = {1380},
  publisher = {daulat},
  address = {tihrān}
}`;
      expect(report.content.trim()).toBe(expected.trim());
    });

    it('48B. serializes journal article with journal title, pages, volume, number, and DOI', () => {
      const csv = `id,type,title,container_title,authors,year,volume,issue,page_start,page_end,doi\nr_art_1,JOURNAL_ARTICLE,دولت و جامعه,فرهنگ,شاه,1995,13,3,321,345,10.1234/in.1995.13.3`;
      const imported = importBibliographyFromCsv(csv);
      const batch = processBibliographyBatch(imported.records);

      const report = exportToBibTeX(batch, 'STRICT_ALL');
      expect(report.success).toBe(true);

      const expected = `@article{pst_r_art_1,
  title = {Daulat va Jamiʿa},
  author = {shāh},
  journal = {Farhang},
  year = {1995},
  volume = {13},
  number = {3},
  pages = {321--345},
  doi = {10.1234/in.1995.13.3}
}`;
      expect(report.content.trim()).toBe(expected.trim());
    });

    it('48C. escapes structural BibTeX characters without destroying Unicode diacritics', () => {
      const csv = `id,type,title,notes\nr_esc,BOOK,کتاب,"Price is $5 & 10% off {Special\\Value}"`;
      const imported = importBibliographyFromCsv(csv);
      const batch = processBibliographyBatch(imported.records);

      const report = exportToBibTeX(batch, 'STRICT_ALL');
      expect(report.success).toBe(true);
      expect(report.content).toContain('title = {Kitab}');
      expect(report.content).toContain('note = {Price is \\$5 \\& 10\\% off \\{Special\\\\Value\\}}');
    });

    it('48D. duplicate citation key fails closed with DUPLICATE_CITATION_KEY diagnostic', () => {
      const recA: BibliographyRecord = {
        id: 'pst_dup',
        type: 'BOOK',
        title: 'کتاب',
        authors: [],
        editors: [],
        translators: [],
        sourceRowIndex: 2,
        sourceColumns: [],
        passthrough: {}
      };
      const recB: BibliographyRecord = {
        id: 'pst_dup',
        type: 'BOOK',
        title: 'ایران',
        authors: [],
        editors: [],
        translators: [],
        sourceRowIndex: 3,
        sourceColumns: [],
        passthrough: {}
      };

      const batch = {
        records: [
          {
            record: recA,
            fields: { title: { fieldPath: 'title' as const, sourceText: 'کتاب', profile: 'ijmes_title' as const, requiresTransliteration: true, finalText: 'Kitab', status: 'DETERMINISTIC' as const, reviewIssues: [] } },
            readiness: 'READY' as const,
            reviewIssueCount: 0,
            invalidReasons: []
          },
          {
            record: recB,
            fields: { title: { fieldPath: 'title' as const, sourceText: 'ایران', profile: 'ijmes_title' as const, requiresTransliteration: true, finalText: 'Iran', status: 'DETERMINISTIC' as const, reviewIssues: [] } },
            readiness: 'READY' as const,
            reviewIssueCount: 0,
            invalidReasons: []
          }
        ],
        summary: { total: 2, ready: 2, reviewRequired: 0, invalid: 0 },
        diagnostics: []
      };

      const report = exportToBibTeX(batch, 'STRICT_ALL');
      expect(report.success).toBe(false);
      expect(report.diagnostics.some((d) => d.code === 'DUPLICATE_CITATION_KEY')).toBe(true);
    });
  });
});
