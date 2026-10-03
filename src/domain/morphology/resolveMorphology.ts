import { consonantalScaffold } from '../../data/ijmes-mappings';
import { RULES } from '../provenance';
import { LexicalEntry, Token, TokenResult } from '../types';
import { resolveVocalizedReadings } from '../vocalization';
import { MorphologicalAnalysis } from './types';

function placeholder(surface: string, status: 'unresolved' | 'ambiguous', alternatives: string[]): string {
  return `⟦${surface}: ${status}${alternatives.length ? `: ${alternatives.join(' | ')}` : ''}⟧`;
}

function canonicalStem(value: string, rules: TokenResult['appliedRules']): string {
  let canonical = value;
  if (canonical.startsWith('ʾ')) { canonical = canonical.slice(1); rules.push(RULES.initialHamzaDrop); }
  if (canonical.includes('ʾ')) rules.push(RULES.medialHamza);
  if (canonical.includes('ʿ')) rules.push(RULES.ayn);
  return canonical;
}

function reviewResult(token: Token, morphology: MorphologicalAnalysis, status: 'AMBIGUOUS' | 'UNRESOLVED', alternatives: string[], warning: string): TokenResult {
  const appliedRules = [...new Map(morphology.evidence.map((item) => [item.rule.id, item.rule])).values()];
  return {
    normalizedSurface: token.normalizedSurface, tokenType: token.type, canonicalTransliteration: null,
    rendered: placeholder(token.normalizedSurface, status === 'AMBIGUOUS' ? 'ambiguous' : 'unresolved', alternatives),
    diagnosticScaffold: consonantalScaffold(token.normalizedSurface), status, confidence: 0, lexicalCategory: morphology.stemCategory,
    appliedRules, lexicalSources: morphology.stemEntry?.readings.map((reading) => reading.source) ?? [],
    warnings: [warning, ...morphology.warnings], alternatives, normalizedStart: token.normalizedStart, normalizedEnd: token.normalizedEnd
  };
}

export function resolveMorphologicalToken(token: Token, morphology: MorphologicalAnalysis): { result: TokenResult; entry?: LexicalEntry } {
  if (morphology.status !== 'CONFIRMED' || !morphology.stemEntry) {
    const ambiguous = morphology.alternatives.includes('WHOLE_WORD');
    return {
      result: reviewResult(token, morphology, ambiguous ? 'AMBIGUOUS' : 'UNRESOLVED', morphology.alternatives, ambiguous
        ? 'Whole-word lexical evidence and productive morphology both remain plausible.'
        : 'Productive suffix shape cannot supply an authoritative reading without confirmed stem-first analysis.'),
      entry: morphology.stemEntry
    };
  }
  let readings = morphology.stemEntry.readings;
  if (morphology.stemVowelEvidence.length) {
    const decision = resolveVocalizedReadings(readings, morphology.stemVowelEvidence);
    if (decision.kind === 'CONFLICT') return { result: reviewResult(token, morphology, 'UNRESOLVED', readings.map((item) => item.canonical), 'Stem vowel evidence conflicts with every reviewed reading.'), entry: morphology.stemEntry };
    if (decision.kind === 'INSUFFICIENT') return { result: reviewResult(token, morphology, 'UNRESOLVED', decision.readings.map((item) => item.canonical), 'Stem vowel evidence cannot be validated because lexical metadata is incomplete.'), entry: morphology.stemEntry };
    readings = decision.readings;
  }
  if (readings.length !== 1) {
    morphology.status = 'CANDIDATE';
    morphology.warnings.push('The proposed stem remains lexically ambiguous.');
    return { result: reviewResult(token, morphology, 'AMBIGUOUS', readings.map((item) => item.canonical), 'Morphology cannot override ambiguous lexical stem evidence.'), entry: morphology.stemEntry };
  }
  const suffix = morphology.morphemes.find((item) => item.type !== 'STEM')!;
  const appliedRules: TokenResult['appliedRules'] = [RULES.lexicalResolution, ...new Map(morphology.evidence.map((item) => [item.rule.id, item.rule])).values()];
  const canonical = `${canonicalStem(readings[0].canonical, appliedRules)}-${suffix.canonicalRendering}`;
  return {
    result: {
      normalizedSurface: token.normalizedSurface, tokenType: token.type, canonicalTransliteration: canonical, rendered: canonical,
      status: 'LEXICON_RESOLVED', confidence: readings[0].confidence, lexicalCategory: morphology.stemCategory, appliedRules,
      lexicalSources: [readings[0].source], warnings: [...morphology.warnings], alternatives: [],
      normalizedStart: token.normalizedStart, normalizedEnd: token.normalizedEnd
    },
    entry: morphology.stemEntry
  };
}
