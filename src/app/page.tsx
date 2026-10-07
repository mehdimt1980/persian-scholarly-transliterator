'use client';

import { useMemo, useState } from 'react';
import PhraseAssistantPanel from './components/PhraseAssistantPanel';
import StatusBadge from './components/StatusBadge';
import WhyThisReading from './components/WhyThisReading';
import ReviewQueue from './components/ReviewQueue';
import InspectionSection from './components/InspectionSection';
import ResearchPrinciples from './components/ResearchPrinciples';
import { transliterate } from '../domain/engine';
import { ProfileId, ReviewActionType, ReviewDecision, ReviewIssue } from '../domain/types';
import {
  AcceptedPhraseDecision,
  AssistedCandidate,
  AssistedResolution,
  buildResolverRequest,
  candidateToReviewDecision,
  resolveSelectedTransliteration
} from '../domain/assistance';

const fixture = 'تأملی درباره ایران: مکتب تبریز و مبانی تجددخواهی';

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

import { useResearchWorkspace } from '../client/workspace';
import WorkspaceSaveStatus from './components/WorkspaceSaveStatus';

export default function Home() {
  const { transliteration, updateTransliteration } = useResearchWorkspace();

  const input = transliteration.input;
  const profile = transliteration.profile;
  const decisions = transliteration.reviewDecisions;
  const acceptedPhraseDecision = transliteration.acceptedPhraseDecision;

  const [copied, setCopied] = useState(false);

  const result = useMemo(() => transliterate(input, profile, decisions), [input, profile, decisions]);
  const {
    activePhraseDecision,
    primary: selectedOutput,
    copyable: selectedCopyable,
    status: selectedStatus
  } = resolveSelectedTransliteration(result, acceptedPhraseDecision);

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

  function setAcceptedPhraseDecision(decision: AcceptedPhraseDecision | null) {
    updateTransliteration({ acceptedPhraseDecision: decision });
  }

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

  async function copy() {
    if (!selectedCopyable) return;
    await navigator.clipboard.writeText(selectedOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
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
          Deterministic IJMES · explicit ambiguity · human-reviewed authority
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
            <StatusBadge status={selectedStatus} />
          </div>

          <div className="output-display">
            {selectedOutput || <span className="output-placeholder">Transliteration output appears here</span>}
          </div>

          {activePhraseDecision ? (
            <p className="review-warning-note" style={{ background: '#f2f7f4', borderColor: '#b7d5c5', color: '#2d6a4f' }}>
              Context-aware phrase proposal accepted by human reviewer.
            </p>
          ) : !result.copyable ? (
            <p className="review-warning-note">
              {result.tokens.some((t) => t.evidenceDerivedProposal && t.status === 'UNRESOLVED')
                ? `${result.tokens.filter((t) => t.evidenceDerivedProposal && t.status === 'UNRESOLVED').length} evidence-derived reading${result.tokens.filter((t) => t.evidenceDerivedProposal && t.status === 'UNRESOLVED').length === 1 ? '' : 's'} shown · review required before final copying.`
                : 'Human review needed. Ambiguous or unresolved material is intentionally held for review before final copy.'}
            </p>
          ) : null}


          <div className="output-footer">
            <span className="profile-tag">
              {profile === 'ijmes_citation_title' ? 'IJMES · Scholarly citation title' : 'IJMES · Scholarly'}
            </span>
            <button
              type="button"
              className="btn-primary"
              onClick={copy}
              disabled={!selectedCopyable}
            >
              {copied ? 'Copied' : selectedCopyable ? 'Copy' : 'Review needed'}
            </button>
          </div>
        </div>
      </section>

      {/* Why this reading progressive disclosure */}
      <WhyThisReading result={result} />

      {/* Phrase Assistant Panel (Quiet callout by default) */}
      {(!result.copyable || activePhraseDecision) && (
        <PhraseAssistantPanel
          result={result}
          reviewDecisions={decisions}
          acceptedDecision={acceptedPhraseDecision}
          onAcceptedDecision={setAcceptedPhraseDecision}
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
