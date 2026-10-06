/**
 * Deterministic identity hashing for scheme interpretation records and candidate analyses.
 *
 * Core invariant:
 *   Identity depends purely on semantic inputs, source/target schemes, and software/rule versions.
 *   Wall-clock audit timestamps (analyzedAt) are strictly excluded from deterministic IDs.
 */

import crypto from 'node:crypto';
import { RomanizationScheme } from '../types';

/**
 * Generate a deterministic identifier for a SchemeInterpretation record.
 */
export function generateInterpretationId(params: {
  evidenceId: string;
  sourceScheme: RomanizationScheme;
  targetScheme: 'IJMES';
  interpreterVersion: string;
  ruleSetVersion: string;
}): string {
  const hash = crypto.createHash('sha256');
  hash.update(params.evidenceId);
  hash.update('\0');
  hash.update(params.sourceScheme);
  hash.update('\0');
  hash.update(params.targetScheme);
  hash.update('\0');
  hash.update(params.interpreterVersion);
  hash.update('\0');
  hash.update(params.ruleSetVersion);

  const digest = hash.digest('hex').slice(0, 16);
  return `interp-${digest}`;
}

/**
 * Generate a deterministic identifier for a CandidateSchemeAnalysis record.
 */
export function generateCandidateAnalysisId(params: {
  candidateId: string;
  targetScheme: 'IJMES';
  aggregatorVersion: string;
  interpretationIds: string[];
}): string {
  const hash = crypto.createHash('sha256');
  hash.update(params.candidateId);
  hash.update('\0');
  hash.update(params.targetScheme);
  hash.update('\0');
  hash.update(params.aggregatorVersion);

  const sortedIds = [...params.interpretationIds].sort();
  for (const id of sortedIds) {
    hash.update('\0');
    hash.update(id);
  }

  const digest = hash.digest('hex').slice(0, 16);
  return `cand-analysis-${digest}`;
}
