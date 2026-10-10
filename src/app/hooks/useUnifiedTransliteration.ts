'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { transliterate } from '../../domain/engine';
import {
  AcceptedPhraseDecision,
  AiExplanation,
  INITIAL_TOKEN_EDITOR_STATE,
  PhraseResolution,
  UnifiedOutputViewModel,
  buildAiExplanation,
  buildPhraseResolverRequest,
  checkAcceptedPhraseApplicability,
  computeEditedCanonical,
  computePhraseReadingFingerprintV3,
  createAcceptedPhraseDecision,
  resolveUnifiedOutput,
  tokenEditorReducer
} from '../../domain/assistance';
import { renderScholarlyCanonical } from '../../domain/presentation';
import type { PresentationProfile, ScholarlyRenderingResult } from '../../domain/presentation';
import type { PhraseContextKind } from '../../domain/assistance';
import type { ProfileId, ReviewDecision, TransliterationResult } from '../../domain/types';
import {
  DraftStatus,
  PhraseDraftController,
  deriveDraftView
} from '../../client/assistance/phraseDraftController';

export type PhraseAssistStatus = DraftStatus;

export interface UseUnifiedTransliterationProps {
  input: string;
  profile: ProfileId;
  semanticContext: PhraseContextKind;
  presentationProfile: PresentationProfile;
  reviewDecisions: ReviewDecision[];
  acceptedPhraseDecision: AcceptedPhraseDecision | null;
  onAcceptedDecision: (decision: AcceptedPhraseDecision | null) => void;
  debounceMs?: number;
}

export interface UseUnifiedTransliterationReturn {
  result: TransliterationResult;
  unifiedOutput: UnifiedOutputViewModel;
  assistStatus: PhraseAssistStatus;
  /** True while a request for the current input is running (initial or regenerate). */
  requestInFlight: boolean;
  assistError: string | null;
  isAiConfigured: boolean | null;
  autoAssistEnabled: boolean;
  aiDraft: PhraseResolution | null;
  explanation: AiExplanation | null;
  editorOpen: boolean;
  tokenEdits: Record<number, string>;
  editedCanonical: string;
  editedRendered: string;
  unlocatedTokens: number[];
  alignmentWarning: string | null;
  canAcceptEditedDraft: boolean;
  actionError: string | null;
  presentationRendering: ScholarlyRenderingResult | null;

  toggleAutoAssist: () => void;
  regenerate: () => void;
  openEditor: () => void;
  closeEditor: () => void;
  editToken: (tokenIndex: number, value: string) => void;
  editPhrase: (value: string) => void;
  resetEdits: () => void;
  acceptCurrentDraft: () => void;
  acceptEditedDraft: () => void;
  rejectCurrentDraft: () => void;
  revokeAccepted: () => void;
}

const DEFAULT_DEBOUNCE_MS = 900;

