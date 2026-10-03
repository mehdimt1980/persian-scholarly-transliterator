import { LEXICON } from '../../data/lexicon';
import { RULES } from '../provenance';
import { isArabicScriptLetter } from '../tokenizer';
import { LexicalEntry, Token, TokenAnalysis } from '../types';
import { PRODUCTIVE_SUFFIX_RULES } from './rules';
import { MorphemeEvidence, MorphemeSegment, MorphologicalAnalysis, MorphologicalHostEnding, ProductiveSuffixRule } from './types';

const ZWNJ = '\u200c';

interface ProposedSegmentation {
  rule: ProductiveSuffixRule;
  stem: string;
  suffixSurface: string;
  explicitIzafat: boolean;
  hasZwnj: boolean;
}

function propose(lookupForm: string): ProposedSegmentation[] {
  const proposals: ProposedSegmentation[] = [];
  for (const rule of PRODUCTIVE_SUFFIX_RULES) {
    const surfaces = rule.morphemeType === 'PLURAL_HA' ? ['های', ...rule.surfaceForms] : rule.surfaceForms;
    for (const surface of surfaces) {
      if (!lookupForm.endsWith(surface) || lookupForm === surface) continue;
      const rawStem = lookupForm.slice(0, -surface.length);
      const hasZwnj = rawStem.endsWith(ZWNJ);
      const stem = hasZwnj ? rawStem.slice(0, -1) : rawStem;
      if (!stem) continue;
      proposals.push({ rule, stem, suffixSurface: surface === 'های' ? 'ها' : surface, explicitIzafat: surface === 'های', hasZwnj });
    }
  }
  return proposals;
}

function reviewedEntry(stem: string, lexicon: LexicalEntry[]): LexicalEntry | undefined {
  return lexicon.find((entry) => entry.normalized === stem);
}

export function classifyHostEnding(entry?: LexicalEntry): MorphologicalHostEnding {
  if (!entry?.readings.length) return 'UNKNOWN';
  if (entry.normalized.endsWith('ه')) return 'HEH_FINAL';
  const classes = new Set(entry.readings.map((reading) => {
    const final = [...reading.canonical.normalize('NFC')].at(-1)?.toLocaleLowerCase('en-US');
    if (!final) return 'UNKNOWN';
    if (/[aāiīuū]/u.test(final)) return 'VOWEL_FINAL';
    return /[a-zšžčġḍḥṣṭẓʿʾ]/u.test(final) ? 'CONSONANT_FINAL' : 'UNKNOWN';
  }));
  return classes.size === 1 ? [...classes][0] : 'UNKNOWN';
}

function evidenceFor(proposal: ProposedSegmentation, hostEnding: MorphologicalHostEnding, entry?: LexicalEntry): MorphemeEvidence[] {
  const evidence: MorphemeEvidence[] = [{ kind: 'PRODUCTIVE_RULE', rule: proposal.rule.rule, description: `Matched supported suffix ${proposal.suffixSurface}.` }];
  if (proposal.hasZwnj) evidence.unshift({ kind: 'ZWNJ_BOUNDARY', rule: RULES.morphZwnjEvidence, description: 'Source orthography provides a ZWNJ immediately before the supported suffix.' });
  if (entry) evidence.push({ kind: 'REVIEWED_STEM', rule: RULES.morphStem, description: `Reviewed ${entry.category ?? 'uncategorized'} stem ${entry.normalized}.` });
  if (entry) evidence.push({ kind: 'HOST_ENDING', rule: RULES.morphHostEnding, description: `Reviewed stem evidence classifies the host as ${hostEnding}.` });
  if (proposal.explicitIzafat) evidence.push({ kind: 'EXPLICIT_IZAFAT_YE', rule: RULES.morphPluralIzafatYe, description: 'Final ی in های explicitly marks izāfat on the plural host.' });
  return evidence;
}

function surfaceSuffixStart(surface: string, proposal: ProposedSegmentation): number {
  const suffixWithIzafat = proposal.explicitIzafat ? `${proposal.suffixSurface}ی` : proposal.suffixSurface;
  return surface.lastIndexOf(suffixWithIzafat);
}

