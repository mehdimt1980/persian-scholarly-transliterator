'use client';

import { useState } from 'react';
import PhraseAssistantPanel from './components/PhraseAssistantPanel';
import StatusBadge from './components/StatusBadge';
import WhyThisReading from './components/WhyThisReading';
import ReviewQueue from './components/ReviewQueue';
import InspectionSection from './components/InspectionSection';
import ResearchPrinciples from './components/ResearchPrinciples';
import { ProfileId, ReviewActionType, ReviewDecision, ReviewIssue } from '../domain/types';
import {
  AcceptedPhraseDecision,
  AssistedCandidate,
  AssistedResolution,
  buildResolverRequest,
  candidateToReviewDecision
} from '../domain/assistance';
import { useResearchWorkspace } from '../client/workspace';
import WorkspaceSaveStatus from './components/WorkspaceSaveStatus';
import { useUnifiedTransliteration } from './hooks/useUnifiedTransliteration';

function actionForAlternative(issue: ReviewIssue, altId: string): ReviewActionType {
  if (issue.type === 'EVIDENCE_DERIVED_READING') {
    return 'ACCEPT_EVIDENCE_DERIVED';
  }
  if (issue.type === 'IZAFAT_CANDIDATE') {
    return altId === 'ACCEPT_IZAFAT' ? 'ACCEPT_IZAFAT' : 'REJECT_IZAFAT';
  }
  if (issue.type === 'MORPHOLOGY_AMBIGUITY') {
    return 'SELECT_MORPHOLOGY';
  }
  return 'SELECT_LEXICAL_READING';
}

type AssistStatusType = 'idle' | 'loading' | 'available' | 'error' | 'stale' | 'unavailable';

