'use client';
import { useMemo, useState } from 'react';
import { transliterate } from '../domain/engine';
import { ProfileId, ReviewDecision, ReviewIssue } from '../domain/types';
import {
  AssistedCandidate,
  AssistedResolution,
  buildResolverRequest,
  candidateToReviewDecision,
  computeRequestFingerprint
} from '../domain/assistance';
import {
  importBibliographyFromCsv,
  validateFileSize,
  processBibliographyBatch,
  exportReviewCsv,
  exportFinalCsv,
  exportToRis,
  exportToBibTeX,
  makeBibliographyIssueScopeKey,
  BibliographyFieldPath,
  BibliographyRecord,
  BibliographyReviewDecision,
  BibliographyDiagnostic,
  BibliographyExportReport,
  ScholarlyExportMode,
  ProcessedBibliographyRecord,
  DEFAULT_IMPORT_LIMITS
} from '../domain/bibliography';

const fixture = 'تأملی درباره ایران: مکتب تبریز و مبانی تجددخواهی';

const sampleCsv = `id,type,title,container_title,authors,year,publisher,place,doi
rec_1,BOOK,مشروطه,,شاه | صفوی,1380,دولت,تهران,
rec_2,JOURNAL_ARTICLE,دولت و جامعه,فرهنگ,شاه,1995,,,,10.1234/in.1995.13.3
rec_3,BOOK,کرم,,نویسنده,1400,انتشارات علم,تهران,
rec_4,BOOK,State and Society in Iran,,Homa Katouzian,2000,I.B. Tauris,London,10.5040/9780755609437`;

