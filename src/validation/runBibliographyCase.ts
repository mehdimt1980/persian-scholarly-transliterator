import { processBibliographyRecord } from '../domain/bibliography/processRecord';
import { validateRecordForFinalExport } from '../domain/bibliography/export/validateRecord';
import { exportFinalCsv } from '../domain/bibliography/csv/export';
import { exportToRis } from '../domain/bibliography/export/ris';
import { exportToBibTeX } from '../domain/bibliography/export/bibtex';
import { LexiconRepository } from '../domain/lexicon/repository';
import {
  BibliographyCaseEvaluationResult,
  BibliographyValidationCase,
  ValidationClassification
} from './types';
import { exactUnicodeMatch } from './evaluateCase';

export function runBibliographyCase(
  testCase: BibliographyValidationCase,
  lexicon?: LexiconRepository
): BibliographyCaseEvaluationResult {
  const decisions = testCase.reviewDecisions ?? [];
  const processed = processBibliographyRecord(testCase.record, decisions, lexicon);

  const reasons: string[] = [];
  const fieldEvaluations: BibliographyCaseEvaluationResult['fieldEvaluations'] = [];

  let isFieldMismatch = false;
  let hasUnderBlockedField = false;

  if (testCase.expected.fields) {
    for (const [fieldPath, expectedField] of Object.entries(testCase.expected.fields)) {
      const actualField = processed.fields[fieldPath];

      if (!actualField) {
        fieldEvaluations.push({
          fieldPath,
          expectedDisposition: expectedField.disposition,
          expectedFinalText: expectedField.finalText,
          actualStatus: 'MISSING',
          actualFinalText: null,
          passed: false,
          reason: `Field "${fieldPath}" is missing in processed record.`
        });
        isFieldMismatch = true;
        reasons.push(`Field "${fieldPath}" is missing in processed record.`);
        continue;
      }

      let passed = true;
      let reason: string | undefined;

      if (expectedField.disposition === 'FINAL' || expectedField.disposition === 'PASSTHROUGH') {
        if (expectedField.finalText !== undefined) {
          if (!actualField.finalText || !exactUnicodeMatch(actualField.finalText, expectedField.finalText)) {
            passed = false;
            reason = `Expected final text "${expectedField.finalText}", but actual was "${actualField.finalText}".`;
            isFieldMismatch = true;
            reasons.push(`Field "${fieldPath}": ${reason}`);
          }
        }
      } else if (expectedField.disposition === 'REVIEW_REQUIRED') {
        if (actualField.finalText !== null || actualField.transliterationResult?.copyable === true) {
          passed = false;
          reason = `Expected REVIEW_REQUIRED, but actual field has finalText "${actualField.finalText}" or copyable=true.`;
          isFieldMismatch = true;
          hasUnderBlockedField = true;
          reasons.push(`Field "${fieldPath}": ${reason}`);
        }
      } else if (expectedField.disposition === 'UNRESOLVED') {
        if (actualField.finalText !== null || actualField.transliterationResult?.copyable === true) {
          passed = false;
          reason = `Expected UNRESOLVED, but actual field has finalText "${actualField.finalText}" or copyable=true.`;
          isFieldMismatch = true;
          hasUnderBlockedField = true;
          reasons.push(`Field "${fieldPath}": ${reason}`);
        }
      }

      fieldEvaluations.push({
        fieldPath,
        expectedDisposition: expectedField.disposition,
        expectedFinalText: expectedField.finalText,
        actualStatus: actualField.status,
        actualFinalText: actualField.finalText,
        passed,
        reason
      });
    }
  }

  // Check readiness
  const readinessMatches = processed.readiness === testCase.expected.readiness;
  if (!readinessMatches) {
    reasons.push(`Expected readiness "${testCase.expected.readiness}", but got "${processed.readiness}".`);
  }

  // If expected READY, verify exportability through domain final exporters
  if (testCase.expected.readiness === 'READY') {
    const exportValidation = validateRecordForFinalExport(processed);
    if (!exportValidation.valid) {
      reasons.push(`Record validation for final export failed: ${exportValidation.diagnostics.map((d) => d.message).join('; ')}`);
    }

    const batch = {
      records: [processed],
      summary: {
        total: 1,
        ready: processed.readiness === 'READY' ? 1 : 0,
        reviewRequired: processed.readiness === 'REVIEW_REQUIRED' ? 1 : 0,
        invalid: processed.readiness === 'INVALID' ? 1 : 0
      },
      diagnostics: []
    };

    const csvReport = exportFinalCsv(batch, 'STRICT_ALL');
    if (!csvReport.success) {
      reasons.push(`Final CSV export failed in STRICT_ALL mode.`);
    }

    const risReport = exportToRis(batch, 'STRICT_ALL');
    if (!risReport.success) {
      reasons.push(`RIS export failed in STRICT_ALL mode.`);
    }

    const bibtexReport = exportToBibTeX(batch, 'STRICT_ALL');
    if (!bibtexReport.success) {
      reasons.push(`BibTeX export failed in STRICT_ALL mode.`);
    }
  }

  let classification: ValidationClassification;
  if (hasUnderBlockedField) {
    classification = 'UNDER_BLOCKED';
  } else if (testCase.expected.readiness === 'READY') {
    if (processed.readiness === 'READY' && !isFieldMismatch && reasons.length === 0) {
      classification = 'CORRECT_AUTHORITATIVE';
    } else if (processed.readiness === 'READY' && isFieldMismatch) {
      classification = 'FALSE_AUTHORITATIVE';
    } else {
      classification = 'OVER_BLOCKED';
    }
  } else if (testCase.expected.readiness === 'REVIEW_REQUIRED') {
    if (processed.readiness === 'READY') {
      classification = 'UNDER_BLOCKED';
    } else if (processed.readiness === 'REVIEW_REQUIRED' && !isFieldMismatch) {
      classification = 'CORRECT_REVIEW_REQUIRED';
    } else {
      classification = 'OVER_BLOCKED';
    }
  } else {
    // Expected INVALID
    if (processed.readiness === 'INVALID' && !isFieldMismatch) {
      classification = 'CORRECT_UNRESOLVED';
    } else if (processed.readiness === 'READY') {
      classification = 'UNDER_BLOCKED';
    } else {
      classification = 'OVER_BLOCKED';
    }
  }

  return {
    caseId: testCase.id,
    recordId: testCase.record.id,
    expectedReadiness: testCase.expected.readiness,
    actualReadiness: processed.readiness,
    classification,
    reasons,
    provenance: testCase.provenance,
    fieldEvaluations
  };
}
