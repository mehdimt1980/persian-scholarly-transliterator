'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type {
  BibliographyWorkspaceV1,
  CrossTabConflictType,
  ResearchWorkspaceContextValue,
  RuntimeTransliterationWorkspace,
  TransliterationWorkspaceV1,
  WorkspacePersistenceStatus
} from './types';
import {
  createDefaultTransliterationWorkspace,
  createDefaultBibliographyWorkspace
} from './defaults';
import {
  fromPersistedAcceptedPhraseDecision,
  toPersistedAcceptedPhraseDecision
} from './validation';
import { workspaceRepository } from './workspaceRepository';

export const ResearchWorkspaceContext = createContext<ResearchWorkspaceContextValue | null>(null);

const BROADCAST_CHANNEL_NAME = 'persian-scholarly-transliterator-sync';
const AUTOSAVE_DEBOUNCE_MS = 300;

function toRuntimeTransliterationWorkspace(
  persisted: TransliterationWorkspaceV1
): RuntimeTransliterationWorkspace {
  return {
    schemaVersion: 1,
    updatedAt: persisted.updatedAt,
    input: persisted.input,
    profile: persisted.profile,
    reviewDecisions: persisted.reviewDecisions,
    acceptedPhraseDecision: persisted.acceptedPhraseDecision
      ? fromPersistedAcceptedPhraseDecision(persisted.acceptedPhraseDecision, persisted.profile)
      : null
  };
}

function toSerializableTransliterationJson(
  runtime: RuntimeTransliterationWorkspace
): string {
  const serializable: TransliterationWorkspaceV1 = {
    schemaVersion: 1,
    updatedAt: runtime.updatedAt,
    input: runtime.input,
    profile: runtime.profile,
    reviewDecisions: runtime.reviewDecisions,
    acceptedPhraseDecision: runtime.acceptedPhraseDecision
      ? toPersistedAcceptedPhraseDecision(runtime.acceptedPhraseDecision)
      : null
  };
  return JSON.stringify(serializable);
}

