import React from 'react';
import type { TransliterationResult } from '../../domain/types';
import type { AiExplanation } from '../../domain/assistance';
import ScholarlyProvenance from './ScholarlyProvenance';

interface WhyThisReadingProps {
  result: TransliterationResult;
  /** Optional AI draft explanation; rendered only here (single source for rationale). */
  explanation?: AiExplanation | null;
}

export default function WhyThisReading({ result, explanation = null }: WhyThisReadingProps) {
  const issueCount = result.reviewIssues.length;
  const appliedCount = result.appliedDecisions.length;
  const profileName =
    result.profile === 'ijmes_citation_title'
      ? 'IJMES · Scholarly citation title profile'
      : 'IJMES · Full scholarly / technical profile';

  return (
    <div className="why-this-reading">
      <details className="why-disclosure">
        <summary className="why-summary">
          <span className="why-title">Why this reading?</span>
          <span className="why-hint">
            {explanation ? 'AI draft explanation · ' : ''}
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

          {explanation && (
            <div className="why-section" id="ai-draft-explanation">
              <h4 className="why-section-heading">AI draft explanation (provisional, not authority)</h4>
              <p className="why-section-text">{explanation.rationale}</p>
              <p className="why-section-text">
                Basis: {explanation.basis}
                {explanation.disposition === 'REVIEW_REQUIRED' ? ' · model flagged uncertainty — review required' : ''}
              </p>
              {explanation.tokens.length > 0 && (
                <ul className="why-section-text">
                  {explanation.tokens.map((row) => (
                    <li key={row.tokenIndex}>
                      <bdi dir="rtl">{row.surface}</bdi> → <strong>{row.proposedReading}</strong>
                      {row.locked ? ' (deterministic reading)' : ' (AI-proposed)'}
                      {row.lexicalSources.length > 0 ? ` · sources: ${row.lexicalSources.join(', ')}` : ''}
                      {row.note ? ` — ${row.note}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {explanation.assumptions.length > 0 && (
                <>
                  <p className="why-section-text"><strong>Assumptions</strong></p>
                  <ul className="why-section-text">
                    {explanation.assumptions.map((a) => <li key={a}>{a}</li>)}
                  </ul>
                </>
              )}
              {explanation.warnings.length > 0 && (
                <>
                  <p className="why-section-text"><strong>Uncertainty</strong></p>
                  <ul className="why-section-text">
                    {explanation.warnings.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                </>
              )}
              <p className="why-section-text">
                Provenance: {explanation.provenance.provider} · {explanation.provenance.model} · prompt {explanation.provenance.promptVersion}
                {explanation.provenance.modelEstimate !== null
                  ? ` · model estimate ${Math.round(explanation.provenance.modelEstimate * 100)}% (uncalibrated, not a validated accuracy score)`
                  : ''}
              </p>
            </div>
          )}

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
