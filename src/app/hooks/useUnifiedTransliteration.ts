'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { transliterate } from '../../domain/engine';
import { renderCanonicalForProfile } from '../../domain/profiles';
import {
  AcceptedPhraseDecision,
  PhraseResolution,
  UnifiedOutputViewModel,
  buildPhraseResolverRequest,
  checkAcceptedPhraseApplicability,
  computePhraseRequestFingerprint,
  createAcceptedPhraseDecision,
  resolveUnifiedOutput
} from '../../domain/assistance';
import type { ProfileId, ReviewDecision, TransliterationResult } from '../../domain/types';

export type PhraseAssistStatus =
  | 'idle'
  | 'loading'
  | 'available'
  | 'error'
  | 'unavailable'
  | 'rejected';

export interface UseUnifiedTransliterationProps {
  input: string;
  profile: ProfileId;
  reviewDecisions: ReviewDecision[];
  acceptedPhraseDecision: AcceptedPhraseDecision | null;
  onAcceptedDecision: (decision: AcceptedPhraseDecision | null) => void;
  debounceMs?: number;
}

export interface UseUnifiedTransliterationReturn {
  result: TransliterationResult;
  unifiedOutput: UnifiedOutputViewModel;
  assistStatus: PhraseAssistStatus;
  assistError: string | null;
  isAiConfigured: boolean | null;
  autoAssistEnabled: boolean;
  isExpanded: boolean;
  editing: boolean;
  canonicalDraft: string;
  renderedDraft: string;
  aiDraft: PhraseResolution | null;
  requestKey: string;
  requestFingerprint: string;

  // Actions
  setAutoAssistEnabled: (enabled: boolean) => void;
  toggleAutoAssist: () => void;
  setIsExpanded: (expanded: boolean) => void;
  toggleExpanded: () => void;
  setCanonicalDraft: (draft: string) => void;
  setRenderedDraft: (draft: string) => void;
  toggleEditing: () => void;
  requestAssistance: () => Promise<void>;
  acceptCurrentDraft: () => void;
  acceptCustomDraft: (canonical: string, rendered?: string) => void;
  rejectCurrentDraft: () => void;
}

const DEFAULT_DEBOUNCE_MS = 900;

