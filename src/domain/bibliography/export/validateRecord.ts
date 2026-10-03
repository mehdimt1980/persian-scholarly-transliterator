import { containsArabicScript } from '../scriptDetection';
import { BibliographyDiagnostic, ProcessedBibliographyRecord } from '../types';

export interface FinalExportValidationResult {
  valid: boolean;
  diagnostics: BibliographyDiagnostic[];
  authoritativeValues: Record<string, string>;
}

export function validateRecordForFinalExport(
  pr: ProcessedBibliographyRecord
): FinalExportValidationResult {
  const diagnostics: BibliographyDiagnostic[] = [];
  const authoritativeValues: Record<string, string> = {};
  const r = pr.record;

  // Derive all expected transformable field paths from source record
  const expectedFields: Array<{ path: string; sourceText: string }> = [];

  // 1. Title is always required
  expectedFields.push({ path: 'title', sourceText: r.title ?? '' });

  // 2. Container title if present in source
  if (r.containerTitle !== undefined && r.containerTitle.trim().length > 0) {
    expectedFields.push({ path: 'containerTitle', sourceText: r.containerTitle });
  }

  // 3. Authors
  r.authors.forEach((creator, idx) => {
    expectedFields.push({ path: `authors.${idx}.literal`, sourceText: creator.literal });
  });

  // 4. Editors
  r.editors.forEach((creator, idx) => {
    expectedFields.push({ path: `editors.${idx}.literal`, sourceText: creator.literal });
  });

  // 5. Translators
  r.translators.forEach((creator, idx) => {
    expectedFields.push({ path: `translators.${idx}.literal`, sourceText: creator.literal });
  });

  // 6. Publisher if present in source
  if (r.publisher !== undefined && r.publisher.trim().length > 0) {
    expectedFields.push({ path: 'publisher', sourceText: r.publisher });
  }

  // 7. Place if present in source
  if (r.place !== undefined && r.place.trim().length > 0) {
    expectedFields.push({ path: 'place', sourceText: r.place });
  }

  // For every expected path, verify existence, provenance, and authoritative completion
  for (const { path, sourceText } of expectedFields) {
    const field = pr.fields[path];

    if (!field) {
      diagnostics.push({
        recordId: r.id,
        row: r.sourceRowIndex,
        field: path,
        severity: 'ERROR',
        code: 'MISSING_PROCESSED_FIELD',
        message: `Expected transformable field "${path}" is missing from processed record.`
      });
      continue;
    }

    if (field.fieldPath !== path || field.sourceText !== sourceText) {
      diagnostics.push({
        recordId: r.id,
        row: r.sourceRowIndex,
        field: path,
        severity: 'ERROR',
        code: 'PROCESSED_FIELD_SOURCE_MISMATCH',
        message: `Field "${path}" sourceText ("${field.sourceText}") does not match canonical source text ("${sourceText}").`
      });
      continue;
    }

    const hasArabic = containsArabicScript(sourceText);

    if (hasArabic) {
      // Must require transliteration and must have non-null finalText
      if (!field.requiresTransliteration || field.finalText === null) {
        diagnostics.push({
          recordId: r.id,
          row: r.sourceRowIndex,
          field: path,
          severity: 'ERROR',
          code: 'UNAUTHORITATIVE_FINAL_FIELD',
          message: `Field "${path}" contains Persian script but is unresolved or unauthoritative for final export.`
        });
        continue;
      }
      authoritativeValues[path] = field.finalText;
    } else {
      // Latin/Passthrough field
      if (field.finalText !== null) {
        authoritativeValues[path] = field.finalText;
      } else {
        authoritativeValues[path] = sourceText;
      }
    }
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics,
    authoritativeValues
  };
}
