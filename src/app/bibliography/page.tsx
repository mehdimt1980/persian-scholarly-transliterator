'use client';

import React, { useMemo, useState } from 'react';
import StatusBadge from '../components/StatusBadge';
import { formatIssueType } from '../components/StatusHelpers';
import { ReviewActionType, ReviewDecision, ReviewIssue } from '../../domain/types';
import {
  AssistedCandidate,
  buildResolverRequest,
  computeRequestFingerprint
} from '../../domain/assistance';
import {
  importBibliographyFromCsv,
  validateFileSize,
  processBibliographyBatch,
  exportReviewCsv,
  exportFinalCsv,
  exportToRis,
  exportToBibTeX,
  makeBibliographyIssueScopeKey,
  candidateToBibliographyReviewDecision,
  BibliographyFieldPath,
  BibliographyRecord,
  BibliographyReviewDecision,
  BibliographyAssistanceState,
  BibliographyDiagnostic,
  BibliographyExportReport,
  ScholarlyExportMode,
  ProcessedBibliographyRecord,
  DEFAULT_IMPORT_LIMITS
} from '../../domain/bibliography';

const sampleCsv = `id,type,title,container_title,authors,year,publisher,place,doi
rec_1,BOOK,مشروطه,,شاه | صفوی,1380,دولت,تهران,
rec_2,JOURNAL_ARTICLE,دولت و جامعه,فرهنگ,شاه,1995,,,,10.1234/in.1995.13.3
rec_3,BOOK,کرم,,نویسنده,1400,انتشارات علم,تهران,
rec_4,BOOK,State and Society in Iran,,Homa Katouzian,2000,I.B. Tauris,London,10.5040/9780755609437`;

function actionForAlternative(issue: ReviewIssue, altId: string): ReviewActionType {
  if (issue.type === 'IZAFAT_CANDIDATE') {
    return altId === 'ACCEPT_IZAFAT' ? 'ACCEPT_IZAFAT' : 'REJECT_IZAFAT';
  }
  if (issue.type === 'MORPHOLOGY_AMBIGUITY') {
    return 'SELECT_MORPHOLOGY';
  }
  return 'SELECT_LEXICAL_READING';
}

type AssistStatusType = 'idle' | 'loading' | 'available' | 'error' | 'stale' | 'unavailable';