export function ResearchWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<{
    transliteration: WorkspacePersistenceStatus;
    bibliography: WorkspacePersistenceStatus;
  }>({
    transliteration: 'restoring',
    bibliography: 'restoring'
  });

  const [transliteration, setTransliteration] = useState<RuntimeTransliterationWorkspace>(() =>
    toRuntimeTransliterationWorkspace(createDefaultTransliterationWorkspace())
  );
  const [bibliography, setBibliography] = useState<BibliographyWorkspaceV1>(
    createDefaultBibliographyWorkspace
  );

  const [crossTabConflict, setCrossTabConflict] = useState<{
    transliteration: CrossTabConflictType;
    bibliography: CrossTabConflictType;
  }>({
    transliteration: null,
    bibliography: null
  });

  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const transliterationSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bibliographySaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const latestTransliterationRef = useRef<RuntimeTransliterationWorkspace>(transliteration);
  const latestBibliographyRef = useRef<BibliographyWorkspaceV1>(bibliography);
  const lastSavedTransliterationJsonRef = useRef<string>('');
  const lastSavedBibliographyJsonRef = useRef<string>('');
  const isRestoringRef = useRef<boolean>(true);

  const unsupportedSchemaRef = useRef<{
    transliteration: boolean;
    bibliography: boolean;
  }>({
    transliteration: false,
    bibliography: false
  });

  const crossTabConflictRef = useRef(crossTabConflict);
  crossTabConflictRef.current = crossTabConflict;

  latestTransliterationRef.current = transliteration;
  latestBibliographyRef.current = bibliography;

  // 1. Initial restoration barrier
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        const [transRes, bibRes] = await Promise.all([
          workspaceRepository.getTransliterationWorkspace(),
          workspaceRepository.getBibliographyWorkspace()
        ]);

        if (cancelled) return;

        let transStatus: WorkspacePersistenceStatus = 'saved';
        let bibStatus: WorkspacePersistenceStatus = 'saved';

        // Transliteration restore evaluation
        if (transRes.status === 'unavailable') {
          transStatus = 'unavailable';
        } else if (transRes.status === 'unsupported-schema') {
          transStatus = 'unsupported-schema';
          unsupportedSchemaRef.current.transliteration = true;
        } else if (transRes.status === 'error') {
          transStatus = 'error';
        } else if (transRes.status === 'ok' && transRes.value) {
          const runtime = toRuntimeTransliterationWorkspace(transRes.value);
          setTransliteration(runtime);
          lastSavedTransliterationJsonRef.current = toSerializableTransliterationJson(runtime);
        } else {
          lastSavedTransliterationJsonRef.current = toSerializableTransliterationJson(
            latestTransliterationRef.current
          );
        }

        // Bibliography restore evaluation
        if (bibRes.status === 'unavailable') {
          bibStatus = 'unavailable';
        } else if (bibRes.status === 'unsupported-schema') {
          bibStatus = 'unsupported-schema';
          unsupportedSchemaRef.current.bibliography = true;
        } else if (bibRes.status === 'error') {
          bibStatus = 'error';
        } else if (bibRes.status === 'ok' && bibRes.value) {
          setBibliography(bibRes.value);
          lastSavedBibliographyJsonRef.current = JSON.stringify(bibRes.value);
        } else {
          lastSavedBibliographyJsonRef.current = JSON.stringify(
            latestBibliographyRef.current
          );
        }

        isRestoringRef.current = false;
        setReady(true);
        setPersistenceStatus({
          transliteration: transStatus,
          bibliography: bibStatus
        });
      } catch {
        if (cancelled) return;
        isRestoringRef.current = false;
        setReady(true);
        setPersistenceStatus({
          transliteration: 'error',
          bibliography: 'error'
        });
      }
    }

    restore();

    // BroadcastChannel setup for cross-tab notification
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        channel.onmessage = (event) => {
          const data = event.data;
          if (data && typeof data === 'object') {
            if (data.type === 'WORKSPACE_SAVED' || data.type === 'WORKSPACE_CLEARED') {
              const conflictKind: CrossTabConflictType =
                data.type === 'WORKSPACE_SAVED' ? 'UPDATED' : 'CLEARED';
              if (data.workspace === 'transliteration') {
                if (transliterationSaveTimeoutRef.current) {
                  clearTimeout(transliterationSaveTimeoutRef.current);
                  transliterationSaveTimeoutRef.current = null;
                }
                setCrossTabConflict((prev) => ({ ...prev, transliteration: conflictKind }));
                setPersistenceStatus((prev) => ({ ...prev, transliteration: 'conflict' }));
              } else if (data.workspace === 'bibliography') {
                if (bibliographySaveTimeoutRef.current) {
                  clearTimeout(bibliographySaveTimeoutRef.current);
                  bibliographySaveTimeoutRef.current = null;
                }
                setCrossTabConflict((prev) => ({ ...prev, bibliography: conflictKind }));
                setPersistenceStatus((prev) => ({ ...prev, bibliography: 'conflict' }));
              }
            }
          }
        };
        broadcastChannelRef.current = channel;
      }
    } catch {
      // BroadcastChannel optional fallback
    }

    return () => {
      cancelled = true;
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
    };
  }, []);

  // Independent Transliteration Flush
  const flushTransliterationSave = async () => {
    if (
      isRestoringRef.current ||
      !ready ||
      unsupportedSchemaRef.current.transliteration ||
      crossTabConflictRef.current.transliteration !== null
    ) {
      return;
    }

    const currentTrans = latestTransliterationRef.current;
    const transJson = toSerializableTransliterationJson(currentTrans);

    if (transJson === lastSavedTransliterationJsonRef.current) return;

    try {
      await workspaceRepository.saveTransliterationWorkspace(currentTrans);
      lastSavedTransliterationJsonRef.current = transJson;
      try {
        broadcastChannelRef.current?.postMessage({
          type: 'WORKSPACE_SAVED',
          workspace: 'transliteration'
        });
      } catch {
        // ignore
      }
      setPersistenceStatus((prev) => ({ ...prev, transliteration: 'saved' }));
    } catch {
      setPersistenceStatus((prev) => ({ ...prev, transliteration: 'error' }));
    }
  };

  // Independent Bibliography Flush
  const flushBibliographySave = async () => {
    if (
      isRestoringRef.current ||
      !ready ||
      unsupportedSchemaRef.current.bibliography ||
      crossTabConflictRef.current.bibliography !== null
    ) {
      return;
    }

    const currentBib = latestBibliographyRef.current;
    const bibJson = JSON.stringify(currentBib);

    if (bibJson === lastSavedBibliographyJsonRef.current) return;

    try {
      await workspaceRepository.saveBibliographyWorkspace(currentBib);
      lastSavedBibliographyJsonRef.current = bibJson;
      try {
        broadcastChannelRef.current?.postMessage({
          type: 'WORKSPACE_SAVED',
          workspace: 'bibliography'
        });
      } catch {
        // ignore
      }
      setPersistenceStatus((prev) => ({ ...prev, bibliography: 'saved' }));
    } catch {
      setPersistenceStatus((prev) => ({ ...prev, bibliography: 'error' }));
    }
  };

  // 2. Independent Debounced Autosave for Transliteration
  useEffect(() => {
    if (
      !ready ||
      isRestoringRef.current ||
      unsupportedSchemaRef.current.transliteration ||
      crossTabConflict.transliteration !== null
    ) {
      return;
    }

    const transJson = toSerializableTransliterationJson(transliteration);
    if (transJson === lastSavedTransliterationJsonRef.current) return;

    setPersistenceStatus((prev) => ({ ...prev, transliteration: 'saving' }));

    if (transliterationSaveTimeoutRef.current) {
      clearTimeout(transliterationSaveTimeoutRef.current);
    }

    transliterationSaveTimeoutRef.current = setTimeout(async () => {
      await flushTransliterationSave();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (transliterationSaveTimeoutRef.current) {
        clearTimeout(transliterationSaveTimeoutRef.current);
      }
    };
  }, [transliteration, ready, crossTabConflict.transliteration]);

  // 2b. Independent Debounced Autosave for Bibliography
  useEffect(() => {
    if (
      !ready ||
      isRestoringRef.current ||
      unsupportedSchemaRef.current.bibliography ||
      crossTabConflict.bibliography !== null
    ) {
      return;
    }

    const bibJson = JSON.stringify(bibliography);
    if (bibJson === lastSavedBibliographyJsonRef.current) return;

    setPersistenceStatus((prev) => ({ ...prev, bibliography: 'saving' }));

    if (bibliographySaveTimeoutRef.current) {
      clearTimeout(bibliographySaveTimeoutRef.current);
    }

    bibliographySaveTimeoutRef.current = setTimeout(async () => {
      await flushBibliographySave();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (bibliographySaveTimeoutRef.current) {
        clearTimeout(bibliographySaveTimeoutRef.current);
      }
    };
  }, [bibliography, ready, crossTabConflict.bibliography]);

  // 3. Independent Lifecycle Listeners for document visibilitychange & pagehide
  useEffect(() => {
    if (!ready) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (transliterationSaveTimeoutRef.current) {
          clearTimeout(transliterationSaveTimeoutRef.current);
          transliterationSaveTimeoutRef.current = null;
        }
        if (bibliographySaveTimeoutRef.current) {
          clearTimeout(bibliographySaveTimeoutRef.current);
          bibliographySaveTimeoutRef.current = null;
        }
        flushTransliterationSave();
        flushBibliographySave();
      }
    };

    const handlePageHide = () => {
      if (transliterationSaveTimeoutRef.current) {
        clearTimeout(transliterationSaveTimeoutRef.current);
        transliterationSaveTimeoutRef.current = null;
      }
      if (bibliographySaveTimeoutRef.current) {
        clearTimeout(bibliographySaveTimeoutRef.current);
        bibliographySaveTimeoutRef.current = null;
      }
      flushTransliterationSave();
      flushBibliographySave();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [ready]);

  // Context methods
  const updateTransliteration = (
    updater:
      | Partial<Omit<RuntimeTransliterationWorkspace, 'schemaVersion' | 'updatedAt'>>
      | ((prev: RuntimeTransliterationWorkspace) => RuntimeTransliterationWorkspace)
  ) => {
    setTransliteration((prev) => {
      if (typeof updater === 'function') {
        const next = updater(prev);
        return {
          ...next,
          schemaVersion: 1,
          updatedAt: new Date().toISOString()
        };
      }
      return {
        ...prev,
        ...updater,
        schemaVersion: 1,
        updatedAt: new Date().toISOString()
      };
    });
  };

  const resetTransliteration = async () => {
    if (transliterationSaveTimeoutRef.current) {
      clearTimeout(transliterationSaveTimeoutRef.current);
      transliterationSaveTimeoutRef.current = null;
    }
    const defaultWorkspace = toRuntimeTransliterationWorkspace(
      createDefaultTransliterationWorkspace()
    );
    setTransliteration(defaultWorkspace);
    lastSavedTransliterationJsonRef.current = toSerializableTransliterationJson(defaultWorkspace);
    unsupportedSchemaRef.current.transliteration = false;
    setCrossTabConflict((prev) => ({ ...prev, transliteration: null }));

    try {
      await workspaceRepository.clearTransliterationWorkspace();
      try {
        broadcastChannelRef.current?.postMessage({
          type: 'WORKSPACE_CLEARED',
          workspace: 'transliteration'
        });
      } catch {
        // ignore
      }
      setPersistenceStatus((prev) => ({ ...prev, transliteration: 'saved' }));
    } catch {
      setPersistenceStatus((prev) => ({ ...prev, transliteration: 'error' }));
    }
  };

  const updateBibliography = (
    updater:
      | Partial<Omit<BibliographyWorkspaceV1, 'schemaVersion' | 'updatedAt'>>
      | ((prev: BibliographyWorkspaceV1) => BibliographyWorkspaceV1)
  ) => {
    setBibliography((prev) => {
      if (typeof updater === 'function') {
        const next = updater(prev);
        return {
          ...next,
          schemaVersion: 1,
          updatedAt: new Date().toISOString()
        };
      }
      return {
        ...prev,
        ...updater,
        schemaVersion: 1,
        updatedAt: new Date().toISOString()
      };
    });
  };

  const resetBibliography = async () => {
    if (bibliographySaveTimeoutRef.current) {
      clearTimeout(bibliographySaveTimeoutRef.current);
      bibliographySaveTimeoutRef.current = null;
    }
    const defaultWorkspace = createDefaultBibliographyWorkspace();
    setBibliography(defaultWorkspace);
    lastSavedBibliographyJsonRef.current = JSON.stringify(defaultWorkspace);
    unsupportedSchemaRef.current.bibliography = false;
    setCrossTabConflict((prev) => ({ ...prev, bibliography: null }));

    try {
      await workspaceRepository.clearBibliographyWorkspace();
      try {
        broadcastChannelRef.current?.postMessage({
          type: 'WORKSPACE_CLEARED',
          workspace: 'bibliography'
        });
      } catch {
        // ignore
      }
      setPersistenceStatus((prev) => ({ ...prev, bibliography: 'saved' }));
    } catch {
      setPersistenceStatus((prev) => ({ ...prev, bibliography: 'error' }));
    }
  };

  const resolveCrossTabConflict = async (
    workspace: 'transliteration' | 'bibliography',
    resolution: 'reload' | 'keep'
  ) => {
    if (workspace === 'transliteration') {
      if (transliterationSaveTimeoutRef.current) {
        clearTimeout(transliterationSaveTimeoutRef.current);
        transliterationSaveTimeoutRef.current = null;
      }

      if (resolution === 'reload') {
        const res = await workspaceRepository.getTransliterationWorkspace();
        if (res.status === 'ok') {
          const runtime = res.value
            ? toRuntimeTransliterationWorkspace(res.value)
            : toRuntimeTransliterationWorkspace(createDefaultTransliterationWorkspace());
          setTransliteration(runtime);
          lastSavedTransliterationJsonRef.current = toSerializableTransliterationJson(runtime);
          setCrossTabConflict((prev) => ({ ...prev, transliteration: null }));
          setPersistenceStatus((prev) => ({ ...prev, transliteration: 'saved' }));
        }
      } else if (resolution === 'keep') {
        setCrossTabConflict((prev) => ({ ...prev, transliteration: null }));
        const currentTrans = latestTransliterationRef.current;
        try {
          await workspaceRepository.saveTransliterationWorkspace(currentTrans);
          lastSavedTransliterationJsonRef.current = toSerializableTransliterationJson(currentTrans);
          try {
            broadcastChannelRef.current?.postMessage({
              type: 'WORKSPACE_SAVED',
              workspace: 'transliteration'
            });
          } catch {
            // ignore
          }
          setPersistenceStatus((prev) => ({ ...prev, transliteration: 'saved' }));
        } catch {
          setPersistenceStatus((prev) => ({ ...prev, transliteration: 'error' }));
        }
      }
    } else if (workspace === 'bibliography') {
      if (bibliographySaveTimeoutRef.current) {
        clearTimeout(bibliographySaveTimeoutRef.current);
        bibliographySaveTimeoutRef.current = null;
      }

      if (resolution === 'reload') {
        const res = await workspaceRepository.getBibliographyWorkspace();
        if (res.status === 'ok') {
          const bib = res.value ?? createDefaultBibliographyWorkspace();
          setBibliography(bib);
          lastSavedBibliographyJsonRef.current = JSON.stringify(bib);
          setCrossTabConflict((prev) => ({ ...prev, bibliography: null }));
          setPersistenceStatus((prev) => ({ ...prev, bibliography: 'saved' }));
        }
      } else if (resolution === 'keep') {
        setCrossTabConflict((prev) => ({ ...prev, bibliography: null }));
        const currentBib = latestBibliographyRef.current;
        try {
          await workspaceRepository.saveBibliographyWorkspace(currentBib);
          lastSavedBibliographyJsonRef.current = JSON.stringify(currentBib);
          try {
            broadcastChannelRef.current?.postMessage({
              type: 'WORKSPACE_SAVED',
              workspace: 'bibliography'
            });
          } catch {
            // ignore
          }
          setPersistenceStatus((prev) => ({ ...prev, bibliography: 'saved' }));
        } catch {
          setPersistenceStatus((prev) => ({ ...prev, bibliography: 'error' }));
        }
      }
    }
  };

  const contextValue: ResearchWorkspaceContextValue = {
    ready,
    persistenceStatus,
    transliteration,
    updateTransliteration,
    resetTransliteration,
    bibliography,
    updateBibliography,
    resetBibliography,
    crossTabConflict,
    resolveCrossTabConflict
  };

  return (
    <ResearchWorkspaceContext.Provider value={contextValue}>
      {children}
    </ResearchWorkspaceContext.Provider>
  );
}

export function useResearchWorkspace(): ResearchWorkspaceContextValue {
  const context = useContext(ResearchWorkspaceContext);
  if (!context) {
    throw new Error('useResearchWorkspace must be used within a ResearchWorkspaceProvider');
  }
  return context;
}
