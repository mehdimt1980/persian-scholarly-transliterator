/**
 * Deterministic semantic fingerprinting for Phase 5E review bases and lexicon state.
 *
 * Invariants:
 *   1. Review-basis fingerprint captures the complete semantic basis of candidate state,
 *      supporting evidence IDs, conflicts, and Phase 5D scheme analysis.
 *   2. Wall-clock timestamps (preparedAt, analyzedAt, derivedAt) are strictly excluded.
 *   3. Lexicon fingerprint captures all meaningful entry metadata, readings, sources,
 *      and context evidence independent of array insertion order.
 */

import crypto from 'node:crypto';
import type { LexicalCandidate } from '../types';
import type { CandidateSchemeAnalysis } from '../scheme/types';
import type { LexiconRepository } from '../../lexicon/repository';
import { stableReadingIdentity } from '../../lexicon/types';

/**
 * Compute a deterministic semantic fingerprint for a candidate review basis.
 */
export function computeReviewBasisFingerprint(
  candidate: LexicalCandidate,
  schemeAnalysis: CandidateSchemeAnalysis
): string {
  const hash = crypto.createHash('sha256');

  // 1. Candidate semantic fields
  hash.update(candidate.id);
  hash.update('\0');
  hash.update(candidate.persianForm);
  hash.update('\0');
  hash.update(candidate.normalizedForm);
  hash.update('\0');
  hash.update(candidate.entityType);
  hash.update('\0');
  hash.update(candidate.status);
  hash.update('\0');
  hash.update(candidate.derivationProvenance?.strategy ?? '');
  hash.update('\0');

  // Sorted evidence IDs
  const sortedEvidenceIds = [...candidate.evidenceIds].sort();
  for (const eid of sortedEvidenceIds) {
    hash.update(eid);
    hash.update('\0');
  }

  // Sorted candidate conflicts
  const sortedConflicts = [...candidate.conflicts].sort((a, b) => {
    const kA = `${a.evidenceId}:${a.romanizationScheme}:${a.conflictKind}:${a.observedRomanization ?? ''}`;
    const kB = `${b.evidenceId}:${b.romanizationScheme}:${b.conflictKind}:${b.observedRomanization ?? ''}`;
    return kA.localeCompare(kB);
  });
  for (const c of sortedConflicts) {
    hash.update(c.evidenceId);
    hash.update('\0');
    hash.update(c.persianForm);
    hash.update('\0');
    hash.update(c.observedRomanization ?? '');
    hash.update('\0');
    hash.update(c.romanizationScheme);
    hash.update('\0');
    hash.update(c.conflictKind);
    hash.update('\0');
    hash.update(c.conflictReason);
    hash.update('\0');
  }

  // 2. Scheme Analysis semantic fields
  hash.update(schemeAnalysis.id);
  hash.update('\0');
  hash.update(schemeAnalysis.consensusStatus);
  hash.update('\0');
  hash.update(schemeAnalysis.consensusTargetHypothesis ?? '');
  hash.update('\0');
  hash.update(schemeAnalysis.aggregatorVersion);
  hash.update('\0');

  // Deterministic target hypotheses
  const sortedHypotheses = [...schemeAnalysis.deterministicTargetHypotheses].sort();
  for (const hyp of sortedHypotheses) {
    hash.update(hyp);
    hash.update('\0');
  }

  // Applied rules
  const sortedAppliedRules = [...schemeAnalysis.appliedRuleIds].sort();
  for (const r of sortedAppliedRules) {
    hash.update(r);
    hash.update('\0');
  }

  // Blockers
  const sortedBlockers = [...schemeAnalysis.blockers].sort((a, b) => {
    const kA = `${a.kind}:${a.reason}:${a.token ?? ''}`;
    const kB = `${b.kind}:${b.reason}:${b.token ?? ''}`;
    return kA.localeCompare(kB);
  });
  for (const b of sortedBlockers) {
    hash.update(b.kind);
    hash.update('\0');
    hash.update(b.reason);
    hash.update('\0');
    hash.update(b.token ?? '');
    hash.update('\0');
  }

  // Sorted individual interpretations
  const sortedInterpretations = [...schemeAnalysis.interpretations].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
  for (const interp of sortedInterpretations) {
    hash.update(interp.id);
    hash.update('\0');
    hash.update(interp.evidenceId);
    hash.update('\0');
    hash.update(interp.sourceScheme);
    hash.update('\0');
    hash.update(interp.targetScheme);
    hash.update('\0');
    hash.update(interp.rawObservedRomanization);
    hash.update('\0');
    hash.update(interp.comparisonSourceForm);
    hash.update('\0');
    hash.update(interp.targetHypothesis ?? '');
    hash.update('\0');
    hash.update(interp.status);
    hash.update('\0');
    hash.update(interp.interpreterVersion);
    hash.update('\0');
    hash.update(interp.ruleSetVersion);
    hash.update('\0');

    const sortedRules = [...interp.appliedRuleIds].sort();
    for (const r of sortedRules) {
      hash.update(r);
      hash.update('\0');
    }

    const sortedInterpBlockers = [...interp.blockers].sort((a, b) => {
      const kA = `${a.kind}:${a.reason}:${a.token ?? ''}`;
      const kB = `${b.kind}:${b.reason}:${b.token ?? ''}`;
      return kA.localeCompare(kB);
    });
    for (const b of sortedInterpBlockers) {
      hash.update(b.kind);
      hash.update('\0');
      hash.update(b.reason);
      hash.update('\0');
      hash.update(b.token ?? '');
      hash.update('\0');
    }
  }

  const digest = hash.digest('hex').slice(0, 16);
  return `rev-basis-${digest}`;
}

