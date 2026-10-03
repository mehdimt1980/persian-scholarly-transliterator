import { LEXICON } from '../data/lexicon';
import { consonantalScaffold } from '../data/ijmes-mappings';
import { normalizePersian } from './normalization';
import { analyzeOrthography } from './orthography';
import { analyzeMorphology } from './morphology/analyzeMorphology';
import { resolveMorphologicalToken } from './morphology/resolveMorphology';
import { applyTitleProfile } from './profiles';
import { RULES } from './provenance';
import { analyzeRelations } from './relations';
import { tokenize } from './tokenizer';
import { ContextRelation, LexicalEntry, ProfileId, ResultStatus, Token, TokenAnalysis, TokenResult, TransliterationResult } from './types';
import { resolveVocalizedReadings } from './vocalization';

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

function unresolvedToken(token: Token, analysis: TokenAnalysis, warning: string, alternatives: string[] = []): TokenResult {
  const appliedRules: TokenResult['appliedRules'] = [RULES.consonantalScaffold, ...analysis.provenance];
  const warnings = [warning, ...analysis.warnings];
  if (token.normalizedSurface.includes('ة')) { appliedRules.push(RULES.persianTaMarbuta); warnings.push('The guide requires Persian tāʾ marbūṭa to render as ih; the diagnostic scaffold records [TM] rather than guessing a final reading.'); }
  return { normalizedSurface: token.normalizedSurface, tokenType: token.type, canonicalTransliteration: null, rendered: reviewPlaceholder(token.normalizedSurface, 'unresolved', alternatives), diagnosticScaffold: consonantalScaffold(token.normalizedSurface), status: 'UNRESOLVED', confidence: 0, appliedRules, lexicalSources: [], warnings, alternatives, normalizedStart: token.normalizedStart, normalizedEnd: token.normalizedEnd };
}

function resolveToken(token: Token, analysis?: TokenAnalysis): { result: TokenResult; entry?: LexicalEntry } {
  if (['whitespace', 'punctuation', 'number', 'latin'].includes(token.type)) return { result: { normalizedSurface: token.normalizedSurface, tokenType: token.type, canonicalTransliteration: token.normalizedSurface, rendered: token.normalizedSurface, status: 'DETERMINISTIC', appliedRules: [], lexicalSources: [], warnings: [], alternatives: [], normalizedStart: token.normalizedStart, normalizedEnd: token.normalizedEnd } };
  if (!analysis) return { result: unresolvedToken(token, { tokenIndex: -1, normalizedSurface: token.normalizedSurface, lookupForm: token.normalizedSurface, normalizedStart: token.normalizedStart, normalizedEnd: token.normalizedEnd, explicitVowels: [], explicitIzafat: null, unsupportedCombiningMarks: [], zwnjBoundaries: [], evidencedSegments: [token.normalizedSurface], warnings: [], provenance: [] }, 'Token type is not supported.') };
  const entry = LEXICON.find((candidate) => candidate.normalized === analysis.lookupForm);
  if (!entry) return { result: unresolvedToken(token, analysis, 'No reviewed lexical reading exists; the diagnostic scaffold is not final transliteration.') };
  if (analysis.unsupportedCombiningMarks.length) return { result: unresolvedToken(token, analysis, 'Unsupported combining-mark evidence prevents authoritative lexical resolution in Phase 2A.', entry.readings.map((reading) => reading.canonical)), entry };
  const lexicalEvidence = analysis.explicitVowels.filter((evidence) => !evidence.relationOnly);
  let compatible = entry.readings;
  let evidenceWarning: string | undefined;
  if (lexicalEvidence.length) {
    const decision = resolveVocalizedReadings(entry.readings, lexicalEvidence);
    if (decision.kind === 'CONFLICT') return { result: unresolvedToken(token, analysis, 'Explicit vowel evidence conflicts with every reviewed lexical reading.', entry.readings.map((reading) => reading.canonical)), entry };
    if (decision.kind === 'INSUFFICIENT') return { result: unresolvedToken(token, analysis, 'Explicit source vowel cannot be validated because reviewed lexical vocalization metadata is incomplete; missing metadata is not a conflict.', decision.readings.map((reading) => reading.canonical)), entry };
    compatible = decision.readings;
    if (decision.kind === 'AMBIGUOUS') evidenceWarning = 'Explicit vowel evidence does not eliminate every competing reading; matching and metadata-unknown readings require review.';
  }
  if (compatible.length !== 1) {
    const alternatives = compatible.map((reading) => reading.canonical);
    return { result: { normalizedSurface: token.normalizedSurface, tokenType: token.type, canonicalTransliteration: null, rendered: reviewPlaceholder(token.normalizedSurface, 'ambiguous', alternatives), status: 'AMBIGUOUS', confidence: Math.max(...compatible.map((reading) => reading.confidence)), lexicalCategory: entry.category, appliedRules: [RULES.lexicalResolution, ...analysis.provenance], lexicalSources: compatible.map((reading) => reading.source), warnings: [evidenceWarning ?? entry.notes ?? 'Multiple supported readings require human review.', ...analysis.warnings], alternatives, normalizedStart: token.normalizedStart, normalizedEnd: token.normalizedEnd }, entry };
  }
  const reading = compatible[0]; const appliedRules: TokenResult['appliedRules'] = [RULES.lexicalResolution, ...analysis.provenance];
  const canonical = applyCanonicalIjmes(reading.canonical, appliedRules);
  return { result: { normalizedSurface: token.normalizedSurface, tokenType: token.type, canonicalTransliteration: canonical, rendered: canonical, status: 'LEXICON_RESOLVED', confidence: reading.confidence, lexicalCategory: entry.category, appliedRules, lexicalSources: [reading.source], warnings: [...(entry.notes ? [entry.notes] : []), ...analysis.warnings], alternatives: [], normalizedStart: token.normalizedStart, normalizedEnd: token.normalizedEnd }, entry };
}

