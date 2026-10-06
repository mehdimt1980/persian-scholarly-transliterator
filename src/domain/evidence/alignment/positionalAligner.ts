import { generateEvidenceId } from '../candidate';
import {
  CandidateEligibility,
  LexicalEntityType,
  LexicalEvidence,
  LexicalEvidenceDerivation
} from '../types';
import { tokenizePersianLexicalTokens } from './persianLexicalTokenizer';
import { tokenizeRomanLexemes } from './romanLexemeTokenizer';
import {
  AlignedSegmentPair,
  AlignmentOptions,
  AlignmentResult
} from './types';

/**
 * Align a parent LexicalEvidence record into derived lexical segments using
 * conservative, high-transparency POSITIONAL_EQUAL_COUNT alignment.
 *
 * Core scholarly invariants:
 *   1. No circular alignment: Never consults transliteration engine or authoritative lexicon.
 *   2. Conservative: If Persian and Roman token counts differ, fails closed without guessing.
 *   3. Exact substrings: Children retain exact raw slices of parent strings.
 *   4. Context-bound detection: Hyphenated / bound forms are marked CONTEXT_BOUND and excluded from candidates.
 *   5. Entity typing: Single-token parents retain parent entityType; multi-token segments default to WORD.
 */
export function alignLexicalEvidence(
  parentEvidence: LexicalEvidence,
  options?: AlignmentOptions
): AlignmentResult {
  if (!parentEvidence.observedRomanization) {
    const pTokens = tokenizePersianLexicalTokens(parentEvidence.persianForm);
    return {
      success: false,
      parentEvidenceId: parentEvidence.id,
      persianTokens: pTokens,
      romanTokens: [],
      pairs: [],
      derivedEvidence: [],
      diagnostic: {
        kind: 'NO_ROMANIZATION',
        message: 'Parent evidence has no observed romanization.'
      }
    };
  }

  const persianTokens = tokenizePersianLexicalTokens(parentEvidence.persianForm);
  const romanTokens = tokenizeRomanLexemes(parentEvidence.observedRomanization);

  if (persianTokens.length === 0) {
    return {
      success: false,
      parentEvidenceId: parentEvidence.id,
      persianTokens,
      romanTokens,
      pairs: [],
      derivedEvidence: [],
      diagnostic: {
        kind: 'NO_PERSIAN_TOKENS',
        message: 'Parent evidence contains zero Persian lexical tokens.',
        persianTokenCount: 0,
        romanTokenCount: romanTokens.length
      }
    };
  }

  if (romanTokens.length === 0) {
    return {
      success: false,
      parentEvidenceId: parentEvidence.id,
      persianTokens,
      romanTokens,
      pairs: [],
      derivedEvidence: [],
      diagnostic: {
        kind: 'NO_ROMAN_TOKENS',
        message: 'Parent evidence contains zero Roman lexeme tokens.',
        persianTokenCount: persianTokens.length,
        romanTokenCount: 0
      }
    };
  }

  if (persianTokens.length !== romanTokens.length) {
    return {
      success: false,
      parentEvidenceId: parentEvidence.id,
      persianTokens,
      romanTokens,
      pairs: [],
      derivedEvidence: [],
      diagnostic: {
        kind: 'TOKEN_COUNT_MISMATCH',
        message: `Token count mismatch between Persian (${persianTokens.length}) and Roman (${romanTokens.length}) observations.`,
        persianTokenCount: persianTokens.length,
        romanTokenCount: romanTokens.length
      }
    };
  }

  const pairs: AlignedSegmentPair[] = [];
  const derivedEvidence: LexicalEvidence[] = [];

  for (let i = 0; i < persianTokens.length; i++) {
    const pToken = persianTokens[i];
    const rToken = romanTokens[i];

    const isContextBound = rToken.hasBoundMarker;
    const candidateEligibility: CandidateEligibility = isContextBound ? 'CONTEXT_BOUND' : 'ELIGIBLE';
    const exclusionReason = isContextBound
      ? 'Contains bound contextual marker or hyphen'
      : undefined;

    // Entity classification: 1-token parent preserves entity type; multi-token defaults to WORD
    const entityType: LexicalEntityType =
      persianTokens.length === 1 ? parentEvidence.entityType : 'WORD';

    const derivation: LexicalEvidenceDerivation = {
      kind: 'ALIGNED_SEGMENT',
      parentEvidenceId: parentEvidence.id,
      segmentIndex: i,
      persianSpan: {
        start: pToken.start,
        end: pToken.end
      },
      romanizationSpan: {
        start: rToken.start,
        end: rToken.end
      },
      alignmentStrategy: 'POSITIONAL_EQUAL_COUNT',
      candidateEligibility,
      exclusionReason
    };

    const id = generateEvidenceId({
      sourceId: parentEvidence.provenance.sourceId,
      sourceRecordId: parentEvidence.sourceRecordId,
      sourceField: parentEvidence.sourceField,
      persianForm: pToken.text,
      observedRomanization: rToken.text,
      romanizationScheme: parentEvidence.romanizationScheme,
      derivation
    });

    const child: LexicalEvidence = {
      id,
      sourceType: parentEvidence.sourceType,
      sourceRecordId: parentEvidence.sourceRecordId,
      sourceUri: parentEvidence.sourceUri,
      sourceField: parentEvidence.sourceField,
      persianForm: pToken.text,
      observedRomanization: rToken.text,
      romanizationScheme: parentEvidence.romanizationScheme,
      entityType,
      context: parentEvidence.context ?? parentEvidence.persianForm,
      provenance: {
        ...parentEvidence.provenance,
        extractorVersion: options?.extractorVersion ?? parentEvidence.provenance.extractorVersion,
        retrievedAt: parentEvidence.provenance.retrievedAt
      },
      status: 'OBSERVED',
      derivation
    };

    pairs.push({
      segmentIndex: i,
      persianToken: pToken,
      romanToken: rToken,
      derivedEvidence: child,
      candidateEligibility,
      exclusionReason
    });

    derivedEvidence.push(child);
  }

  return {
    success: true,
    parentEvidenceId: parentEvidence.id,
    persianTokens,
    romanTokens,
    pairs,
    derivedEvidence
  };
}
