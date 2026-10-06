/**
 * Read-only diagnostic policy auditor comparing Phase 5D scheme rules against project runtime IJMES mappings.
 *
 * Core scholarly invariant:
 *   This audit is strictly read-only and diagnostic.
 *   Every audit entry is backed by official source citations in IJMES_TARGET_POLICY_REGISTRY.
 *   It does NOT modify runtime transliteration engine mappings or frozen gold behaviors.
 */

import {
  PERSIAN_CONSONANT_MAPPINGS,
  PERSIAN_GUIDE_SPECIAL_RENDERINGS
} from '../../../data/ijmes-mappings';
import { getAllTargetPolicies } from './rules';
import {
  PolicyAuditComparisonStatus,
  PolicyAuditEntry,
  PolicyAuditReport
} from './types';

/**
 * Execute a read-only comparison audit between Phase 5D target scheme policies and runtime IJMES tables.
 */
export function auditIjmesRuntimePolicy(): PolicyAuditReport {
  const policies = getAllTargetPolicies();
  const entries: PolicyAuditEntry[] = [];
  let matches = 0;
  let mismatches = 0;
  let notComparable = 0;

  for (const policy of policies) {
    let runtimeMappingSymbol: string | null = null;
    if (policy.character in PERSIAN_CONSONANT_MAPPINGS) {
      runtimeMappingSymbol = PERSIAN_CONSONANT_MAPPINGS[policy.character];
    } else if (policy.character in PERSIAN_GUIDE_SPECIAL_RENDERINGS) {
      runtimeMappingSymbol = PERSIAN_GUIDE_SPECIAL_RENDERINGS[policy.character];
    }

    let status: PolicyAuditComparisonStatus;
    if (runtimeMappingSymbol === null) {
      status = 'NOT_COMPARABLE';
      notComparable++;
    } else if (runtimeMappingSymbol === policy.targetSymbol) {
      status = 'MATCH';
      matches++;
    } else {
      status = 'MISMATCH';
      mismatches++;
    }

    entries.push({
      policyId: policy.policyId,
      character: policy.character,
      persianLetterName: policy.persianLetterName,
      schemeTargetSymbol: policy.targetSymbol,
      runtimeMappingSymbol,
      status,
      sourceReferences: policy.sourceReferences,
      notes: policy.notes
    });
  }

  let summary: 'PASS' | 'PASS_WITH_NONCOMPARABLE' | 'DISCREPANCY_DETECTED';
  if (mismatches > 0) {
    summary = 'DISCREPANCY_DETECTED';
  } else if (notComparable > 0) {
    summary = 'PASS_WITH_NONCOMPARABLE';
  } else {
    summary = 'PASS';
  }

  return {
    timestamp: new Date().toISOString(),
    targetScheme: 'IJMES',
    totalChecked: entries.length,
    matches,
    mismatches,
    notComparable,
    entries,
    summary
  };
}