export function useUnifiedTransliteration({
  input,
  profile,
  reviewDecisions,
  acceptedPhraseDecision,
  onAcceptedDecision,
  debounceMs = DEFAULT_DEBOUNCE_MS
}: UseUnifiedTransliterationProps): UseUnifiedTransliterationReturn {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [autoAssistEnabled, setAutoAssistEnabled] = useState<boolean>(true);
  const [assistStatus, setAssistStatus] = useState<PhraseAssistStatus>('idle');
  const [aiDraft, setAiDraft] = useState<PhraseResolution | null>(null);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [editing, setEditing] = useState<boolean>(false);
  const [canonicalDraft, setCanonicalDraft] = useState<string>('');
  const [renderedDraft, setRenderedDraft] = useState<string>('');

  // Resolution cache by requestFingerprint to prevent duplicate network calls
  const resolutionCacheRef = useRef<Map<string, PhraseResolution>>(new Map());
  const requestSequenceRef = useRef<number>(0);
  const inFlightAbortRef = useRef<AbortController | null>(null);

  // Deterministic transliteration evaluation
  const result = useMemo(
    () => transliterate(input, profile, reviewDecisions),
    [input, profile, reviewDecisions]
  );

  const eligibleForAssistance = useMemo(() => {
    if (result.copyable) return false;
    const hasPersianWord = result.tokens.some((token) => token.tokenType === 'persian-word');
    return hasPersianWord && result.reviewIssues.length > 0;
  }, [result.copyable, result.tokens, result.reviewIssues.length]);

  const requestKey = useMemo(
    () => [
      result.normalizedInput,
      result.profile,
      result.status,
      result.reviewIssues.map((issue) => issue.id).sort().join(','),
      reviewDecisions.map((decision) => [
        decision.issueId,
        decision.action,
        decision.selectedAlternativeId ?? '',
        decision.manualCanonicalTransliteration ?? '',
        decision.note ?? ''
      ].join(':')).sort().join(',')
    ].join('::'),
    [result.normalizedInput, result.profile, result.status, result.reviewIssues, reviewDecisions]
  );

  const requestFingerprint = useMemo(() => {
    const resolverReq = buildPhraseResolverRequest(result);
    return computePhraseRequestFingerprint(resolverReq, 'openai', 'default');
  }, [result]);

  // Unified Output View Model calculation (pure precedence)
  const unifiedOutput = useMemo(
    () => resolveUnifiedOutput(result, acceptedPhraseDecision, aiDraft),
    [result, acceptedPhraseDecision, aiDraft]
  );

  // Check configuration status on mount
  useEffect(() => {
    let cancelled = false;
    fetch('/api/assist/status')
      .then(async (response) => {
        if (!response.ok) throw new Error('Assistance status endpoint is unavailable.');
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setConfigured(Boolean(data.configured));
      })
      .catch(() => {
        if (!cancelled) setConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync draft strings when active AI draft changes
  useEffect(() => {
    if (aiDraft?.scholarlyCanonical) {
      setCanonicalDraft(aiDraft.scholarlyCanonical);
      setRenderedDraft(aiDraft.renderedOutput ?? '');
    }
  }, [aiDraft]);

  // Handle input / key changes: check cache, reset stale drafts, invalidate stale accepted decisions
  useEffect(() => {
    // Invalidate stale accepted decisions if applicable
    if (acceptedPhraseDecision) {
      const { applicable } = checkAcceptedPhraseApplicability(acceptedPhraseDecision, result);
      if (!applicable) {
        onAcceptedDecision(null);
      }
    }

    // Check if we already have a cached resolution for this exact fingerprint
    const cached = resolutionCacheRef.current.get(requestFingerprint);
    if (cached) {
      setAiDraft(cached);
      setAssistStatus('available');
      setAssistError(null);
      setCanonicalDraft(cached.scholarlyCanonical ?? '');
      setRenderedDraft(cached.renderedOutput ?? '');
      return;
    }

    // Clear previous un-cached draft on input change
    setAiDraft(null);
    setCanonicalDraft('');
    setRenderedDraft('');
    setEditing(false);
    setAssistError(null);
    setAssistStatus('idle');
  }, [requestKey, requestFingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

  // Execute actual assist fetch
  const executeFetch = useCallback(
    async (manual: boolean = false) => {
      if (!eligibleForAssistance) return;

      // Abort previous in-flight request if still running
      if (inFlightAbortRef.current) {
        inFlightAbortRef.current.abort();
        inFlightAbortRef.current = null;
      }

      const controller = new AbortController();
      inFlightAbortRef.current = controller;
      const currentSequence = ++requestSequenceRef.current;

      setAssistStatus('loading');
      setAssistError(null);
      if (manual) {
        setIsExpanded(true);
      }

      try {
        const response = await fetch('/api/assist/phrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: result.originalInput,
            profile: result.profile,
            reviewDecisions: reviewDecisions.map((d) => ({
              issueId: d.issueId,
              action: d.action,
              selectedAlternativeId: d.selectedAlternativeId,
              manualCanonicalTransliteration: d.manualCanonicalTransliteration,
              note: d.note
            }))
          }),
          signal: controller.signal
        });

        if (currentSequence !== requestSequenceRef.current) {
          // Out of order response; discard
          return;
        }

        const data = await response.json();
        if (!response.ok) {
          if (response.status === 503) {
            setConfigured(false);
            setAssistStatus('unavailable');
          } else if (response.status === 409) {
            setAssistStatus('idle');
          } else {
            setAssistStatus('error');
          }
          setAssistError(data.message || data.error || 'Phrase assistance request failed.');
          return;
        }

        const resolution = data.resolution as PhraseResolution;
        // Store in fingerprint cache
        if (resolution.requestFingerprint) {
          resolutionCacheRef.current.set(resolution.requestFingerprint, resolution);
        }

        setAiDraft(resolution);
        setCanonicalDraft(resolution.scholarlyCanonical ?? '');
        setRenderedDraft(resolution.renderedOutput ?? '');
        setAssistStatus('available');
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (currentSequence === requestSequenceRef.current) {
          setAssistStatus('error');
          setAssistError(err instanceof Error ? err.message : 'Network error during phrase resolution.');
        }
      } finally {
        if (inFlightAbortRef.current === controller) {
          inFlightAbortRef.current = null;
        }
      }
    },
    [eligibleForAssistance, result.originalInput, result.profile, reviewDecisions]
  );

  // Automatic debounced invocation (~900ms)
  useEffect(() => {
    if (!autoAssistEnabled) return;
    if (configured === false) return;
    if (!eligibleForAssistance) return;
    if (assistStatus === 'rejected') return;

    // If already cached or active, do nothing
    if (aiDraft && aiDraft.requestFingerprint === requestFingerprint) return;

    const timer = setTimeout(() => {
      executeFetch(false);
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [
    autoAssistEnabled,
    configured,
    eligibleForAssistance,
    assistStatus,
    requestKey,
    requestFingerprint,
    debounceMs,
    executeFetch,
    aiDraft
  ]);

  // Clean up in-flight abort controller on unmount
  useEffect(() => {
    return () => {
      if (inFlightAbortRef.current) {
        inFlightAbortRef.current.abort();
      }
    };
  }, []);

  const requestAssistance = useCallback(async () => {
    await executeFetch(true);
  }, [executeFetch]);

  const acceptCurrentDraft = useCallback(() => {
    if (!aiDraft || !aiDraft.scholarlyCanonical) return;
    try {
      const decision = createAcceptedPhraseDecision(
        aiDraft,
        result,
        canonicalDraft || aiDraft.scholarlyCanonical,
        renderedDraft || aiDraft.renderedOutput || undefined
      );
      onAcceptedDecision(decision);
      setEditing(false);
      setAssistError(null);
    } catch (err) {
      setAssistError(err instanceof Error ? err.message : 'Unable to accept this phrase resolution.');
    }
  }, [aiDraft, result, canonicalDraft, renderedDraft, onAcceptedDecision]);

  const acceptCustomDraft = useCallback(
    (canonical: string, rendered?: string) => {
      if (!aiDraft) return;
      try {
        const decision = createAcceptedPhraseDecision(
          aiDraft,
          result,
          canonical,
          rendered
        );
        onAcceptedDecision(decision);
        setEditing(false);
        setAssistError(null);
      } catch (err) {
        setAssistError(err instanceof Error ? err.message : 'Unable to accept this phrase resolution.');
      }
    },
    [aiDraft, result, onAcceptedDecision]
  );

  const rejectCurrentDraft = useCallback(() => {
    setAiDraft(null);
    setCanonicalDraft('');
    setRenderedDraft('');
    setEditing(false);
    setAssistError(null);
    setAssistStatus('rejected');
    setIsExpanded(false);
    onAcceptedDecision(null);
  }, [onAcceptedDecision]);

  const toggleEditing = useCallback(() => {
    if (editing) {
      setCanonicalDraft(aiDraft?.scholarlyCanonical ?? '');
      setRenderedDraft(aiDraft?.renderedOutput ?? '');
      setEditing(false);
      return;
    }
    setEditing(true);
  }, [editing, aiDraft]);

  const toggleAutoAssist = useCallback(() => {
    setAutoAssistEnabled((prev) => !prev);
  }, []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  return {
    result,
    unifiedOutput,
    assistStatus,
    assistError,
    isAiConfigured: configured,
    autoAssistEnabled,
    isExpanded,
    editing,
    canonicalDraft,
    renderedDraft,
    aiDraft,
    requestKey,
    requestFingerprint,

    setAutoAssistEnabled,
    toggleAutoAssist,
    setIsExpanded,
    toggleExpanded,
    setCanonicalDraft,
    setRenderedDraft,
    toggleEditing,
    requestAssistance,
    acceptCurrentDraft,
    acceptCustomDraft,
    rejectCurrentDraft
  };
}