function analyzeProposal(token: Token, tokenIndex: number, orthography: TokenAnalysis, proposal: ProposedSegmentation, lexicon: LexicalEntry[]): MorphologicalAnalysis {
  const entry = reviewedEntry(proposal.stem, lexicon);
  const wholeEntry = reviewedEntry(orthography.lookupForm, lexicon);
  const hostEnding = classifyHostEnding(entry);
  const realization = proposal.rule.realizations?.find((item) => item.hostEnding === hostEnding);
  const canonicalRendering = realization?.canonicalRendering ?? proposal.rule.canonicalRendering;
  const categoryCompatible = Boolean(entry?.category && proposal.rule.hostCategories.includes(entry.category));
  const hostCompatible = Boolean(canonicalRendering);
  const boundarySupportsConfirmation = proposal.hasZwnj || proposal.rule.allowWithoutZwnj;
  const unsupported = orthography.unsupportedCombiningMarks.length > 0;
  const competingWholeWord = Boolean(wholeEntry);
  const confirmed = categoryCompatible && hostCompatible && boundarySupportsConfirmation && !unsupported && !competingWholeWord;
  const conflict = Boolean(entry && !categoryCompatible) || unsupported;
  const status = conflict ? 'CONFLICT' : confirmed ? 'CONFIRMED' : 'CANDIDATE';
  const evidence = evidenceFor(proposal, hostEnding, entry);
  if (competingWholeWord) evidence.push({ kind: 'WHOLE_WORD_READING', rule: RULES.morphWholeWordCompetition, description: `Reviewed whole-token reading competes with segmentation of ${proposal.stem}.` });
  const suffixStart = surfaceSuffixStart(token.normalizedSurface, proposal);
  const stemEnd = suffixStart > 0 && token.normalizedSurface[suffixStart - 1] === ZWNJ ? suffixStart - 1 : suffixStart;
  const stemBaseCount = [...proposal.stem].filter(isArabicScriptLetter).length;
  const stemVowelEvidence = orthography.explicitVowels.filter((item) => item.afterBaseIndex < stemBaseCount);
  const stemSegment: MorphemeSegment = {
    type: 'STEM', normalizedSurface: token.normalizedSurface.slice(0, stemEnd), normalizedStart: token.normalizedStart,
    normalizedEnd: token.normalizedStart + stemEnd, evidence: entry ? [{ kind: 'REVIEWED_STEM', rule: RULES.morphStem, description: `Validated against reviewed stem ${entry.normalized}.` }] : [], status: entry ? (categoryCompatible ? 'CONFIRMED' : 'CONFLICT') : 'CANDIDATE'
  };
  const suffixSegment: MorphemeSegment = {
    type: proposal.rule.morphemeType, normalizedSurface: proposal.suffixSurface, normalizedStart: token.normalizedStart + suffixStart,
    normalizedEnd: token.normalizedStart + suffixStart + proposal.suffixSurface.length, canonicalRendering,
    evidence: evidence.filter((item) => item.kind !== 'REVIEWED_STEM' && item.kind !== 'WHOLE_WORD_READING'), status
  };
  const warnings: string[] = [];
  if (!entry) warnings.push('Supported suffix shape found, but the proposed stem has no reviewed lexical entry.');
  else if (!categoryCompatible) warnings.push(`Reviewed stem category ${entry.category ?? 'unknown'} is incompatible with ${proposal.rule.morphemeType}.`);
  if (entry && categoryCompatible && !hostCompatible) warnings.push(`${proposal.rule.morphemeType} has no authoritative Phase 2B realization for ${hostEnding}; vowel-final and heh-final possessive allomorphs require review.`);
  if (!boundarySupportsConfirmation) warnings.push('Suffix shape lacks an explicit ZWNJ; this Phase 2B rule remains a candidate.');
  if (competingWholeWord) warnings.push('A reviewed whole-word reading competes with productive segmentation; human review is required.');
  if (unsupported) warnings.push('Unsupported combining-mark evidence prevents authoritative morphology.');
  return {
    tokenIndex, normalizedSurface: token.normalizedSurface, normalizedStart: token.normalizedStart, normalizedEnd: token.normalizedEnd,
    lexicalLookupStem: proposal.stem, stemEntry: entry, stemCategory: entry?.category, hostEnding, stemVowelEvidence,
    morphemes: [stemSegment, suffixSegment], status, explicitIzafat: proposal.explicitIzafat, evidence, warnings,
    alternatives: competingWholeWord ? ['WHOLE_WORD', 'PRODUCTIVE_SEGMENTATION'] : status === 'CANDIDATE' ? ['UNSEGMENTED', 'PRODUCTIVE_SEGMENTATION'] : []
  };
}

export function analyzeMorphology(tokens: Token[], analyses: TokenAnalysis[], lexicon: LexicalEntry[] = LEXICON): MorphologicalAnalysis[] {
  const byToken = new Map(analyses.map((analysis) => [analysis.tokenIndex, analysis]));
  const results: MorphologicalAnalysis[] = [];
  tokens.forEach((token, tokenIndex) => {
    if (token.type !== 'persian-word') return;
    const orthography = byToken.get(tokenIndex);
    if (!orthography) return;
    const wholeEntry = reviewedEntry(orthography.lookupForm, lexicon);
    const candidates = propose(orthography.lookupForm).map((proposal) => analyzeProposal(token, tokenIndex, orthography, proposal, lexicon))
      .filter((candidate) => candidate.stemEntry || !wholeEntry);
    if (!candidates.length) return;
    const ranked = candidates.sort((left, right) => {
      const rank = { CONFIRMED: 2, CONFLICT: 1, CANDIDATE: 0 };
      return rank[right.status] - rank[left.status] || right.lexicalLookupStem.length - left.lexicalLookupStem.length;
    });
    results.push(ranked[0]);
  });
  return results;
}