export function useUnifiedTransliteration({
  input,
  profile,
  semanticContext,
  presentationProfile,
  reviewDecisions,
  acceptedPhraseDecision,
  onAcceptedDecision,
  debounceMs = DEFAULT_DEBOUNCE_MS
}: UseUnifiedTransliterationProps): UseUnifiedTransliterationReturn {
  const controllerRef = useRef<PhraseDraftController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new PhraseDraftController({
      debounceMs,
      fetchImpl: (url, init) => fetch(url, init)
    });
    // Main workspace is strictly user-triggered: no AI call on mount, typing or profile changes.
    controllerRef.current.setAutoEnabled(false);
  }
  const controller = controllerRef.current;

  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const view = useMemo(() => deriveDraftView(snapshot), [snapshot]);

  const [editor, dispatch] = useReducer(tokenEditorReducer, INITIAL_TOKEN_EDITOR_STATE);
  const [actionError, setActionError] = useState<string | null>(null);

  const result = useMemo(
    () => transliterate(input, profile, reviewDecisions),
    [input, profile, reviewDecisions]
  );

  const eligible = useMemo(
    () =>
      !result.copyable &&
      result.reviewIssues.length > 0 &&
      result.tokens.some((token) => token.tokenType === 'persian-word'),
    [result]
  );

  // Client-side V3 reading identity excludes rendering-only profile/output fields.
  const cacheId = useMemo(
    () => computePhraseReadingFingerprintV3(buildPhraseResolverRequest(result, undefined, semanticContext), 'client-draft-cache', 'v3'),
    [result, semanticContext]
  );

  const payload = useMemo(
    () => ({
      input: result.originalInput,
      profile: result.profile,
      contextKind: semanticContext,
      reviewDecisions: reviewDecisions.map((d) => ({
        issueId: d.issueId,
        action: d.action,
        selectedAlternativeId: d.selectedAlternativeId,
        manualCanonicalTransliteration: d.manualCanonicalTransliteration,
        note: d.note
      }))
    }),
    [result.originalInput, result.profile, semanticContext, reviewDecisions]
  );

  // Feed context to the controller.
  useEffect(() => {
    controller.setContext({ cacheId, eligible, payload });
  }, [controller, cacheId, eligible, payload]);

  // Configuration status.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/assist/status')
      .then(async (response) => {
        if (!response.ok) throw new Error('Assistance status endpoint is unavailable.');
        return response.json();
      })
      .then((data) => {
        if (!cancelled) controller.setConfigured(Boolean(data.configured));
      })
      .catch(() => {
        if (!cancelled) controller.setConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [controller]);

  useEffect(() => () => controller.destroy(), [controller]);

  // Close the editor whenever the identity changes.
  useEffect(() => {
    dispatch({ type: 'CLOSE' });
  }, [cacheId]);

  // Stale accepted-decision invalidation (existing fingerprint rules).
  useEffect(() => {
    if (acceptedPhraseDecision && !checkAcceptedPhraseApplicability(acceptedPhraseDecision, result, semanticContext).applicable) {
      onAcceptedDecision(null);
    }
  }, [acceptedPhraseDecision, result, semanticContext, onAcceptedDecision]);

  const aiDraft = view.draft;
  const selectedOutput = useMemo(
    () => resolveUnifiedOutput(result, acceptedPhraseDecision, aiDraft, semanticContext),
    [result, acceptedPhraseDecision, aiDraft, semanticContext]
  );
  const presentationRendering = useMemo(() => selectedOutput.scholarlyCanonical
    ? renderScholarlyCanonical(selectedOutput.scholarlyCanonical, presentationProfile, { contentCategory: semanticContext })
    : null, [selectedOutput.scholarlyCanonical, presentationProfile, semanticContext]);
  const unifiedOutput = useMemo<UnifiedOutputViewModel>(() => {
    if (!presentationRendering) return selectedOutput;
    if (presentationRendering.ok && presentationRendering.output !== null) {
      return { ...selectedOutput, primary: presentationRendering.output, profileRendering: presentationRendering.output };
    }
    return {
      ...selectedOutput,
      primary: '',
      profileRendering: null,
      isCopyableDraft: false,
      isVerifiedCopyable: false,
      isHumanAcceptedCopyable: false,
      badgeLabel: 'Rendering blocked',
      badgeTone: 'blocked',
      noticeText: presentationRendering.diagnostics.map((item) => item.message).join(' ')
    };
  }, [selectedOutput, presentationRendering]);
  const explanation = useMemo(() => buildAiExplanation(result, aiDraft), [result, aiDraft]);

  const edited = useMemo(() => computeEditedCanonical(aiDraft, editor), [aiDraft, editor]);
  const editedRendered = useMemo(
    () => {
      if (!edited.canonical.trim()) return '';
      return renderScholarlyCanonical(edited.canonical, presentationProfile, { contentCategory: semanticContext }).output ?? '';
    },
    [edited.canonical, presentationProfile, semanticContext]
  );

  const accept = useCallback(
    (canonical: string) => {
      if (!aiDraft) return;
      try {
        const decision = createAcceptedPhraseDecision(aiDraft, result, canonical, undefined, undefined, semanticContext);
        onAcceptedDecision(decision);
        dispatch({ type: 'CLOSE' });
        setActionError(null);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Unable to accept this phrase resolution.');
      }
    },
    [aiDraft, result, semanticContext, onAcceptedDecision, setActionError]
  );

  return {
    result,
    unifiedOutput,
    assistStatus: view.status,
    requestInFlight: view.requestInFlight,
    assistError: view.error,
    isAiConfigured: snapshot.configured,
    autoAssistEnabled: snapshot.autoEnabled,
    aiDraft,
    explanation,
    editorOpen: editor.open,
    tokenEdits: editor.tokenEdits,
    editedCanonical: edited.canonical,
    editedRendered,
    unlocatedTokens: edited.unlocated,
    alignmentWarning: edited.alignment.warning,
    canAcceptEditedDraft: edited.unlocated.length === 0,
    actionError,
    presentationRendering,

    toggleAutoAssist: () => controller.setAutoEnabled(!snapshot.autoEnabled),
    regenerate: () => controller.regenerate(),
    openEditor: () => dispatch({ type: 'OPEN' }),
    closeEditor: () => dispatch({ type: 'CLOSE' }),
    editToken: (tokenIndex, value) => dispatch({ type: 'EDIT_TOKEN', tokenIndex, value }),
    editPhrase: (value) => dispatch({ type: 'EDIT_PHRASE', value }),
    resetEdits: () => dispatch({ type: 'RESET' }),
    acceptCurrentDraft: () => aiDraft?.scholarlyCanonical && accept(aiDraft.scholarlyCanonical),
    acceptEditedDraft: () => {
      if (edited.unlocated.length > 0) {
        setActionError('Requested token edits remain unapplied. Review and edit the full phrase before accepting.');
        return;
      }
      accept(edited.canonical);
    },
    rejectCurrentDraft: () => {
      controller.reject();
      dispatch({ type: 'CLOSE' });
      setActionError(null);
    },
    revokeAccepted: () => onAcceptedDecision(null)
  };
}
