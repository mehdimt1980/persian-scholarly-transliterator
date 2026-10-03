'use client';
import { useMemo, useState } from 'react';
import { transliterate } from '../domain/engine';
import { ProfileId, ReviewDecision } from '../domain/types';

const fixture = 'تأملی درباره ایران: مکتب تبریز و مبانی تجددخواهی';

export default function Home() {
  const [input, setInput] = useState(fixture);
  const [profile, setProfile] = useState<ProfileId>('ijmes_title');
  const [decisions, setDecisions] = useState<ReviewDecision[]>([]);
  const [manualInputs, setManualInputs] = useState<Record<string, string>>({});
  const [manualErrors, setManualErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => transliterate(input, profile, decisions), [input, profile, decisions]);

  function applyDecision(newDecision: ReviewDecision) {
    setDecisions((prev) => {
      const filtered = prev.filter((d) => d.issueId !== newDecision.issueId);
      return [...filtered, newDecision];
    });
  }

  function clearDecision(issueId: string) {
    setDecisions((prev) => prev.filter((d) => d.issueId !== issueId));
  }

  function clearAllDecisions() {
    setDecisions([]);
    setManualInputs({});
    setManualErrors({});
  }

  const [assistStatus, setAssistStatus] = useState<Record<string, 'idle' | 'loading' | 'available' | 'error' | 'unavailable'>>({});
  const [assistResolutions, setAssistResolutions] = useState<Record<string, any>>({});
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
        setAssistErrors((prev) => ({ ...prev, [issueId]: data.error || 'Assisted resolver request failed.' }));
        return;
      }

      setAssistResolutions((prev) => ({ ...prev, [issueId]: data.resolution }));
      setAssistStatus((prev) => ({ ...prev, [issueId]: 'available' }));
    } catch (err: unknown) {
      setAssistStatus((prev) => ({ ...prev, [issueId]: 'error' }));
      setAssistErrors((prev) => ({ ...prev, [issueId]: err instanceof Error ? err.message : 'Network error.' }));
    }
  }

  function applyAssistedCandidate(issueId: string, candidate: any, resolution: any) {
    let action = 'MANUAL_CANONICAL_OVERRIDE';
    let selectedAlternativeId: string | undefined = undefined;
    let manualCanonicalTransliteration: string | undefined = undefined;

    if (candidate.kind === 'EXISTING_LEXICAL_READING') {
      action = 'SELECT_LEXICAL_READING';
      selectedAlternativeId = candidate.alternativeId ?? candidate.canonical;
    } else if (candidate.kind === 'MANUAL_CANONICAL') {
      action = 'MANUAL_CANONICAL_OVERRIDE';
      manualCanonicalTransliteration = candidate.canonical;
    } else if (candidate.kind === 'IZAFAT_DECISION') {
      action = candidate.relationDecision ?? 'ACCEPT_IZAFAT';
    } else if (candidate.kind === 'MORPHOLOGY_BRANCH') {
      action = 'SELECT_MORPHOLOGY';
      selectedAlternativeId = candidate.morphologyBranch;
    }

    applyDecision({
      issueId,
      action: action as any,
      selectedAlternativeId,
      manualCanonicalTransliteration,
      assistance: {
        suggestionId: candidate.id,
        provider: resolution.provider,
        model: resolution.model,
        promptVersion: resolution.promptVersion
      }
    });
  }

  function handleManualSubmit(issueId: string) {
    const value = manualInputs[issueId];
    if (!value || value.trim().length === 0) {
      setManualErrors((prev) => ({ ...prev, [issueId]: 'Transliteration value cannot be empty.' }));
      return;
    }
    if (/[\u0600-\u06FF]/u.test(value)) {
      setManualErrors((prev) => ({ ...prev, [issueId]: 'Canonical transliteration cannot contain Persian or Arabic script.' }));
      return;
    }
    setManualErrors((prev) => {
      const next = { ...prev };
      delete next[issueId];
      return next;
    });
    applyDecision({
      issueId,
      action: 'MANUAL_CANONICAL_OVERRIDE',
      manualCanonicalTransliteration: value.trim()
    });
  }

  async function copy() {
    if (!result.copyable) return;
    await navigator.clipboard.writeText(result.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  const hasIssues = result.reviewIssues.length > 0;
  const hasDecisions = result.appliedDecisions.length > 0;

  return (
    <main>
      <header>
        <p className="eyebrow">SCHOLARLY LANGUAGE TOOLS · FOUNDATION</p>
        <h1>Persian <em>→</em> transliteration</h1>
        <p className="lede">A transparent IJMES workflow for academic Persian, designed to show where the source is certain—and where human review is required.</p>
      </header>

      <section className="workspace">
        <div className="panel input-panel">
          <div className="panel-top">
            <label htmlFor="source">Persian source</label>
            <span>RTL · Unicode safe</span>
          </div>
          <textarea
            id="source"
            dir="rtl"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <div className="controls">
            <label>
              Context
              <select value={profile} onChange={(event) => setProfile(event.target.value as ProfileId)}>
                <option value="ijmes_title">Book / article title</option>
                <option value="ijmes_full">Full scholarly / technical term</option>
              </select>
            </label>
          </div>
        </div>

        <div className="panel output-panel">
          <div className="panel-top">
            <label>Selected transliteration</label>
            <span className={`status ${result.status.toLowerCase()}`}>{result.status}</span>
          </div>
          <div className="output">
            {result.output || <span className="muted">Output appears here</span>}
          </div>
          {!result.copyable && (
            <p className="review-notice">
              Human review required. Ambiguous or unresolved material is intentionally not copyable as final transliteration.
            </p>
          )}
          <div className="output-actions">
            <span className="profile">
              {profile === 'ijmes_title' ? 'IJMES · title presentation' : 'IJMES · full scholarly'}
            </span>
            <button onClick={copy} disabled={!result.copyable}>
              {copied ? 'Copied' : result.copyable ? 'Copy output' : 'Review required'}
            </button>
          </div>
        </div>
      </section>

      {/* Human Review Workspace Section */}
      {(hasIssues || hasDecisions) && (
        <section className={`review-workspace ${!hasIssues ? 'resolved-all' : ''}`}>
          <div className="review-workspace-header">
            <div>
              <p className="eyebrow">HUMAN REVIEW WORKSPACE</p>
              <h3>{hasIssues ? `Review required (${result.reviewIssues.length} pending)` : 'All review blockers resolved'}</h3>
            </div>
            {hasDecisions && (
              <button className="btn-clear" onClick={clearAllDecisions}>
                Reset all decisions ({result.appliedDecisions.length})
              </button>
            )}
          </div>

          {/* Pending Review Issues */}
          {result.reviewIssues.map((issue) => (
            <div className="review-card" key={issue.id}>
              <div className="review-card-top">
                <span className="surface" dir="rtl">{issue.surface}</span>
                <span className="badge ambiguous">{issue.type}</span>
              </div>
              <div className="review-card-body">
                <p>{issue.description}</p>
                {issue.evidenceSummary && <p className="evidence-summary">{issue.evidenceSummary}</p>}
              </div>

              <div className="review-actions">
                {issue.type === 'LEXICAL_AMBIGUITY' && (
                  <>
                    {issue.alternatives.map((alt) => (
                      <button
                        key={alt.id}
                        className="secondary"
                        onClick={() => applyDecision({
                          issueId: issue.id,
                          action: 'SELECT_LEXICAL_READING',
                          selectedAlternativeId: alt.canonical ?? alt.id
                        })}
                      >
                        Select: <strong>{alt.canonical ?? alt.label}</strong>
                      </button>
                    ))}
                  </>
                )}

                {issue.type === 'IZAFAT_CANDIDATE' && (
                  <>
                    <button
                      className="secondary"
                      onClick={() => applyDecision({ issueId: issue.id, action: 'ACCEPT_IZAFAT' })}
                    >
                      Accept izāfat (-i)
                    </button>
                    <button
                      className="secondary"
                      onClick={() => applyDecision({ issueId: issue.id, action: 'REJECT_IZAFAT' })}
                    >
                      Reject izāfat (no -i)
                    </button>
                  </>
                )}

                {issue.type === 'MORPHOLOGY_AMBIGUITY' && (
                  <>
                    {issue.alternatives.map((alt) => (
                      <button
                        key={alt.id}
                        className="secondary"
                        onClick={() => applyDecision({
                          issueId: issue.id,
                          action: 'SELECT_MORPHOLOGY',
                          selectedAlternativeId: alt.id
                        })}
                      >
                        {alt.label}: <strong>{alt.canonical ?? alt.id}</strong>
                      </button>
                    ))}
                  </>
                )}

                {issue.allowedActions.includes('MANUAL_CANONICAL_OVERRIDE') && (
                  <div className="manual-input-row">
                    <input
                      type="text"
                      placeholder="Enter canonical transliteration (e.g. mashrūṭa-khvāhī)"
                      value={manualInputs[issue.id] ?? ''}
                      onChange={(e) => setManualInputs((prev) => ({ ...prev, [issue.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleManualSubmit(issue.id); }}
                    />
                    <button onClick={() => handleManualSubmit(issue.id)}>Apply manual override</button>
                  </div>
                )}
              </div>

              {manualErrors[issue.id] && (
                <p className="warning" style={{ marginTop: '8px', fontSize: '11px' }}>
                  {manualErrors[issue.id]}
                </p>
              )}

              {/* Assisted Resolver Section */}
              <div className="assisted-section">
                <div className="assisted-header">
                  <span>Assisted Resolver</span>
                  <button
                    className="secondary"
                    disabled={assistStatus[issue.id] === 'loading'}
                    onClick={() => requestAssistance(issue.id)}
                  >
                    {assistStatus[issue.id] === 'loading' ? 'Resolving...' : 'Ask resolver'}
                  </button>
                </div>

                {assistStatus[issue.id] === 'unavailable' && (
                  <p className="assisted-msg">Assisted resolver is currently unavailable (API key not configured).</p>
                )}

                {assistStatus[issue.id] === 'error' && (
                  <p className="assisted-msg error">{assistErrors[issue.id] || 'Assisted resolver failed.'}</p>
                )}

                {assistResolutions[issue.id] && assistResolutions[issue.id].issueId === issue.id && (
                  <div className="assisted-candidates-grid">
                    {assistResolutions[issue.id].candidates.map((c: any) => (
                      <div className="assisted-candidate-card" key={c.id}>
                        <div className="assisted-candidate-info">
                          <div className="assisted-candidate-top">
                            <span className="badge-basis">#{c.rank}</span>
                            <strong>
                              {c.kind === 'EXISTING_LEXICAL_READING' && (c.canonical || c.alternativeId)}
                              {c.kind === 'MANUAL_CANONICAL' && c.canonical}
                              {c.kind === 'IZAFAT_DECISION' && (c.relationDecision === 'ACCEPT_IZAFAT' ? 'Accept izāfat (-i)' : 'Reject izāfat')}
                              {c.kind === 'MORPHOLOGY_BRANCH' && (c.morphologyBranch === 'WHOLE_WORD' ? 'Whole word branch' : 'Productive segmentation')}
                            </strong>
                            <span className="badge-basis">{c.basis}</span>
                            {c.modelConfidence !== undefined && (
                              <span className="badge-basis">{Math.round(c.modelConfidence * 100)}% conf</span>
                            )}
                            <span className="ai-badge">AI suggestion — not authoritative</span>
                          </div>
                          <p className="assisted-rationale">{c.rationale}</p>
                          {c.evidenceRefs && c.evidenceRefs.length > 0 && (
                            <p className="assisted-meta">Refs: {c.evidenceRefs.join(', ')}</p>
                          )}
                        </div>
                        <button
                          className="secondary"
                          onClick={() => applyAssistedCandidate(issue.id, c, assistResolutions[issue.id])}
                        >
                          Use this suggestion
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Active Decisions */}
          {result.appliedDecisions.map((decision) => (
            <div className="review-active-status" key={decision.issueId}>
              <span>Applied override: <strong>{decision.action}</strong> {decision.manualCanonicalTransliteration ? `("${decision.manualCanonicalTransliteration}")` : decision.selectedAlternativeId ? `("${decision.selectedAlternativeId}")` : ''}</span>
              <button className="btn-clear" onClick={() => clearDecision(decision.issueId)}>Undo decision</button>
            </div>
          ))}
        </section>
      )}

      {/* Token Inspection Section */}
      <section className="inspection">
        <div className="section-heading">
          <div>
            <p className="eyebrow">INSPECTION</p>
            <h2>Token-level evidence</h2>
          </div>
          <p>Normalized surface, lookup form, orthographic evidence, lexical status, and rule provenance remain distinct.</p>
        </div>
        <div className="token-list">
          {result.tokens.map((token, index) => {
            if (!token.normalizedSurface.trim()) return null;
            const analysis = result.analyses.find((item) => item.tokenIndex === index);
            return (
              <article className="token" key={`${token.normalizedStart}-${index}`}>
                <div className="token-line">
                  <span className="source" dir="rtl">{token.normalizedSurface}</span>
                  <span className="arrow">→</span>
                  <span>{token.rendered}</span>
                  <span className={`badge ${token.status.toLowerCase()}`}>{token.status}</span>
                </div>
                <div className="token-meta">
                  {token.automaticStatus && token.automaticStatus !== token.status && (
                    <span className="auto-badge">automatic: {token.automaticStatus}</span>
                  )}
                  {analysis && <span>normalized span: {analysis.normalizedStart}–{analysis.normalizedEnd}</span>}
                  {analysis && analysis.lookupForm !== analysis.normalizedSurface && (
                    <span>lookup: <bdi dir="rtl">{analysis.lookupForm}</bdi></span>
                  )}
                  {analysis?.explicitVowels.map((vowel) => (
                    <span key={`${vowel.normalizedTokenOffset}-${vowel.mark}`}>
                      {vowel.mark.toLowerCase()} → {vowel.vowel} · normalized token offset {vowel.normalizedTokenOffset}
                      {vowel.relationOnly ? ' · relation evidence' : ''}
                    </span>
                  ))}
                  {analysis?.unsupportedCombiningMarks.map((mark) => (
                    <span className="warning" key={`${mark.normalizedTokenOffset}-${mark.mark}`}>
                      unsupported combining mark U+{mark.mark.codePointAt(0)?.toString(16).toUpperCase()} · normalized token offset {mark.normalizedTokenOffset}
                    </span>
                  ))}
                  {analysis && analysis.zwnjBoundaries.length > 0 && (
                    <span>ZWNJ boundaries: {analysis.zwnjBoundaries.join(', ')} · segments: {analysis.evidencedSegments.join(' | ')}</span>
                  )}
                  {token.confidence !== undefined && (
                    <span>confidence {Math.round(token.confidence * 100)}%</span>
                  )}
                  {token.diagnosticScaffold && <span>diagnostic only: {token.diagnosticScaffold}</span>}
                  {token.alternatives.length > 0 && (
                    <span>alternatives: {token.alternatives.join(' · ')}</span>
                  )}
                  {token.appliedRules.length > 0 && (
                    <span>{token.appliedRules.map((rule) => rule.id).join(' · ')}</span>
                  )}
                  {token.warnings.map((warning) => (
                    <span className="warning" key={warning}>{warning}</span>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Morphology Section */}
      <section className="inspection morphology">
        <div className="section-heading">
          <div>
            <p className="eyebrow">MORPHOLOGY</p>
            <h2>Productive suffix evidence</h2>
          </div>
          <p>Segmentation is shown separately from lexical resolution and IJMES rendering.</p>
        </div>
        {result.morphology.length === 0 ? (
          <p className="empty-evidence">No supported productive suffix analysis.</p>
        ) : (
          <div className="token-list">
            {result.morphology.map((analysis) => (
              <article className="token" key={`morph-${analysis.tokenIndex}`}>
                <div className="token-line">
                  <span className="source" dir="rtl">{analysis.normalizedSurface}</span>
                  <span className="arrow">→</span>
                  <span dir="rtl">{analysis.morphemes.map((item) => item.normalizedSurface).join(' + ')}</span>
                  <span className={`badge ${analysis.status === 'CONFIRMED' ? 'lexicon_resolved' : 'ambiguous'}`}>
                    {analysis.status}
                  </span>
                </div>
                <div className="token-meta">
                  <span>
                    stem: <bdi dir="rtl">{analysis.lexicalLookupStem}</bdi>
                    {analysis.stemEntry?.readings[0] && ` → ${analysis.stemEntry.readings[0].canonical}`}
                  </span>
                  <span>host ending: {analysis.hostEnding}</span>
                  {analysis.morphemes.filter((item) => item.type !== 'STEM').map((item) => (
                    <span key={`${item.type}-${item.normalizedStart}`}>
                      {item.normalizedSurface} · {item.type}
                      {item.canonicalRendering && ` → -${item.canonicalRendering}`}
                    </span>
                  ))}
                  {analysis.evidence.map((item) => (
                    <span key={`${item.kind}-${item.rule.id}`}>{item.kind} · {item.rule.id}</span>
                  ))}
                  {analysis.alternatives.length > 0 && <span>alternatives: {analysis.alternatives.join(' · ')}</span>}
                  {analysis.warnings.map((warning) => (
                    <span className="warning" key={warning}>{warning}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Relations Section */}
      <section className="inspection relations">
        <div className="section-heading">
          <div>
            <p className="eyebrow">RELATIONS</p>
            <h2>Context evidence</h2>
          </div>
          <p>Known words can still have an uncertain grammatical relation.</p>
        </div>
        {result.relations.length === 0 ? (
          <p className="empty-evidence">No contextual relation detected.</p>
        ) : (
          <div className="token-list">
            {result.relations.map((relation, index) => (
              <article className="token" key={`${relation.sourceTokenIndex}-${relation.targetTokenIndex}-${index}`}>
                <div className="token-line">
                  <span className="source" dir="rtl">{result.tokens[relation.sourceTokenIndex].normalizedSurface}</span>
                  <span className="arrow">IZĀFAT</span>
                  <span dir="rtl">{result.tokens[relation.targetTokenIndex].normalizedSurface}</span>
                  <span className={`badge ${relation.status === 'CANDIDATE' ? 'ambiguous' : relation.disposition === 'REJECTED' ? 'user_override' : ''}`}>
                    {relation.disposition === 'REJECTED' ? 'REJECTED' : relation.status}
                  </span>
                </div>
                <div className="token-meta">
                  <span>rendering: {relation.rendering}</span>
                  {relation.evidence.map((evidence) => (
                    <span key={evidence.rule.id}>{evidence.rule.id} · {evidence.source}</span>
                  ))}
                  {relation.warnings.map((warning) => (
                    <span className="warning" key={warning}>{warning}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer>
        <span>Not an official IJMES / Cambridge product.</span>
        <span>Source-grounded · Reviewable · Unicode</span>
      </footer>
    </main>
  );
}
