import { DEFAULT_LEXICON_REPOSITORY } from '../../data/lexicon';
import { LexiconRepository } from '../lexicon/repository';
import { RULES } from '../provenance';
import { ContextRelation, LexicalEntry, MorphologicalAnalysis, RuleDefinition, Token, TokenAnalysis, TokenResult } from '../types';
import { ReviewDecision, ReviewIssue } from './types';
import { validateManualTransliteration } from './validation';

function applyCanonicalIjmes(value: string, rules: RuleDefinition[]): string {
  let canonical = value;
  if (canonical.startsWith('ʾ')) { canonical = canonical.slice(1); rules.push(RULES.initialHamzaDrop); }
  if (canonical.includes('ʾ')) rules.push(RULES.medialHamza);
  if (canonical.includes('ʿ')) rules.push(RULES.ayn);
  return canonical;
}

export interface AppliedReviewResult {
  tokens: TokenResult[];
  relations: ContextRelation[];
  morphology: MorphologicalAnalysis[];
  appliedDecisions: ReviewDecision[];
  staleDecisions: ReviewDecision[];
  resolvedIssueIds: Set<string>;
}

export function applyReviewDecisions(
  tokens: Token[],
  tokenResults: TokenResult[],
  analyses: TokenAnalysis[],
  entries: Array<LexicalEntry | undefined>,
  morphologies: MorphologicalAnalysis[],
  relations: ContextRelation[],
  issues: ReviewIssue[],
  decisions: ReviewDecision[] = [],
  lexicon: LexiconRepository = DEFAULT_LEXICON_REPOSITORY
): AppliedReviewResult {
  const analysisByToken = new Map(analyses.map((item) => [item.tokenIndex, item]));
  const updatedTokens: TokenResult[] = tokenResults.map((t) => ({
    ...t,
    appliedRules: [...t.appliedRules],
    lexicalSources: [...t.lexicalSources],
    warnings: [...t.warnings],
    alternatives: [...t.alternatives],
    automatic: {
      status: t.automatic.status,
      canonicalTransliteration: t.automatic.canonicalTransliteration,
      rendered: t.automatic.rendered,
      diagnosticScaffold: t.automatic.diagnosticScaffold,
      confidence: t.automatic.confidence,
      lexicalCategory: t.automatic.lexicalCategory,
      appliedRules: [...t.automatic.appliedRules],
      lexicalSources: [...t.automatic.lexicalSources],
      warnings: [...t.automatic.warnings],
      alternatives: [...t.automatic.alternatives],
      blockingReason: t.automatic.blockingReason
    }
  }));

  const updatedRelations: ContextRelation[] = relations.map((r) => ({
    ...r,
    evidence: [...r.evidence],
    warnings: [...r.warnings]
  }));

  const updatedMorphology: MorphologicalAnalysis[] = morphologies.map((m) => ({
    ...m,
    evidence: [...m.evidence],
    warnings: [...m.warnings],
    alternatives: [...m.alternatives]
  }));

  const issueMap = new Map(issues.map((i) => [i.id, i]));
  const appliedDecisions: ReviewDecision[] = [];
  const staleDecisions: ReviewDecision[] = [];
  const resolvedIssueIds = new Set<string>();

  for (const decision of decisions) {
    const issue = issueMap.get(decision.issueId);
    if (!issue) {
      staleDecisions.push(decision);
      continue;
    }

    // 1. Authorization check: action must be explicitly permitted by the issue
    if (!issue.allowedActions.includes(decision.action)) {
      staleDecisions.push(decision);
      continue;
    }

    let appliedSuccessfully = false;

    // 2. Action: Manual canonical override
    if (decision.action === 'MANUAL_CANONICAL_OVERRIDE') {
      const validation = validateManualTransliteration(decision.manualCanonicalTransliteration);
      if (validation.valid && validation.normalized) {
        const tokenIndex = issue.tokenIndexes[0];
        if (tokenIndex !== undefined && updatedTokens[tokenIndex]) {
          const current = updatedTokens[tokenIndex];
          const manualValue = validation.normalized;
          current.status = 'USER_OVERRIDE';
          current.canonicalTransliteration = manualValue;
          current.rendered = manualValue;
          current.appliedRules = [RULES.consonantalScaffold, RULES.userManualCanonicalOverride];
          current.lexicalSources = ['User manual override (session-scoped)'];
          current.warnings = decision.note ? [`Note: ${decision.note}`] : [];
          current.alternatives = [];
          current.userDecision = decision;
          current.automaticStatus = current.automatic.status;
          current.automaticCanonical = current.automatic.canonicalTransliteration;
          appliedSuccessfully = true;
        }
      }
    }

    // 3. Action: Select lexical reading (must belong to issue alternatives)
    else if (decision.action === 'SELECT_LEXICAL_READING') {
      const tokenIndex = issue.tokenIndexes[0];
      const selectedId = decision.selectedAlternativeId;
      const selectedCanonical = decision.manualCanonicalTransliteration;

      // Alternative membership check: must be in issue.alternatives
      const matchingAlt = issue.alternatives.find((alt) =>
        alt.id === selectedId || alt.canonical === selectedId || alt.canonical === selectedCanonical
      );

      if (tokenIndex !== undefined && updatedTokens[tokenIndex] && matchingAlt) {
        const analysis = analysisByToken.get(tokenIndex);
        const lookupForm = analysis?.lookupForm ?? tokens[tokenIndex]?.normalizedSurface;
        const entry = lexicon.findByNormalized(lookupForm) ?? entries[tokenIndex];
        const reading = entry?.readings.find((r) =>
          r.id === matchingAlt.id || r.canonical === matchingAlt.canonical
        );
        const canonicalValue = reading?.canonical ?? matchingAlt.canonical;

        if (canonicalValue) {
          const current = updatedTokens[tokenIndex];
          const appliedRules: RuleDefinition[] = [RULES.lexicalResolution, RULES.userLexicalReadingSelection];
          const canonical = applyCanonicalIjmes(canonicalValue, appliedRules);

          current.status = 'USER_OVERRIDE';
          current.canonicalTransliteration = canonical;
          current.rendered = canonical;
          current.appliedRules = appliedRules;
          current.lexicalSources = reading?.sources?.map((s) => s.citation) ?? (reading ? [reading.source] : [matchingAlt.source ?? 'Reviewed alternative reading']);
          current.warnings = reading?.notes ? [reading.notes] : [];
          current.alternatives = [];
          current.userDecision = decision;
          current.automaticStatus = current.automatic.status;
          current.automaticCanonical = current.automatic.canonicalTransliteration;
          appliedSuccessfully = true;
        }
      }
    }

    // 4. Action: Accept izāfat
    else if (decision.action === 'ACCEPT_IZAFAT') {
      const sourceIndex = issue.tokenIndexes[0];
      const targetIndex = issue.tokenIndexes[1];
      const relation = updatedRelations.find((r) => r.sourceTokenIndex === sourceIndex && r.targetTokenIndex === targetIndex);
      if (relation) {
        relation.status = 'CONFIRMED';
        relation.rendering = 'STANDARD_I';
        relation.disposition = 'ACCEPTED';
        relation.evidence.push({
          kind: 'USER_DECISION',
          rule: RULES.userIzafatAccept,
          source: 'Confirmed by human review session'
        });
        relation.warnings = [];
        relation.userDecision = decision;
        appliedSuccessfully = true;
      }
    }

    // 5. Action: Reject izāfat
    else if (decision.action === 'REJECT_IZAFAT') {
      const sourceIndex = issue.tokenIndexes[0];
      const targetIndex = issue.tokenIndexes[1];
      const relation = updatedRelations.find((r) => r.sourceTokenIndex === sourceIndex && r.targetTokenIndex === targetIndex);
      if (relation) {
        relation.status = 'CONFIRMED';
        relation.disposition = 'REJECTED';
        relation.evidence.push({
          kind: 'USER_DECISION',
          rule: RULES.userIzafatReject,
          source: 'Rejected by human review session'
        });
        relation.warnings = [];
        relation.userDecision = decision;
        appliedSuccessfully = true;
      }
    }

    // 6. Action: Select morphology (WHOLE_WORD vs PRODUCTIVE_SEGMENTATION)
    else if (decision.action === 'SELECT_MORPHOLOGY') {
      const tokenIndex = issue.tokenIndexes[0];
      const morph = updatedMorphology.find((m) => m.tokenIndex === tokenIndex);
      const current = updatedTokens[tokenIndex];
      const analysis = analysisByToken.get(tokenIndex);
      const lookupForm = analysis?.lookupForm ?? tokens[tokenIndex]?.normalizedSurface;
      const wholeEntry = lexicon.findByNormalized(lookupForm);

      const matchingAlt = issue.alternatives.find((alt) => alt.id === decision.selectedAlternativeId);

      if (tokenIndex !== undefined && current && morph && matchingAlt) {
        if (decision.selectedAlternativeId === 'WHOLE_WORD' && wholeEntry && wholeEntry.readings.length > 0) {
          morph.status = 'CONFIRMED';
          morph.warnings = [];

          if (wholeEntry.readings.length === 1) {
            const reading = wholeEntry.readings[0];
            const appliedRules: RuleDefinition[] = [RULES.lexicalResolution, RULES.userMorphologySelection];
            const canonical = applyCanonicalIjmes(reading.canonical, appliedRules);

            current.status = 'USER_OVERRIDE';
            current.canonicalTransliteration = canonical;
            current.rendered = canonical;
            current.appliedRules = appliedRules;
            current.lexicalSources = reading.sources?.map((s) => s.citation) ?? [reading.source];
            current.warnings = [];
            current.alternatives = [];
            current.userDecision = decision;
            current.automaticStatus = current.automatic.status;
            current.automaticCanonical = current.automatic.canonicalTransliteration;
          } else {
            // Whole word branch has lexical ambiguity; resolve morphology competition but keep lexical ambiguity
            current.status = 'AMBIGUOUS';
            current.canonicalTransliteration = null;
            current.alternatives = wholeEntry.readings.map((r) => r.canonical);
            current.appliedRules = [RULES.lexicalResolution, RULES.userMorphologySelection];
            current.lexicalSources = wholeEntry.readings.flatMap((r) => r.sources?.map((s) => s.citation) ?? [r.source]);
            current.warnings = ['Morphology competition resolved to whole-word reading; select lexical reading to proceed.'];
            current.userDecision = decision;
          }
          appliedSuccessfully = true;
        } else if (decision.selectedAlternativeId === 'PRODUCTIVE_SEGMENTATION' && morph.stemEntry) {
          const suffix = morph.morphemes.find((item) => item.type !== 'STEM');
          if (suffix && suffix.canonicalRendering) {
            morph.status = 'CONFIRMED';
            morph.warnings = [];

            if (morph.stemEntry.readings.length === 1) {
              const stemReading = morph.stemEntry.readings[0];
              const appliedRules: RuleDefinition[] = [
                RULES.lexicalResolution,
                RULES.userMorphologySelection,
                ...new Map(morph.evidence.map((item) => [item.rule.id, item.rule])).values()
              ];
              const stemCanonical = applyCanonicalIjmes(stemReading.canonical, appliedRules);
              const canonical = `${stemCanonical}-${suffix.canonicalRendering}`;

              current.status = 'USER_OVERRIDE';
              current.canonicalTransliteration = canonical;
              current.rendered = canonical;
              current.appliedRules = appliedRules;
              current.lexicalSources = stemReading.sources?.map((s) => s.citation) ?? [stemReading.source];
              current.warnings = [];
              current.alternatives = [];
              current.userDecision = decision;
              current.automaticStatus = current.automatic.status;
              current.automaticCanonical = current.automatic.canonicalTransliteration;
            } else {
              // Productive stem has lexical ambiguity
              current.status = 'AMBIGUOUS';
              current.canonicalTransliteration = null;
              current.alternatives = morph.stemEntry.readings.map((r) => r.canonical);
              current.appliedRules = [RULES.lexicalResolution, RULES.userMorphologySelection];
              current.lexicalSources = morph.stemEntry.readings.flatMap((r) => r.sources?.map((s) => s.citation) ?? [r.source]);
              current.warnings = ['Morphology competition resolved to productive segmentation; select stem reading to proceed.'];
              current.userDecision = decision;
            }
            appliedSuccessfully = true;
          }
        }
      }
    }

    if (appliedSuccessfully) {
      appliedDecisions.push(decision);
      resolvedIssueIds.add(issue.id);
    } else {
      staleDecisions.push(decision);
    }
  }

  return {
    tokens: updatedTokens,
    relations: updatedRelations,
    morphology: updatedMorphology,
    appliedDecisions,
    staleDecisions,
    resolvedIssueIds
  };
}
