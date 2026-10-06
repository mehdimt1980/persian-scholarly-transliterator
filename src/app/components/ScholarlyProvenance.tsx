import React from 'react';

export interface ProvenanceStage {
  label: string;
  value: string;
  source?: string;
  rule?: string;
  isAuthoritative?: boolean;
}

interface ScholarlyProvenanceProps {
  stages?: ProvenanceStage[];
  hasExternalEvidence?: boolean;
  externalEvidenceSummary?: string;
  emptyNotice?: string;
}

export default function ScholarlyProvenance({
  stages = [],
  hasExternalEvidence = false,
  externalEvidenceSummary,
  emptyNotice = 'No external authority evidence is attached to this transliteration.'
}: ScholarlyProvenanceProps) {
  if (!hasExternalEvidence && stages.length === 0) {
    return (
      <div className="provenance-empty">
        <span className="provenance-empty-label">External evidence</span>
        <p className="provenance-empty-text">{emptyNotice}</p>
      </div>
    );
  }

  return (
    <div className="provenance-trail" aria-label="Scholarly Provenance Trail">
      {externalEvidenceSummary && (
        <div className="provenance-summary">
          <span className="provenance-label">Attached Evidence:</span>
          <span className="provenance-val">{externalEvidenceSummary}</span>
        </div>
      )}
      {stages.length > 0 && (
        <div className="provenance-stages">
          {stages.map((stage, idx) => (
            <div key={idx} className="provenance-stage">
              <div className="stage-header">
                <span className="stage-num">{idx + 1}</span>
                <span className="stage-label">{stage.label}</span>
                {stage.source && <span className="stage-source">{stage.source}</span>}
              </div>
              <div className="stage-content">
                <div className="stage-value">{stage.value}</div>
                {stage.rule && <div className="stage-rule">Rule: {stage.rule}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
