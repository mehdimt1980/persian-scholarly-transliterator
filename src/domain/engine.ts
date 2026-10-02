import { LEXICON } from '../data/lexicon';
import { consonantalScaffold } from '../data/ijmes-mappings';
import { detectContext } from './context';
import { normalizePersian } from './normalization';
import { applyTitleProfile } from './profiles';
import { RULES } from './provenance';
import { tokenize } from './tokenizer';
import { ProfileId, ResultStatus, TokenResult, TransliterationResult } from './types';

function reviewPlaceholder(source: string, status: 'unresolved' | 'ambiguous', alternatives: string[] = []): string {
  const detail = alternatives.length ? `: ${alternatives.join(' | ')}` : '';
  return `⟦${source}: ${status}${detail}⟧`;
}

function applyCanonicalIjmes(value: string, rules: TokenResult['appliedRules']): string {
  let canonical = value;
  if (canonical.startsWith('ʾ')) { canonical = canonical.slice(1); rules.push(RULES.initialHamzaDrop); }
  if (canonical.includes('ʾ')) rules.push(RULES.medialHamza);
  if (canonical.includes('ʿ')) rules.push(RULES.ayn);
  return canonical;
}

function resolveToken(source: string, start: number, end: number, passthrough = false): TokenResult {
  if (passthrough) return { source, canonicalTransliteration: source, rendered: source, status: 'DETERMINISTIC', appliedRules: [], lexicalSources: [], warnings: [], alternatives: [], start, end };
  const entry = LEXICON.find((candidate) => candidate.normalized === source);
  if (!entry) return { source, canonicalTransliteration: null, rendered: reviewPlaceholder(source, 'unresolved'), diagnosticScaffold: consonantalScaffold(source), status: 'UNRESOLVED', confidence: 0, appliedRules: [RULES.consonantalScaffold], lexicalSources: [], warnings: ['No reviewed lexical reading exists; the diagnostic scaffold is not final transliteration.'], alternatives: [], start, end };
  if (entry.readings.length !== 1) {
    const alternatives = entry.readings.map((reading) => reading.canonical);
    return { source, canonicalTransliteration: null, rendered: reviewPlaceholder(source, 'ambiguous', alternatives), status: 'AMBIGUOUS', confidence: Math.max(...entry.readings.map((reading) => reading.confidence)), appliedRules: [RULES.lexicalResolution], lexicalSources: entry.readings.map((reading) => reading.source), warnings: [entry.notes ?? 'Multiple supported readings require human review.'], alternatives, start, end };
  }
  const reading = entry.readings[0]; const appliedRules = [RULES.lexicalResolution];
  const canonical = applyCanonicalIjmes(reading.canonical, appliedRules);
  return { source, canonicalTransliteration: canonical, rendered: canonical, status: 'LEXICON_RESOLVED', confidence: reading.confidence, appliedRules, lexicalSources: [reading.source], warnings: entry.notes ? [entry.notes] : [], alternatives: [], start, end };
}

function overallStatus(results: TokenResult[]): ResultStatus {
  if (results.some((result) => result.status === 'UNRESOLVED')) return 'UNRESOLVED';
  if (results.some((result) => result.status === 'AMBIGUOUS')) return 'AMBIGUOUS';
  if (results.some((result) => result.status === 'LEXICON_RESOLVED')) return 'LEXICON_RESOLVED';
  return 'DETERMINISTIC';
}

export function transliterate(input: string, profile: ProfileId = 'ijmes_full'): TransliterationResult {
  const normalization = normalizePersian(input); const tokens = tokenize(normalization.normalizedInput);
  const results = tokens.map((token) => resolveToken(token.text, token.start, token.end, ['whitespace', 'punctuation', 'number', 'latin'].includes(token.type)));
  for (const evidence of detectContext(tokens)) {
    const result = results[evidence.sourceTokenIndex];
    if (result.canonicalTransliteration !== null) {
      result.canonicalTransliteration += '-i'; result.rendered = result.canonicalTransliteration;
      result.appliedRules.push(evidence.rule, RULES.izafatRender); result.lexicalSources.push(evidence.source);
    }
  }
  if (profile === 'ijmes_title') applyTitleProfile(results);
  const status = overallStatus(results); const copyable = !results.some((result) => ['UNRESOLVED', 'AMBIGUOUS'].includes(result.status));
  return { originalInput: input, normalizedInput: normalization.normalizedInput, normalizationChanges: normalization.changes, profile, output: results.map((result) => result.rendered).join(''), copyable, status, tokens: results, warnings: results.flatMap((result) => result.warnings) };
}
