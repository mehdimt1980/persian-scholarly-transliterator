import { LEXICON } from '../data/lexicon';
import { RULES } from './provenance';
import { ContextEvidence, Token } from './types';

export function detectContext(tokens: Token[]): ContextEvidence[] {
  const evidence: ContextEvidence[] = [];
  for (let sourceTokenIndex = 0; sourceTokenIndex < tokens.length; sourceTokenIndex += 1) {
    const token = tokens[sourceTokenIndex];
    if (token.type !== 'persian-word') continue;
    const entry = LEXICON.find((candidate) => candidate.normalized === token.normalizedText);
    const allowedTargets = entry?.context?.explicitIzafatAfter;
    if (!allowedTargets?.length) continue;
    let targetTokenIndex = sourceTokenIndex + 1;
    while (tokens[targetTokenIndex]?.type === 'whitespace') targetTokenIndex += 1;
    const target = tokens[targetTokenIndex];
    if (target?.type === 'persian-word' && allowedTargets.includes(target.normalizedText)) {
      evidence.push({ type: 'IZAFAT', sourceTokenIndex, targetTokenIndex, rule: RULES.izafatDetected, source: entry?.context?.source ?? 'Lexical context evidence' });
    }
  }
  return evidence;
}
