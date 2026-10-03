import { DEFAULT_LEXICON_REPOSITORY } from '../../data/lexicon';
import { LexiconRepository } from '../lexicon/repository';
import { ContextRelation, LexicalEntry, MorphologicalAnalysis, Token, TokenAnalysis, TokenResult } from '../types';
import { ReviewAlternative, ReviewIssue, ReviewIssueType } from './types';

export function generateTokenIssueId(token: Token, tokenIndex: number, type: ReviewIssueType): string {
  return `issue:token:${tokenIndex}:${token.normalizedSurface}:${token.normalizedStart}-${token.normalizedEnd}:${type}`;
}

export function generateRelationIssueId(sourceToken: Token, sourceIndex: number, targetToken: Token, targetIndex: number, type: ReviewIssueType): string {
  return `issue:relation:${sourceToken.normalizedSurface}[${sourceIndex}:${sourceToken.normalizedStart}-${sourceToken.normalizedEnd}]->${targetToken.normalizedSurface}[${targetIndex}:${targetToken.normalizedStart}-${targetToken.normalizedEnd}]:${type}`;
}

export function detectReviewIssues(
  tokens: Token[],
  tokenResults: TokenResult[],
  analyses: TokenAnalysis[],
  entries: Array<LexicalEntry | undefined>,
  morphologies: MorphologicalAnalysis[],
  relations: ContextRelation[],
  lexicon: LexiconRepository = DEFAULT_LEXICON_REPOSITORY
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const analysisByToken = new Map(analyses.map((item) => [item.tokenIndex, item]));
  const morphologyByToken = new Map(morphologies.map((item) => [item.tokenIndex, item]));

  // 1. Token-level review issues
  tokenResults.forEach((result, tokenIndex) => {
    if (result.tokenType !== 'persian-word') return;
    if (result.status === 'DETERMINISTIC' || result.status === 'LEXICON_RESOLVED' || result.status === 'USER_OVERRIDE') {
      return;
    }

    const token = tokens[tokenIndex];
    const entry = entries[tokenIndex];
    const morph = morphologyByToken.get(tokenIndex);
    const analysis = analysisByToken.get(tokenIndex);
    const lookupForm = analysis?.lookupForm ?? token.normalizedSurface;

    // A. Morphology competition / ambiguity (WHOLE_WORD vs PRODUCTIVE_SEGMENTATION)
    if (morph && morph.alternatives.includes('WHOLE_WORD') && morph.status !== 'CONFIRMED') {
      const wholeEntry = lexicon.findByNormalized(lookupForm);
      const wholeWordReading = wholeEntry && wholeEntry.readings.length === 1 ? wholeEntry.readings[0].canonical : undefined;
      const suffix = morph.morphemes.find((item) => item.type !== 'STEM');
      const stemReading = morph.stemEntry && morph.stemEntry.readings.length === 1 ? morph.stemEntry.readings[0].canonical : undefined;
      const morphReading = stemReading && suffix?.canonicalRendering ? `${stemReading}-${suffix.canonicalRendering}` : undefined;

      const alternatives: ReviewAlternative[] = [
        {
          id: 'WHOLE_WORD',
          label: 'Whole word reading',
          canonical: wholeWordReading,
          description: wholeWordReading
            ? `Use reviewed whole-word reading "${wholeWordReading}".`
            : wholeEntry && wholeEntry.readings.length > 1
              ? `Whole word branch (${wholeEntry.readings.length} readings)`
              : 'Use whole-word reading.'
        },
        {
          id: 'PRODUCTIVE_SEGMENTATION',
          label: 'Productive segmentation',
          canonical: morphReading,
          description: morphReading
            ? `Segment as stem + suffix "${morphReading}".`
            : morph.stemEntry && morph.stemEntry.readings.length > 1
              ? `Productive stem branch (${morph.stemEntry.readings.length} readings)`
              : 'Segment as productive stem + suffix.'
        }
      ];

      issues.push({
        id: generateTokenIssueId(token, tokenIndex, 'MORPHOLOGY_AMBIGUITY'),
        type: 'MORPHOLOGY_AMBIGUITY',
        tokenIndexes: [tokenIndex],
        morphologyIndex: tokenIndex,
        surface: token.normalizedSurface,
        description: 'Reviewed whole-word lexical evidence and productive suffix segmentation are both plausible.',
        alternatives,
        allowedActions: ['SELECT_MORPHOLOGY', 'MANUAL_CANONICAL_OVERRIDE'],
        evidenceSummary: morph.warnings.join(' ')
      });
      return;
    }

    // B. Unsupported morphology allomorph (e.g. vowel-final possessive)
    if (result.blockingReason === 'UNSUPPORTED_ALLOMORPH' || (morph && morph.status === 'CANDIDATE' && morph.warnings.some((w) => w.includes('allomorphs require review') || w.includes('no authoritative')))) {
      issues.push({
        id: generateTokenIssueId(token, tokenIndex, 'UNSUPPORTED_ALLOMORPH'),
        type: 'UNSUPPORTED_ALLOMORPH',
        tokenIndexes: [tokenIndex],
        morphologyIndex: tokenIndex,
        surface: token.normalizedSurface,
        description: morph?.warnings[0] || result.warnings[0] || 'Unsupported morphological allomorph requires explicit manual transliteration.',
        alternatives: [],
        allowedActions: ['MANUAL_CANONICAL_OVERRIDE'],
        evidenceSummary: morph?.warnings.join(' ') ?? result.warnings.join(' ')
      });
      return;
    }

    // C. Unsupported combining mark evidence
    if (result.blockingReason === 'UNSUPPORTED_ORTHOGRAPHIC_EVIDENCE' || (analysis && analysis.unsupportedCombiningMarks.length > 0)) {
      issues.push({
        id: generateTokenIssueId(token, tokenIndex, 'UNSUPPORTED_ORTHOGRAPHIC_EVIDENCE'),
        type: 'UNSUPPORTED_ORTHOGRAPHIC_EVIDENCE',
        tokenIndexes: [tokenIndex],
        surface: token.normalizedSurface,
        description: result.warnings[0] || 'Unsupported combining mark prevents authoritative automatic transliteration.',
        alternatives: [],
        allowedActions: ['MANUAL_CANONICAL_OVERRIDE'],
        evidenceSummary: analysis?.unsupportedCombiningMarks.map((m) => `U+${m.mark.codePointAt(0)?.toString(16).toUpperCase()}`).join(', ')
      });
      return;
    }

    // D. Insufficient vocalization metadata
    if (result.blockingReason === 'INSUFFICIENT_VOCALIZATION') {
      issues.push({
        id: generateTokenIssueId(token, tokenIndex, 'INSUFFICIENT_VOCALIZATION'),
        type: 'INSUFFICIENT_VOCALIZATION',
        tokenIndexes: [tokenIndex],
        surface: token.normalizedSurface,
        description: result.warnings[0] || 'Explicit source vowel cannot be validated because reviewed lexical vocalization metadata is incomplete.',
        alternatives: [],
        allowedActions: ['MANUAL_CANONICAL_OVERRIDE'],
        evidenceSummary: result.alternatives.length > 0 ? `Alternatives: ${result.alternatives.join(', ')}` : undefined
      });
      return;
    }

    // E. Lexical Ambiguity
    if (result.status === 'AMBIGUOUS' || result.blockingReason === 'LEXICAL_AMBIGUITY' || (entry && entry.readings.length > 1 && result.alternatives.length > 1)) {
      const activeEntry = lexicon.findByNormalized(lookupForm) ?? morph?.stemEntry ?? entry;
      const compatibleReadings = activeEntry?.readings.filter((reading) =>
        result.alternatives.length === 0 || result.alternatives.includes(reading.canonical)
      ) ?? [];

      const alternatives: ReviewAlternative[] = compatibleReadings.length > 0
        ? compatibleReadings.map((reading, idx) => ({
            id: reading.id ?? `reading:${reading.canonical}:${idx}`,
            label: reading.canonical,
            canonical: reading.canonical,
            description: reading.notes ?? (reading.vocalization ? `Vocalized reading (${reading.canonical})` : undefined),
            source: reading.source
          }))
        : result.alternatives.map((alt, idx) => ({
            id: `alt:${alt}:${idx}`,
            label: alt,
            canonical: alt,
            description: `Alternative reading: ${alt}`
          }));

      issues.push({
        id: generateTokenIssueId(token, tokenIndex, 'LEXICAL_AMBIGUITY'),
        type: 'LEXICAL_AMBIGUITY',
        tokenIndexes: [tokenIndex],
        surface: token.normalizedSurface,
        description: result.warnings[0] || 'Multiple reviewed readings require explicit human selection.',
        alternatives,
        allowedActions: ['SELECT_LEXICAL_READING', 'MANUAL_CANONICAL_OVERRIDE'],
        evidenceSummary: `Alternatives: ${result.alternatives.join(', ')}`
      });
      return;
    }

    // F. Unknown / Unresolved Token (including vocalization conflict or unknown stem)
    if (result.status === 'UNRESOLVED' || result.blockingReason === 'NO_LEXICAL_ENTRY' || result.blockingReason === 'VOCALIZATION_CONFLICT') {
      issues.push({
        id: generateTokenIssueId(token, tokenIndex, 'UNKNOWN_TOKEN'),
        type: 'UNKNOWN_TOKEN',
        tokenIndexes: [tokenIndex],
        surface: token.normalizedSurface,
        description: result.warnings[0] || 'No reviewed lexical reading exists. Enter canonical transliteration.',
        alternatives: [],
        allowedActions: ['MANUAL_CANONICAL_OVERRIDE'],
        evidenceSummary: result.diagnosticScaffold ? `Diagnostic scaffold: ${result.diagnosticScaffold}` : undefined
      });
    }
  });

  // 2. Relation-level review issues (e.g. Izāfat Candidate)
  relations.forEach((relation, relationIndex) => {
    if (relation.status === 'CANDIDATE' && relation.disposition !== 'ACCEPTED' && relation.disposition !== 'REJECTED') {
      const sourceToken = tokens[relation.sourceTokenIndex];
      const targetToken = tokens[relation.targetTokenIndex];
      const surface = `${sourceToken.normalizedSurface} ${targetToken.normalizedSurface}`;

      issues.push({
        id: generateRelationIssueId(sourceToken, relation.sourceTokenIndex, targetToken, relation.targetTokenIndex, 'IZAFAT_CANDIDATE'),
        type: 'IZAFAT_CANDIDATE',
        tokenIndexes: [relation.sourceTokenIndex, relation.targetTokenIndex],
        relationIndex,
        surface,
        description: `Unmarked grammatical relation between "${sourceToken.normalizedSurface}" and "${targetToken.normalizedSurface}" requires human review.`,
        alternatives: [
          { id: 'ACCEPT_IZAFAT', label: 'Accept izāfat (-i)', canonical: '-i', description: 'Confirm izāfat relation and apply IJMES -i rendering.' },
          { id: 'REJECT_IZAFAT', label: 'Reject izāfat (no -i)', description: 'Reject candidate izāfat relation.' }
        ],
        allowedActions: ['ACCEPT_IZAFAT', 'REJECT_IZAFAT'],
        evidenceSummary: relation.warnings.join(' ')
      });
    }
  });

  // Sort issues deterministically by source position
  return issues.sort((a, b) => {
    const startA = a.tokenIndexes[0] ?? 0;
    const startB = b.tokenIndexes[0] ?? 0;
    if (startA !== startB) return startA - startB;
    return a.id.localeCompare(b.id);
  });
}
