import { DEFAULT_LEXICON_REPOSITORY } from '../data/lexicon';
import { consonantalScaffold } from '../data/ijmes-mappings';
import { normalizePersian } from './normalization';
import { analyzeOrthography } from './orthography';
import { analyzeMorphology } from './morphology/analyzeMorphology';
import { resolveMorphologicalToken } from './morphology/resolveMorphology';
import { applyTitleProfile } from './profiles';
import { RULES } from './provenance';
import { analyzeRelations } from './relations';
import { tokenize } from './tokenizer';
import { resolveWithFrozenReviewedAuthority } from './frozenReviewedAuthority';
import {
  AutomaticBlockingReason,
  AutomaticTokenSnapshot,
  ContextRelation,
  LexicalEntry,
  ProfileId,
  ResultStatus,
  Token,
  TokenAnalysis,
  TokenResult,
  TransliterationResult
} from './types';
import { resolveVocalizedReadings } from './vocalization';
import { LexiconRepository } from './lexicon/repository';
import { ReviewDecision } from './review/types';
import { detectReviewIssues } from './review/issueDetector';
import { applyReviewDecisions } from './review/decisionApplier';

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

function unresolvedToken(
  token: Token,
  analysis: TokenAnalysis,
  warning: string,
  alternatives: string[] = [],
  blockingReason: AutomaticBlockingReason = 'NO_LEXICAL_ENTRY'
): TokenResult {
  const appliedRules: TokenResult['appliedRules'] = [RULES.consonantalScaffold, ...analysis.provenance];
  const warnings = [warning, ...analysis.warnings];
  if (token.normalizedSurface.includes('ة')) {
    appliedRules.push(RULES.persianTaMarbuta);
    warnings.push('The guide requires Persian tāʾ marbūṭa to render as ih; the diagnostic scaffold records [TM] rather than guessing a final reading.');
  }
  const rendered = reviewPlaceholder(token.normalizedSurface, 'unresolved', alternatives);
  const scaffold = consonantalScaffold(token.normalizedSurface);

  const automatic: AutomaticTokenSnapshot = {
    status: 'UNRESOLVED',
    canonicalTransliteration: null,
    rendered,
    diagnosticScaffold: scaffold,
    confidence: 0,
    appliedRules: [...appliedRules],
    lexicalSources: [],
    warnings: [...warnings],
    alternatives: [...alternatives],
    blockingReason
  };

  return {
    normalizedSurface: token.normalizedSurface,
    tokenType: token.type,
    canonicalTransliteration: null,
    rendered,
    diagnosticScaffold: scaffold,
    status: 'UNRESOLVED',
    automaticStatus: 'UNRESOLVED',
    automaticCanonical: null,
    confidence: 0,
    appliedRules,
    lexicalSources: [],
    warnings,
    alternatives,
    normalizedStart: token.normalizedStart,
    normalizedEnd: token.normalizedEnd,
    automatic,
    blockingReason
  };
}

