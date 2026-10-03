import { getFieldPolicy } from '../fieldPolicy';
import { containsArabicScript } from '../scriptDetection';
import { BibliographyDiagnostic, BibliographyFieldPath, ProcessedBibliographyRecord } from '../types';

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
  const expectedFields: Array<{ path: BibliographyFieldPath; sourceText: string }> = [];

  // 1. Title is always required
  expectedFields.push({ path: 'title', sourceText: r.title ?? '' });

  // 2. Container title if present in source
  if (r.containerTitle !== undefined && r.containerTitle.trim().length > 0) {
    expectedFields.push({ path: 'containerTitle', sourceText: r.containerTitle });
  }

  // 3. Authors
  r.authors.forEach((creator, idx) => {
    expectedFields.push({ path: `authors.${idx}.literal` as BibliographyFieldPath, sourceText: creator.literal });
  });

  // 4. Editors
  r.editors.forEach((creator, idx) => {
    expectedFields.push({ path: `editors.${idx}.literal` as BibliographyFieldPath, sourceText: creator.literal });
  });

  // 5. Translators
  r.translators.forEach((creator, idx) => {
    expectedFields.push({ path: `translators.${idx}.literal` as BibliographyFieldPath, sourceText: creator.literal });
  });

  // 6. Publisher if present in source
  if (r.publisher !== undefined && r.publisher.trim().length > 0) {
    expectedFields.push({ path: 'publisher', sourceText: r.publisher });
  }

  // 7. Place if present in source
  if (r.place !== undefined && r.place.trim().length > 0) {
    expectedFields.push({ path: 'place', sourceText: r.place });
  }

  // For every expected path, verify existence, provenance, profile, and authoritative completion
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

    const expectedPolicy = getFieldPolicy(path);
    if (field.profile !== expectedPolicy.profile) {
      diagnostics.push({
        recordId: r.id,
        row: r.sourceRowIndex,
        field: path,
        severity: 'ERROR',
        code: 'FIELD_PROFILE_MISMATCH',
        message: `Field "${path}" profile ("${field.profile}") does not match expected policy profile ("${expectedPolicy.profile}").`
      });
      continue;
    }

    const hasArabic = containsArabicScript(sourceText);

    if (hasArabic) {
      if (!field.requiresTransliteration) {
        diagnostics.push({
          recordId: r.id,
          row: r.sourceRowIndex,
          field: path,
          severity: 'ERROR',
          code: 'UNAUTHORITATIVE_FINAL_FIELD',
          message: `Field "${path}" contains Persian script but requiresTransliteration is false.`
        });
        continue;
      }

      if (!field.transliterationResult) {
        diagnostics.push({
          recordId: r.id,
          row: r.sourceRowIndex,
          field: path,
          severity: 'ERROR',
          code: 'MISSING_TRANSLITERATION_RESULT',
          message: `Field "${path}" is missing an authoritative transliteration result.`
        });
        continue;
      }

      if (field.transliterationResult.originalInput !== sourceText) {
        diagnostics.push({
          recordId: r.id,
          row: r.sourceRowIndex,
          field: path,
          severity: 'ERROR',
          code: 'TRANSLITERATION_RESULT_SOURCE_MISMATCH',
          message: `Field "${path}" transliteration result originalInput ("${field.transliterationResult.originalInput}") does not match canonical source text ("${sourceText}").`
        });
        continue;
      }

      if (field.transliterationResult.profile !== expectedPolicy.profile) {
        diagnostics.push({
          recordId: r.id,
          row: r.sourceRowIndex,
          field: path,
          severity: 'ERROR',
          code: 'TRANSLITERATION_RESULT_PROFILE_MISMATCH',
          message: `Field "${path}" transliteration result profile ("${field.transliterationResult.profile}") does not match expected policy profile ("${expectedPolicy.profile}").`
        });
        continue;
      }

      if (!field.transliterationResult.copyable || field.transliterationResult.status === 'UNRESOLVED') {
        diagnostics.push({
          recordId: r.id,
          row: r.sourceRowIndex,
          field: path,
          severity: 'ERROR',
          code: 'UNCOPYABLE_TRANSLITERATION_RESULT',
          message: `Field "${path}" transliteration result is uncopyable or unresolved.`
        });
        continue;
      }

      if (field.finalText === null || field.finalText !== field.transliterationResult.output) {
        diagnostics.push({
          recordId: r.id,
          row: r.sourceRowIndex,
          field: path,
          severity: 'ERROR',
          code: 'FINAL_TEXT_RESULT_MISMATCH',
          message: `Field "${path}" finalText does not match transliteration result output.`
        });
        continue;
      }

      authoritativeValues[path] = field.finalText;
    } else {
      // Latin / non-Arabic script: true passthrough required
      if (
        field.requiresTransliteration !== false ||
        field.status !== 'PASSTHROUGH' ||
        field.finalText !== sourceText
      ) {
        diagnostics.push({
          recordId: r.id,
          row: r.sourceRowIndex,
          field: path,
          severity: 'ERROR',
          code: 'INVALID_PASSTHROUGH_FIELD',
          message: `Field "${path}" contains non-Persian source and must be an unmodified passthrough.`
        });
        continue;
      }

      authoritativeValues[path] = field.finalText;
    }
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics,
    authoritativeValues
  };
}
