'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReviewDecision, TransliterationResult } from '../../domain/types';
import { renderCanonicalForProfile } from '../../domain/profiles';
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
  const [isExpanded, setIsExpanded] = useState(false);

  const eligible = !result.copyable && result.reviewIssues.length > 0;
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
    setIsExpanded(false);

    if (acceptedDecision && !acceptedApplicable) {
      onAcceptedDecision(null);
    }
  }, [requestKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const requestPhraseResolution = useCallback(async () => {
    if (!eligible) return;

    setStatus('loading');
    setError(null);
    setEditing(false);
    setIsExpanded(true);

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
    setIsExpanded(false);
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

  // Accepted State
  const renderingLabel =
    result.profile === 'ijmes_citation_title'
      ? 'Citation-title rendering'
      : 'Profile rendering';

  // Accepted State
  if (acceptedDecision && acceptedApplicable) {
    return (
      <section className={`${styles.panel} ${styles.accepted}`} aria-label="Accepted Phrase Suggestion">
        <div className={styles.topline}>
          <div>
            <span className={styles.kicker}>Human-Accepted Phrase Suggestion</span>
            <h3 className={styles.title}>Accepted Context-Aware Reading</h3>
          </div>
          <span className={styles.acceptedBadge}>Human Accepted</span>
        </div>

        <div className={styles.outputGrid}>
          <div className={styles.outputField}>
            <span className={styles.label}>Scholarly canonical</span>
            <div className={styles.value}>{acceptedDecision.scholarlyCanonical}</div>
          </div>
          <div className={styles.outputField}>
            <span className={styles.label}>{renderingLabel}</span>
            <div className={styles.value}>{acceptedDecision.renderedOutput}</div>
            {result.profile === 'ijmes_citation_title' && (
              <small style={{ color: '#4a5568', marginTop: '0.25rem', display: 'block', fontSize: '0.8rem' }}>
                Citation rendering preserves scholarly diacritics and applies title capitalization.
              </small>
            )}
          </div>
        </div>

        <div className={styles.metaRow}>
          <span>{acceptedDecision.acceptance.replaceAll('_', ' ').toLowerCase()}</span>
          <span>{acceptedDecision.provider} · {acceptedDecision.model}</span>
          <span>prompt v{acceptedDecision.promptVersion}</span>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.secondaryButton} onClick={() => onAcceptedDecision(null)}>
            Revoke phrase choice
          </button>
        </div>
        <p className={styles.authorityNote}>
          This suggestion became active only after explicit human acceptance. Granular deterministic issues remain available below for review.
        </p>
      </section>
    );
  }

  // Quiet callout state: default collapsed when not yet explicitly requested
  if (!isExpanded && !resolution && status !== 'loading') {
    return (
      <div className={styles.callout}>
        <div className={styles.calloutText}>
          <strong className={styles.calloutTitle}>Need help resolving this phrase?</strong>
          <p className={styles.calloutDesc}>
            The assistant can suggest a context-aware reading. Suggestions never become authoritative automatically.
          </p>
        </div>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            void requestPhraseResolution();
          }}
          disabled={configured === false}
          aria-label={configured === false ? 'Assistant unavailable' : 'Ask assistant'}
        >
          {configured === false ? 'Assistant unavailable' : 'Ask assistant'}
        </button>
      </div>
    );
  }

  return (
    <section className={styles.panel} aria-label="Phrase Assistance Panel">
      <div className={styles.topline}>
        <div>
          <span className={styles.kicker}>Context-Aware Phrase Suggestion</span>
          <h3 className={styles.title}>Phrase-Level Proposal</h3>
          <p className={styles.subtitle}>
            {result.profile === 'ijmes_citation_title' ? 'Citation title profile' : 'Full scholarly profile'} · {result.reviewIssues.length} unresolved issue{result.reviewIssues.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className={styles.badgeContainer}>
          <span className={styles.aiBadge}>AI suggestion</span>
          <span className={styles.advisorySub}>Advisory only · Requires human acceptance</span>
        </div>
      </div>

      {configured === false && (
        <div className={styles.notice}>
          Assisted phrase resolution is not configured (OpenAI credentials not set). Deterministic transliteration and manual review continue to work normally.
        </div>
      )}

      {status === 'loading' && (
        <div className={styles.loadingBox}>
          Analyzing full phrase context, morphology, and relations…
        </div>
      )}

      {error && <div className={styles.errorBox}>{error}</div>}

      {resolution?.disposition === 'REVIEW_REQUIRED' && (
        <div className={styles.reviewRequiredBox}>
          <strong>Assistant declined to force a single reading.</strong>
          <p>{resolution.rationale}</p>
          {resolution.assumptions.length > 0 && (
            <ul>
              {resolution.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          )}
          {(resolution.warnings ?? []).map((warning) => (
            <div key={warning} className={styles.warning}>
              {warning}
            </div>
          ))}
        </div>
      )}

      {resolution?.disposition === 'PROPOSED' && resolution.scholarlyCanonical && resolution.renderedOutput && (
        <>
          <div className={styles.proposalHeader}>
            <div className={styles.proposalMeta}>
              <span className={styles.proposalBadge}>Suggestion · Not authoritative</span>
              <span className={styles.confidence}>
                confidence: {confidenceLabel(resolution.confidence)}
                {resolution.confidence !== null ? ` (${Math.round(resolution.confidence * 100)}%)` : ''}
              </span>
            </div>
            <span className={styles.basis}>{resolution.basis.replaceAll('_', ' ').toLowerCase()}</span>
          </div>

          <div className={styles.outputGrid}>
            <div className={styles.outputField}>
              <label className={styles.label} htmlFor="phrase-canonical">
                Scholarly canonical
              </label>
              {editing ? (
                <input
                  id="phrase-canonical"
                  className={styles.editInput}
                  value={canonicalDraft}
                  onChange={(event) => {
                    const next = event.target.value;
                    setCanonicalDraft(next);
                    setRenderedDraft(renderCanonicalForProfile(next, result.profile));
                  }}
                />
              ) : (
                <div className={styles.value}>{resolution.scholarlyCanonical}</div>
              )}
            </div>
            <div className={styles.outputField}>
              <label className={styles.label} htmlFor="phrase-rendered">
                {renderingLabel}
              </label>
              {editing ? (
                <div className={styles.value} style={{ background: '#f8fafc', fontStyle: 'italic' }}>
                  {renderedDraft}
                </div>
              ) : (
                <div className={styles.value}>{resolution.renderedOutput}</div>
              )}
              {result.profile === 'ijmes_citation_title' && (
                <small style={{ color: '#4a5568', marginTop: '0.25rem', display: 'block', fontSize: '0.8rem' }}>
                  Citation rendering preserves scholarly diacritics and applies title capitalization.
                </small>
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
                  {reading.note && <small>{reading.note}</small>}
                </div>
              ))}
            </div>
          )}

          {resolution.assumptions.length > 0 && (
            <details className={styles.details}>
              <summary className={styles.detailsSummary}>Assumptions and uncertainties</summary>
              <ul className={styles.detailsList}>
                {resolution.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </details>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.primaryButton} onClick={acceptResolution}>
              {editing ? 'Accept edited suggestion' : 'Accept suggestion'}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={toggleEditing}>
              {editing ? 'Cancel edit' : 'Edit before accepting'}
            </button>
            <button type="button" className={styles.rejectButton} onClick={rejectResolution}>
              Dismiss
            </button>
          </div>
          <p className={styles.authorityNote}>
            Accepting creates explicit user-decision provenance. Suggestions never grant reusable authority by themselves.
          </p>
        </>
      )}

      {!resolution && status !== 'loading' && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => {
              void requestPhraseResolution();
            }}
            disabled={configured === false}
          >
            {status === 'rejected' ? 'Analyze phrase again' : 'Ask assistant'}
          </button>
        </div>
      )}
    </section>
  );
}
