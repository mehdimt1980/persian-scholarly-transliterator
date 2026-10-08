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
  /** tokenIndexes whose proposed reading could not be located in the phrase canonical. */
  unlocated: number[];
}

/**
 * Replace each edited token reading inside the phrase canonical, scanning left-to-right
 * in tokenIndex order so repeated readings are aligned positionally, not by first match.
 */
export function applyTokenReadingEdits(
  phraseCanonical: string,
  readings: PhraseTokenReadingProposal[],
  edits: Record<number, string>
): TokenEditResult {
  const ordered = [...readings].sort((a, b) => a.tokenIndex - b.tokenIndex);
  let output = '';
  let cursor = 0;
  const unlocated: number[] = [];

  for (const reading of ordered) {
    const at = phraseCanonical.indexOf(reading.canonical, cursor);
    if (at < 0) {
      if (edits[reading.tokenIndex] !== undefined && edits[reading.tokenIndex] !== reading.canonical) {
        unlocated.push(reading.tokenIndex);
      }
      continue;
    }
    const edited = edits[reading.tokenIndex];
    output += phraseCanonical.slice(cursor, at) + (edited !== undefined ? edited : reading.canonical);
    cursor = at + reading.canonical.length;
  }

  output += phraseCanonical.slice(cursor);
  return { canonical: output, unlocated };
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
): { canonical: string; unlocated: number[] } {
  if (!draft?.scholarlyCanonical) return { canonical: '', unlocated: [] };
  if (state.phraseOverride !== null) return { canonical: state.phraseOverride, unlocated: [] };
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
