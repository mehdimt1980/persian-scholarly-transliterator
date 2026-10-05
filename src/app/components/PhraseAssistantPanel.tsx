'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReviewDecision, TransliterationResult } from '../../domain/types';
import {
  AcceptedPhraseDecision,
  PhraseResolution,
  checkAcceptedPhraseApplicability,
  createAcceptedPhraseDecision
} from '../../domain/assistance';
import styles from './PhraseAssistantPanel.module.css';

type PhraseAssistStatus = 'idle' | 'loading' | 'available' | 'error' | 'unavailable' | 'rejected';

interface PhraseAssistantPanelProps {
  result: TransliterationResult;
  reviewDecisions: ReviewDecision[];
  acceptedDecision: AcceptedPhraseDecision | null;
  onAcceptedDecision: (decision: AcceptedPhraseDecision | null) => void;
}

function confidenceLabel(value: number | null): string {
  if (value === null) return 'not scored';
  if (value >= 0.85) return 'high';
  if (value >= 0.65) return 'medium';
  return 'low';
}

export default function PhraseAssistantPanel({
  result,
  reviewDecisions,
  acceptedDecision,
  onAcceptedDecision
}: PhraseAssistantPanelProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [status, setStatus] = useState<PhraseAssistStatus>('idle');
  const [resolution, setResolution] = useState<PhraseResolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [canonicalDraft, setCanonicalDraft] = useState('');
  const [renderedDraft, setRenderedDraft] = useState('');
  const lastAutomaticAttempt = useRef<string | null>(null);

  const meaningfulPersianTokens = useMemo(
    () => result.tokens.filter((token) => token.tokenType === 'persian-word').length,
    [result.tokens]
  );

  const eligible = !result.copyable && result.reviewIssues.length > 0;
  const automaticEligible = eligible && meaningfulPersianTokens >= 2;
  const acceptedApplicable = acceptedDecision
    ? checkAcceptedPhraseApplicability(acceptedDecision, result).applicable
    : false;

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

  useEffect(() => {
    setResolution(null);
    setError(null);
    setEditing(false);
    setCanonicalDraft('');
    setRenderedDraft('');
    setStatus('idle');

    if (acceptedDecision && !acceptedApplicable) {
      onAcceptedDecision(null);
    }
  }, [requestKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const requestPhraseResolution = useCallback(async () => {
    if (!eligible) return;

    setStatus('loading');
    setError(null);
    setEditing(false);

    try {
      const response = await fetch('/api/assist/phrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: result.originalInput,
          profile: result.profile,
          reviewDecisions: reviewDecisions.map((decision) => ({
            issueId: decision.issueId,
            action: decision.action,
            selectedAlternativeId: decision.selectedAlternativeId,
            manualCanonicalTransliteration: decision.manualCanonicalTransliteration,
            note: decision.note
          }))
        })
      });

      const data = await response.json();
      if (!response.ok) {
        if (response.status === 503) {
          setConfigured(false);
          setStatus('unavailable');
        } else if (response.status === 409) {
          setStatus('idle');
        } else {
          setStatus('error');
        }
        setError(data.message || data.error || 'Context-aware phrase resolution failed.');
        return;
      }

      const nextResolution = data.resolution as PhraseResolution;
      setResolution(nextResolution);
      setCanonicalDraft(nextResolution.scholarlyCanonical ?? '');
      setRenderedDraft(nextResolution.renderedOutput ?? '');
      setStatus('available');
    } catch (requestError) {
      setStatus('error');
      setError(requestError instanceof Error ? requestError.message : 'Network error during phrase resolution.');
    }
  }, [eligible, result.originalInput, result.profile, reviewDecisions]);

  useEffect(() => {
    if (!automaticEligible || configured !== true || acceptedApplicable) return;
    if (lastAutomaticAttempt.current === requestKey) return;

    const timer = window.setTimeout(() => {
      lastAutomaticAttempt.current = requestKey;
      void requestPhraseResolution();
    }, 900);

    return () => window.clearTimeout(timer);
  }, [automaticEligible, configured, acceptedApplicable, requestKey, requestPhraseResolution]);

  function acceptResolution() {
    if (!resolution) return;
    try {
      const decision = createAcceptedPhraseDecision(
        resolution,
        result,
        canonicalDraft,
        renderedDraft
      );
      onAcceptedDecision(decision);
      setEditing(false);
      setError(null);
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : 'Unable to accept this phrase resolution.');
    }
  }

  function rejectResolution() {
    setResolution(null);
    setCanonicalDraft('');
    setRenderedDraft('');
    setEditing(false);
    setError(null);
    setStatus('rejected');
    lastAutomaticAttempt.current = requestKey;
    onAcceptedDecision(null);
  }

  function toggleEditing() {
    if (editing) {
      setCanonicalDraft(resolution?.scholarlyCanonical ?? '');
      setRenderedDraft(resolution?.renderedOutput ?? '');
      setEditing(false);
      return;
    }
    setEditing(true);
  }

  if (!eligible && !acceptedApplicable) return null;

  if (acceptedDecision && acceptedApplicable) {
    return (
      <section className={`${styles.panel} ${styles.accepted}`}>
        <div className={styles.topline}>
          <div>
            <div className={styles.kicker}>HUMAN-GATED PHRASE RESOLUTION</div>
            <h3>Accepted context-aware resolution</h3>
          </div>
          <span className={styles.acceptedBadge}>USER ACCEPTED</span>
        </div>

        <div className={styles.outputGrid}>
          <div>
            <span className={styles.label}>Scholarly canonical</span>
            <div className={styles.value}>{acceptedDecision.scholarlyCanonical}</div>
          </div>
          <div>
            <span className={styles.label}>Selected profile rendering</span>
            <div className={styles.value}>{acceptedDecision.renderedOutput}</div>
          </div>
        </div>

        <div className={styles.metaRow}>
          <span>{acceptedDecision.acceptance.replaceAll('_', ' ')}</span>
          <span>{acceptedDecision.provider} · {acceptedDecision.model}</span>
          <span>prompt {acceptedDecision.promptVersion}</span>
        </div>

        <div className={styles.actions}>
          <button className={styles.secondaryButton} onClick={() => onAcceptedDecision(null)}>
            Revoke phrase decision
          </button>
        </div>
        <p className={styles.authorityNote}>
          The AI proposal became usable only after explicit human acceptance. Granular deterministic issues remain available below for inspection.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <div className={styles.topline}>
        <div>
          <div className={styles.kicker}>AUTOMATIC CONTEXT-AWARE ASSISTED RESOLVER</div>
          <h3>Resolve the whole phrase, not isolated tokens</h3>
          <p className={styles.subtitle}>
            {result.profile === 'ijmes_title' ? 'Book / article title' : 'Full scholarly / technical context'} · {result.reviewIssues.length} unresolved issue{result.reviewIssues.length === 1 ? '' : 's'}
          </p>
        </div>
        <span className={styles.aiBadge}>AI ADVISORY · ZERO AUTHORITY</span>
      </div>

      {configured === false && (
        <div className={styles.notice}>
          AI phrase resolution is implemented but not connected. Configure <code>OPENAI_API_KEY</code> and <code>ASSISTED_RESOLVER_MODEL</code> on deployment; deterministic and manual review continue to work normally.
        </div>
      )}

      {status === 'loading' && (
        <div className={styles.loadingBox}>
          Analyzing full phrase context, unresolved tokens, morphology, and relations…
        </div>
      )}

      {error && <div className={styles.errorBox}>{error}</div>}

      {resolution?.disposition === 'REVIEW_REQUIRED' && (
        <div className={styles.reviewRequiredBox}>
          <strong>AI declined to force a single reading.</strong>
          <p>{resolution.rationale}</p>
          {resolution.assumptions.length > 0 && (
            <ul>
              {resolution.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
            </ul>
          )}
          {(resolution.warnings ?? []).map((warning) => (
            <div key={warning} className={styles.warning}>{warning}</div>
          ))}
        </div>
      )}

      {resolution?.disposition === 'PROPOSED' && resolution.scholarlyCanonical && resolution.renderedOutput && (
        <>
          <div className={styles.proposalHeader}>
            <div>
              <span className={styles.proposalBadge}>PROPOSAL · NOT YET AUTHORITATIVE</span>
              <span className={styles.confidence}>
                confidence: {confidenceLabel(resolution.confidence)}{resolution.confidence !== null ? ` · ${Math.round(resolution.confidence * 100)}%` : ''}
              </span>
            </div>
            <span className={styles.basis}>{resolution.basis.replaceAll('_', ' ')}</span>
          </div>

          <div className={styles.outputGrid}>
            <div>
              <label className={styles.label} htmlFor="phrase-canonical">Scholarly canonical</label>
              {editing ? (
                <input
                  id="phrase-canonical"
                  className={styles.editInput}
                  value={canonicalDraft}
                  onChange={(event) => setCanonicalDraft(event.target.value)}
                />
              ) : (
                <div className={styles.value}>{resolution.scholarlyCanonical}</div>
              )}
            </div>
            <div>
              <label className={styles.label} htmlFor="phrase-rendered">Profile rendering</label>
              {editing ? (
                <input
                  id="phrase-rendered"
                  className={styles.editInput}
                  value={renderedDraft}
                  onChange={(event) => setRenderedDraft(event.target.value)}
                />
              ) : (
                <div className={styles.value}>{resolution.renderedOutput}</div>
              )}
            </div>
          </div>

          <div className={styles.rationale}>
            <span className={styles.label}>Why this reading?</span>
            <p>{resolution.rationale}</p>
          </div>

          {resolution.tokenReadings.length > 0 && (
            <div className={styles.tokenGrid}>
              {resolution.tokenReadings.map((reading) => (
                <div key={`${reading.tokenIndex}:${reading.surface}`} className={styles.tokenChip}>
                  <bdi dir="rtl">{reading.surface}</bdi>
                  <span>→</span>
                  <strong>{reading.canonical}</strong>
                  <small>{reading.note}</small>
                </div>
              ))}
            </div>
          )}

          {resolution.assumptions.length > 0 && (
            <details className={styles.details}>
              <summary>Assumptions and uncertainties</summary>
              <ul>
                {resolution.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
              </ul>
            </details>
          )}

          <div className={styles.actions}>
            <button className={styles.primaryButton} onClick={acceptResolution}>
              {editing ? 'Accept edited resolution' : 'Accept resolution'}
            </button>
            <button className={styles.secondaryButton} onClick={toggleEditing}>
              {editing ? 'Cancel edit' : 'Edit before accepting'}
            </button>
            <button className={styles.rejectButton} onClick={rejectResolution}>Reject</button>
          </div>
          <p className={styles.authorityNote}>
            Accepting creates explicit user-decision provenance. Model confidence is advisory and never grants authority by itself.
          </p>
        </>
      )}

      {!resolution && status !== 'loading' && (
        <div className={styles.actions}>
          <button
            className={styles.primaryButton}
            onClick={() => {
              lastAutomaticAttempt.current = requestKey;
              void requestPhraseResolution();
            }}
            disabled={configured === false}
          >
            {status === 'rejected' ? 'Analyze phrase again' : automaticEligible ? 'Resolve full phrase now' : 'Ask phrase resolver'}
          </button>
          {automaticEligible && configured === true && status === 'idle' && (
            <span className={styles.autoHint}>Automatic fallback starts after the input is stable.</span>
          )}
        </div>
      )}
    </section>
  );
}
