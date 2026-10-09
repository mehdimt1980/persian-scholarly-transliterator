'use client';

import { useState } from 'react';
import TokenReadingEditor from './components/TokenReadingEditor';
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
import type { PhraseContextKind } from '../domain/assistance';
import type {
  CustomScholarlyV1Options,
  PresentationProfile,
  PresentationProfileId
} from '../domain/presentation';

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
  const [semanticContext, setSemanticContext] = useState<PhraseContextKind>(
    profile === 'ijmes_citation_title' ? 'BOOK_OR_ARTICLE_TITLE' : 'GENERAL_SCHOLARLY_TEXT'
  );
  const [presentationProfileId, setPresentationProfileId] = useState<PresentationProfileId>('full_scholarly_v1');
  const [customDiacritics, setCustomDiacritics] = useState<CustomScholarlyV1Options['diacritics']>('FULL');
  const [customCapitalization, setCustomCapitalization] = useState<CustomScholarlyV1Options['capitalization']>('PRESERVE');
  const presentationProfile: PresentationProfile = presentationProfileId === 'custom_scholarly_v1'
    ? {
        id: 'custom_scholarly_v1',
        options: {
          diacritics: customDiacritics,
          capitalization: customCapitalization,
          contentCategory: semanticContext
        }
      }
    : { id: presentationProfileId };

  function setAcceptedPhraseDecision(decision: AcceptedPhraseDecision | null) {
    updateTransliteration({ acceptedPhraseDecision: decision });
  }

  // Unified Draft-First Transliteration Hook
  const translitState = useUnifiedTransliteration({
    input,
    profile,
    semanticContext,
    presentationProfile,
    reviewDecisions: decisions,
    acceptedPhraseDecision,
    onAcceptedDecision: setAcceptedPhraseDecision
  });

  const {
    result,
    unifiedOutput,
    requestInFlight,
    assistError: phraseAssistError,
    isAiConfigured,
    autoAssistEnabled,
    aiDraft,
    explanation,
    editorOpen,
    tokenEdits,
    editedCanonical,
    editedRendered,
    unlocatedTokens,
    alignmentWarning,
    canAcceptEditedDraft,
    actionError,
    toggleAutoAssist,
    regenerate,
    openEditor,
    closeEditor,
    editToken,
    editPhrase,
    resetEdits,
    acceptCurrentDraft,
    acceptEditedDraft,
    rejectCurrentDraft,
    revokeAccepted
  } = translitState;
  const draftPresent = Boolean(aiDraft);
  const canRegenerate = isAiConfigured === true && !result.copyable && result.reviewIssues.length > 0;

  function setInput(newInput: string) {
    updateTransliteration({ input: newInput });
  }

  function setProfile(newProfile: ProfileId) {
    updateTransliteration({ profile: newProfile });
  }

  function changeSemanticContext(context: PhraseContextKind) {
    setSemanticContext(context);
    if (context !== 'BOOK_OR_ARTICLE_TITLE') setCustomCapitalization('PRESERVE');
    setProfile(context === 'BOOK_OR_ARTICLE_TITLE' ? 'ijmes_citation_title' : 'ijmes_full');
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
    if (!unifiedOutput.isVerifiedCopyable && !unifiedOutput.isHumanAcceptedCopyable) return;
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
              Semantic Reading Context
              <select
                className="context-select"
                value={semanticContext}
                onChange={(event) => changeSemanticContext(event.target.value as PhraseContextKind)}
              >
                <option value="BOOK_OR_ARTICLE_TITLE">Book / article title</option>
                <option value="GENERAL_SCHOLARLY_TEXT">General scholarly text</option>
              </select>
            </label>
            <label className="context-selector-label">
              Presentation
              <select
                className="context-select"
                value={presentationProfileId}
                onChange={(event) => setPresentationProfileId(event.target.value as PresentationProfileId)}
              >
                <option value="full_scholarly_v1">Full Scholarly</option>
                <option value="ijmes_publication_v1">IJMES Publication</option>
                <option value="custom_scholarly_v1">Custom Scholarly v1</option>
              </select>
            </label>
            {presentationProfileId === 'custom_scholarly_v1' && (
              <>
                <label className="context-selector-label">
                  Custom diacritics
                  <select
                    className="context-select"
                    value={customDiacritics}
                    onChange={(event) => setCustomDiacritics(event.target.value as CustomScholarlyV1Options['diacritics'])}
                  >
                    <option value="FULL">Full</option>
                    <option value="PUBLICATION">Publication style</option>
                  </select>
                </label>
                <label className="context-selector-label">
                  Custom capitalization
                  <select
                    className="context-select"
                    value={customCapitalization}
                    onChange={(event) => setCustomCapitalization(event.target.value as CustomScholarlyV1Options['capitalization'])}
                  >
                    <option value="PRESERVE">Preserve canonical case</option>
                    <option value="ENGLISH_TITLE" disabled={semanticContext !== 'BOOK_OR_ARTICLE_TITLE'}>English title</option>
                  </select>
                </label>
              </>
            )}
          </div>
        </div>

        {/* Transliteration Output Panel */}
        <div className="panel-card output-panel">
          <div className="panel-card-header">
            <span className="panel-label">Transliteration</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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

          {/* Request lifecycle line: never claims 'analyzing' when a current draft exists */}
          {requestInFlight && (
            <p className="panel-hint" role="status" style={{ color: '#6366f1', fontStyle: 'italic' }}>
              {draftPresent ? 'Regenerating suggestion… current draft shown below remains available.' : 'Analyzing phrase…'}
            </p>
          )}
          {!requestInFlight && phraseAssistError && !draftPresent && (
            <p className="review-warning-note" role="alert">
              AI draft unavailable: {phraseAssistError} The deterministic analysis below remains fully usable.
            </p>
          )}
          {!draftPresent && !requestInFlight && isAiConfigured === false && !result.copyable && result.reviewIssues.length > 0 && (
            <p className="panel-hint">
              AI draft unavailable: assistance is not configured (OpenAI credentials not set).
            </p>
          )}
          {actionError && (
            <p className="review-warning-note" role="alert">{actionError}</p>
          )}

          <div className="output-footer">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span className="profile-tag">
                {presentationProfileId === 'full_scholarly_v1'
                  ? 'Full Scholarly'
                  : presentationProfileId === 'ijmes_publication_v1'
                    ? 'IJMES Publication v1'
                    : 'Custom Scholarly v1'}
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

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {unifiedOutput.isDraft && (
                <>
                  <button type="button" className="btn-secondary" onClick={editorOpen ? closeEditor : openEditor} aria-expanded={editorOpen} aria-controls="token-reading-editor">
                    {editorOpen ? 'Close editor' : 'Review & Edit'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={acceptCurrentDraft}>
                    Accept Draft
                  </button>
                  <button type="button" className="btn-secondary" onClick={rejectCurrentDraft}>
                    Dismiss
                  </button>
                  <button type="button" className="btn-primary" onClick={copyDraft}>
                    {draftCopied ? 'Draft Copied' : 'Copy Draft'}
                  </button>
                </>
              )}

              {canRegenerate && (
                <button type="button" className="btn-secondary" onClick={regenerate} disabled={requestInFlight}>
                  Regenerate suggestion
                </button>
              )}

              {unifiedOutput.presentation === 'HUMAN_ACCEPTED' && (
                <button type="button" className="btn-secondary" onClick={revokeAccepted}>
                  Revoke acceptance
                </button>
              )}

              {(unifiedOutput.isVerifiedCopyable || unifiedOutput.isHumanAcceptedCopyable) && (
                <button type="button" className="btn-primary" onClick={copyVerified}>
                  {verifiedCopied ? 'Copied' : 'Copy'}
                </button>
              )}

              {unifiedOutput.presentation === 'UNRESOLVED_NO_DRAFT' && (
                <button type="button" className="btn-primary" disabled>
                  {requestInFlight ? 'Generating draft…' : 'Review needed'}
                </button>
              )}
            </div>
          </div>

          {editorOpen && explanation && unifiedOutput.isDraft && (
            <TokenReadingEditor
              explanation={explanation}
              tokenEdits={tokenEdits}
              editedCanonical={editedCanonical}
              editedRendered={editedRendered}
              unlocatedTokens={unlocatedTokens}
              alignmentWarning={alignmentWarning}
              canAccept={canAcceptEditedDraft}
              profileLabel={profile === 'ijmes_citation_title' ? 'Citation-title rendering' : 'Profile rendering'}
              error={actionError}
              onEditToken={editToken}
              onEditPhrase={editPhrase}
              onReset={resetEdits}
              onAccept={acceptEditedDraft}
              onClose={closeEditor}
            />
          )}
        </div>
      </section>

      {/* Why this reading? (single home for AI rationale, token explanations, uncertainty, provenance) */}
      <WhyThisReading result={result} explanation={explanation} />

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
