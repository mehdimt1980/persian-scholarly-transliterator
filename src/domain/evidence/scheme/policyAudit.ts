/**
 * Read-only diagnostic policy auditor comparing Phase 5D scheme rules against project runtime IJMES mappings.
 *
 * Core scholarly invariant:
 *   This audit is strictly read-only and diagnostic.
 *   It does NOT modify runtime transliteration engine mappings or frozen gold behaviors.
 */

import {
  PERSIAN_CONSONANT_MAPPINGS,
  PERSIAN_GUIDE_SPECIAL_RENDERINGS
} from '../../../data/ijmes-mappings';
import {
  PolicyAuditComparisonStatus,
  PolicyAuditEntry,
  PolicyAuditReport
} from './types';

interface ComparisonCheck {
  character: string;
  persianLetterName: string;
  schemeRuleId: string;
  schemeTargetSymbol: string;
  notes?: string;
}

const POLICY_CHECKS: ComparisonCheck[] = [
  {
    character: 'ع',
    persianLetterName: 'ʿAyn',
    schemeRuleId: 'ALA_LC_TO_IJMES_AYN',
    schemeTargetSymbol: 'ʿ',
    notes: 'Modifier letter reversed comma U+02BF'
  },
  {
    character: 'ء',
    persianLetterName: 'Hamzah',
    schemeRuleId: 'ALA_LC_TO_IJMES_LEXICAL_HAMZA',
    schemeTargetSymbol: 'ʾ',
    notes: 'Modifier letter right half ring U+02BE'
  },
  {
    character: 'ض',
    persianLetterName: 'Żād / Ḍād',
    schemeRuleId: 'ALA_LC_TO_IJMES_DAD',
    schemeTargetSymbol: 'ż',
    notes: 'Z with dot above U+017C'
  },
  {
    character: 'ص',
    persianLetterName: 'Ṣād',
    schemeRuleId: 'STANDARD_IJMES_DIRECT',
    schemeTargetSymbol: 'ṣ',
    notes: 'S with dot below U+1E63'
  },
  {
    character: 'ط',
    persianLetterName: 'Ṭā',
    schemeRuleId: 'STANDARD_IJMES_DIRECT',
    schemeTargetSymbol: 'ṭ',
    notes: 'T with dot below U+1E6D'
  },
  {
    character: 'ظ',
    persianLetterName: 'Ẓā',
    schemeRuleId: 'STANDARD_IJMES_DIRECT',
    schemeTargetSymbol: 'ẓ',
    notes: 'Z with dot below U+1E93'
  },
  {
    character: 'ح',
    persianLetterName: 'Ḥā',
    schemeRuleId: 'STANDARD_IJMES_DIRECT',
    schemeTargetSymbol: 'ḥ',
    notes: 'H with dot below U+1E25'
  },
  {
    character: 'خ',
    persianLetterName: 'Khā',
    schemeRuleId: 'STANDARD_IJMES_DIRECT',
    schemeTargetSymbol: 'kh',
    notes: 'Digraph kh'
  },
  {
    character: 'غ',
    persianLetterName: 'Ghayn',
    schemeRuleId: 'STANDARD_IJMES_DIRECT',
    schemeTargetSymbol: 'gh',
    notes: 'Digraph gh'
  },
  {
    character: 'ش',
    persianLetterName: 'Shīn',
    schemeRuleId: 'STANDARD_IJMES_DIRECT',
    schemeTargetSymbol: 'sh',
    notes: 'Digraph sh'
  },
  {
    character: 'چ',
    persianLetterName: 'Chih',
    schemeRuleId: 'STANDARD_IJMES_DIRECT',
    schemeTargetSymbol: 'ch',
    notes: 'Digraph ch'
  },
  {
    character: 'ژ',
    persianLetterName: 'Zhih',
    schemeRuleId: 'STANDARD_IJMES_DIRECT',
    schemeTargetSymbol: 'zh',
    notes: 'Digraph zh'
  },
  {
    character: 'ة',
    persianLetterName: 'Tā marbūṭah',
    schemeRuleId: 'STANDARD_IJMES_SPECIAL',
    schemeTargetSymbol: 'ih',
    notes: 'Persian guide special rendering -ih'
  }
];

/**
 * Execute a read-only comparison audit between Phase 5D target scheme policies and runtime IJMES tables.
 */
export function auditIjmesRuntimePolicy(): PolicyAuditReport {
  const entries: PolicyAuditEntry[] = [];
  let matches = 0;
  let mismatches = 0;
  let notComparable = 0;

  for (const check of POLICY_CHECKS) {
    let runtimeMappingSymbol: string | null = null;
    if (check.character in PERSIAN_CONSONANT_MAPPINGS) {
      runtimeMappingSymbol = PERSIAN_CONSONANT_MAPPINGS[check.character];
    } else if (check.character in PERSIAN_GUIDE_SPECIAL_RENDERINGS) {
      runtimeMappingSymbol = PERSIAN_GUIDE_SPECIAL_RENDERINGS[check.character];
    }

    let status: PolicyAuditComparisonStatus;
    if (runtimeMappingSymbol === null) {
      status = 'NOT_COMPARABLE';
      notComparable++;
    } else if (runtimeMappingSymbol === check.schemeTargetSymbol) {
      status = 'MATCH';
      matches++;
    } else {
      status = 'MISMATCH';
      mismatches++;
    }

    entries.push({
      character: check.character,
      persianLetterName: check.persianLetterName,
      schemeRuleId: check.schemeRuleId,
      schemeTargetSymbol: check.schemeTargetSymbol,
      runtimeMappingSymbol,
      status,
      notes: check.notes
    });
  }

  return {
    timestamp: new Date().toISOString(),
    targetScheme: 'IJMES',
    totalChecked: entries.length,
    matches,
    mismatches,
    notComparable,
    entries,
    summary: mismatches === 0 ? 'PASS' : 'DISCREPANCY_DETECTED'
  };
}
