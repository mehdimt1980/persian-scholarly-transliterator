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
  remainingIssues: ReviewIssue[];
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
  const updatedTokens = tokenResults.map((t) => ({ ...t, appliedRules: [...t.appliedRules], lexicalSources: [...t.lexicalSources], warnings: [...t.warnings], alternatives: [...t.alternatives] }));
  const updatedRelations = relations.map((r) => ({ ...r, evidence: [...r.evidence], warnings: [...r.warnings] }));
  const updatedMorphology = morphologies.map((m) => ({ ...m, evidence: [...m.evidence], warnings: [...m.warnings], alternatives: [...m.alternatives] }));

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

    let appliedSuccessfully = false;

    // 1. Manual canonical override
    if (decision.action === 'MANUAL_CANONICAL_OVERRIDE') {
      const validation = validateManualTransliteration(decision.manualCanonicalTransliteration);
      if (validation.valid && validation.normalized) {
        const tokenIndex = issue.tokenIndexes[0];
        if (tokenIndex !== undefined && updatedTokens[tokenIndex]) {
          const current = updatedTokens[tokenIndex];
          const manualValue = validation.normalized;
          current.automaticStatus = current.automaticStatus ?? current.status;
          current.automaticCanonical = current.automaticCanonical ?? current.canonicalTransliteration;
          current.status = 'USER_OVERRIDE';
          current.canonicalTransliteration = manualValue;
          current.rendered = manualValue;
          current.appliedRules = [RULES.consonantalScaffold, RULES.userManualCanonicalOverride];
          current.lexicalSources = ['User manual override (session-scoped)'];
          current.warnings = decision.note ? [`Note: ${decision.note}`] : [];
          current.alternatives = [];
          current.userDecision = decision;
          appliedSuccessfully = true;
        }
      }
    }

    // 2. Select lexical reading
    else if (decision.action === 'SELECT_LEXICAL_READING') {
      const tokenIndex = issue.tokenIndexes[0];
      const entry = entries[tokenIndex];
      if (tokenIndex !== undefined && updatedTokens[tokenIndex] && entry) {
        const selectedId = decision.selectedAlternativeId;
        const selectedCanonical = decision.manualCanonicalTransliteration;
        const reading = entry.readings.find((r) => r.id === selectedId || r.canonical === selectedId || r.canonical === selectedCanonical);
        if (reading) {
          const current = updatedTokens[tokenIndex];
          const appliedRules: RuleDefinition[] = [RULES.lexicalResolution, RULES.userLexicalReadingSelection];
          const canonical = applyCanonicalIjmes(reading.canonical, appliedRules);

          current.automaticStatus = current.automaticStatus ?? current.status;
          current.automaticCanonical = current.automaticCanonical ?? current.canonicalTransliteration;
          current.status = 'USER_OVERRIDE';
          current.canonicalTransliteration = canonical;
          current.rendered = canonical;
          current.appliedRules = appliedRules;
          current.lexicalSources = reading.sources?.map((s) => s.citation) ?? [reading.source];
          current.warnings = reading.notes ? [reading.notes] : [];
          current.alternatives = [];
          current.userDecision = decision;
          appliedSuccessfully = true;
        }
      }
    }

    // 3. Accept izafat
    else if (decision.action === 'ACCEPT_IZAFAT') {
      const sourceIndex = issue.tokenIndexes[0];
      const targetIndex = issue.tokenIndexes[1];
      const relation = updatedRelations.find((r) => r.sourceTokenIndex === sourceIndex && r.targetTokenIndex === targetIndex);
      if (relation) {
        relation.status = 'CONFIRMED';
        relation.rendering = 'STANDARD_I';
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

    // 4. Reject izafat
    else if (decision.action === 'REJECT_IZAFAT') {
      const sourceIndex = issue.tokenIndexes[0];
      const targetIndex = issue.tokenIndexes[1];
      const relationIndex = updatedRelations.findIndex((r) => r.sourceTokenIndex === sourceIndex && r.targetTokenIndex === targetIndex);
      if (relationIndex !== -1) {
        const relation = updatedRelations[relationIndex];
        relation.evidence.push({
          kind: 'USER_DECISION',
          rule: RULES.userIzafatReject,
          source: 'Rejected by human review session'
        });
        relation.warnings = [];
        relation.userDecision = decision;
        // Mark as rejected so it won't be rendered as -i
        (relation as unknown as { rejected: boolean }).rejected = true;
        appliedSuccessfully = true;
      }
    }

    // 5. Select morphology
    else if (decision.action === 'SELECT_MORPHOLOGY') {
      const tokenIndex = issue.tokenIndexes[0];
      const morph = updatedMorphology.find((m) => m.tokenIndex === tokenIndex);
      const current = updatedTokens[tokenIndex];
      const lookupForm = analyses[tokenIndex]?.lookupForm ?? tokens[tokenIndex]?.normalizedSurface;
      const wholeEntry = lexicon.findByNormalized(lookupForm);

      if (tokenIndex !== undefined && current && morph) {
        if (decision.selectedAlternativeId === 'WHOLE_WORD' && wholeEntry && wholeEntry.readings.length > 0) {
          const appliedRules: RuleDefinition[] = [RULES.lexicalResolution, RULES.userMorphologySelection];
          const canonical = applyCanonicalIjmes(wholeEntry.readings[0].canonical, appliedRules);

          current.automaticStatus = current.automaticStatus ?? current.status;
          current.automaticCanonical = current.automaticCanonical ?? current.canonicalTransliteration;
          current.status = 'USER_OVERRIDE';
          current.canonicalTransliteration = canonical;
          current.rendered = canonical;
          current.appliedRules = appliedRules;
          current.lexicalSources = wholeEntry.readings[0].sources?.map((s) => s.citation) ?? [wholeEntry.readings[0].source];
          current.warnings = [];
          current.alternatives = [];
          current.userDecision = decision;

          morph.status = 'CONFIRMED';
          morph.warnings = [];
          appliedSuccessfully = true;
        } else if (decision.selectedAlternativeId === 'PRODUCTIVE_SEGMENTATION' && morph.stemEntry) {
          const suffix = morph.morphemes.find((item) => item.type !== 'STEM');
          const stemReading = morph.stemEntry.readings[0];
          if (stemReading && suffix && suffix.canonicalRendering) {
            const appliedRules: RuleDefinition[] = [RULES.lexicalResolution, RULES.userMorphologySelection, ...new Map(morph.evidence.map((item) => [item.rule.id, item.rule])).values()];
            const stemCanonical = applyCanonicalIjmes(stemReading.canonical, appliedRules);
            const canonical = `${stemCanonical}-${suffix.canonicalRendering}`;

            current.automaticStatus = current.automaticStatus ?? current.status;
            current.automaticCanonical = current.automaticCanonical ?? current.canonicalTransliteration;
            current.status = 'USER_OVERRIDE';
            current.canonicalTransliteration = canonical;
            current.rendered = canonical;
            current.appliedRules = appliedRules;
            current.lexicalSources = stemReading.sources?.map((s) => s.citation) ?? [stemReading.source];
            current.warnings = [];
            current.alternatives = [];
            current.userDecision = decision;

            morph.status = 'CONFIRMED';
            morph.warnings = [];
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

  const remainingIssues = issues.filter((i) => !resolvedIssueIds.has(i.id));

  return {
    tokens: updatedTokens,
    relations: updatedRelations,
    morphology: updatedMorphology,
    appliedDecisions,
    staleDecisions,
    remainingIssues
  };
}
