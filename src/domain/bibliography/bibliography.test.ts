import { describe, expect, it } from 'vitest';
import {
  importBibliographyFromCsv,
  validateFileSize,
  processBibliographyBatch,
  exportReviewCsv,
  exportFinalCsv,
  exportToRis,
  exportToBibTeX,
  validateRecordForFinalExport,
  containsArabicScript,
  generateFallbackRecordId,
  computeRecordContentFingerprint,
  makeBibliographyIssueScopeKey,
  sanitizeBibTeXKey,
  validateBibliographyAssistanceApplicability,
  candidateToBibliographyReviewDecision,
  processBibliographyRecord,
  BibliographyRecord,
  BibliographyReviewDecision,
  BibliographyAssistanceState,
  ProcessedBibliographyRecord,
  ProcessedBibliographyBatch
} from './index';
import {
  AssistedResolution,
  buildResolverRequest,
  computeRequestFingerprint
} from '../assistance';
import { transliterate } from '../engine';

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

  describe('CSV Parser & Importer Robustness (Sections 1, 3, 5, 6, 7, 8, 10, 11, 12, 13, 25)', () => {
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

    it('preserves exact CRLF inside quoted source cells and across review CSV export round-trip', () => {
      const csv = `id,type,title,notes\r\nr1,BOOK,کتاب,"Line 1\r\nLine 2"\r\n`;
      const result = importBibliographyFromCsv(csv);
      expect(result.success).toBe(true);
      expect(result.records[0].sourceColumns.find((c) => c.header === 'notes')?.value).toBe('Line 1\r\nLine 2');

      const batch = processBibliographyBatch(result.records);
      const reviewCsv = exportReviewCsv(batch);
      expect(reviewCsv.success).toBe(true);
      expect(reviewCsv.content).toContain('"Line 1\r\nLine 2"');

      // Re-import review CSV and verify exact semantic preservation
      const reimported = importBibliographyFromCsv(reviewCsv.content);
      expect(reimported.success).toBe(true);
      expect(reimported.records[0].sourceColumns.find((c) => c.header === 'notes')?.value).toBe('Line 1\r\nLine 2');
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

    it('row-width mismatch is fatal when row has too many columns', () => {
      const csv = `id,type,title\nr1,BOOK,کتاب,extra_unnamed_column`;
      const result = importBibliographyFromCsv(csv);
      expect(result.success).toBe(false);
      expect(result.records.length).toBe(0);
      expect(result.diagnostics.some((d) => d.code === 'ROW_WIDTH_MISMATCH' && d.severity === 'ERROR')).toBe(true);
    });

    it('row-width mismatch is fatal when row has too few columns', () => {
      const csv = `id,type,title,authors\nr1,BOOK,کتاب`;
      const result = importBibliographyFromCsv(csv);
      expect(result.success).toBe(false);
      expect(result.records.length).toBe(0);
      expect(result.diagnostics.some((d) => d.code === 'ROW_WIDTH_MISMATCH' && d.severity === 'ERROR')).toBe(true);
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

      // r1: "ایران" is in lexicon (īrān -> Īrān in title), "شاه" is in lexicon (shāh) -> READY
      const r1 = batch.records.find((r) => r.record.id === 'r1')!;
      expect(r1.fields['title'].finalText).toBe('Īrān');
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

  describe('Source-Preserving Positional Layout in Review CSV (Sections 4, 11, 14, 15, 16)', () => {
    it('review CSV preserves original source column names and order positionally', () => {
      const csv = `Record_ID,Article_Title,Author,My_Custom_Column\nr1,کتاب,نویسنده,Val1`;
      const imported = importBibliographyFromCsv(csv);
      const batch = processBibliographyBatch(imported.records);
      const review = exportReviewCsv(batch);

      expect(review.success).toBe(true);
      const firstLine = review.content.split('\r\n')[0];
      expect(firstLine).toMatch(/^Record_ID,Article_Title,Author,My_Custom_Column,translit_title/);
      expect(review.content).toContain('Val1');
    });

    it('preserves duplicate source headers positionally without collapsing values', () => {
      const csv = `title,Custom,Custom\nکتاب,ValA,ValB`;
      const imported = importBibliographyFromCsv(csv);
      const batch = processBibliographyBatch(imported.records);

      const review = exportReviewCsv(batch);
      expect(review.success).toBe(true);
      expect(review.content).toContain('ValA,ValB');
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

  describe('Final-Export Consistency & Expected Field Validation (Sections 5, 6, 7, 8, 9)', () => {
    it('rejects export when expected processed title is missing (9A)', () => {
      const processedRec: ProcessedBibliographyRecord = {
        record: {
          id: 'r_missing_title',
          type: 'BOOK',
          title: 'دولت',
          authors: [],
          editors: [],
          translators: [],
          sourceRowIndex: 2,
          sourceColumns: [],
          passthrough: {}
        },
        fields: {}, // Missing title field
        readiness: 'READY',
        reviewIssueCount: 0,
        invalidReasons: []
      };

      const val = validateRecordForFinalExport(processedRec);
      expect(val.valid).toBe(false);
      expect(val.diagnostics.some((d) => d.code === 'MISSING_PROCESSED_FIELD')).toBe(true);

      const batch = {
        records: [processedRec],
        summary: { total: 1, ready: 1, reviewRequired: 0, invalid: 0 },
        diagnostics: []
      };
      expect(exportFinalCsv(batch, 'STRICT_ALL').success).toBe(false);
      expect(exportToRis(batch, 'STRICT_ALL').success).toBe(false);
      expect(exportToBibTeX(batch, 'STRICT_ALL').success).toBe(false);
    });

    it('rejects export when Persian field falsely declares requiresTransliteration=false (9B)', () => {
      const processedRec: ProcessedBibliographyRecord = {
        record: {
          id: 'r_false_pt',
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
            profile: 'ijmes_citation_title',
            requiresTransliteration: false, // Falsely bypasses transliteration
            finalText: 'دولت',
            status: 'PASSTHROUGH',
            reviewIssues: []
          }
        },
        readiness: 'READY',
        reviewIssueCount: 0,
        invalidReasons: []
      };

      const val = validateRecordForFinalExport(processedRec);
      expect(val.valid).toBe(false);
      expect(val.diagnostics.some((d) => d.code === 'UNAUTHORITATIVE_FINAL_FIELD')).toBe(true);
    });

    it('rejects export when field sourceText does not match canonical source text (9C)', () => {
      const processedRec: ProcessedBibliographyRecord = {
        record: {
          id: 'r_mismatch',
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
            sourceText: 'کتاب', // Mismatch from canonical record.title ("دولت")
            profile: 'ijmes_citation_title',
            requiresTransliteration: true,
            finalText: 'Kitāb',
            status: 'DETERMINISTIC',
            reviewIssues: []
          }
        },
        readiness: 'READY',
        reviewIssueCount: 0,
        invalidReasons: []
      };

      const val = validateRecordForFinalExport(processedRec);
      expect(val.valid).toBe(false);
      expect(val.diagnostics.some((d) => d.code === 'PROCESSED_FIELD_SOURCE_MISMATCH')).toBe(true);
    });

    it('rejects STRICT_ALL exports when any record is unresolved; diagnostic placeholders never leak', () => {
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

    it('READY_ONLY exports only READY records and explicitly reports skipped records', () => {
      const csv = `id,type,title\nr1,BOOK,کتاب\nr2,BOOK,کرم\nr3,BOOK,ایران`;
      const imported = importBibliographyFromCsv(csv);
      const batch = processBibliographyBatch(imported.records);

      const ris = exportToRis(batch, 'READY_ONLY');
      expect(ris.success).toBe(true);
      expect(ris.exportedRecordIds).toEqual(['r1', 'r3']);
      expect(ris.skippedRecordIds).toEqual(['r2']);
      expect(ris.skipReasons['r2']).toBeDefined();
      expect(ris.content).toContain('TI  - Kitāb');
      expect(ris.content).toContain('TI  - Īrān');
      expect(ris.content).not.toContain('کرم');
      expect(ris.content).not.toContain('⟦');
    });
  });

  describe('Bibliography Assistance Outer Scope Boundary & Spoof Protection (Sections 1, 2, 3, 4)', () => {
    it('makeBibliographyIssueScopeKey creates unique composite key for record + field + issue', () => {
      const key1 = makeBibliographyIssueScopeKey('r1', 'title', 'issue:123');
      const key2 = makeBibliographyIssueScopeKey('r2', 'title', 'issue:123');
      const key3 = makeBibliographyIssueScopeKey('r1', 'containerTitle', 'issue:123');
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
    });

    it('cross-record application attempt fails closed with BIBLIOGRAPHY_SCOPE_MISMATCH', () => {
      const csv = `id,type,title\nr1,BOOK,کرم\nr2,BOOK,کرم`;
      const imported = importBibliographyFromCsv(csv);
      const batch = processBibliographyBatch(imported.records);

      const pr1 = batch.records[0];
      const pr2 = batch.records[1];
      const issue1 = pr1.fields['title'].reviewIssues[0];
      const issue2 = pr2.fields['title'].reviewIssues[0];

      const req1 = buildResolverRequest(pr1.fields['title'].transliterationResult!, issue1.id)!;
      const req2 = buildResolverRequest(pr2.fields['title'].transliterationResult!, issue2.id)!;
      const fp1 = computeRequestFingerprint(req1, 'openai', 'gpt-4o-mini');

      const r1AssistanceState: BibliographyAssistanceState = {
        recordId: 'r1',
        fieldPath: 'title',
        issueId: issue1.id,
        resolution: {
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
        }
      };

      // Attempting to apply r1 assistance to r2/title fails with BIBLIOGRAPHY_SCOPE_MISMATCH
      const crossRecordApplicability = validateBibliographyAssistanceApplicability(
        r1AssistanceState,
        'r2', // currentRecordId is r2
        'title',
        issue2,
        req2,
        r1AssistanceState.resolution.candidates[0]
      );
      expect(crossRecordApplicability.applicable).toBe(false);
      expect(crossRecordApplicability.reason).toBe('BIBLIOGRAPHY_SCOPE_MISMATCH');

      expect(() => {
        candidateToBibliographyReviewDecision(
          'sugg_1',
          r1AssistanceState,
          'r2',
          'title',
          issue2,
          req2
        );
      }).toThrow(/BIBLIOGRAPHY_SCOPE_MISMATCH/);

      // Attempting to apply r1 assistance to r1/publisher fails with BIBLIOGRAPHY_SCOPE_MISMATCH
      const crossFieldApplicability = validateBibliographyAssistanceApplicability(
        r1AssistanceState,
        'r1',
        'publisher', // different field
        issue1,
        req1,
        r1AssistanceState.resolution.candidates[0]
      );
      expect(crossFieldApplicability.applicable).toBe(false);
      expect(crossFieldApplicability.reason).toBe('BIBLIOGRAPHY_SCOPE_MISMATCH');

      // Applying to matching r1/title succeeds cleanly
      const validDecision = candidateToBibliographyReviewDecision(
        'sugg_1',
        r1AssistanceState,
        'r1',
        'title',
        issue1,
        req1
      );
      expect(validDecision.recordId).toBe('r1');
      expect(validDecision.fieldPath).toBe('title');
      expect(validDecision.decision.action).toBe('SELECT_LEXICAL_READING');

      const batchDecisions: BibliographyReviewDecision[] = [validDecision];
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
        'TI  - Mashrūṭa',
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
      expect(report.content).toContain('TI  - Daulat Va Jāmiʿa');
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
  title = {Mashrūṭa},
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
  title = {Daulat Va Jāmiʿa},
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
      expect(report.content).toContain('title = {Kitāb}');
      expect(report.content).toContain('note = {Price is \\$5 \\& 10\\% off \\{Special\\\\Value\\}}');
    });

    it('48D. duplicate citation key fails closed with DUPLICATE_CITATION_KEY diagnostic', () => {
      const recA: BibliographyRecord = {
        id: 'pst_dup:1',
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
        id: 'pst_dup_1',
        type: 'BOOK',
        title: 'ایران',
        authors: [],
        editors: [],
        translators: [],
        sourceRowIndex: 3,
        sourceColumns: [],
        passthrough: {}
      };

      const batch = processBibliographyBatch([recA, recB]);

      const report = exportToBibTeX(batch, 'STRICT_ALL');
      expect(report.success).toBe(false);
      expect(report.diagnostics.some((d) => d.code === 'DUPLICATE_CITATION_KEY')).toBe(true);
    });

    it('48E. rejects record in final export when field profile does not match expected policy', () => {
      const pr = processBibliographyRecord({
        id: 'r_prof',
        type: 'BOOK',
        title: 'دولت',
        authors: [],
        editors: [],
        translators: [],
        sourceRowIndex: 1,
        sourceColumns: [],
        passthrough: {}
      });
      // Artificially tamper profile to ijmes_full instead of ijmes_citation_title
      pr.fields.title.profile = 'ijmes_full';

      const batch: ProcessedBibliographyBatch = {
        records: [pr],
        summary: { total: 1, ready: 1, reviewRequired: 0, invalid: 0 },
        diagnostics: []
      };

      const csvReport = exportFinalCsv(batch, 'STRICT_ALL');
      expect(csvReport.success).toBe(false);
      expect(csvReport.diagnostics.some((d) => d.code === 'FIELD_PROFILE_MISMATCH')).toBe(true);

      const risReport = exportToRis(batch, 'STRICT_ALL');
      expect(risReport.success).toBe(false);
      expect(risReport.diagnostics.some((d) => d.code === 'FIELD_PROFILE_MISMATCH')).toBe(true);

      const bibtexReport = exportToBibTeX(batch, 'STRICT_ALL');
      expect(bibtexReport.success).toBe(false);
      expect(bibtexReport.diagnostics.some((d) => d.code === 'FIELD_PROFILE_MISMATCH')).toBe(true);
    });

    it('48F. rejects record in final export when Persian field is missing transliteration result', () => {
      const pr = processBibliographyRecord({
        id: 'r_fake',
        type: 'BOOK',
        title: 'دولت',
        authors: [],
        editors: [],
        translators: [],
        sourceRowIndex: 1,
        sourceColumns: [],
        passthrough: {}
      });
      // Tamper transliterationResult to undefined
      pr.fields.title.transliterationResult = undefined;
      pr.fields.title.finalText = 'Fake';

      const batch: ProcessedBibliographyBatch = {
        records: [pr],
        summary: { total: 1, ready: 1, reviewRequired: 0, invalid: 0 },
        diagnostics: []
      };

      const csvReport = exportFinalCsv(batch, 'STRICT_ALL');
      expect(csvReport.success).toBe(false);
      expect(csvReport.diagnostics.some((d) => d.code === 'MISSING_TRANSLITERATION_RESULT')).toBe(true);

      const risReport = exportToRis(batch, 'STRICT_ALL');
      expect(risReport.success).toBe(false);
      expect(risReport.diagnostics.some((d) => d.code === 'MISSING_TRANSLITERATION_RESULT')).toBe(true);

      const bibtexReport = exportToBibTeX(batch, 'STRICT_ALL');
      expect(bibtexReport.success).toBe(false);
      expect(bibtexReport.diagnostics.some((d) => d.code === 'MISSING_TRANSLITERATION_RESULT')).toBe(true);
    });

    it('48G. rejects record in final export when transliteration result is uncopyable', () => {
      const pr = processBibliographyRecord({
        id: 'r_uncopy',
        type: 'BOOK',
        title: 'دولت',
        authors: [],
        editors: [],
        translators: [],
        sourceRowIndex: 1,
        sourceColumns: [],
        passthrough: {}
      });
      if (pr.fields.title.transliterationResult) {
        pr.fields.title.transliterationResult.copyable = false;
      }
      pr.fields.title.finalText = 'Something';

      const batch: ProcessedBibliographyBatch = {
        records: [pr],
        summary: { total: 1, ready: 1, reviewRequired: 0, invalid: 0 },
        diagnostics: []
      };

      const csvReport = exportFinalCsv(batch, 'STRICT_ALL');
      expect(csvReport.success).toBe(false);
      expect(csvReport.diagnostics.some((d) => d.code === 'UNCOPYABLE_TRANSLITERATION_RESULT')).toBe(true);

      const risReport = exportToRis(batch, 'STRICT_ALL');
      expect(risReport.success).toBe(false);
      expect(risReport.diagnostics.some((d) => d.code === 'UNCOPYABLE_TRANSLITERATION_RESULT')).toBe(true);

      const bibtexReport = exportToBibTeX(batch, 'STRICT_ALL');
      expect(bibtexReport.success).toBe(false);
      expect(bibtexReport.diagnostics.some((d) => d.code === 'UNCOPYABLE_TRANSLITERATION_RESULT')).toBe(true);
    });

    it('48H. rejects record in final export when finalText does not match transliteration result output', () => {
      const pr = processBibliographyRecord({
        id: 'r_mismatch',
        type: 'BOOK',
        title: 'دولت',
        authors: [],
        editors: [],
        translators: [],
        sourceRowIndex: 1,
        sourceColumns: [],
        passthrough: {}
      });
      pr.fields.title.finalText = 'Dawlat'; // Engine output is 'Daulat'

      const batch: ProcessedBibliographyBatch = {
        records: [pr],
        summary: { total: 1, ready: 1, reviewRequired: 0, invalid: 0 },
        diagnostics: []
      };

      const csvReport = exportFinalCsv(batch, 'STRICT_ALL');
      expect(csvReport.success).toBe(false);
      expect(csvReport.diagnostics.some((d) => d.code === 'FINAL_TEXT_RESULT_MISMATCH')).toBe(true);

      const risReport = exportToRis(batch, 'STRICT_ALL');
      expect(risReport.success).toBe(false);
      expect(risReport.diagnostics.some((d) => d.code === 'FINAL_TEXT_RESULT_MISMATCH')).toBe(true);

      const bibtexReport = exportToBibTeX(batch, 'STRICT_ALL');
      expect(bibtexReport.success).toBe(false);
      expect(bibtexReport.diagnostics.some((d) => d.code === 'FINAL_TEXT_RESULT_MISMATCH')).toBe(true);
    });

    it('48I. rejects record in final export when Latin passthrough field is modified', () => {
      const pr = processBibliographyRecord({
        id: 'r_latin_mod',
        type: 'BOOK',
        title: 'State and Society in Iran',
        authors: [],
        editors: [],
        translators: [],
        sourceRowIndex: 1,
        sourceColumns: [],
        passthrough: {}
      });
      // Tamper finalText
      pr.fields.title.finalText = 'Changed title';

      const batch: ProcessedBibliographyBatch = {
        records: [pr],
        summary: { total: 1, ready: 1, reviewRequired: 0, invalid: 0 },
        diagnostics: []
      };

      const csvReport = exportFinalCsv(batch, 'STRICT_ALL');
      expect(csvReport.success).toBe(false);
      expect(csvReport.diagnostics.some((d) => d.code === 'INVALID_PASSTHROUGH_FIELD')).toBe(true);

      const risReport = exportToRis(batch, 'STRICT_ALL');
      expect(risReport.success).toBe(false);
      expect(risReport.diagnostics.some((d) => d.code === 'INVALID_PASSTHROUGH_FIELD')).toBe(true);

      const bibtexReport = exportToBibTeX(batch, 'STRICT_ALL');
      expect(bibtexReport.success).toBe(false);
      expect(bibtexReport.diagnostics.some((d) => d.code === 'INVALID_PASSTHROUGH_FIELD')).toBe(true);
    });

    it('48J. successfully exports legitimate Persian resolved and Latin passthrough records', () => {
      const persianRecord = processBibliographyRecord({
        id: 'r_persian',
        type: 'BOOK',
        title: 'دولت',
        authors: [],
        editors: [],
        translators: [],
        sourceRowIndex: 1,
        sourceColumns: [],
        passthrough: {}
      });

      const latinRecord = processBibliographyRecord({
        id: 'r_latin',
        type: 'BOOK',
        title: 'State and Society in Iran',
        authors: [],
        editors: [],
        translators: [],
        sourceRowIndex: 2,
        sourceColumns: [],
        passthrough: {}
      });

      const batch: ProcessedBibliographyBatch = {
        records: [persianRecord, latinRecord],
        summary: { total: 2, ready: 2, reviewRequired: 0, invalid: 0 },
        diagnostics: []
      };

      const csvReport = exportFinalCsv(batch, 'STRICT_ALL');
      expect(csvReport.success).toBe(true);
      expect(csvReport.exportedRecordIds).toEqual(['r_persian', 'r_latin']);

      const risReport = exportToRis(batch, 'STRICT_ALL');
      expect(risReport.success).toBe(true);
      expect(risReport.exportedRecordIds).toEqual(['r_persian', 'r_latin']);

      const bibtexReport = exportToBibTeX(batch, 'STRICT_ALL');
      expect(bibtexReport.success).toBe(true);
      expect(bibtexReport.exportedRecordIds).toEqual(['r_persian', 'r_latin']);
    });

    it('48K. rejects record in final export when transliteration result originalInput does not match sourceText', () => {
      const pr = processBibliographyRecord({
        id: 'r_src_mismatch',
        type: 'BOOK',
        title: 'دولت',
        authors: [],
        editors: [],
        translators: [],
        sourceRowIndex: 1,
        sourceColumns: [],
        passthrough: {}
      });
      // Attach a valid copyable transliteration result generated for 'کتاب' instead of 'دولت'
      const otherResult = transliterate('کتاب', 'ijmes_citation_title');
      pr.fields.title.transliterationResult = otherResult;
      pr.fields.title.finalText = otherResult.output;

      const batch: ProcessedBibliographyBatch = {
        records: [pr],
        summary: { total: 1, ready: 1, reviewRequired: 0, invalid: 0 },
        diagnostics: []
      };

      const csvReport = exportFinalCsv(batch, 'STRICT_ALL');
      expect(csvReport.success).toBe(false);
      expect(csvReport.diagnostics.some((d) => d.code === 'TRANSLITERATION_RESULT_SOURCE_MISMATCH')).toBe(true);

      const risReport = exportToRis(batch, 'STRICT_ALL');
      expect(risReport.success).toBe(false);
      expect(risReport.diagnostics.some((d) => d.code === 'TRANSLITERATION_RESULT_SOURCE_MISMATCH')).toBe(true);

      const bibtexReport = exportToBibTeX(batch, 'STRICT_ALL');
      expect(bibtexReport.success).toBe(false);
      expect(bibtexReport.diagnostics.some((d) => d.code === 'TRANSLITERATION_RESULT_SOURCE_MISMATCH')).toBe(true);
    });

    it('48L. rejects record in final export when transliteration result profile does not match expected policy', () => {
      const pr = processBibliographyRecord({
        id: 'r_res_prof',
        type: 'BOOK',
        title: 'دولت',
        authors: [],
        editors: [],
        translators: [],
        sourceRowIndex: 1,
        sourceColumns: [],
        passthrough: {}
      });
      // Generate valid result with ijmes_full and attach to title (which requires ijmes_citation_title)
      // while keeping field.profile as ijmes_citation_title
      const fullResult = transliterate('دولت', 'ijmes_full');
      pr.fields.title.transliterationResult = fullResult;
      pr.fields.title.profile = 'ijmes_citation_title';
      pr.fields.title.finalText = fullResult.output;

      const batch: ProcessedBibliographyBatch = {
        records: [pr],
        summary: { total: 1, ready: 1, reviewRequired: 0, invalid: 0 },
        diagnostics: []
      };

      const csvReport = exportFinalCsv(batch, 'STRICT_ALL');
      expect(csvReport.success).toBe(false);
      expect(csvReport.diagnostics.some((d) => d.code === 'TRANSLITERATION_RESULT_PROFILE_MISMATCH')).toBe(true);

      const risReport = exportToRis(batch, 'STRICT_ALL');
      expect(risReport.success).toBe(false);
      expect(risReport.diagnostics.some((d) => d.code === 'TRANSLITERATION_RESULT_PROFILE_MISMATCH')).toBe(true);

      const bibtexReport = exportToBibTeX(batch, 'STRICT_ALL');
      expect(bibtexReport.success).toBe(false);
      expect(bibtexReport.diagnostics.some((d) => d.code === 'TRANSLITERATION_RESULT_PROFILE_MISMATCH')).toBe(true);
    });
  });

  describe('Scholarly Citation Title Diacritic Preservation in Bibliography Exports (Section 27)', () => {
    it('preserves full scholarly diacritics in title fields across Review CSV, Final CSV, RIS, and BibTeX', () => {
      const record: BibliographyRecord = {
        id: 'rec_zaval_001',
        type: 'BOOK',
        title: 'زوال اندیشه سیاسی در ایران',
        authors: [{ literal: 'شاه' }],
        editors: [],
        translators: [],
        year: '2000',
        publisher: 'دولت',
        place: 'تهران',
        sourceRowIndex: 1,
        sourceColumns: [],
        passthrough: {}
      };

      const processed = processBibliographyRecord(record);
      // Verify processed title field policy uses ijmes_citation_title
      expect(processed.fields.title.profile).toBe('ijmes_citation_title');

      // Human-resolved field with Zavāl-i Andīshah-i Siyāsī Dar Īrān
      processed.fields.title.finalText = 'Zavāl-i Andīshah-i Siyāsī Dar Īrān';
      processed.fields.title.status = 'USER_OVERRIDE';
      processed.readiness = 'READY';
      processed.fields.title.transliterationResult = {
        originalInput: 'زوال اندیشه سیاسی در ایران',
        normalizedInput: 'زوال اندیشه سیاسی در ایران',
        normalizationChanges: [],
        profile: 'ijmes_citation_title',
        output: 'Zavāl-i Andīshah-i Siyāsī Dar Īrān',
        copyable: true,
        status: 'USER_OVERRIDE',
        tokens: [],
        analyses: [],
        morphology: [],
        relations: [],
        reviewIssues: [],
        appliedDecisions: [],
        staleDecisions: [],
        reviewReasons: [],
        warnings: []
      };

      const batch: ProcessedBibliographyBatch = {
        records: [processed],
        summary: { total: 1, ready: 1, reviewRequired: 0, invalid: 0 },
        diagnostics: []
      };

      // 1. Review CSV
      const reviewCsv = exportReviewCsv(batch);
      expect(reviewCsv.content).toContain('Zavāl-i Andīshah-i Siyāsī Dar Īrān');
      expect(reviewCsv.content).not.toContain('Zaval-i Andishah-i Siyasi Dar Iran');

      // 2. Final CSV
      const finalCsv = exportFinalCsv(batch, 'STRICT_ALL');
      expect(finalCsv.success).toBe(true);
      expect(finalCsv.content).toContain('Zavāl-i Andīshah-i Siyāsī Dar Īrān');
      expect(finalCsv.content).not.toContain('Zaval-i Andishah-i Siyasi Dar Iran');

      // 3. RIS
      const ris = exportToRis(batch, 'STRICT_ALL');
      expect(ris.success).toBe(true);
      expect(ris.content).toContain('TI  - Zavāl-i Andīshah-i Siyāsī Dar Īrān');
      expect(ris.content).not.toContain('Zaval-i Andishah-i Siyasi Dar Iran');

      // 4. BibTeX
      const bibtex = exportToBibTeX(batch, 'STRICT_ALL');
      expect(bibtex.success).toBe(true);
      expect(bibtex.content).toContain('title = {Zavāl-i Andīshah-i Siyāsī Dar Īrān}');
      expect(bibtex.content).not.toContain('Zaval-i Andishah-i Siyasi Dar Iran');
    });
  });
});
