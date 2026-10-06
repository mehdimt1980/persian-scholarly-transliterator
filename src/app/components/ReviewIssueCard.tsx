'use client';

import React, { useState } from 'react';
import type { ReviewActionType, ReviewDecision, ReviewIssue, TransliterationResult } from '../../domain/types';
import type { AssistedCandidate, AssistedResolution } from '../../domain/assistance';
import { formatIssueType } from './StatusHelpers';

interface ReviewIssueCardProps {
  issue: ReviewIssue;
  result: TransliterationResult;
  appliedDecision?: ReviewDecision;
  assistStatus: 'idle' | 'loading' | 'available' | 'error' | 'stale' | 'unavailable';
  assistResolution?: AssistedResolution;
  assistError?: string;
  onRequestAssistance: (issueId: string) => void;
  onApplyAssistedCandidate: (issue: ReviewIssue, candidate: AssistedCandidate, resolution: AssistedResolution) => void;
  onApplyDecision: (decision: ReviewDecision) => void;
  onClearDecision: (issueId: string) => void;
  actionForAlternative: (issue: ReviewIssue, altId: string) => ReviewActionType;
}

export default function ReviewIssueCard({
  issue,
  appliedDecision,
  assistStatus,
  assistResolution,
  assistError,
  onRequestAssistance,
  onApplyAssistedCandidate,
  onApplyDecision,
  onClearDecision,
  actionForAlternative
}: ReviewIssueCardProps) {
  const [manualInput, setManualInput] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  function handleManualSubmit() {
    if (!manualInput || manualInput.trim().length === 0) {
      setManualError('Transliteration value cannot be empty.');
      return;
    }
    if (/[\u0600-\u06FF]/u.test(manualInput)) {
      setManualError('Canonical transliteration cannot contain Persian or Arabic script.');
      return;
    }
    setManualError(null);
    onApplyDecision({
      issueId: issue.id,
      action: 'MANUAL_CANONICAL_OVERRIDE',
      manualCanonicalTransliteration: manualInput.trim()
    });
  }

  const isApplied = Boolean(appliedDecision);

  return (
    <article className={`review-card ${isApplied ? 'has-decision' : ''}`} aria-labelledby={`issue-title-${issue.id}`}>
      <div className="review-card-header">
        <div className="review-card-title-group">
          <span className="review-kicker">Needs review</span>
          <h4 id={`issue-title-${issue.id}`} className="review-surface" dir="rtl">
            {issue.surface}
          </h4>
        </div>
        <span className="badge status-review">{formatIssueType(issue.type)}</span>
      </div>

      <div className="review-card-explanation">
        <p className="review-desc">
          The system cannot safely determine this reading automatically: <em>{issue.description}</em>
        </p>
        {issue.evidenceSummary && (
          <div className="review-evidence-line">
            <span className="evidence-label">Evidence:</span> {issue.evidenceSummary}
          </div>
        )}
      </div>

      <div className="review-options-section">
        <span className="options-heading">Possible readings:</span>
        <div className="alternatives-grid">
          {issue.alternatives.map((alt) => {
            const action = actionForAlternative(issue, alt.id);
            const isSelected = appliedDecision?.action === action && appliedDecision?.selectedAlternativeId === alt.id;
            return (
              <button
                key={alt.id}
                type="button"
                className={`alt-btn ${isSelected ? 'selected' : ''}`}
                onClick={() => onApplyDecision({ issueId: issue.id, action, selectedAlternativeId: alt.id })}
              >
                <span className="alt-label">{alt.label}</span>
                {alt.canonical && <span className="alt-canonical">({alt.canonical})</span>}
              </button>
            );
          })}
        </div>

        {issue.allowedActions.includes('MANUAL_CANONICAL_OVERRIDE') && (
          <div className="manual-override-form">
            <label htmlFor={`manual-input-${issue.id}`} className="manual-label">
              Manual scholarly form:
            </label>
            <div className="manual-input-row">
              <input
                id={`manual-input-${issue.id}`}
                type="text"
                className="manual-text-input"
                placeholder="e.g. kirm"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleManualSubmit();
                }}
              />
              <button type="button" className="btn-secondary" onClick={handleManualSubmit}>
                Enter manually
              </button>
            </div>
            {manualError && <span className="form-error">{manualError}</span>}
          </div>
        )}
      </div>

      {appliedDecision && (
        <div className="active-decision-banner">
          <div className="decision-text">
            <span className="decision-label">Active choice:</span>{' '}
            <strong>{appliedDecision.action.replace(/_/g, ' ')}</strong>
            {appliedDecision.manualCanonicalTransliteration && (
              <span> ({appliedDecision.manualCanonicalTransliteration})</span>
            )}
            {appliedDecision.assistance && (
              <span className="decision-assist-tag"> · Assisted [{appliedDecision.assistance.suggestionId}]</span>
            )}
          </div>
          <button
            type="button"
            className="btn-undo"
            onClick={() => onClearDecision(issue.id)}
            aria-label={`Undo decision for ${issue.surface}`}
          >
            Undo choice
          </button>
        </div>
      )}

      {/* Advisory Assisted Suggestions */}
      <div className="assisted-subpanel">
        <div className="assisted-subpanel-header">
          <div className="assisted-tag-group">
            <span className="advisory-badge">AI suggestion</span>
            <span className="advisory-label">Advisory · Requires human acceptance</span>
          </div>
          <button
            type="button"
            className="btn-subtle"
            onClick={() => onRequestAssistance(issue.id)}
            disabled={assistStatus === 'loading'}
          >
            {assistStatus === 'loading'
              ? 'Analyzing...'
              : assistResolution
              ? 'Re-query suggestion'
              : 'Ask assistant'}
          </button>
        </div>

        {assistStatus === 'unavailable' && (
          <p className="assisted-info-msg">
            Assisted resolver is not configured in this environment (OpenAI credentials not present). Deterministic and manual review remain fully functional.
          </p>
        )}

        {assistError && <p className="assisted-info-msg error">{assistError}</p>}

        {assistResolution && (
          <div className="assisted-candidates-wrapper">
            {assistResolution.candidates.length === 0 ? (
              <p className="assisted-info-msg">No suggestions proposed for this issue.</p>
            ) : (
              <div className="assisted-candidates-cards">
                {assistResolution.candidates.map((cand) => (
                  <div key={cand.id} className="assisted-candidate-item">
                    <div className="candidate-details">
                      <div className="candidate-reading">
                        <strong>
                          {cand.kind === 'EXISTING_LEXICAL_READING' && cand.canonical}
                          {cand.kind === 'MANUAL_CANONICAL' && cand.canonical}
                          {cand.kind === 'IZAFAT_DECISION' && cand.relationDecision}
                          {cand.kind === 'MORPHOLOGY_BRANCH' && cand.morphologyBranch}
                        </strong>
                        <span className="candidate-basis">{cand.basis.replace(/_/g, ' ')}</span>
                      </div>
                      <p className="candidate-rationale">{cand.rationale}</p>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => onApplyAssistedCandidate(issue, cand, assistResolution)}
                    >
                      Use suggestion
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <details className="technical-details-disclosure">
        <summary className="technical-summary">Technical details</summary>
        <div className="technical-body">
          <div className="tech-row">
            <span className="tech-label">Issue ID:</span>
            <code className="tech-val">{issue.id}</code>
          </div>
          <div className="tech-row">
            <span className="tech-label">Issue Type:</span>
            <code className="tech-val">{issue.type}</code>
          </div>
          <div className="tech-row">
            <span className="tech-label">Allowed Actions:</span>
            <code className="tech-val">{issue.allowedActions.join(', ')}</code>
          </div>
        </div>
      </details>
    </article>
  );
}
