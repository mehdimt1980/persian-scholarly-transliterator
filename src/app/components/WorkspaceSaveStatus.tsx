'use client';

import React, { useState } from 'react';
import { useResearchWorkspace } from '../../client/workspace';

interface WorkspaceSaveStatusProps {
  workspaceType: 'transliteration' | 'bibliography';
  onClearCustom?: () => void;
}

export default function WorkspaceSaveStatus({
  workspaceType,
  onClearCustom
}: WorkspaceSaveStatusProps) {
  const {
    ready,
    persistenceStatus,
    crossTabConflict,
    resolveCrossTabConflict,
    resetTransliteration,
    resetBibliography
  } = useResearchWorkspace();

  const [confirmingClear, setConfirmingClear] = useState(false);

  const status = persistenceStatus[workspaceType];
  const conflict = crossTabConflict[workspaceType];

  const handleClear = async () => {
    if (workspaceType === 'transliteration') {
      await resetTransliteration();
    } else {
      await resetBibliography();
    }
    if (onClearCustom) {
      onClearCustom();
    }
    setConfirmingClear(false);
  };

  const getStatusLabel = () => {
    if (!ready || status === 'restoring') {
      return 'Restoring local workspace…';
    }
    if (status === 'saving') {
      return 'Saving…';
    }
    if (status === 'unsupported-schema') {
      return 'Workspace data was created by a newer version. Local saving is paused to protect it.';
    }
    if (status === 'conflict') {
      return 'Conflict: modified in another tab';
    }
    if (status === 'unavailable' || status === 'error') {
      return 'Local save unavailable';
    }
    return 'Saved locally';
  };

  const getStatusIcon = () => {
    if (!ready || status === 'restoring' || status === 'saving') {
      return (
        <svg className="workspace-status-spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      );
    }
    if (status === 'unsupported-schema' || status === 'conflict') {
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    }
    if (status === 'unavailable' || status === 'error') {
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    }
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  };

  return (
    <div className="workspace-save-status-container" aria-label="Local workspace persistence status">
      {conflict !== null && (
        <div className="workspace-crosstab-alert" role="status">
          <span className="workspace-crosstab-text">
            {conflict === 'CLEARED'
              ? 'This workspace was cleared in another tab.'
              : 'This workspace was updated in another tab.'}
          </span>
          <div className="workspace-crosstab-actions">
            <button
              type="button"
              className="workspace-crosstab-btn-reload"
              onClick={() => resolveCrossTabConflict(workspaceType, 'reload')}
            >
              Reload latest
            </button>
            <button
              type="button"
              className="workspace-crosstab-btn-keep"
              onClick={() => resolveCrossTabConflict(workspaceType, 'keep')}
            >
              Keep this tab&apos;s version
            </button>
          </div>
        </div>
      )}

      <div className="workspace-persistence-bar">
        <div
          className={`workspace-status-indicator workspace-status-${status}`}
          title="Your workspace is stored locally in this browser. Assistant requests are sent only when you explicitly choose to use the assistant."
        >
          <span className="workspace-status-icon">{getStatusIcon()}</span>
          <span className="workspace-status-text">{getStatusLabel()}</span>
          {status !== 'unsupported-schema' && (
            <span className="workspace-privacy-hint">(Browser-local storage)</span>
          )}
        </div>

        <div className="workspace-actions">
          {!confirmingClear ? (
            <button
              type="button"
              className="workspace-clear-btn"
              onClick={() => setConfirmingClear(true)}
              title={
                workspaceType === 'transliteration'
                  ? 'Reset transliteration input, profile, and review decisions to defaults'
                  : 'Reset bibliography records, review decisions, and CSV text to defaults'
              }
            >
              Clear Workspace
            </button>
          ) : (
            <div className="workspace-clear-confirm-group" role="group" aria-label="Confirm workspace reset">
              <span className="workspace-clear-prompt">Reset to defaults?</span>
              <button
                type="button"
                className="workspace-clear-btn-confirm"
                onClick={handleClear}
              >
                Yes, Reset
              </button>
              <button
                type="button"
                className="workspace-clear-btn-cancel"
                onClick={() => setConfirmingClear(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