/**
 * Compute a deterministic semantic fingerprint for a LexiconRepository snapshot.
 */
export function computeLexiconFingerprint(lexicon: LexiconRepository): string {
  const hash = crypto.createHash('sha256');

  // Sort entries deterministically by normalized form, then id
  const sortedEntries = [...lexicon.getAllEntries()].sort((a, b) => {
    const normCmp = a.normalized.localeCompare(b.normalized);
    if (normCmp !== 0) return normCmp;
    return a.id.localeCompare(b.id);
  });

  for (const entry of sortedEntries) {
    hash.update(entry.id);
    hash.update('\0');
    hash.update(entry.surface);
    hash.update('\0');
    hash.update(entry.normalized);
    hash.update('\0');
    hash.update(entry.category ?? '');
    hash.update('\0');
    hash.update(entry.properName?.type ?? '');
    hash.update('\0');
    hash.update(entry.properName?.notes ?? '');
    hash.update('\0');
    hash.update(entry.notes ?? '');
    hash.update('\0');

    if (entry.sources) {
      const sortedSources = [...entry.sources].sort((a, b) =>
        `${a.type}:${a.citation}:${a.reference ?? ''}`.localeCompare(
          `${b.type}:${b.citation}:${b.reference ?? ''}`
        )
      );
      for (const s of sortedSources) {
        hash.update(s.type);
        hash.update('\0');
        hash.update(s.citation);
        hash.update('\0');
        hash.update(s.reference ?? '');
        hash.update('\0');
      }
    }

    if (entry.context) {
      hash.update(entry.context.source);
      hash.update('\0');
      hash.update(entry.context.notes ?? '');
      hash.update('\0');
      if (entry.context.explicitIzafatAfter) {
        const sortedIzafat = [...entry.context.explicitIzafatAfter].sort();
        for (const iz of sortedIzafat) {
          hash.update(iz);
          hash.update('\0');
        }
      }
    }

    // Sort readings by stable reading identity
    const sortedReadings = [...entry.readings].sort((a, b) =>
      stableReadingIdentity(a).localeCompare(stableReadingIdentity(b))
    );

    for (const reading of sortedReadings) {
      hash.update(reading.id ?? '');
      hash.update('\0');
      hash.update(reading.canonical);
      hash.update('\0');
      hash.update(String(reading.confidence));
      hash.update('\0');
      hash.update(reading.source);
      hash.update('\0');
      hash.update(reading.notes ?? '');
      hash.update('\0');
      hash.update(reading.category ?? '');
      hash.update('\0');
      hash.update(reading.properName?.type ?? '');
      hash.update('\0');
      hash.update(reading.properName?.notes ?? '');
      hash.update('\0');

      if (reading.sources) {
        const sortedReadSources = [...reading.sources].sort((a, b) =>
          `${a.type}:${a.citation}:${a.reference ?? ''}`.localeCompare(
            `${b.type}:${b.citation}:${b.reference ?? ''}`
          )
        );
        for (const s of sortedReadSources) {
          hash.update(s.type);
          hash.update('\0');
          hash.update(s.citation);
          hash.update('\0');
          hash.update(s.reference ?? '');
          hash.update('\0');
        }
      }

      if (reading.vocalization) {
        const sortedVoc = [...reading.vocalization].sort(
          (a, b) => a.afterBaseIndex - b.afterBaseIndex
        );
        for (const v of sortedVoc) {
          hash.update(String(v.afterBaseIndex));
          hash.update('\0');
          hash.update(v.vowel);
          hash.update('\0');
        }
      }
    }
  }

  const digest = hash.digest('hex').slice(0, 16);
  return `lex-fp-${digest}`;
}