function actionForAlternative(issue: ReviewIssue, altId: string) {
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
  const [workspaceMode, setWorkspaceMode] = useState<'single' | 'batch'>('single');

  // Single mode state
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

  // --- Batch Bibliography State ---
  const [csvText, setCsvText] = useState(sampleCsv);
  const [batchRecords, setBatchRecords] = useState<BibliographyRecord[]>([]);
  const [importDiagnostics, setImportDiagnostics] = useState<BibliographyDiagnostic[]>([]);
  const [batchReviewDecisions, setBatchReviewDecisions] = useState<BibliographyReviewDecision[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [batchFilter, setBatchFilter] = useState<'ALL' | 'READY' | 'REVIEW_REQUIRED' | 'INVALID'>('ALL');
  const [exportMode, setExportMode] = useState<ScholarlyExportMode>('STRICT_ALL');
  const [exportReport, setExportReport] = useState<BibliographyExportReport | null>(null);

  // Batch Field-Scoped Assistance State
  const [batchAssistStatus, setBatchAssistStatus] = useState<Record<string, AssistStatusType>>({});
  const [batchAssistResolutions, setBatchAssistResolutions] = useState<Record<string, AssistedResolution>>({});
  const [batchAssistErrors, setBatchAssistErrors] = useState<Record<string, string>>({});

  const processedBatch = useMemo(
    () => processBibliographyBatch(batchRecords, batchReviewDecisions),
    [batchRecords, batchReviewDecisions]
  );

  const selectedRecord: ProcessedBibliographyRecord | undefined = useMemo(
    () => processedBatch.records.find((r) => r.record.id === selectedRecordId),
    [processedBatch, selectedRecordId]
  );

  function handleImportCsv() {
    const result = importBibliographyFromCsv(csvText);
    if (!result.success) {
      setBatchRecords([]);
      setImportDiagnostics(result.diagnostics);
      setSelectedRecordId(null);
      setBatchReviewDecisions([]);
      setExportReport(null);
      return;
    }
    setBatchRecords(result.records);
    setImportDiagnostics(result.diagnostics);
    setBatchReviewDecisions([]);
    setExportReport(null);
    if (result.records.length > 0) {
      setSelectedRecordId(result.records[0].id);
    } else {
      setSelectedRecordId(null);
    }
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Item 8 & 25: Check file size BEFORE reading into memory
    const sizeCheck = validateFileSize(file.size, DEFAULT_IMPORT_LIMITS.maxFileSize);
    if (!sizeCheck.valid && sizeCheck.diagnostic) {
      setBatchRecords([]);
      setImportDiagnostics([sizeCheck.diagnostic]);
      setSelectedRecordId(null);
      setBatchReviewDecisions([]);
      setExportReport(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setCsvText(content);
      const result = importBibliographyFromCsv(content);
      if (!result.success) {
        setBatchRecords([]);
        setImportDiagnostics(result.diagnostics);
        setSelectedRecordId(null);
        setBatchReviewDecisions([]);
        setExportReport(null);
        return;
      }
      setBatchRecords(result.records);
      setImportDiagnostics(result.diagnostics);
      setBatchReviewDecisions([]);
      setExportReport(null);
      if (result.records.length > 0) {
        setSelectedRecordId(result.records[0].id);
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  function applyBatchFieldDecision(recordId: string, fieldPath: BibliographyFieldPath, decision: ReviewDecision) {
    setBatchReviewDecisions((prev) => {
      const filtered = prev.filter(
        (d) => !(d.recordId === recordId && d.fieldPath === fieldPath && d.decision.issueId === decision.issueId)
      );
      return [...filtered, { recordId, fieldPath, decision }];
    });
  }

  function clearBatchFieldDecision(recordId: string, fieldPath: BibliographyFieldPath, issueId: string) {
    setBatchReviewDecisions((prev) =>
      prev.filter(
        (d) => !(d.recordId === recordId && d.fieldPath === fieldPath && d.decision.issueId === issueId)
      )
    );
  }

  function resetFieldDecisions(recordId: string, fieldPath: BibliographyFieldPath) {
    setBatchReviewDecisions((prev) =>
      prev.filter((d) => !(d.recordId === recordId && d.fieldPath === fieldPath))
    );
  }

  async function requestBatchAssistance(recordId: string, fieldPath: BibliographyFieldPath, issue: ReviewIssue) {
    const scopeKey = makeBibliographyIssueScopeKey(recordId, fieldPath, issue.id);
    const pr = processedBatch.records.find((r) => r.record.id === recordId);
    const field = pr?.fields[fieldPath];
    if (!field || !field.profile) return;

    setBatchAssistStatus((prev) => ({ ...prev, [scopeKey]: 'loading' }));
    setBatchAssistErrors((prev) => {
      const next = { ...prev };
      delete next[scopeKey];
      return next;
    });

    const relevantDecisions = batchReviewDecisions
      .filter((d) => d.recordId === recordId && d.fieldPath === fieldPath)
      .map((d) => d.decision);

    try {
      const res = await fetch('/api/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: field.sourceText,
          profile: field.profile,
          reviewDecisions: relevantDecisions,
          issueId: issue.id
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setBatchAssistStatus((prev) => ({ ...prev, [scopeKey]: res.status === 503 ? 'unavailable' : 'error' }));
        setBatchAssistErrors((prev) => ({ ...prev, [scopeKey]: data.message || data.error || 'Assisted resolver request failed.' }));
        return;
      }

      setBatchAssistResolutions((prev) => ({ ...prev, [scopeKey]: data.resolution }));
      setBatchAssistStatus((prev) => ({ ...prev, [scopeKey]: 'available' }));
    } catch (err: unknown) {
      setBatchAssistStatus((prev) => ({ ...prev, [scopeKey]: 'error' }));
      setBatchAssistErrors((prev) => ({ ...prev, [scopeKey]: err instanceof Error ? err.message : 'Network error.' }));
    }
  }

  function applyBatchAssistedCandidate(
    recordId: string,
    fieldPath: BibliographyFieldPath,
    issue: ReviewIssue,
    candidate: AssistedCandidate,
    resolution: AssistedResolution
  ) {
    const scopeKey = makeBibliographyIssueScopeKey(recordId, fieldPath, issue.id);
    const pr = processedBatch.records.find((r) => r.record.id === recordId);
    const field = pr?.fields[fieldPath];
    if (!field || !field.transliterationResult) return;

    try {
      const currentRequest = buildResolverRequest(field.transliterationResult, issue.id);
      const decision = candidateToReviewDecision(candidate.id, resolution, issue, currentRequest);
      applyBatchFieldDecision(recordId, fieldPath, decision);
    } catch (err) {
      setBatchAssistErrors((prev) => ({
        ...prev,
        [scopeKey]: err instanceof Error ? err.message : 'Failed to apply suggestion.'
      }));
    }
  }

  function triggerDownload(report: BibliographyExportReport) {
    setExportReport(report);
    if (!report.success || !report.content) return;
    const blob = new Blob([report.content], { type: report.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = report.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const filteredRecords = useMemo(() => {
    if (batchFilter === 'ALL') return processedBatch.records;
    return processedBatch.records.filter((r) => r.readiness === batchFilter);
  }, [processedBatch, batchFilter]);

  const hasIssues = result.reviewIssues.length > 0;
  const hasDecisions = result.appliedDecisions.length > 0;

  return (
    <main>
      <header>
        <p className="eyebrow">SCHOLARLY LANGUAGE TOOLS · FOUNDATION</p>
        <h1>Persian <em>→</em> transliteration</h1>
        <p className="lede">A transparent IJMES workflow for academic Persian, designed to show where the source is certain—and where human review is required.</p>
      </header>

      {/* Mode Switcher */}
      <div className="mode-toggle">
        <button
          className={`mode-btn ${workspaceMode === 'single' ? 'active' : ''}`}
          onClick={() => setWorkspaceMode('single')}
        >
          Single transliteration
        </button>
        <button
          className={`mode-btn ${workspaceMode === 'batch' ? 'active' : ''}`}
          onClick={() => setWorkspaceMode('batch')}
        >
          Bibliography batch
        </button>
      </div>

      {workspaceMode === 'single' ? (
        <>
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
                  <select
                    value={profile}
                    onChange={(event) => setProfile(event.target.value as ProfileId)}
                  >
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

          {/* Single Review Workspace: Visible when issues exist OR active decisions can be reviewed/undone */}
          {(hasIssues || hasDecisions) && (
            <section className={`review-workspace ${result.copyable ? 'resolved-all' : ''}`}>
              <div className="review-workspace-header">
                <div>
                  <h3>Human Review Queue ({result.reviewIssues.length})</h3>
                  <p className="controls" style={{ margin: '4px 0 0' }}>
                    Select an alternative reading or provide a manual transliteration. Every choice creates explicit user-decision provenance.
                  </p>
                </div>
                {hasDecisions && (
                  <button className="btn-clear" onClick={clearAllDecisions}>
                    Reset all decisions ({result.appliedDecisions.length})
                  </button>
                )}
              </div>

              {/* Active Decisions Banner when issues are resolved */}
              {hasDecisions && (
                <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {result.appliedDecisions.map((decision) => (
                    <div key={decision.issueId} className="review-active-status" style={{ justifyContent: 'space-between' }}>
                      <span>
                        Active decision [{decision.issueId}]: {decision.action}
                        {decision.manualCanonicalTransliteration ? ` (${decision.manualCanonicalTransliteration})` : ''}
                        {decision.assistance ? ` · Assisted [${decision.assistance.suggestionId}]` : ''}
                      </span>
                      <button className="btn-clear" onClick={() => clearDecision(decision.issueId)}>
                        Undo decision
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="review-list">
                {result.reviewIssues.map((issue) => {
                  const applied = result.appliedDecisions.find((d) => d.issueId === issue.id);
                  const status = assistStatus[issue.id] || 'idle';
                  const resolution = assistResolutions[issue.id];
                  const assistErr = assistErrors[issue.id];

                  let isStale = false;
                  if (resolution) {
                    const currentResolverRequest = buildResolverRequest(result, issue.id);
                    if (!currentResolverRequest) {
                      isStale = true;
                    } else {
                      const currentFingerprint = computeRequestFingerprint(
                        currentResolverRequest,
                        resolution.provider,
                        resolution.model
                      );
                      isStale = resolution.requestFingerprint !== currentFingerprint;
                    }
                  }

                  return (
                    <div key={issue.id} className="review-card">
                      <div className="review-card-top">
                        <span className="surface" dir="rtl">{issue.surface}</span>
                        <span className="badge ambiguous">{issue.type}</span>
                      </div>
                      <div className="review-card-body">
                        <p style={{ margin: 0 }}>{issue.description}</p>
                        {issue.evidenceSummary && (
                          <div className="evidence-summary">Evidence: {issue.evidenceSummary}</div>
                        )}
                      </div>

                      <div className="review-actions">
                        {issue.alternatives.map((alt) => {
                          const action = actionForAlternative(issue, alt.id);
                          const isSelected = applied?.action === action && applied?.selectedAlternativeId === alt.id;
                          return (
                            <button
                              key={alt.id}
                              className={isSelected ? 'btn-active' : 'secondary'}
                              onClick={() => applyDecision({ issueId: issue.id, action, selectedAlternativeId: alt.id })}
                            >
                              {alt.label} {alt.canonical ? `(${alt.canonical})` : ''}
                            </button>
                          );
                        })}

                        {issue.allowedActions.includes('MANUAL_CANONICAL_OVERRIDE') && (
                          <div className="manual-input-row">
                            <input
                              type="text"
                              placeholder="Manual Latin canonical (e.g. kirm)"
                              value={manualInputs[issue.id] || ''}
                              onChange={(e) => setManualInputs((prev) => ({ ...prev, [issue.id]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleManualSubmit(issue.id); }}
                            />
                            <button className="secondary" onClick={() => handleManualSubmit(issue.id)}>
                              Apply
                            </button>
                          </div>
                        )}
                        {manualErrors[issue.id] && (
                          <span className="warning" style={{ fontSize: '11px', display: 'block', width: '100%' }}>
                            {manualErrors[issue.id]}
                          </span>
                        )}
                      </div>

                      {applied && (
                        <div className="review-active-status">
                          <span>
                            Active override: {applied.action}
                            {applied.manualCanonicalTransliteration ? ` (${applied.manualCanonicalTransliteration})` : ''}
                            {applied.assistance ? ` · Assisted suggestion [${applied.assistance.suggestionId}]` : ''}
                          </span>
                          <button className="btn-clear" onClick={() => clearDecision(issue.id)}>
                            Remove override
                          </button>
                        </div>
                      )}

                      {/* Assisted Candidate Resolver */}
                      <div className="assisted-section">
                        <div className="assisted-header">
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="ai-badge">AI Advisory</span>
                            Assisted Suggestions
                          </span>
                          <button
                            className="secondary"
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                            onClick={() => requestAssistance(issue.id)}
                            disabled={status === 'loading'}
                          >
                            {status === 'loading' ? 'Analyzing...' : resolution ? 'Re-query Suggestions' : 'Ask Assisted Resolver'}
                          </button>
                        </div>

                        {status === 'unavailable' && (
                          <div className="assisted-msg">
                            Assisted resolver unavailable (OpenAI credentials not configured).
                          </div>
                        )}

                        {assistErr && <div className="assisted-msg error">{assistErr}</div>}

                        {resolution && (
                          <>
                            {isStale && (
                              <div className="stale-banner">
                                Input or profile has changed since suggestion was fetched. Suggestions are stale.
                              </div>
                            )}

                            <div className={`assisted-candidates-grid ${isStale ? 'is-stale' : ''}`}>
                              {resolution.candidates.length === 0 ? (
                                <div className="assisted-msg">No suggestions proposed for this issue.</div>
                              ) : (
                                resolution.candidates.map((cand) => (
                                  <div key={cand.id} className="assisted-candidate-card">
                                    <div className="assisted-candidate-info">
                                      <div className="assisted-candidate-top">
                                        <strong>
                                          {cand.kind === 'EXISTING_LEXICAL_READING' && cand.canonical}
                                          {cand.kind === 'MANUAL_CANONICAL' && cand.canonical}
                                          {cand.kind === 'IZAFAT_DECISION' && cand.relationDecision}
                                          {cand.kind === 'MORPHOLOGY_BRANCH' && cand.morphologyBranch}
                                        </strong>
                                        <span className="badge-basis">{cand.basis}</span>
                                        {cand.modelConfidence !== undefined && cand.modelConfidence !== null && (
                                          <span style={{ fontSize: '11px', color: '#666' }}>
                                            {(cand.modelConfidence * 100).toFixed(0)}%
                                          </span>
                                        )}
                                      </div>
                                      <p className="assisted-rationale">{cand.rationale}</p>
                                    </div>
                                    <button
                                      className="secondary"
                                      style={{ padding: '6px 10px', fontSize: '11px' }}
                                      onClick={() => applyAssistedCandidate(issue, cand, resolution)}
                                      disabled={isStale}
                                    >
                                      Use this suggestion
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
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
        </>
      ) : (
        /* Batch Workspace Mode */
        <section className="batch-container">
          <div className="batch-input-card">
            <div className="batch-input-header">
              <div>
                <h3>Bibliography CSV Input</h3>
                <p className="controls" style={{ margin: '4px 0 0' }}>
                  Upload or paste a CSV bibliography file. The system processes Persian fields independently while preserving source metadata and custom columns.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  id="csv-file-upload"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
                <button
                  className="secondary"
                  onClick={() => document.getElementById('csv-file-upload')?.click()}
                >
                  Upload CSV file
                </button>
                <button
                  className="secondary"
                  onClick={() => setCsvText(sampleCsv)}
                >
                  Load sample CSV
                </button>
              </div>
            </div>

            <textarea
              style={{ height: '120px', fontFamily: 'DM Mono, monospace', fontSize: '12px' }}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Paste CSV bibliography data..."
            />

            <div className="batch-input-actions">
              <button onClick={handleImportCsv}>
                Parse & Process Batch ({batchRecords.length} records loaded)
              </button>
            </div>

            {importDiagnostics.length > 0 && (
              <div style={{ marginTop: '14px' }}>
                {importDiagnostics.map((d, i) => (
                  <div key={i} className={`assisted-msg ${d.severity === 'ERROR' ? 'error' : ''}`}>
                    [{d.code}] {d.row ? `Row ${d.row}: ` : ''}{d.message}
                  </div>
                ))}
              </div>
            )}
          </div>

          {batchRecords.length > 0 && (
            <>
              {/* Batch Summary Counters */}
              <div className="batch-summary-grid">
                <div className="batch-stat-card">
                  <div className="batch-stat-num">{processedBatch.summary.total}</div>
                  <div className="batch-stat-label">Total Records</div>
                </div>
                <div className="batch-stat-card ready">
                  <div className="batch-stat-num">{processedBatch.summary.ready}</div>
                  <div className="batch-stat-label">Ready for Export</div>
                </div>
                <div className="batch-stat-card review_required">
                  <div className="batch-stat-num">{processedBatch.summary.reviewRequired}</div>
                  <div className="batch-stat-label">Review Required</div>
                </div>
                <div className="batch-stat-card invalid">
                  <div className="batch-stat-num">{processedBatch.summary.invalid}</div>
                  <div className="batch-stat-label">Invalid Records</div>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="batch-filters">
                <button
                  className={`batch-filter-btn ${batchFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setBatchFilter('ALL')}
                >
                  All ({processedBatch.summary.total})
                </button>
                <button
                  className={`batch-filter-btn ${batchFilter === 'READY' ? 'active' : ''}`}
                  onClick={() => setBatchFilter('READY')}
                >
                  Ready ({processedBatch.summary.ready})
                </button>
                <button
                  className={`batch-filter-btn ${batchFilter === 'REVIEW_REQUIRED' ? 'active' : ''}`}
                  onClick={() => setBatchFilter('REVIEW_REQUIRED')}
                >
                  Review Required ({processedBatch.summary.reviewRequired})
                </button>
                <button
                  className={`batch-filter-btn ${batchFilter === 'INVALID' ? 'active' : ''}`}
                  onClick={() => setBatchFilter('INVALID')}
                >
                  Invalid ({processedBatch.summary.invalid})
                </button>
              </div>

              {/* Records Table */}
              <div className="batch-table-container">
                <table className="batch-table">
                  <thead>
                    <tr>
                      <th>Record ID</th>
                      <th>Type</th>
                      <th>Source Title</th>
                      <th>Final Transliteration</th>
                      <th>Status</th>
                      <th>Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((pr) => {
                      const isSelected = pr.record.id === selectedRecordId;
                      return (
                        <tr
                           key={pr.record.id}
                          className={`batch-row-clickable ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedRecordId(pr.record.id)}
                        >
                          <td style={{ fontFamily: 'DM Mono, monospace', fontSize: '12px' }}>{pr.record.id}</td>
                          <td><span className="badge-basis">{pr.record.type}</span></td>
                          <td className="table-cell-title" dir="rtl">{pr.record.title}</td>
                          <td className="table-cell-final">
                            {pr.fields['title']?.finalText || <span className="muted">—</span>}
                          </td>
                          <td>
                            <span className={`badge ${pr.readiness.toLowerCase()}`}>
                              {pr.readiness}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'DM Mono, monospace', fontSize: '12px' }}>
                            {pr.reviewIssueCount > 0 ? (
                              <span className="warning">{pr.reviewIssueCount} pending</span>
                            ) : (
                              <span style={{ color: 'var(--sage)' }}>0</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Record Field Inspector */}
              {selectedRecord && (
                <div className="field-inspector">
                  <div className="field-inspector-header">
                    <div>
                      <div className="field-inspector-title">
                        Record: <span style={{ fontFamily: 'DM Mono, monospace' }}>{selectedRecord.record.id}</span>
                      </div>
                      <p className="controls" style={{ margin: '4px 0 0' }}>
                        Type: {selectedRecord.record.type} · Readiness: {selectedRecord.readiness} · Source Row: {selectedRecord.record.sourceRowIndex}
                      </p>
                    </div>
                    <span className={`badge ${selectedRecord.readiness.toLowerCase()}`}>
                      {selectedRecord.readiness}
                    </span>
                  </div>

                  {selectedRecord.invalidReasons.length > 0 && (
                    <div className="assisted-msg error" style={{ marginBottom: '16px' }}>
                      Invalid: {selectedRecord.invalidReasons.join('; ')}
                    </div>
                  )}

                  <div className="field-cards-grid">
                    {Object.values(selectedRecord.fields).map((field) => {
                      const needsReview = field.status === 'REVIEW_REQUIRED' || field.status === 'UNRESOLVED';
                      const activeDecisionsForField = batchReviewDecisions.filter(
                        (d) => d.recordId === selectedRecord.record.id && d.fieldPath === field.fieldPath
                      );

                      return (
                        <div
                          key={field.fieldPath}
                          className={`field-card ${needsReview ? 'needs-review' : ''}`}
                        >
                          <div className="field-card-top">
                            <span className="field-name">{field.fieldPath}</span>
                            <span className={`badge ${field.status.toLowerCase()}`}>{field.status}</span>
                          </div>

                          <div className="field-source" dir="rtl">{field.sourceText}</div>
                          <div className="field-final">
                            Final: {field.finalText ? <strong>{field.finalText}</strong> : <span className="muted">Pending review</span>}
                          </div>

                          {/* Active Field Decisions Display with Undo/Reset (Item 17) */}
                          {activeDecisionsForField.length > 0 && (
                            <div style={{ marginTop: '8px', borderTop: '1px solid var(--line)', paddingTop: '6px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink)' }}>Active Field Decisions:</span>
                                <button
                                  className="btn-clear"
                                  style={{ fontSize: '10px' }}
                                  onClick={() => resetFieldDecisions(selectedRecord.record.id, field.fieldPath)}
                                >
                                  Reset field
                                </button>
                              </div>
                              {activeDecisionsForField.map((bd) => (
                                <div key={bd.decision.issueId} className="review-active-status" style={{ justifyContent: 'space-between', padding: '4px 8px', margin: '4px 0' }}>
                                  <span style={{ fontSize: '11px' }}>
                                    {bd.decision.action}
                                    {bd.decision.manualCanonicalTransliteration ? ` (${bd.decision.manualCanonicalTransliteration})` : ''}
                                    {bd.decision.selectedAlternativeId ? ` [${bd.decision.selectedAlternativeId}]` : ''}
                                  </span>
                                  <button
                                    className="btn-clear"
                                    style={{ fontSize: '10px' }}
                                    onClick={() => clearBatchFieldDecision(selectedRecord.record.id, field.fieldPath, bd.decision.issueId)}
                                  >
                                    Undo
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Field Review Actions & Field-Scoped Assistance (Items 12-16) */}
                          {field.reviewIssues.length > 0 && (
                            <div style={{ marginTop: '12px' }}>
                              {field.reviewIssues.map((issue) => {
                                const scopeKey = makeBibliographyIssueScopeKey(selectedRecord.record.id, field.fieldPath, issue.id);
                                const assistStat = batchAssistStatus[scopeKey] || 'idle';
                                const assistRes = batchAssistResolutions[scopeKey];
                                const assistErr = batchAssistErrors[scopeKey];

                                let isStale = false;
                                if (assistRes && field.transliterationResult) {
                                  const currentReq = buildResolverRequest(field.transliterationResult, issue.id);
                                  if (!currentReq) {
                                    isStale = true;
                                  } else {
                                    const currentFp = computeRequestFingerprint(currentReq, assistRes.provider, assistRes.model);
                                    isStale = assistRes.requestFingerprint !== currentFp;
                                  }
                                }

                                return (
                                  <div key={issue.id} style={{ marginTop: '8px', padding: '10px', background: '#fff', border: '1px solid var(--line)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                      <strong style={{ fontSize: '13px' }}>{issue.description}</strong>
                                      <span className="badge ambiguous">{issue.type}</span>
                                    </div>
                                    <div className="review-actions">
                                      {issue.alternatives.map((alt) => (
                                        <button
                                          key={alt.id}
                                          className="secondary"
                                          style={{ padding: '4px 8px', fontSize: '11px' }}
                                          onClick={() =>
                                            applyBatchFieldDecision(selectedRecord.record.id, field.fieldPath, {
                                              issueId: issue.id,
                                              action: actionForAlternative(issue, alt.id),
                                              selectedAlternativeId: alt.id
                                            })
                                          }
                                        >
                                          {alt.label} {alt.canonical ? `(${alt.canonical})` : ''}
                                        </button>
                                      ))}
                                      {issue.allowedActions.includes('MANUAL_CANONICAL_OVERRIDE') && (
                                        <button
                                          className="secondary"
                                          style={{ padding: '4px 8px', fontSize: '11px' }}
                                          onClick={() => {
                                            const val = prompt('Enter manual Latin canonical transliteration:');
                                            if (val && val.trim().length > 0) {
                                              applyBatchFieldDecision(selectedRecord.record.id, field.fieldPath, {
                                                issueId: issue.id,
                                                action: 'MANUAL_CANONICAL_OVERRIDE',
                                                manualCanonicalTransliteration: val.trim()
                                              });
                                            }
                                          }}
                                        >
                                          Manual override...
                                        </button>
                                      )}
                                    </div>

                                    {/* Field-Scoped Assisted Candidate Section */}
                                    <div className="assisted-section" style={{ marginTop: '8px' }}>
                                      <div className="assisted-header">
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <span className="ai-badge">AI Advisory</span>
                                          Assisted Suggestions
                                        </span>
                                        <button
                                          className="secondary"
                                          style={{ padding: '3px 6px', fontSize: '10px' }}
                                          onClick={() => requestBatchAssistance(selectedRecord.record.id, field.fieldPath, issue)}
                                          disabled={assistStat === 'loading'}
                                        >
                                          {assistStat === 'loading' ? 'Analyzing...' : assistRes ? 'Re-query' : 'Ask Assisted Resolver'}
                                        </button>
                                      </div>

                                      {assistStat === 'unavailable' && (
                                        <div className="assisted-msg" style={{ fontSize: '11px' }}>
                                          Assisted resolver unavailable (OpenAI credentials not configured).
                                        </div>
                                      )}

                                      {assistErr && <div className="assisted-msg error" style={{ fontSize: '11px' }}>{assistErr}</div>}

                                      {assistRes && (
                                        <>
                                          {isStale && (
                                            <div className="stale-banner" style={{ fontSize: '11px' }}>
                                              Field state has changed. Suggestions are stale.
                                            </div>
                                          )}

                                          <div className={`assisted-candidates-grid ${isStale ? 'is-stale' : ''}`}>
                                            {assistRes.candidates.length === 0 ? (
                                              <div className="assisted-msg" style={{ fontSize: '11px' }}>No suggestions proposed.</div>
                                            ) : (
                                              assistRes.candidates.map((cand) => (
                                                <div key={cand.id} className="assisted-candidate-card" style={{ padding: '6px' }}>
                                                  <div className="assisted-candidate-info">
                                                    <div className="assisted-candidate-top">
                                                      <strong style={{ fontSize: '12px' }}>
                                                        {cand.kind === 'EXISTING_LEXICAL_READING' && cand.canonical}
                                                        {cand.kind === 'MANUAL_CANONICAL' && cand.canonical}
                                                        {cand.kind === 'IZAFAT_DECISION' && cand.relationDecision}
                                                        {cand.kind === 'MORPHOLOGY_BRANCH' && cand.morphologyBranch}
                                                      </strong>
                                                      <span className="badge-basis">{cand.basis}</span>
                                                    </div>
                                                    <p className="assisted-rationale" style={{ fontSize: '10px' }}>{cand.rationale}</p>
                                                  </div>
                                                  <button
                                                    className="secondary"
                                                    style={{ padding: '4px 6px', fontSize: '10px' }}
                                                    onClick={() =>
                                                      applyBatchAssistedCandidate(
                                                        selectedRecord.record.id,
                                                        field.fieldPath,
                                                        issue,
                                                        cand,
                                                        assistRes
                                                      )
                                                    }
                                                    disabled={isStale}
                                                  >
                                                    Use suggestion
                                                  </button>
                                                </div>
                                              ))
                                            )}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Export Panel */}
              <div className="export-panel">
                <div className="export-panel-header">
                  <div>
                    <h3>Scholarly Exports</h3>
                    <p className="controls" style={{ margin: '4px 0 0' }}>
                      Export bibliographic metadata to standard scholarly formats with full Unicode diacritics.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ font: '500 11px DM Mono, monospace', color: 'var(--muted)' }}>
                      Export Policy:
                    </label>
                    <select
                      value={exportMode}
                      onChange={(e) => setExportMode(e.target.value as ScholarlyExportMode)}
                      style={{ margin: 0, padding: '6px 12px' }}
                    >
                      <option value="STRICT_ALL">Strict (all records must be ready)</option>
                      <option value="READY_ONLY">Ready only (skip unready records)</option>
                    </select>
                  </div>
                </div>

                <div className="export-options-grid">
                  <div className="export-card">
                    <h4>Source-Preserving Review CSV</h4>
                    <p>Includes original columns + translit_* columns for ongoing scholarly review.</p>
                    <button className="secondary" onClick={() => triggerDownload(exportReviewCsv(processedBatch))}>
                      Download Review CSV
                    </button>
                  </div>

                  <div className="export-card">
                    <h4>Final Scholarly CSV</h4>
                    <p>Clean downstream CSV containing only resolved final metadata.</p>
                    <button className="secondary" onClick={() => triggerDownload(exportFinalCsv(processedBatch, exportMode))}>
                      Download Final CSV
                    </button>
                  </div>

                  <div className="export-card">
                    <h4>Scholarly RIS (Zotero / EndNote)</h4>
                    <p>Standard tagged UTF-8 RIS interchange format with CRLF endings.</p>
                    <button className="secondary" onClick={() => triggerDownload(exportToRis(processedBatch, exportMode))}>
                      Download RIS
                    </button>
                  </div>

                  <div className="export-card">
                    <h4>Scholarly BibTeX</h4>
                    <p>LaTeX BibTeX format with deterministic keys and escaped structural characters.</p>
                    <button className="secondary" onClick={() => triggerDownload(exportToBibTeX(processedBatch, exportMode))}>
                      Download BibTeX
                    </button>
                  </div>
                </div>

                {exportReport && (
                  <div className="export-report-box">
                    <div>
                      <strong>Export Report ({exportReport.format}):</strong> {exportReport.success ? 'Success' : 'Failed'}
                    </div>
                    <div>Exported records: {exportReport.exportedRecordIds.length}</div>
                    {exportReport.skippedRecordIds.length > 0 && (
                      <div className="warning">
                        Skipped records ({exportReport.skippedRecordIds.length}): {exportReport.skippedRecordIds.join(', ')}
                      </div>
                    )}
                    {exportReport.diagnostics.length > 0 && (
                      <div style={{ marginTop: '6px' }}>
                        Diagnostics:
                        {exportReport.diagnostics.map((d, idx) => (
                          <div key={idx} className={`assisted-msg ${d.severity === 'ERROR' ? 'error' : ''}`}>
                            [{d.code}] {d.recordId ? `Record "${d.recordId}": ` : ''}{d.message}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}

      <footer>
        <span>IJMES Transliteration Foundation</span>
        <span>Deterministic Rule Engine · Reviewed Lexicon · Human Gated</span>
      </footer>
    </main>
  );
}