function resolveToken(token: Token, analysis?: TokenAnalysis, lexicon: LexiconRepository = DEFAULT_LEXICON_REPOSITORY): { result: TokenResult; entry?: LexicalEntry } {
  if (['whitespace', 'punctuation', 'number', 'latin'].includes(token.type)) {
    const automatic: AutomaticTokenSnapshot = {
      status: 'DETERMINISTIC',
      canonicalTransliteration: token.normalizedSurface,
      rendered: token.normalizedSurface,
      appliedRules: [],
      lexicalSources: [],
      warnings: [],
      alternatives: []
    };
    return {
      result: {
        normalizedSurface: token.normalizedSurface,
        tokenType: token.type,
        canonicalTransliteration: token.normalizedSurface,
        rendered: token.normalizedSurface,
        status: 'DETERMINISTIC',
        automaticStatus: 'DETERMINISTIC',
        automaticCanonical: token.normalizedSurface,
        appliedRules: [],
        lexicalSources: [],
        warnings: [],
        alternatives: [],
        normalizedStart: token.normalizedStart,
        normalizedEnd: token.normalizedEnd,
        automatic
      }
    };
  }
  if (!analysis) {
    return {
      result: unresolvedToken(token, {
        tokenIndex: -1,
        normalizedSurface: token.normalizedSurface,
        lookupForm: token.normalizedSurface,
        normalizedStart: token.normalizedStart,
        normalizedEnd: token.normalizedEnd,
        explicitVowels: [],
        explicitIzafat: null,
        unsupportedCombiningMarks: [],
        zwnjBoundaries: [],
        evidencedSegments: [token.normalizedSurface],
        warnings: [],
        provenance: []
      }, 'Token type is not supported.', [], 'NO_LEXICAL_ENTRY')
    };
  }

  const entry = lexicon.findByNormalized(analysis.lookupForm);
  if (!entry) {
    return { result: unresolvedToken(token, analysis, 'No reviewed lexical reading exists; the diagnostic scaffold is not final transliteration.', [], 'NO_LEXICAL_ENTRY') };
  }
  if (analysis.unsupportedCombiningMarks.length) {
    return {
      result: unresolvedToken(
        token,
        analysis,
        'Unsupported combining-mark evidence prevents authoritative lexical resolution in Phase 2A.',
        entry.readings.map((reading) => reading.canonical),
        'UNSUPPORTED_ORTHOGRAPHIC_EVIDENCE'
      ),
      entry
    };
  }

  const lexicalEvidence = analysis.explicitVowels.filter((evidence) => !evidence.relationOnly);
  let compatible = entry.readings;
  let evidenceWarning: string | undefined;

  if (lexicalEvidence.length) {
    const decision = resolveVocalizedReadings(entry.readings, lexicalEvidence);
    if (decision.kind === 'CONFLICT') {
      return {
        result: unresolvedToken(
          token,
          analysis,
          'Explicit vowel evidence conflicts with every reviewed lexical reading.',
          entry.readings.map((reading) => reading.canonical),
          'VOCALIZATION_CONFLICT'
        ),
        entry
      };
    }
    if (decision.kind === 'INSUFFICIENT') {
      return {
        result: unresolvedToken(
          token,
          analysis,
          'Explicit source vowel cannot be validated because reviewed lexical vocalization metadata is incomplete; missing metadata is not a conflict.',
          decision.readings.map((reading) => reading.canonical),
          'INSUFFICIENT_VOCALIZATION'
        ),
        entry
      };
    }
    compatible = decision.readings;
    if (decision.kind === 'AMBIGUOUS') {
      evidenceWarning = 'Explicit vowel evidence does not eliminate every competing reading; matching and metadata-unknown readings require review.';
    }
  }

  if (compatible.length !== 1) {
    const alternatives = compatible.map((reading) => reading.canonical);
    const rendered = reviewPlaceholder(token.normalizedSurface, 'ambiguous', alternatives);
    const appliedRules: TokenResult['appliedRules'] = [RULES.lexicalResolution, ...analysis.provenance];
    const lexicalSources = compatible.flatMap((reading) => reading.sources?.map((s) => s.citation) ?? [reading.source]);
    const warnings = [evidenceWarning ?? entry.notes ?? 'Multiple supported readings require human review.', ...analysis.warnings];
    const confidence = Math.max(...compatible.map((reading) => reading.confidence));

    const automatic: AutomaticTokenSnapshot = {
      status: 'AMBIGUOUS',
      canonicalTransliteration: null,
      rendered,
      confidence,
      lexicalCategory: entry.category,
      appliedRules: [...appliedRules],
      lexicalSources: [...lexicalSources],
      warnings: [...warnings],
      alternatives: [...alternatives],
      blockingReason: 'LEXICAL_AMBIGUITY'
    };

    return {
      result: {
        normalizedSurface: token.normalizedSurface,
        tokenType: token.type,
        canonicalTransliteration: null,
        rendered,
        status: 'AMBIGUOUS',
        automaticStatus: 'AMBIGUOUS',
        automaticCanonical: null,
        confidence,
        lexicalCategory: entry.category,
        appliedRules,
        lexicalSources,
        warnings,
        alternatives,
        normalizedStart: token.normalizedStart,
        normalizedEnd: token.normalizedEnd,
        automatic,
        blockingReason: 'LEXICAL_AMBIGUITY'
      },
      entry
    };
  }

  const reading = compatible[0];
  const appliedRules: TokenResult['appliedRules'] = [RULES.lexicalResolution, ...analysis.provenance];
  const canonical = applyCanonicalIjmes(reading.canonical, appliedRules);
  const lexicalSources = reading.sources?.map((s) => s.citation) ?? [reading.source];
  const warnings = [...(entry.notes ? [entry.notes] : []), ...analysis.warnings];

  const automatic: AutomaticTokenSnapshot = {
    status: 'LEXICON_RESOLVED',
    canonicalTransliteration: canonical,
    rendered: canonical,
    confidence: reading.confidence,
    lexicalCategory: entry.category,
    appliedRules: [...appliedRules],
    lexicalSources: [...lexicalSources],
    warnings: [...warnings],
    alternatives: []
  };

  return {
    result: {
      normalizedSurface: token.normalizedSurface,
      tokenType: token.type,
      canonicalTransliteration: canonical,
      rendered: canonical,
      status: 'LEXICON_RESOLVED',
      automaticStatus: 'LEXICON_RESOLVED',
      automaticCanonical: canonical,
      confidence: reading.confidence,
      lexicalCategory: entry.category,
      appliedRules,
      lexicalSources,
      warnings,
      alternatives: [],
      normalizedStart: token.normalizedStart,
      normalizedEnd: token.normalizedEnd,
      automatic
    },
    entry
  };
}

