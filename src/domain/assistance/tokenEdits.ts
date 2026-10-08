/**
 * Phase 8A: pure helpers for the token-by-token draft editor and the
 * "Why this reading?" AI explanation. No React, no network.
 *
 * Invariants:
 *   - Token alignment is by authoritative tokenIndex from the resolver request.
 *   - Edits never mutate the AI resolution; they produce a new canonical string.
 *   - Final validation + profile rendering remain in createAcceptedPhraseDecision.
 */

import type { TransliterationResult } from '../types';
import type { PhraseResolution, PhraseTokenReadingProposal } from './phraseTypes';

export interface TokenEditResult {
  canonical: string;
  /** tokenIndexes whose requested edits could not be safely applied. */
  unlocated: number[];
  alignment: TokenPhraseAlignment;
}

export type TokenPhraseAlignmentStatus = 'ALIGNED' | 'AMBIGUOUS' | 'UNALIGNED';

export interface TokenPhraseSpan {
  tokenIndex: number;
  start: number;
  end: number;
}

export interface TokenPhraseAlignment {
  status: TokenPhraseAlignmentStatus;
  spans: TokenPhraseSpan[];
  warning: string | null;
}

const LEXICAL_CHARACTER = /[\p{L}\p{M}ʾʿ]/u;
const NON_LEXICAL_GAP = /^[\s\p{P}\p{S}]*$/u;
const STRUCTURAL_GAP = /^(?:-[\p{L}\p{M}ʾʿ]+)*[\s\p{P}\p{S}]*$/u;

function hasLexicalBoundary(text: string, start: number, end: number): boolean {
  return (start === 0 || !LEXICAL_CHARACTER.test(text[start - 1])) &&
    (end === text.length || !LEXICAL_CHARACTER.test(text[end]));
}

function candidateStarts(phrase: string, canonical: string): number[] {
  if (!canonical) return [];
  const phraseFolded = phrase.toLocaleLowerCase('en-US');
  const canonicalFolded = canonical.toLocaleLowerCase('en-US');
  const starts: number[] = [];
  let cursor = 0;
  while (cursor <= phraseFolded.length - canonicalFolded.length) {
    const start = phraseFolded.indexOf(canonicalFolded, cursor);
    if (start < 0) break;
    const end = start + canonical.length;
    if (hasLexicalBoundary(phrase, start, end)) starts.push(start);
    cursor = start + 1;
  }
  return starts;
}

/**
 * Establish one global, order-preserving alignment. Every lexical part of the phrase
 * must be accounted for by a reading or by a hyphen-attached suffix/izafat segment.
 * Multiple valid mappings fail closed instead of selecting the first substring hit.
 */
export function alignTokenReadings(
  phraseCanonical: string,
  readings: PhraseTokenReadingProposal[]
): TokenPhraseAlignment {
  const ordered = [...readings].sort((a, b) => a.tokenIndex - b.tokenIndex);
  if (ordered.length === 0) {
    return {
      status: phraseCanonical.trim() ? 'UNALIGNED' : 'ALIGNED',
      spans: [],
      warning: phraseCanonical.trim()
        ? 'No token readings were supplied for this phrase. Use full-phrase editing.'
        : null
    };
  }

  const candidates = ordered.map((reading) => candidateStarts(phraseCanonical, reading.canonical));
  const solutions: TokenPhraseSpan[][] = [];

  function visit(readingIndex: number, cursor: number, spans: TokenPhraseSpan[]): void {
    if (solutions.length > 1) return;
    if (readingIndex === ordered.length) {
      if (STRUCTURAL_GAP.test(phraseCanonical.slice(cursor))) solutions.push(spans);
      return;
    }

    const reading = ordered[readingIndex];
    for (const start of candidates[readingIndex]) {
      if (start < cursor) continue;
      const gap = phraseCanonical.slice(cursor, start);
      const gapAllowed = readingIndex === 0 ? NON_LEXICAL_GAP.test(gap) : STRUCTURAL_GAP.test(gap);
      if (!gapAllowed) continue;
      const end = start + reading.canonical.length;
      visit(readingIndex + 1, end, [...spans, { tokenIndex: reading.tokenIndex, start, end }]);
    }
  }

  visit(0, 0, []);
  if (solutions.length === 1) return { status: 'ALIGNED', spans: solutions[0], warning: null };
  if (solutions.length > 1) {
    return {
      status: 'AMBIGUOUS',
      spans: [],
      warning: 'Token readings match the phrase in more than one valid way. Use full-phrase editing.'
    };
  }
  return {
    status: 'UNALIGNED',
    spans: [],
    warning: 'Token readings do not align exactly with the phrase canonical. Use full-phrase editing.'
  };
}

/**
 * Replace edited token readings only after a unique global alignment is established.
 */
