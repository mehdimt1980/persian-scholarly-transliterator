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
    resetTransliteration,
    resetBibliography,
    crossTabNotice,
    dismissCrossTabNotice,
    reloadFromStorage
  } = useResearchWorkspace();

  const [confirmingClear, setConfirmingClear] = useState(false);

  const hasCrossTabNotice = crossTabNotice[workspaceType];

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
    if (!ready || persistenceStatus === 'restoring') {
      return 'Restoring local workspace…';
    }
    if (persistenceStatus === 'saving') {
      return 'Saving…';
    }
    if (persistenceStatus === 'error') {
      return 'Local save unavailable';
    }
    return 'Saved locally';
  };

  const getStatusIcon = () => {
    if (!ready || persistenceStatus === 'restoring' || persistenceStatus === 'saving') {
      return (
        <svg className="workspace-status-spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      );
    }
    if (persistenceStatus === 'error') {
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5">
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
      {hasCrossTabNotice && (
        <div className="workspace-crosstab-alert" role="status">
          <span className="workspace-crosstab-text">
            This workspace was updated in another tab.
          </span>
          <div className="workspace-crosstab-actions">
            <button
              type="button"
              className="workspace-crosstab-btn-reload"
              onClick={() => reloadFromStorage(workspaceType)}
            >
              Reload latest
            </button>
            <button
              type="button"
              className="workspace-crosstab-btn-dismiss"
              onClick={() => dismissCrossTabNotice(workspaceType)}
              aria-label="Dismiss cross-tab notice"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="workspace-persistence-bar">
        <div className="workspace-status-indicator" title="Your workspace is stored locally in this browser. Assistant requests are sent only when you explicitly choose to use the assistant.">
          <span className="workspace-status-icon">{getStatusIcon()}</span>
          <span className="workspace-status-text">{getStatusLabel()}</span>
          <span className="workspace-privacy-hint">(Browser-local storage)</span>
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