function overallStatus(results: TokenResult[], relations: ContextRelation[]): ResultStatus {
  if (results.some((result) => result.status === 'UNRESOLVED')) return 'UNRESOLVED';
  if (results.some((result) => result.status === 'AMBIGUOUS') || relations.some((relation) => relation.status === 'CANDIDATE' || relation.rendering === 'REVIEW_REQUIRED_ALLOMORPH')) return 'AMBIGUOUS';
  if (results.some((result) => result.status === 'LEXICON_RESOLVED')) return 'LEXICON_RESOLVED';
  return 'DETERMINISTIC';
}

function renderOutput(results: TokenResult[], relations: ContextRelation[]): string {
  const markers = new Map<number, string>();
  for (const relation of relations) {
    if (relation.status === 'CANDIDATE') markers.set(relation.sourceTokenIndex, ' ⟦izāfat?: -i / none⟧');
    if (relation.rendering === 'REVIEW_REQUIRED_ALLOMORPH') markers.set(relation.sourceTokenIndex, ' ⟦izāfat rendering: review⟧');
  }
  return results.map((result, index) => result.rendered + (markers.get(index) ?? '')).join('');
}

export function transliterate(input: string, profile: ProfileId = 'ijmes_full'): TransliterationResult {
  const normalization = normalizePersian(input); const tokens = tokenize(normalization.normalizedInput); const analyses = analyzeOrthography(tokens);
  const analysisByToken = new Map(analyses.map((analysis) => [analysis.tokenIndex, analysis]));
  const morphology = analyzeMorphology(tokens, analyses); const morphologyByToken = new Map(morphology.map((analysis) => [analysis.tokenIndex, analysis]));
  const resolved = tokens.map((token, index) => morphologyByToken.has(index) ? resolveMorphologicalToken(token, morphologyByToken.get(index)!) : resolveToken(token, analysisByToken.get(index))); const results = resolved.map((item) => item.result); const entries = resolved.map((item) => item.entry);
  const relations = analyzeRelations(tokens, analyses, entries, results, morphology);
  for (const relation of relations.filter((item) => item.status === 'CONFIRMED' && item.rendering === 'STANDARD_I')) {
    const result = results[relation.sourceTokenIndex];
    if (result.canonicalTransliteration !== null) { result.canonicalTransliteration += '-i'; result.rendered = result.canonicalTransliteration; result.appliedRules.push(...relation.evidence.map((evidence) => evidence.rule), RULES.izafatRender); }
  }
  if (profile === 'ijmes_title') applyTitleProfile(results);
  const status = overallStatus(results, relations); const reviewReasons = [...relations.filter((relation) => relation.status === 'CANDIDATE' || relation.rendering === 'REVIEW_REQUIRED_ALLOMORPH').flatMap((relation) => relation.warnings), ...morphology.filter((analysis) => analysis.status !== 'CONFIRMED').flatMap((analysis) => analysis.warnings)];
  const copyable = !results.some((result) => ['UNRESOLVED', 'AMBIGUOUS'].includes(result.status)) && reviewReasons.length === 0;
  return { originalInput: input, normalizedInput: normalization.normalizedInput, normalizationChanges: normalization.changes, profile, output: renderOutput(results, relations), copyable, status, tokens: results, analyses, morphology, relations, reviewReasons, warnings: [...results.flatMap((result) => result.warnings), ...relations.flatMap((relation) => relation.warnings), ...morphology.flatMap((analysis) => analysis.warnings)] };
}