export function applyTokenReadingEdits(
  phraseCanonical: string,
  readings: PhraseTokenReadingProposal[],
  edits: Record<number, string>
): TokenEditResult {
  const ordered = [...readings].sort((a, b) => a.tokenIndex - b.tokenIndex);
  const alignment = alignTokenReadings(phraseCanonical, ordered);
  const requested = ordered.filter(
    (reading) => edits[reading.tokenIndex] !== undefined && edits[reading.tokenIndex] !== reading.canonical
  );
  if (alignment.status !== 'ALIGNED') {
    return {
      canonical: phraseCanonical,
      unlocated: requested.map((reading) => reading.tokenIndex),
      alignment
    };
  }

  let output = '';
  let cursor = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const reading = ordered[index];
    const span = alignment.spans[index];
    const edited = edits[reading.tokenIndex];
    output += phraseCanonical.slice(cursor, span.start) +
      (edited !== undefined ? edited : phraseCanonical.slice(span.start, span.end));
    cursor = span.end;
  }

  output += phraseCanonical.slice(cursor);
  return { canonical: output, unlocated: [], alignment };
}

export interface TokenEditorState {
  open: boolean;
  /** tokenIndex -> edited canonical reading */
  tokenEdits: Record<number, string>;
  /** Direct phrase-level edit; supersedes token edits until reset. */
  phraseOverride: string | null;
}

export const INITIAL_TOKEN_EDITOR_STATE: TokenEditorState = {
  open: false,
  tokenEdits: {},
  phraseOverride: null
};

export type TokenEditorAction =
  | { type: 'OPEN' }
  | { type: 'CLOSE' }
  | { type: 'EDIT_TOKEN'; tokenIndex: number; value: string }
  | { type: 'EDIT_PHRASE'; value: string }
  | { type: 'RESET' };

export function tokenEditorReducer(state: TokenEditorState, action: TokenEditorAction): TokenEditorState {
  switch (action.type) {
    case 'OPEN':
      return { ...state, open: true };
    case 'CLOSE':
      return { ...INITIAL_TOKEN_EDITOR_STATE };
    case 'EDIT_TOKEN':
      return {
        ...state,
        phraseOverride: null,
        tokenEdits: { ...state.tokenEdits, [action.tokenIndex]: action.value }
      };
    case 'EDIT_PHRASE':
      return { ...state, tokenEdits: {}, phraseOverride: action.value };
    case 'RESET':
      return { ...INITIAL_TOKEN_EDITOR_STATE, open: state.open };
    default:
      return state;
  }
}

export function computeEditedCanonical(
  draft: PhraseResolution | null,
  state: TokenEditorState
): TokenEditResult {
  if (!draft?.scholarlyCanonical) {
    return {
      canonical: '',
      unlocated: [],
      alignment: { status: 'UNALIGNED', spans: [], warning: 'No AI draft is available to align.' }
    };
  }
  if (state.phraseOverride !== null) {
    return {
      canonical: state.phraseOverride,
      unlocated: [],
      alignment: { status: 'ALIGNED', spans: [], warning: null }
    };
  }
  return applyTokenReadingEdits(draft.scholarlyCanonical, draft.tokenReadings, state.tokenEdits);
}

export interface TokenExplanationRow {
  tokenIndex: number;
  surface: string;
  proposedReading: string;
  note: string;
  deterministicStatus: string;
  /** True when a deterministic canonical exists and must not be overridden. */
  locked: boolean;
  lexicalSources: string[];
  alternatives: string[];
}

export interface AiExplanation {
  rationale: string;
  basis: string;
  disposition: PhraseResolution['disposition'];
  assumptions: string[];
  warnings: string[];
  tokens: TokenExplanationRow[];
  provenance: {
    provider: string;
    model: string;
    promptVersion: string;
    /** Model self-estimate; not an empirically validated accuracy score. */
    modelEstimate: number | null;
  };
}

export function buildAiExplanation(
  result: TransliterationResult,
  draft: PhraseResolution | null
): AiExplanation | null {
  if (!draft) return null;
  const tokens: TokenExplanationRow[] = draft.tokenReadings.map((reading) => {
    const token = result.tokens[reading.tokenIndex];
    return {
      tokenIndex: reading.tokenIndex,
      surface: reading.surface,
      proposedReading: reading.canonical,
      note: reading.note,
      deterministicStatus: token?.status ?? 'UNKNOWN',
      locked: Boolean(token?.canonicalTransliteration),
      lexicalSources: token ? [...token.lexicalSources] : [],
      alternatives: token ? [...token.alternatives] : []
    };
  });
  return {
    rationale: draft.rationale,
    basis: draft.basis.replaceAll('_', ' ').toLowerCase(),
    disposition: draft.disposition,
    assumptions: [...draft.assumptions],
    warnings: [...(draft.warnings ?? [])],
    tokens,
    provenance: {
      provider: draft.provider,
      model: draft.model,
      promptVersion: draft.promptVersion,
      modelEstimate: draft.confidence
    }
  };
}