function overallStatus(results: TokenResult[], relations: ContextRelation[]): ResultStatus {
  if (results.some((result) => result.status === 'UNRESOLVED')) return 'UNRESOLVED';
  if (
    results.some((result) => result.status === 'AMBIGUOUS') ||
    relations.some((relation) => (relation.status === 'CANDIDATE' || relation.rendering === 'REVIEW_REQUIRED_ALLOMORPH') && relation.disposition !== 'REJECTED')
  ) {
    return 'AMBIGUOUS';
  }
  if (results.some((result) => result.status === 'USER_OVERRIDE') || relations.some((relation) => Boolean(relation.userDecision))) {
    return 'USER_OVERRIDE';
  }
  if (results.some((result) => result.status === 'LEXICON_RESOLVED')) return 'LEXICON_RESOLVED';
  return 'DETERMINISTIC';
}

function renderOutput(results: TokenResult[], relations: ContextRelation[]): string {
  const markers = new Map<number, string>();
  for (const relation of relations) {
    if (relation.disposition === 'REJECTED') continue;
    if (relation.status === 'CANDIDATE') markers.set(relation.sourceTokenIndex, ' ⟦izāfat?: -i / none⟧');
    if (relation.rendering === 'REVIEW_REQUIRED_ALLOMORPH') markers.set(relation.sourceTokenIndex, ' ⟦izāfat rendering: review⟧');
  }
  return results.map((result, index) => result.rendered + (markers.get(index) ?? '')).join('');
}

