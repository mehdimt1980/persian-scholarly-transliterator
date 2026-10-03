import { RULES } from './provenance';
import { ContextRelation, LexicalEntry, Token, TokenAnalysis, TokenResult } from './types';

const DEPENDENT_CATEGORIES = new Set(['noun', 'adjective', 'proper-noun']);

function nextAdjacentPersianToken(tokens: Token[], sourceIndex: number): number | null {
  let index = sourceIndex + 1;
  while (tokens[index]?.type === 'whitespace') index += 1;
  return tokens[index]?.type === 'persian-word' ? index : null;
}

export function analyzeRelations(tokens: Token[], analyses: TokenAnalysis[], entries: Array<LexicalEntry | undefined>, results: TokenResult[]): ContextRelation[] {
  const analysisByToken = new Map(analyses.map((analysis) => [analysis.tokenIndex, analysis]));
  const relations: ContextRelation[] = [];
  for (let sourceTokenIndex = 0; sourceTokenIndex < tokens.length; sourceTokenIndex += 1) {
    if (tokens[sourceTokenIndex].type !== 'persian-word') continue;
    const targetTokenIndex = nextAdjacentPersianToken(tokens, sourceTokenIndex);
    if (targetTokenIndex === null) continue;
    const analysis = analysisByToken.get(sourceTokenIndex); const sourceEntry = entries[sourceTokenIndex]; const targetEntry = entries[targetTokenIndex];
    if (analysis?.explicitIzafat) {
      const heh = analysis.explicitIzafat === 'HEH_ORTHOGRAPHY';
      relations.push({ type: 'IZAFAT', sourceTokenIndex, targetTokenIndex, status: 'CONFIRMED', rendering: heh ? 'REVIEW_REQUIRED_ALLOMORPH' : 'STANDARD_I', evidence: [{ kind: heh ? 'EXPLICIT_HEH_ORTHOGRAPHY' : 'EXPLICIT_FINAL_KASRA', rule: RULES.izafatExplicitInterpretation, source: heh ? 'Preserved final-heh izāfat orthography' : 'Explicit final kasra in source' }], warnings: heh ? ['Izāfat is explicit, but this vowel-final allomorph is not rendered automatically in Phase 2A.'] : [] });
      continue;
    }
    if (sourceEntry?.context?.explicitIzafatAfter?.includes(analysisByToken.get(targetTokenIndex)?.lookupForm ?? '')) {
      relations.push({ type: 'IZAFAT', sourceTokenIndex, targetTokenIndex, status: 'CONFIRMED', rendering: 'STANDARD_I', evidence: [{ kind: 'CURATED_LEXICAL_CONTEXT', rule: RULES.izafatDetected, source: sourceEntry.context.source }], warnings: [] });
      continue;
    }
    if (sourceEntry?.category === 'noun' && targetEntry?.category && DEPENDENT_CATEGORIES.has(targetEntry.category) && results[sourceTokenIndex].canonicalTransliteration && results[targetTokenIndex].canonicalTransliteration) {
      relations.push({ type: 'IZAFAT', sourceTokenIndex, targetTokenIndex, status: 'CANDIDATE', rendering: 'STANDARD_I', confidence: 0.5, evidence: [{ kind: 'GRAMMATICAL_CANDIDATE', rule: RULES.izafatCandidate, source: `Resolved ${sourceEntry.category} followed by resolved ${targetEntry.category}` }], warnings: ['Both tokens are resolved, but the unmarked izāfat relation requires review.'] });
    }
  }
  return relations;
}