export default function BibliographyPage() {
  const [csvText, setCsvText] = useState(sampleCsv);
  const [batchRecords, setBatchRecords] = useState<BibliographyRecord[]>([]);
  const [importDiagnostics, setImportDiagnostics] = useState<BibliographyDiagnostic[]>([]);
  const [batchReviewDecisions, setBatchReviewDecisions] = useState<BibliographyReviewDecision[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [batchFilter, setBatchFilter] = useState<'ALL' | 'READY' | 'REVIEW_REQUIRED' | 'INVALID'>('ALL');
  const [exportMode, setExportMode] = useState<ScholarlyExportMode>('STRICT_ALL');
  const [exportReport, setExportReport] = useState<BibliographyExportReport | null>(null);

  // Field-scoped assistance
  const [batchAssistStatus, setBatchAssistStatus] = useState<Record<string, AssistStatusType>>({});
  const [batchAssistResolutions, setBatchAssistResolutions] = useState<Record<string, BibliographyAssistanceState>>({});
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

      setBatchAssistResolutions((prev) => ({
        ...prev,
        [scopeKey]: {
          recordId,
          fieldPath,
          issueId: issue.id,
          resolution: data.resolution
        }
      }));
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
    assistanceState: BibliographyAssistanceState
  ) {
    const scopeKey = makeBibliographyIssueScopeKey(recordId, fieldPath, issue.id);
    const pr = processedBatch.records.find((r) => r.record.id === recordId);
    const field = pr?.fields[fieldPath];
    if (!field || !field.transliterationResult) return;

    try {
      const currentRequest = buildResolverRequest(field.transliterationResult, issue.id);
      const batchDecision = candidateToBibliographyReviewDecision(
        candidate.id,
        assistanceState,
        recordId,
        fieldPath,
        issue,
        currentRequest
      );
      applyBatchFieldDecision(batchDecision.recordId, batchDecision.fieldPath, batchDecision.decision);
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

  return (
    <div className="batch-workspace">
      <section className="page-intro" aria-labelledby="bib-title">
        <span className="page-intro-eyebrow">Batch Processing</span>
        <h1 id="bib-title" className="page-title">
          Bibliography Transliteration
        </h1>
        <p className="page-tagline">
          Batch processing for scholarly bibliographies with field-level ambiguity tracking and multi-format export.
        </p>
      </section>

      {/* 1. Import Section */}
      <section className="batch-card" aria-labelledby="import-heading">
        <div className="batch-card-header">
          <div>
            <h2 id="import-heading" className="batch-card-title">Import Bibliography CSV</h2>
            <p className="batch-card-subtitle">
              Upload or paste CSV bibliography data. Persian fields are processed independently while preserving all source metadata.
            </p>
          </div>
          <div className="batch-header-actions">
            <input
              type="file"
              accept=".csv,text/csv"
              id="csv-file-upload"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => document.getElementById('csv-file-upload')?.click()}
            >
              Upload CSV file
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setCsvText(sampleCsv)}
            >
              Load sample CSV
            </button>
          </div>
        </div>

        <textarea
          className="batch-csv-area"
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder="Paste CSV bibliography data..."
          aria-label="CSV input data"
        />

        <div className="batch-actions-bar">
          <button type="button" className="btn-primary" onClick={handleImportCsv}>
            Parse & Process Batch ({batchRecords.length} records active)
          </button>
        </div>

        {importDiagnostics.length > 0 && (
          <div style={{ marginTop: '14px' }}>
            {importDiagnostics.map((d, i) => (
              <div key={i} className={`assisted-info-msg ${d.severity === 'ERROR' ? 'error' : ''}`}>
                [{d.code}] {d.row ? `Row ${d.row}: ` : ''}{d.message}
              </div>
            ))}
          </div>
        )}
      </section>

      {batchRecords.length > 0 && (
        <>
          {/* 2. Processing Summary Counters */}
          <section className="batch-counters-grid" aria-label="Batch Summary">
            <div className="counter-card">
              <div className="counter-num">{processedBatch.summary.total}</div>
              <div className="counter-label">Total Records</div>
            </div>
            <div className="counter-card ready">
              <div className="counter-num">{processedBatch.summary.ready}</div>
              <div className="counter-label">Ready for Export</div>
            </div>
            <div className="counter-card review">
              <div className="counter-num">{processedBatch.summary.reviewRequired}</div>
              <div className="counter-label">Review Needed</div>
            </div>
            <div className="counter-card invalid">
              <div className="counter-num">{processedBatch.summary.invalid}</div>
              <div className="counter-label">Invalid Records</div>
            </div>
          </section>

          {/* 3. Filter Bar */}
          <div className="batch-filter-bar" role="tablist" aria-label="Record Filter">
            <button
              type="button"
              className={`filter-tab-btn ${batchFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setBatchFilter('ALL')}
            >
              All ({processedBatch.summary.total})
            </button>
            <button
              type="button"
              className={`filter-tab-btn ${batchFilter === 'READY' ? 'active' : ''}`}
              onClick={() => setBatchFilter('READY')}
            >
              Ready ({processedBatch.summary.ready})
            </button>
            <button
              type="button"
              className={`filter-tab-btn ${batchFilter === 'REVIEW_REQUIRED' ? 'active' : ''}`}
              onClick={() => setBatchFilter('REVIEW_REQUIRED')}
            >
              Review Needed ({processedBatch.summary.reviewRequired})
            </button>
            <button
              type="button"
              className={`filter-tab-btn ${batchFilter === 'INVALID' ? 'active' : ''}`}
              onClick={() => setBatchFilter('INVALID')}
            >
              Invalid ({processedBatch.summary.invalid})
            </button>
          </div>

          {/* 4. Records Table */}
          <section className="batch-table-wrapper" aria-label="Bibliography Records List">
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
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setSelectedRecordId(pr.record.id);
                      }}
                    >
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{pr.record.id}</td>
                      <td>
                        <span className="badge status-neutral">{pr.record.type}</span>
                      </td>
                      <td className="table-cell-title" dir="rtl">{pr.record.title}</td>
                      <td className="table-cell-final">
                        {pr.fields['title']?.finalText || <span style={{ color: 'var(--text-faint)' }}>—</span>}
                      </td>
                      <td>
                        <StatusBadge status={pr.readiness} />
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                        {pr.reviewIssueCount > 0 ? (
                          <span style={{ color: 'var(--status-review-text)', fontWeight: 600 }}>
                            {pr.reviewIssueCount} pending
                          </span>
                        ) : (
                          <span style={{ color: 'var(--status-ready-text)' }}>0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* 5. Selected Record Inspector */}
          {selectedRecord && (
            <section className="batch-card" aria-labelledby="selected-record-heading">
              <div className="batch-card-header">
                <div>
                  <h3 id="selected-record-heading" className="batch-card-title">
                    Record: <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedRecord.record.id}</span>
                  </h3>
                  <p className="batch-card-subtitle">
                    Type: {selectedRecord.record.type} · Source Row: {selectedRecord.record.sourceRowIndex}
                  </p>
                </div>
                <StatusBadge status={selectedRecord.readiness} />
              </div>

              {selectedRecord.invalidReasons.length > 0 && (
                <div className="review-warning-note" style={{ marginBottom: '16px' }}>
                  Invalid: {selectedRecord.invalidReasons.join('; ')}
                </div>
              )}

              <div style={{ display: 'grid', gap: '16px' }}>
                {Object.values(selectedRecord.fields).map((field) => {
                  const needsReview = field.status === 'REVIEW_REQUIRED' || field.status === 'UNRESOLVED';
                  const activeDecisionsForField = batchReviewDecisions.filter(
                    (d) => d.recordId === selectedRecord.record.id && d.fieldPath === field.fieldPath
                  );

                  return (
                    <article
                      key={field.fieldPath}
                      className="review-card"
                      style={{
                        background: needsReview ? 'var(--status-review-bg)' : 'var(--bg-paper)',
                        borderColor: needsReview ? 'var(--status-review-border)' : 'var(--border-rule)'
                      }}
                    >
                      <div className="review-card-header">
                        <span className="panel-label">{field.fieldPath}</span>
                        <StatusBadge status={field.status} />
                      </div>

                      <div className="token-source" dir="rtl" style={{ fontSize: '20px', marginBottom: '8px' }}>
                        {field.sourceText}
                      </div>

                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', marginBottom: '12px' }}>
                        Final:{' '}
                        {field.finalText ? (
                          <strong>{field.finalText}</strong>
                        ) : (
                          <span style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>Pending review</span>
                        )}
                      </div>

                      {/* Active Decisions with Undo/Reset */}
                      {activeDecisionsForField.length > 0 && (
                        <div style={{ marginTop: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                              Active Field Choices:
                            </span>
                            <button
                              type="button"
                              className="btn-reset"
                              onClick={() => resetFieldDecisions(selectedRecord.record.id, field.fieldPath)}
                            >
                              Reset field
                            </button>
                          </div>
                          {activeDecisionsForField.map((bd) => (
                            <div key={bd.decision.issueId} className="active-decision-banner" style={{ padding: '6px 10px', margin: '4px 0' }}>
                              <span style={{ fontSize: '12px' }}>
                                {bd.decision.action.replace(/_/g, ' ')}
                                {bd.decision.manualCanonicalTransliteration ? ` (${bd.decision.manualCanonicalTransliteration})` : ''}
                                {bd.decision.selectedAlternativeId ? ` [${bd.decision.selectedAlternativeId}]` : ''}
                              </span>
                              <button
                                type="button"
                                className="btn-undo"
                                onClick={() => clearBatchFieldDecision(selectedRecord.record.id, field.fieldPath, bd.decision.issueId)}
                              >
                                Undo
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Field Review Issues & Field-Scoped Assistance */}
                      {field.reviewIssues.length > 0 && (
                        <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                          {field.reviewIssues.map((issue) => {
                            const scopeKey = makeBibliographyIssueScopeKey(selectedRecord.record.id, field.fieldPath, issue.id);
                            const assistStat = batchAssistStatus[scopeKey] || 'idle';
                            const assistState = batchAssistResolutions[scopeKey];
                            const assistRes = assistState?.resolution;
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
                              <div key={issue.id} style={{ marginTop: '10px', padding: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-rule)', borderRadius: '3px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                  <strong style={{ fontSize: '13px' }}>{issue.description}</strong>
                                  <span className="badge status-review">{formatIssueType(issue.type)}</span>
                                </div>

                                <div className="alternatives-grid" style={{ marginBottom: '8px' }}>
                                  {issue.alternatives.map((alt) => (
                                    <button
                                      key={alt.id}
                                      type="button"
                                      className="alt-btn"
                                      style={{ padding: '6px 10px', fontSize: '12px' }}
                                      onClick={() =>
                                        applyBatchFieldDecision(selectedRecord.record.id, field.fieldPath, {
                                          issueId: issue.id,
                                          action: actionForAlternative(issue, alt.id),
                                          selectedAlternativeId: alt.id
                                        })
                                      }
                                    >
                                      <span>{alt.label}</span>
                                      {alt.canonical && <span className="alt-canonical">({alt.canonical})</span>}
                                    </button>
                                  ))}
                                  {issue.allowedActions.includes('MANUAL_CANONICAL_OVERRIDE') && (
                                    <button
                                      type="button"
                                      className="btn-secondary"
                                      style={{ padding: '6px 10px', fontSize: '12px' }}
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

                                {/* Field-Scoped Assisted Suggestions */}
                                <div className="assisted-subpanel">
                                  <div className="assisted-subpanel-header">
                                    <div className="assisted-tag-group">
                                      <span className="advisory-badge">AI suggestion</span>
                                      <span className="advisory-label">Advisory</span>
                                    </div>
                                    <button
                                      type="button"
                                      className="btn-subtle"
                                      onClick={() => requestBatchAssistance(selectedRecord.record.id, field.fieldPath, issue)}
                                      disabled={assistStat === 'loading'}
                                    >
                                      {assistStat === 'loading' ? 'Analyzing...' : assistRes ? 'Re-query' : 'Ask assistant'}
                                    </button>
                                  </div>

                                  {assistStat === 'unavailable' && (
                                    <p className="assisted-info-msg">
                                      Assisted resolver unavailable (OpenAI credentials not configured).
                                    </p>
                                  )}

                                  {assistErr && <p className="assisted-info-msg error">{assistErr}</p>}

                                  {assistRes && (
                                    <>
                                      {isStale && (
                                        <div className="review-warning-note" style={{ marginBottom: '8px' }}>
                                          Field state has changed. Suggestions are stale.
                                        </div>
                                      )}

                                      <div className="assisted-candidates-cards">
                                        {assistRes.candidates.length === 0 ? (
                                          <p className="assisted-info-msg">No suggestions proposed.</p>
                                        ) : (
                                          assistRes.candidates.map((cand) => (
                                            <div key={cand.id} className="assisted-candidate-item" style={{ padding: '8px 10px' }}>
                                              <div className="candidate-details">
                                                <div className="candidate-reading">
                                                  <strong>
                                                    {cand.kind === 'EXISTING_LEXICAL_READING' && cand.canonical}
                                                    {cand.kind === 'MANUAL_CANONICAL' && cand.canonical}
                                                    {cand.kind === 'IZAFAT_DECISION' && cand.relationDecision}
                                                    {cand.kind === 'MORPHOLOGY_BRANCH' && cand.morphologyBranch}
                                                  </strong>
                                                  <span className="candidate-basis">{cand.basis.replace(/_/g, ' ')}</span>
                                                </div>
                                                <p className="candidate-rationale">{cand.rationale}</p>
                                              </div>
                                              <button
                                                type="button"
                                                className="btn-secondary btn-sm"
                                                onClick={() =>
                                                  applyBatchAssistedCandidate(
                                                    selectedRecord.record.id,
                                                    field.fieldPath,
                                                    issue,
                                                    cand,
                                                    assistState
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
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* 6. Scholarly Exports Panel */}
          <section className="batch-card" aria-labelledby="export-heading">
            <div className="batch-card-header">
              <div>
                <h3 id="export-heading" className="batch-card-title">Scholarly Exports</h3>
                <p className="batch-card-subtitle">
                  Export bibliographic metadata to standard scholarly formats with full Unicode diacritics.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label className="context-selector-label" style={{ margin: 0 }}>
                  Export Policy:
                  <select
                    className="context-select"
                    value={exportMode}
                    onChange={(e) => setExportMode(e.target.value as ScholarlyExportMode)}
                  >
                    <option value="STRICT_ALL">Strict (all records must be ready)</option>
                    <option value="READY_ONLY">Ready only (skip unready records)</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="export-grid">
              <div className="export-tile">
                <div>
                  <h4 className="export-tile-title">Review CSV</h4>
                  <p className="export-tile-desc">
                    Source columns + translit_* columns for ongoing scholarly review.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => triggerDownload(exportReviewCsv(processedBatch))}
                >
                  Download Review CSV
                </button>
              </div>

              <div className="export-tile">
                <div>
                  <h4 className="export-tile-title">Final Scholarly CSV</h4>
                  <p className="export-tile-desc">
                    Clean downstream CSV containing only resolved final metadata.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => triggerDownload(exportFinalCsv(processedBatch, exportMode))}
                >
                  Download Final CSV
                </button>
              </div>

              <div className="export-tile">
                <div>
                  <h4 className="export-tile-title">Scholarly RIS (Zotero / EndNote)</h4>
                  <p className="export-tile-desc">
                    Standard tagged UTF-8 RIS interchange format.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => triggerDownload(exportToRis(processedBatch, exportMode))}
                >
                  Download RIS
                </button>
              </div>

              <div className="export-tile">
                <div>
                  <h4 className="export-tile-title">Scholarly BibTeX</h4>
                  <p className="export-tile-desc">
                    LaTeX BibTeX format with deterministic keys and escaped diacritics.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => triggerDownload(exportToBibTeX(processedBatch, exportMode))}
                >
                  Download BibTeX
                </button>
              </div>
            </div>

            {exportReport && (
              <div className="active-decision-banner" style={{ marginTop: '18px', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                <div>
                  <strong>Export Report ({exportReport.format}):</strong> {exportReport.success ? 'Success' : 'Failed'}
                </div>
                <div>Exported records: {exportReport.exportedRecordIds.length}</div>
                {exportReport.skippedRecordIds.length > 0 && (
                  <div style={{ color: 'var(--status-review-text)' }}>
                    Skipped records ({exportReport.skippedRecordIds.length}): {exportReport.skippedRecordIds.join(', ')}
                  </div>
                )}
                {exportReport.diagnostics.length > 0 && (
                  <div style={{ marginTop: '6px' }}>
                    {exportReport.diagnostics.map((d, idx) => (
                      <div key={idx} className={`assisted-info-msg ${d.severity === 'ERROR' ? 'error' : ''}`}>
                        [{d.code}] {d.recordId ? `Record "${d.recordId}": ` : ''}{d.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