export default function Home() {
  const { transliteration, updateTransliteration } = useResearchWorkspace();

  const input = transliteration.input;
  const profile = transliteration.profile;
  const decisions = transliteration.reviewDecisions;
  const acceptedPhraseDecision = transliteration.acceptedPhraseDecision;

  const [verifiedCopied, setVerifiedCopied] = useState(false);
  const [draftCopied, setDraftCopied] = useState(false);

  function setAcceptedPhraseDecision(decision: AcceptedPhraseDecision | null) {
    updateTransliteration({ acceptedPhraseDecision: decision });
  }

  // Unified Draft-First Transliteration Hook
  const translitState = useUnifiedTransliteration({
    input,
    profile,
    reviewDecisions: decisions,
    acceptedPhraseDecision,
    onAcceptedDecision: setAcceptedPhraseDecision
  });

  const {
    result,
    unifiedOutput,
    assistStatus: phraseAssistStatus,
    assistError: phraseAssistError,
    isAiConfigured,
    autoAssistEnabled,
    isExpanded: isPhraseExpanded,
    editing: isPhraseEditing,
    canonicalDraft,
    renderedDraft,
    aiDraft,
    toggleAutoAssist,
    setIsExpanded: setIsPhraseExpanded,
    setCanonicalDraft,
    setRenderedDraft,
    toggleEditing: togglePhraseEditing,
    requestAssistance: requestPhraseAssistance,
    acceptCurrentDraft,
    rejectCurrentDraft
  } = translitState;

  function setInput(newInput: string) {
    updateTransliteration({ input: newInput });
  }

  function setProfile(newProfile: ProfileId) {
    updateTransliteration({ profile: newProfile });
  }

  function applyDecision(newDecision: ReviewDecision) {
    updateTransliteration((prev) => {
      const filtered = prev.reviewDecisions.filter((d) => d.issueId !== newDecision.issueId);
      return {
        ...prev,
        reviewDecisions: [...filtered, newDecision]
      };
    });
  }

  function clearDecision(issueId: string) {
    updateTransliteration((prev) => ({
      ...prev,
      reviewDecisions: prev.reviewDecisions.filter((d) => d.issueId !== issueId)
    }));
  }

  function clearAllDecisions() {
    updateTransliteration({
      reviewDecisions: [],
      acceptedPhraseDecision: null
    });
  }

  // Issue-level assistant state (for fine-grained ReviewQueue items)
  const [assistStatus, setAssistStatus] = useState<Record<string, AssistStatusType>>({});
  const [assistResolutions, setAssistResolutions] = useState<Record<string, AssistedResolution>>({});
  const [assistErrors, setAssistErrors] = useState<Record<string, string>>({});

  async function requestAssistance(issueId: string) {
    setAssistStatus((prev) => ({ ...prev, [issueId]: 'loading' }));
    setAssistErrors((prev) => {
      const next = { ...prev };
      delete next[issueId];
      return next;
    });

    try {
      const res = await fetch('/api/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input,
          profile,
          reviewDecisions: decisions,
          issueId
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setAssistStatus((prev) => ({ ...prev, [issueId]: res.status === 503 ? 'unavailable' : 'error' }));
        setAssistErrors((prev) => ({ ...prev, [issueId]: data.message || data.error || 'Assisted resolver request failed.' }));
        return;
      }

      setAssistResolutions((prev) => ({ ...prev, [issueId]: data.resolution }));
      setAssistStatus((prev) => ({ ...prev, [issueId]: 'available' }));
    } catch (err: unknown) {
      setAssistStatus((prev) => ({ ...prev, [issueId]: 'error' }));
      setAssistErrors((prev) => ({ ...prev, [issueId]: err instanceof Error ? err.message : 'Network error.' }));
    }
  }

  function applyAssistedCandidate(issue: ReviewIssue, candidate: AssistedCandidate, resolution: AssistedResolution) {
    try {
      const currentRequest = buildResolverRequest(result, issue.id);
      const decision = candidateToReviewDecision(candidate.id, resolution, issue, currentRequest);
      applyDecision(decision);
    } catch (err) {
      setAssistErrors((prev) => ({
        ...prev,
        [issue.id]: err instanceof Error ? err.message : 'Failed to apply suggestion.'
      }));
    }
  }

  async function copyVerified() {
    if (!unifiedOutput.isVerifiedCopyable) return;
    await navigator.clipboard.writeText(unifiedOutput.primary);
    setVerifiedCopied(true);
    setTimeout(() => setVerifiedCopied(false), 1400);
  }

  async function copyDraft() {
    if (!unifiedOutput.isCopyableDraft) return;
    await navigator.clipboard.writeText(unifiedOutput.primary);
    setDraftCopied(true);
    setTimeout(() => setDraftCopied(false), 1400);
  }

  return (
    <div>
      <section className="page-intro" aria-labelledby="home-title">
        <span className="page-intro-eyebrow">Scholarly Workspace</span>
        <h1 id="home-title" className="page-title">
          Persian Scholarly Transliterator
        </h1>
        <p className="page-tagline">
          Evidence-aware transliteration for Persian scholarship.
        </p>
        <p className="page-subtag">
          Deterministic IJMES · explicit ambiguity · AI draft-first workflow · human-reviewed authority
        </p>
      </section>

      <WorkspaceSaveStatus workspaceType="transliteration" />

      <section className="workspace-grid" aria-label="Transliteration Workspace">
        {/* Persian Source Input Panel */}
        <div className="panel-card input-panel">
          <div className="panel-card-header">
            <label htmlFor="source-input" className="panel-label">
              Persian Source
            </label>
            <span className="panel-hint">RTL · Unicode</span>
          </div>

          <textarea
            id="source-input"
            dir="rtl"
            className="source-textarea"
            placeholder="متن فارسی را وارد کنید..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />

          <div className="panel-controls">
            <label className="context-selector-label">
              Context Profile
              <select
                className="context-select"
                value={profile}
                onChange={(event) => setProfile(event.target.value as ProfileId)}
              >
                <option value="ijmes_citation_title">Book / article title (fully diacritized citation)</option>
                <option value="ijmes_full">Full scholarly / technical term</option>
              </select>
            </label>
          </div>
        </div>

        {/* Transliteration Output Panel */}
        <div className="panel-card output-panel">
          <div className="panel-card-header">
            <span className="panel-label">Transliteration</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {phraseAssistStatus === 'loading' && (
                <span style={{ fontSize: '0.75rem', color: '#6366f1', fontStyle: 'italic' }}>
                  Analyzing phrase…
                </span>
              )}
              <StatusBadge
                status={unifiedOutput.status}
                label={unifiedOutput.badgeLabel}
                tone={unifiedOutput.badgeTone}
              />
            </div>
          </div>

          <div className="output-display">
            {unifiedOutput.primary || (
              <span className="output-placeholder">Transliteration output appears here</span>
            )}
          </div>

          {/* Contextual notice / warning note */}
          {unifiedOutput.noticeText && (
            <p
              className="review-warning-note"
              style={
                unifiedOutput.presentation === 'HUMAN_ACCEPTED'
                  ? { background: '#f2f7f4', borderColor: '#b7d5c5', color: '#2d6a4f' }
                  : unifiedOutput.presentation === 'AI_DRAFT'
                    ? { background: '#eef2ff', borderColor: '#c7d2fe', color: '#4338ca' }
                    : unifiedOutput.presentation === 'AI_DRAFT_NEEDS_REVIEW'
                      ? { background: '#fef9ee', borderColor: '#fcd34d', color: '#92400e' }
                      : undefined
              }
            >
              {unifiedOutput.noticeText}
            </p>
          )}

          <div className="output-footer">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span className="profile-tag">
                {profile === 'ijmes_citation_title' ? 'IJMES · Scholarly citation title' : 'IJMES · Scholarly'}
              </span>
              <button
                type="button"
                className="btn-secondary"
                style={{
                  fontSize: '0.75rem',
                  padding: '0.2rem 0.5rem',
                  background: autoAssistEnabled ? '#f0fdf4' : '#f9fafb',
                  borderColor: autoAssistEnabled ? '#86efac' : '#d1d5db',
                  color: autoAssistEnabled ? '#166534' : '#6b7280'
                }}
                onClick={toggleAutoAssist}
                title="Toggle automatic AI draft assistance"
              >
                AI Draft: {autoAssistEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {/* Draft actions */}
              {unifiedOutput.isDraft && (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setIsPhraseExpanded(true)}
                  >
                    Review &amp; Edit
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={acceptCurrentDraft}
                  >
                    Accept Draft
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={copyDraft}
                  >
                    {draftCopied ? 'Draft Copied' : 'Copy Draft'}
                  </button>
                </>
              )}

              {/* Verified copy action */}
              {unifiedOutput.isVerifiedCopyable && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={copyVerified}
                >
                  {verifiedCopied ? 'Copied' : 'Copy'}
                </button>
              )}

              {/* Unresolved / no draft action */}
              {unifiedOutput.presentation === 'UNRESOLVED_NO_DRAFT' && (
                <button
                  type="button"
                  className="btn-primary"
                  disabled
                >
                  {phraseAssistStatus === 'loading' ? 'Generating draft…' : 'Review needed'}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Why this reading progressive disclosure */}
      <WhyThisReading result={result} />

      {/* Phrase Assistant Panel (Detailed breakdown, rationale, and editing) */}
      {(!result.copyable || unifiedOutput.activePhraseDecision || isPhraseExpanded) && (
        <PhraseAssistantPanel
          result={result}
          reviewDecisions={decisions}
          acceptedDecision={acceptedPhraseDecision}
          onAcceptedDecision={setAcceptedPhraseDecision}
          sharedStatus={phraseAssistStatus}
          sharedResolution={aiDraft}
          sharedError={phraseAssistError}
          sharedIsConfigured={isAiConfigured}
          sharedIsExpanded={isPhraseExpanded}
          sharedEditing={isPhraseEditing}
          sharedCanonicalDraft={canonicalDraft}
          sharedRenderedDraft={renderedDraft}
          onRequestAssistance={requestPhraseAssistance}
          onAcceptCurrentDraft={acceptCurrentDraft}
          onRejectCurrentDraft={rejectCurrentDraft}
          onToggleEditing={togglePhraseEditing}
          onSetCanonicalDraft={setCanonicalDraft}
          onSetRenderedDraft={setRenderedDraft}
          onSetExpanded={setIsPhraseExpanded}
        />
      )}

      {/* Human Review Queue */}
      <ReviewQueue
        result={result}
        decisions={decisions}
        assistStatus={assistStatus}
        assistResolutions={assistResolutions}
        assistErrors={assistErrors}
        onRequestAssistance={requestAssistance}
        onApplyAssistedCandidate={applyAssistedCandidate}
        onApplyDecision={applyDecision}
        onClearDecision={clearDecision}
        onClearAllDecisions={clearAllDecisions}
        actionForAlternative={actionForAlternative}
      />

      {/* Token & Morphology Inspection with Progressive Disclosure */}
      <InspectionSection result={result} />

      {/* Core Principles */}
      <ResearchPrinciples />
    </div>
  );
}
