import { DEFAULT_LEXICON_REPOSITORY } from '../../data/lexicon';
import { LexiconRepository } from '../lexicon/repository';
import { ContextRelation, LexicalEntry, MorphologicalAnalysis, Token, TokenAnalysis, TokenResult } from '../types';
import { ReviewAlternative, ReviewIssue, ReviewIssueType } from './types';

export function generateTokenIssueId(tokenIndex: number, surface: string, type: ReviewIssueType): string {
  return `issue:token:${tokenIndex}:${surface}:${type}`;
}

export function generateRelationIssueId(sourceIndex: number, targetIndex: number, type: ReviewIssueType): string {
  return `issue:relation:${sourceIndex}-${targetIndex}:${type}`;
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
  const morphologyByToken = new Map(morphologies.map((item) => [item.tokenIndex, item]));

  // 1. Token-level review issues
  tokenResults.forEach((result, tokenIndex) => {
    if (result.tokenType !== 'persian-word') return;
    const token = tokens[tokenIndex];
    const entry = entries[tokenIndex];
    const morph = morphologyByToken.get(tokenIndex);
    const analysis = analyses[tokenIndex];
    const lookupForm = analysis?.lookupForm ?? token.normalizedSurface;

    // Morphology competition / ambiguity
    if (morph && morph.alternatives.includes('WHOLE_WORD')) {
      const wholeEntry = lexicon.findByNormalized(lookupForm);
      const wholeWordReading = wholeEntry?.readings[0]?.canonical;
      const suffix = morph.morphemes.find((item) => item.type !== 'STEM');
      const stemReading = morph.stemEntry?.readings[0]?.canonical;
      const morphReading = stemReading && suffix?.canonicalRendering ? `${stemReading}-${suffix.canonicalRendering}` : undefined;

      const alternatives: ReviewAlternative[] = [
        {
          id: 'WHOLE_WORD',
          label: 'Whole word reading',
          canonical: wholeWordReading,
          description: wholeWordReading ? `Use reviewed whole-word reading "${wholeWordReading}".` : 'Use whole-word reading.'
        },
        {
          id: 'PRODUCTIVE_SEGMENTATION',
          label: 'Productive segmentation',
          canonical: morphReading,
          description: morphReading ? `Segment as stem + suffix "${morphReading}".` : 'Segment as productive stem + suffix.'
        }
      ];

      issues.push({
        id: generateTokenIssueId(tokenIndex, token.normalizedSurface, 'MORPHOLOGY_AMBIGUITY'),
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

    // Unsupported morphology allomorph (e.g. vowel-final possessive)
    if (morph && morph.status === 'CANDIDATE' && morph.warnings.some((w) => w.includes('allomorphs require review') || w.includes('no authoritative'))) {
      issues.push({
        id: generateTokenIssueId(tokenIndex, token.normalizedSurface, 'UNSUPPORTED_ALLOMORPH'),
        type: 'UNSUPPORTED_ALLOMORPH',
        tokenIndexes: [tokenIndex],
        morphologyIndex: tokenIndex,
        surface: token.normalizedSurface,
        description: morph.warnings[0] || 'Unsupported morphological allomorph requires explicit manual transliteration.',
        alternatives: [],
        allowedActions: ['MANUAL_CANONICAL_OVERRIDE'],
        evidenceSummary: morph.warnings.join(' ')
      });
      return;
    }

    // Lexical Ambiguity
    if (result.status === 'AMBIGUOUS' || (entry && entry.readings.length > 1 && result.alternatives.length > 1)) {
      const compatibleReadings = entry?.readings.filter((reading) =>
        result.alternatives.length === 0 || result.alternatives.includes(reading.canonical)
      ) ?? [];

      const alternatives: ReviewAlternative[] = compatibleReadings.map((reading, idx) => ({
        id: reading.id ?? `reading:${reading.canonical}:${idx}`,
        label: reading.canonical,
        canonical: reading.canonical,
        description: reading.notes ?? (reading.vocalization ? `Vocalized reading (${reading.canonical})` : undefined),
        source: reading.source
      }));

      issues.push({
        id: generateTokenIssueId(tokenIndex, token.normalizedSurface, 'LEXICAL_AMBIGUITY'),
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

    // Unknown / Unresolved Token
    if (result.status === 'UNRESOLVED') {
      issues.push({
        id: generateTokenIssueId(tokenIndex, token.normalizedSurface, 'UNKNOWN_TOKEN'),
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
    if (relation.status === 'CANDIDATE') {
      const sourceToken = tokens[relation.sourceTokenIndex];
      const targetToken = tokens[relation.targetTokenIndex];
      const surface = `${sourceToken.normalizedSurface} ${targetToken.normalizedSurface}`;

      issues.push({
        id: generateRelationIssueId(relation.sourceTokenIndex, relation.targetTokenIndex, 'IZAFAT_CANDIDATE'),
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
