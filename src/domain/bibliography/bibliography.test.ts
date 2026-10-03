import { describe, expect, it } from 'vitest';
import {
  importBibliographyFromCsv,
  processBibliographyBatch,
  exportReviewCsv,
  exportFinalCsv,
  exportToRis,
  exportToBibTeX,
  containsArabicScript,
  generateFallbackRecordId,
  computeRecordContentFingerprint,
  BibliographyRecord,
  BibliographyReviewDecision
} from './index';
import { LexicalEntry } from '../lexicon/types';
import { LexiconRepository } from '../lexicon/repository';

describe('Phase 4 Batch Bibliography Processing and Scholarly Exports', () => {
  describe('Script Detection', () => {
    it('accurately identifies Arabic/Persian script material and non-Arabic text', () => {
      expect(containsArabicScript('تاریخ ایران')).toBe(true);
      expect(containsArabicScript('Homa Katouzian')).toBe(false);
      expect(containsArabicScript('Iran and دولت')).toBe(true);
      expect(containsArabicScript('1921-1979')).toBe(false);
      expect(containsArabicScript('10.1017/S002074380000000X')).toBe(false);
    });
  });

  describe('Record Identity & Fingerprinting', () => {
    it('computes deterministic content fingerprints independent of row index', () => {
      const recA: Omit<BibliographyRecord, 'id' | 'sourceRowIndex'> = {
        type: 'BOOK',
        title: 'تاریخ ایران',
        authors: [{ literal: 'پیرنیا' }],
        editors: [],
        translators: [],
        passthrough: {}
      };
      const recB: Omit<BibliographyRecord, 'id' | 'sourceRowIndex'> = {
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
      expect(generateFallbackRecordId(recA, 1)).toBe(`record:${fpA}:1`);
      expect(generateFallbackRecordId(recB, 2)).toBe(`record:${fpB}:2`);
    });
  });

  describe('CSV Import & Robustness (Sections 5, 6, 7, 30, 44)', () => {
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

    it('preserves unknown CSV columns in passthrough', () => {
      const csv = `id,type,title,custom_tag,scholar_rating\nr1,BOOK,کتاب,MyTag,5-star`;
      const result = importBibliographyFromCsv(csv);
      expect(result.success).toBe(true);
      expect(result.records[0].passthrough).toEqual({
        custom_tag: 'MyTag',
        scholar_rating: '5-star'
      });
    });

    it('generates fallback deterministic IDs when id column is missing or empty', () => {
      const csv = `title,authors\nکتاب اول,نویسنده\nکتاب اول,نویسنده`;
      const result = importBibliographyFromCsv(csv);
      expect(result.success).toBe(true);
      expect(result.records.length).toBe(2);
      expect(result.records[0].id).toMatch(/^record:[a-f0-9]{8}:1$/);
      expect(result.records[1].id).toMatch(/^record:[a-f0-9]{8}:2$/);
    });

    it('emits error diagnostic on duplicate supplied IDs', () => {
      const csv = `id,type,title\nr1,BOOK,کتاب الف\nr1,BOOK,کتاب ب`;
      const result = importBibliographyFromCsv(csv);
      expect(result.success).toBe(false);
      expect(result.diagnostics.some((d) => d.code === 'DUPLICATE_ID')).toBe(true);
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

    it('enforces import limits', () => {
      const hugeCsv = `title\n` + 'A'.repeat(60000);
      const result = importBibliographyFromCsv(hugeCsv, {
        maxFileSize: 100000,
        maxRowCount: 10,
        maxFieldLength: 1000
      });
      expect(result.diagnostics.some((d) => d.code === 'FIELD_LENGTH_EXCEEDED')).toBe(true);
    });
  });

  describe('Pure Batch Processor & Field Policies (Sections 10, 11, 15, 16, 39)', () => {
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
      expect(batch.summary.reviewRequired).toBe(2); // r2 has unknown "دانشجو", r3 has ambiguous "کرم"

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
  });

  describe('Field-Level & Creator Scoping (Sections 13, 14, 40, 41)', () => {
    it('40. decision for r1/title does not resolve r2/title even if Persian text and issue IDs match', () => {
      const csv = `id,type,title\nr1,BOOK,کرم\nr2,BOOK,کرم`;
      const imported = importBibliographyFromCsv(csv);
      const initial = processBibliographyBatch(imported.records);

      const r1Issue = initial.records[0].fields['title'].reviewIssues[0];
      const r2Issue = initial.records[1].fields['title'].reviewIssues[0];
      expect(r1Issue).toBeDefined();
      expect(r2Issue).toBeDefined();

      // Apply decision strictly scoped to r1
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
      // The engine processes the Persian word while preserving surrounding Latin words
      expect(pr.fields['title'].finalText).toContain('Daulat');
      expect(pr.fields['title'].finalText).toMatch(/Iran/i);
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

    it('20. source-preserving CSV export includes translit_* columns and original passthrough data', () => {
      const csv = `id,type,title,custom_col\nr1,BOOK,کتاب,Val1\nr2,BOOK,کرم,Val2`;
      const imported = importBibliographyFromCsv(csv);
      const batch = processBibliographyBatch(imported.records);

      const report = exportReviewCsv(batch);
      expect(report.success).toBe(true);
      expect(report.content).toContain('translit_title');
      expect(report.content).toContain('custom_col');
      expect(report.content).toContain('Kitab');
      expect(report.content).toContain('Val1');
      expect(report.content).toContain('Val2');
      // For unresolved r2, translit_title is empty
      expect(report.content).not.toContain('⟦');
    });
  });

  describe('RIS Golden Tests (Sections 22, 23, 47)', () => {
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

      // "دولت و جامعه" has unambiguous conjunction "va" -> READY
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
  });

  describe('BibTeX Golden Tests (Sections 24, 25, 26, 27, 28, 48)', () => {
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
      const csv = `id,type,title\npst_same_key,BOOK,کتاب\npst_same_key,BOOK,ایران`;
      const imported = importBibliographyFromCsv(csv);
      // Force same ID on records
      imported.records[1].id = 'pst_same_key';

      const batch = processBibliographyBatch(imported.records);
      const report = exportToBibTeX(batch, 'STRICT_ALL');
      expect(report.success).toBe(false);
      expect(report.diagnostics.some((d) => d.code === 'DUPLICATE_CITATION_KEY')).toBe(true);
    });
  });
});
