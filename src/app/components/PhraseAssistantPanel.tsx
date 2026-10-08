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

  // Optional shared state from useUnifiedTransliteration
  sharedStatus?: PhraseAssistStatus;
  sharedResolution?: PhraseResolution | null;
  sharedError?: string | null;
  sharedIsConfigured?: boolean | null;
  sharedIsExpanded?: boolean;
  sharedEditing?: boolean;
  sharedCanonicalDraft?: string;
  sharedRenderedDraft?: string;
  onRequestAssistance?: () => Promise<void>;
  onAcceptCurrentDraft?: () => void;
  onRejectCurrentDraft?: () => void;
  onToggleEditing?: () => void;
  onSetCanonicalDraft?: (draft: string) => void;
  onSetRenderedDraft?: (draft: string) => void;
  onSetExpanded?: (expanded: boolean) => void;
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
  onAcceptedDecision,
  sharedStatus,
  sharedResolution,
  sharedError,
  sharedIsConfigured,
  sharedIsExpanded,
  sharedEditing,
  sharedCanonicalDraft,
  sharedRenderedDraft,
  onRequestAssistance,
  onAcceptCurrentDraft,
  onRejectCurrentDraft,
  onToggleEditing,
  onSetCanonicalDraft,
  onSetRenderedDraft,
  onSetExpanded
}: PhraseAssistantPanelProps) {
  // Local state fallback when shared state is not provided
  const [localConfigured, setLocalConfigured] = useState<boolean | null>(null);
  const [localStatus, setLocalStatus] = useState<PhraseAssistStatus>('idle');
  const [localResolution, setLocalResolution] = useState<PhraseResolution | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localEditing, setLocalEditing] = useState(false);
  const [localCanonicalDraft, setLocalCanonicalDraft] = useState('');
  const [localRenderedDraft, setLocalRenderedDraft] = useState('');
  const [localIsExpanded, setLocalIsExpanded] = useState(false);

  const isShared = sharedStatus !== undefined;

  const configured = isShared ? (sharedIsConfigured ?? null) : localConfigured;
  const status = isShared ? (sharedStatus ?? 'idle') : localStatus;
  const resolution = isShared ? (sharedResolution ?? null) : localResolution;
  const error = isShared ? (sharedError ?? null) : localError;
  const editing = isShared ? (sharedEditing ?? false) : localEditing;
  const canonicalDraft = isShared ? (sharedCanonicalDraft ?? '') : localCanonicalDraft;
  const renderedDraft = isShared ? (sharedRenderedDraft ?? '') : localRenderedDraft;
  const isExpanded = isShared ? (sharedIsExpanded ?? false) : localIsExpanded;

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
    if (isShared) return;
    let cancelled = false;
    fetch('/api/assist/status')
      .then(async (response) => {
        if (!response.ok) throw new Error('Assistance status endpoint is unavailable.');
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setLocalConfigured(Boolean(data.configured));
      })
      .catch(() => {
        if (!cancelled) setLocalConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isShared]);

  useEffect(() => {
    if (isShared) return;
    setLocalResolution(null);
    setLocalError(null);
    setLocalEditing(false);
    setLocalCanonicalDraft('');
    setLocalRenderedDraft('');
    setLocalStatus('idle');
    setLocalIsExpanded(false);

    if (acceptedDecision && !acceptedApplicable) {
      onAcceptedDecision(null);
    }
  }, [requestKey, isShared]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRequestPhraseResolution = useCallback(async () => {
    if (isShared && onRequestAssistance) {
      await onRequestAssistance();
      return;
    }

    if (!eligible) return;

    setLocalStatus('loading');
    setLocalError(null);
    setLocalEditing(false);
    setLocalIsExpanded(true);

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
          setLocalConfigured(false);
          setLocalStatus('unavailable');
        } else if (response.status === 409) {
          setLocalStatus('idle');
        } else {
          setLocalStatus('error');
        }
        setLocalError(data.message || data.error || 'Context-aware phrase resolution failed.');
        return;
      }

      const nextResolution = data.resolution as PhraseResolution;
      setLocalResolution(nextResolution);
      setLocalCanonicalDraft(nextResolution.scholarlyCanonical ?? '');
      setLocalRenderedDraft(nextResolution.renderedOutput ?? '');
      setLocalStatus('available');
    } catch (requestError) {
      setLocalStatus('error');
      setLocalError(requestError instanceof Error ? requestError.message : 'Network error during phrase resolution.');
    }
  }, [isShared, onRequestAssistance, eligible, result.originalInput, result.profile, reviewDecisions]);

  function handleAcceptResolution() {
    if (isShared && onAcceptCurrentDraft) {
      onAcceptCurrentDraft();
      return;
    }
    if (!resolution || !resolution.scholarlyCanonical) return;
    try {
      const decision = createAcceptedPhraseDecision(
        resolution,
        result,
        canonicalDraft || resolution.scholarlyCanonical,
        renderedDraft || resolution.renderedOutput || undefined
      );
      onAcceptedDecision(decision);
      setLocalEditing(false);
      setLocalError(null);
    } catch (acceptError) {
      setLocalError(acceptError instanceof Error ? acceptError.message : 'Unable to accept this phrase resolution.');
    }
  }

  function handleRejectResolution() {
    if (isShared && onRejectCurrentDraft) {
      onRejectCurrentDraft();
      return;
    }
    setLocalResolution(null);
    setLocalCanonicalDraft('');
    setLocalRenderedDraft('');
    setLocalEditing(false);
    setLocalError(null);
    setLocalStatus('rejected');
    setLocalIsExpanded(false);
    onAcceptedDecision(null);
  }

  function handleToggleEditing() {
    if (isShared && onToggleEditing) {
      onToggleEditing();
      return;
    }
    if (editing) {
      setLocalCanonicalDraft(resolution?.scholarlyCanonical ?? '');
      setLocalRenderedDraft(resolution?.renderedOutput ?? '');
      setLocalEditing(false);
      return;
    }
    setLocalEditing(true);
  }

  function handleCanonicalChange(next: string) {
    if (isShared && onSetCanonicalDraft && onSetRenderedDraft) {
      onSetCanonicalDraft(next);
      onSetRenderedDraft(renderCanonicalForProfile(next, result.profile));
      return;
    }
    setLocalCanonicalDraft(next);
    setLocalRenderedDraft(renderCanonicalForProfile(next, result.profile));
  }

  if (!eligible && !acceptedApplicable) return null;

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

  // Quiet callout state: default collapsed when not yet explicitly requested or expanded
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
            void handleRequestPhraseResolution();
          }}
          disabled={configured === false}
          aria-label={configured === false ? 'Assistant unavailable' : 'Ask assistant'}
        >
          {configured === false ? 'Assistant unavailable' : 'Ask assistant'}
        </button>
      </div>
    );
  }

  const hasDisplayableDraft = Boolean(resolution?.scholarlyCanonical && resolution?.renderedOutput);

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

      {resolution?.disposition === 'REVIEW_REQUIRED' && !hasDisplayableDraft && (
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

      {hasDisplayableDraft && resolution && (
        <>
          <div className={styles.proposalHeader}>
            <div className={styles.proposalMeta}>
              <span className={styles.proposalBadge}>
                {resolution.disposition === 'REVIEW_REQUIRED' ? 'Draft · Needs Review' : 'Suggestion · Not authoritative'}
              </span>
              <span className={styles.confidence}>
                model estimate: {confidenceLabel(resolution.confidence)}
                {resolution.confidence !== null ? ` (${Math.round(resolution.confidence * 100)}%)` : ''} · uncalibrated
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
                  onChange={(event) => handleCanonicalChange(event.target.value)}
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

          {(resolution.warnings ?? []).length > 0 && (
            <div className={styles.warningsList} style={{ marginTop: '0.5rem' }}>
              {(resolution.warnings ?? []).map((warning) => (
                <div key={warning} className={styles.warning}>
                  {warning}
                </div>
              ))}
            </div>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.primaryButton} onClick={handleAcceptResolution}>
              {editing ? 'Accept edited suggestion' : 'Accept suggestion'}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={handleToggleEditing}>
              {editing ? 'Cancel edit' : 'Edit before accepting'}
            </button>
            <button type="button" className={styles.rejectButton} onClick={handleRejectResolution}>
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
              void handleRequestPhraseResolution();
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
