'use client';

import React from 'react';
import type { ReviewActionType, ReviewDecision, ReviewIssue, TransliterationResult } from '../../domain/types';
import type { AssistedCandidate, AssistedResolution } from '../../domain/assistance';
import ReviewIssueCard from './ReviewIssueCard';

interface ReviewQueueProps {
  result: TransliterationResult;
  decisions: ReviewDecision[];
  assistStatus: Record<string, 'idle' | 'loading' | 'available' | 'error' | 'stale' | 'unavailable'>;
  assistResolutions: Record<string, AssistedResolution>;
  assistErrors: Record<string, string>;
  onRequestAssistance: (issueId: string) => void;
  onApplyAssistedCandidate: (issue: ReviewIssue, candidate: AssistedCandidate, resolution: AssistedResolution) => void;
  onApplyDecision: (decision: ReviewDecision) => void;
  onClearDecision: (issueId: string) => void;
  onClearAllDecisions: () => void;
  actionForAlternative: (issue: ReviewIssue, altId: string) => ReviewActionType;
}

export default function ReviewQueue({
  result,
  decisions,
  assistStatus,
  assistResolutions,
  assistErrors,
  onRequestAssistance,
  onApplyAssistedCandidate,
  onApplyDecision,
  onClearDecision,
  onClearAllDecisions,
  actionForAlternative
}: ReviewQueueProps) {
  const issues = result.reviewIssues;
  const appliedCount = result.appliedDecisions.length;

  if (issues.length === 0 && appliedCount === 0) {
    return null;
  }

  return (
    <section className="review-queue-section" aria-labelledby="review-queue-heading">
      <div className="review-queue-header">
        <div>
          <h3 id="review-queue-heading" className="review-queue-title">
            Human Review Queue ({issues.length})
          </h3>
          <p className="review-queue-subtitle">
            Select an alternative reading or provide a manual transliteration. Every choice creates explicit user-decision provenance.
          </p>
        </div>
        {appliedCount > 0 && (
          <button type="button" className="btn-reset" onClick={onClearAllDecisions}>
            Reset all choices ({appliedCount})
          </button>
        )}
      </div>

      <div className="review-cards-stack">
        {issues.map((issue) => {
          const applied = result.appliedDecisions.find((d) => d.issueId === issue.id);
          const status = assistStatus[issue.id] || 'idle';
          const resolution = assistResolutions[issue.id];
          const error = assistErrors[issue.id];

          return (
            <ReviewIssueCard
              key={issue.id}
              issue={issue}
              result={result}
              appliedDecision={applied}
              assistStatus={status}
              assistResolution={resolution}
              assistError={error}
              onRequestAssistance={onRequestAssistance}
              onApplyAssistedCandidate={onApplyAssistedCandidate}
              onApplyDecision={onApplyDecision}
              onClearDecision={onClearDecision}
              actionForAlternative={actionForAlternative}
            />
          );
        })}
      </div>
    </section>
  );
}