export function transliterate(
  input: string,
  profile: ProfileId = 'ijmes_full',
  reviewDecisions: ReviewDecision[] = [],
  lexicon: LexiconRepository = DEFAULT_LEXICON_REPOSITORY
): TransliterationResult {
  lexicon.assertValid();
  const normalization = normalizePersian(input);

  // Human-approved frozen V2 authority is an exact normalized phrase/profile layer.
  // It is consulted only after the independent Phase 4.6C baseline was recorded.
  // Misses fall through unchanged to the compositional lexicon/morphology pipeline.
  if (lexicon === DEFAULT_LEXICON_REPOSITORY) {
    const reviewedAuthority = resolveWithFrozenReviewedAuthority(
      input,
      normalization,
      profile,
      reviewDecisions
    );
    if (reviewedAuthority) return reviewedAuthority;
  }

  const tokens = tokenize(normalization.normalizedInput);
  const analyses = analyzeOrthography(tokens);
  const analysisByToken = new Map(analyses.map((analysis) => [analysis.tokenIndex, analysis]));

  const morphology = analyzeMorphology(tokens, analyses, lexicon);
  const morphologyByToken = new Map(morphology.map((analysis) => [analysis.tokenIndex, analysis]));

  const resolved = tokens.map((token, index) =>
    morphologyByToken.has(index)
      ? resolveMorphologicalToken(token, morphologyByToken.get(index)!)
      : resolveToken(token, analysisByToken.get(index), lexicon)
  );

  const initialResults = resolved.map((item) => item.result);
  const entries = resolved.map((item) => item.entry);
  const initialRelations = analyzeRelations(tokens, analyses, entries, initialResults, morphology);

  // 1. Initial issue detection
  const initialIssues = detectReviewIssues(tokens, initialResults, analyses, entries, morphology, initialRelations, lexicon);

  // 2. Iterative deterministic decision application & recomputation loop
  let currentTokens = initialResults;
  let currentRelations = initialRelations;
  let currentMorphology = morphology;
  let currentIssues = initialIssues;
  const allAppliedDecisions: ReviewDecision[] = [];
  let remainingDecisionsToApply = [...reviewDecisions];

  const maxPasses = reviewDecisions.length + 1;
  for (let pass = 0; pass < maxPasses && remainingDecisionsToApply.length > 0; pass++) {
    const reviewResult = applyReviewDecisions(
      tokens,
      currentTokens,
      analyses,
      entries,
      currentMorphology,
      currentRelations,
      currentIssues,
      remainingDecisionsToApply,
      lexicon
    );

    currentTokens = reviewResult.tokens;
    currentRelations = reviewResult.relations;
    currentMorphology = reviewResult.morphology;
    allAppliedDecisions.push(...reviewResult.appliedDecisions);

    const appliedSet = new Set(reviewResult.appliedDecisions.map((d) => d.issueId));
    remainingDecisionsToApply = remainingDecisionsToApply.filter((d) => !appliedSet.has(d.issueId));

    currentIssues = detectReviewIssues(
      tokens,
      currentTokens,
      analyses,
      entries,
      currentMorphology,
      currentRelations,
      lexicon
    );

    if (reviewResult.appliedDecisions.length === 0) {
      break;
    }
  }

  const finalTokens = currentTokens;
  const finalRelations = currentRelations;
  const finalMorphology = currentMorphology;
  const remainingIssues = currentIssues;
  const staleDecisions = remainingDecisionsToApply;

  // 3. Render izāfat on confirmed non-rejected relations
  for (const relation of finalRelations.filter((item) => item.status === 'CONFIRMED' && item.rendering === 'STANDARD_I' && item.disposition !== 'REJECTED')) {
    const result = finalTokens[relation.sourceTokenIndex];
    if (result && result.canonicalTransliteration !== null) {
      result.canonicalTransliteration += '-i';
      result.rendered = result.canonicalTransliteration;
      result.appliedRules.push(...relation.evidence.map((evidence) => evidence.rule), RULES.izafatRender);
    }
  }

  if (profile === 'ijmes_citation_title') {
    applyTitleProfile(finalTokens);
  }

  const status = overallStatus(finalTokens, finalRelations);
  const reviewReasons = [
    ...finalRelations
      .filter((relation) => (relation.status === 'CANDIDATE' || relation.rendering === 'REVIEW_REQUIRED_ALLOMORPH') && relation.disposition !== 'REJECTED')
      .flatMap((relation) => relation.warnings),
    ...finalMorphology
      .filter((analysis) => analysis.status !== 'CONFIRMED' && !allAppliedDecisions.some((d) => d.action === 'SELECT_MORPHOLOGY' && d.issueId.includes(`:${analysis.tokenIndex}:`)))
      .flatMap((analysis) => analysis.warnings)
  ];

  const copyable = !finalTokens.some((result) => ['UNRESOLVED', 'AMBIGUOUS'].includes(result.status)) &&
    reviewReasons.length === 0 &&
    remainingIssues.length === 0;

  return {
    originalInput: input,
    normalizedInput: normalization.normalizedInput,
    normalizationChanges: normalization.changes,
    profile,
    output: renderOutput(finalTokens, finalRelations),
    copyable,
    status,
    tokens: finalTokens,
    analyses,
    morphology: finalMorphology,
    relations: finalRelations,
    reviewIssues: remainingIssues,
    appliedDecisions: allAppliedDecisions,
    staleDecisions,
    reviewReasons,
    warnings: [
      ...finalTokens.flatMap((result) => result.warnings),
      ...finalRelations.flatMap((relation) => relation.warnings),
      ...finalMorphology.flatMap((analysis) => analysis.warnings)
    ]
  };
}
