'use client';

import React from 'react';
import type { TransliterationResult } from '../../domain/types';
import StatusBadge from './StatusBadge';

interface InspectionSectionProps {
  result: TransliterationResult;
}

export default function InspectionSection({ result }: InspectionSectionProps) {
  const activeTokens = result.tokens.filter((t) => t.normalizedSurface.trim().length > 0);

  return (
    <section className="inspection-section" aria-labelledby="inspection-heading">
      <div className="inspection-heading-group">
        <div>
          <span className="inspection-kicker">Linguistic & Rule Provenance</span>
          <h2 id="inspection-heading" className="inspection-title">
            Scholarly Evidence Inspection
          </h2>
        </div>
        <p className="inspection-subtitle">
          Orthographic normalization, lexical lookup, productive morphology, and grammatical relations remain individually verifiable.
        </p>
      </div>

      <details className="inspection-details-block" open>
        <summary className="inspection-summary">
          <span className="inspection-summary-title">Token-Level Analysis</span>
          <span className="inspection-count">({activeTokens.length} tokens)</span>
        </summary>

        <div className="token-list">
          {result.tokens.map((token, index) => {
            if (!token.normalizedSurface.trim()) return null;
            const analysis = result.analyses.find((item) => item.tokenIndex === index);
            return (
              <article className="token-row" key={`${token.normalizedStart}-${index}`}>
                <div className="token-main-line">
                  <span className="token-source" dir="rtl">
                    {token.normalizedSurface}
                  </span>
                  <span className="token-arrow" aria-hidden="true">→</span>
                  <span className="token-rendered">{token.rendered}</span>
                  <StatusBadge status={token.status} />
                </div>

                <div className="token-meta-items">
                  {token.automaticStatus && token.automaticStatus !== token.status && (
                    <span className="meta-item auto-tag">automatic: {token.automaticStatus}</span>
                  )}
                  {analysis && (
                    <span className="meta-item">
                      span: {analysis.normalizedStart}–{analysis.normalizedEnd}
                    </span>
                  )}
                  {analysis && analysis.lookupForm !== analysis.normalizedSurface && (
                    <span className="meta-item">
                      lookup: <bdi dir="rtl">{analysis.lookupForm}</bdi>
                    </span>
                  )}
                  {analysis?.explicitVowels.map((vowel) => (
                    <span className="meta-item" key={`${vowel.normalizedTokenOffset}-${vowel.mark}`}>
                      {vowel.mark.toLowerCase()} → {vowel.vowel} (offset {vowel.normalizedTokenOffset})
                    </span>
                  ))}
                  {analysis && analysis.zwnjBoundaries.length > 0 && (
                    <span className="meta-item">
                      ZWNJ segments: {analysis.evidencedSegments.join(' | ')}
                    </span>
                  )}
                  {token.alternatives.length > 0 && (
                    <span className="meta-item">
                      alternatives: {token.alternatives.join(' · ')}
                    </span>
                  )}
                  {token.appliedRules.length > 0 && (
                    <span className="meta-item rule-tag">
                      {token.appliedRules.map((r) => r.id).join(' · ')}
                    </span>
                  )}
                  {token.evidenceDerivedProposal && (
                    <div className="meta-item evidence-proposal-item" style={{ background: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: '4px', padding: '6px 8px', marginTop: '4px', width: '100%' }}>
                      <div>
                        <strong>Evidence-derived proposal:</strong> <code>{token.evidenceDerivedProposal.hypothesis}</code> ({token.evidenceDerivedProposal.confidenceTier.toLowerCase().replace(/_/g, ' ')})
                      </div>
                      <div style={{ fontSize: '0.85em', color: '#6c757d' }}>
                        Source: English Wiktionary (Kaikki) · Profiles: {token.evidenceDerivedProposal.sourceProfiles.join(', ')} · Pack: v{token.evidenceDerivedProposal.packVersion}
                      </div>
                      <div style={{ fontSize: '0.8em', color: '#b02a37', marginTop: '2px' }}>
                        <em>[External evidence · not reviewed authority · requires human review]</em>
                      </div>
                    </div>
                  )}
                  {token.warnings.map((warning) => (
                    <span className="meta-item warning" key={warning}>
                      {warning}
                    </span>
                  ))}

                </div>
              </article>
            );
          })}
        </div>
      </details>

      {/* Suffix Morphology Section */}
      <details className="inspection-details-block">
        <summary className="inspection-summary">
          <span className="inspection-summary-title">Productive Suffix Morphology</span>
          <span className="inspection-count">({result.morphology.length} analyses)</span>
        </summary>

        {result.morphology.length === 0 ? (
          <p className="empty-inspection">No productive suffix analysis detected in current text.</p>
        ) : (
          <div className="token-list">
            {result.morphology.map((analysis) => (
              <article className="token-row" key={`morph-${analysis.tokenIndex}`}>
                <div className="token-main-line">
                  <span className="token-source" dir="rtl">
                    {analysis.normalizedSurface}
                  </span>
                  <span className="token-arrow" aria-hidden="true">→</span>
                  <span className="token-rendered" dir="rtl">
                    {analysis.morphemes.map((item) => item.normalizedSurface).join(' + ')}
                  </span>
                  <StatusBadge status={analysis.status} />
                </div>
                <div className="token-meta-items">
                  <span className="meta-item">
                    stem: <bdi dir="rtl">{analysis.lexicalLookupStem}</bdi>
                    {analysis.stemEntry?.readings[0] && ` → ${analysis.stemEntry.readings[0].canonical}`}
                  </span>
                  <span className="meta-item">host ending: {analysis.hostEnding}</span>
                  {analysis.morphemes
                    .filter((item) => item.type !== 'STEM')
                    .map((item) => (
                      <span className="meta-item" key={`${item.type}-${item.normalizedStart}`}>
                        {item.normalizedSurface} · {item.type}
                        {item.canonicalRendering && ` → -${item.canonicalRendering}`}
                      </span>
                    ))}
                  {analysis.evidence.map((item) => (
                    <span className="meta-item rule-tag" key={`${item.kind}-${item.rule.id}`}>
                      {item.kind} · {item.rule.id}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </details>

      {/* Relations Section */}
      <details className="inspection-details-block">
        <summary className="inspection-summary">
          <span className="inspection-summary-title">Context & Grammatical Relations</span>
          <span className="inspection-count">({result.relations.length} relations)</span>
        </summary>

        {result.relations.length === 0 ? (
          <p className="empty-inspection">No contextual relation detected.</p>
        ) : (
          <div className="token-list">
            {result.relations.map((relation, index) => (
              <article
                className="token-row"
                key={`${relation.sourceTokenIndex}-${relation.targetTokenIndex}-${index}`}
              >
                <div className="token-main-line">
                  <span className="token-source" dir="rtl">
                    {result.tokens[relation.sourceTokenIndex]?.normalizedSurface}
                  </span>
                  <span className="relation-tag">IZĀFAT</span>
                  <span className="token-target" dir="rtl">
                    {result.tokens[relation.targetTokenIndex]?.normalizedSurface}
                  </span>
                  <StatusBadge
                    status={
                      relation.disposition === 'REJECTED'
                        ? 'REJECTED'
                        : relation.status
                    }
                  />
                </div>
                <div className="token-meta-items">
                  <span className="meta-item">rendering: {relation.rendering}</span>
                  {relation.evidence.map((evidence) => (
                    <span className="meta-item rule-tag" key={evidence.rule.id}>
                      {evidence.rule.id} · {evidence.source}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </details>
    </section>
  );
}
