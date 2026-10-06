import React from 'react';
import type { TransliterationResult } from '../../domain/types';
import ScholarlyProvenance from './ScholarlyProvenance';

interface WhyThisReadingProps {
  result: TransliterationResult;
}

export default function WhyThisReading({ result }: WhyThisReadingProps) {
  const issueCount = result.reviewIssues.length;
  const appliedCount = result.appliedDecisions.length;
  const profileName =
    result.profile === 'ijmes_title'
      ? 'IJMES · Title presentation profile'
      : 'IJMES · Full scholarly / technical profile';

  return (
    <div className="why-this-reading">
      <details className="why-disclosure">
        <summary className="why-summary">
          <span className="why-title">Why this reading?</span>
          <span className="why-hint">
            {issueCount === 0 ? 'Deterministic rules applied' : `${issueCount} item${issueCount === 1 ? '' : 's'} need review`}
          </span>
        </summary>

        <div className="why-content">
          <div className="why-section">
            <h4 className="why-section-heading">Interpretation basis</h4>
            <p className="why-section-text">
              Deterministic IJMES scholarly transliteration rules using the <em>{profileName}</em>.
            </p>
          </div>

          <div className="why-section">
            <h4 className="why-section-heading">Ambiguities</h4>
            <p className="why-section-text">
              {issueCount === 0 ? (
                'No unresolved ambiguity detected in source text.'
              ) : (
                <>
                  <strong>{issueCount}</strong> reading{issueCount === 1 ? '' : 's'} require human review before becoming canonical transliteration.
                </>
              )}
            </p>
          </div>

          <div className="why-section">
            <h4 className="why-section-heading">External evidence</h4>
            <ScholarlyProvenance
              hasExternalEvidence={false}
              emptyNotice="No external authority evidence is attached to this transliteration."
            />
          </div>

          <details className="technical-details-disclosure">
            <summary className="technical-summary">Technical details</summary>
            <div className="technical-body">
              <div className="tech-row">
                <span className="tech-label">Profile ID:</span>
                <code className="tech-val">{result.profile}</code>
              </div>
              <div className="tech-row">
                <span className="tech-label">Status Enum:</span>
                <code className="tech-val">{result.status}</code>
              </div>
              <div className="tech-row">
                <span className="tech-label">Copyable:</span>
                <code className="tech-val">{result.copyable ? 'true' : 'false'}</code>
              </div>
              <div className="tech-row">
                <span className="tech-label">Applied Decisions:</span>
                <code className="tech-val">{appliedCount}</code>
              </div>
              <div className="tech-row">
                <span className="tech-label">Tokens Analyzed:</span>
                <code className="tech-val">{result.tokens.length}</code>
              </div>
              <div className="tech-row">
                <span className="tech-label">Morphology Analyses:</span>
                <code className="tech-val">{result.morphology.length}</code>
              </div>
              <div className="tech-row">
                <span className="tech-label">Grammatical Relations:</span>
                <code className="tech-val">{result.relations.length}</code>
              </div>
            </div>
          </details>
        </div>
      </details>
    </div>
  );
}
