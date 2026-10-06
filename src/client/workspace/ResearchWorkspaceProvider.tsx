'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type {
  BibliographyWorkspaceV1,
  PersistenceStatus,
  ResearchWorkspaceContextValue,
  RuntimeTransliterationWorkspace,
  TransliterationWorkspaceV1
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
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>('restoring');

  const [transliteration, setTransliteration] = useState<RuntimeTransliterationWorkspace>(() =>
    toRuntimeTransliterationWorkspace(createDefaultTransliterationWorkspace())
  );
  const [bibliography, setBibliography] = useState<BibliographyWorkspaceV1>(
    createDefaultBibliographyWorkspace
  );

  const [crossTabNotice, setCrossTabNotice] = useState<{
    transliteration: boolean;
    bibliography: boolean;
  }>({
    transliteration: false,
    bibliography: false
  });

  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

        let hasUnavailable = false;

        // Transliteration restore evaluation
        if (transRes.status === 'unavailable') {
          hasUnavailable = true;
        } else if (transRes.status === 'unsupported-schema') {
          unsupportedSchemaRef.current.transliteration = true;
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
          hasUnavailable = true;
        } else if (bibRes.status === 'unsupported-schema') {
          unsupportedSchemaRef.current.bibliography = true;
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

        if (hasUnavailable || transRes.status === 'error' || bibRes.status === 'error') {
          setPersistenceStatus('error');
        } else {
          setPersistenceStatus('saved');
        }
      } catch {
        if (cancelled) return;
        isRestoringRef.current = false;
        setReady(true);
        setPersistenceStatus('error');
      }
    }

    restore();

    // BroadcastChannel setup for cross-tab notification
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        channel.onmessage = (event) => {
          const data = event.data;
          if (data && typeof data === 'object' && (data.type === 'WORKSPACE_SAVED' || data.type === 'WORKSPACE_CLEARED')) {
            if (data.workspace === 'transliteration') {
              setCrossTabNotice((prev) => ({ ...prev, transliteration: true }));
            } else if (data.workspace === 'bibliography') {
              setCrossTabNotice((prev) => ({ ...prev, bibliography: true }));
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

  // Flush helper
  const flushSave = async () => {
    if (isRestoringRef.current || !ready) return;

    const currentTrans = latestTransliterationRef.current;
    const currentBib = latestBibliographyRef.current;
    const transJson = toSerializableTransliterationJson(currentTrans);
    const bibJson = JSON.stringify(currentBib);

    const transChanged =
      !unsupportedSchemaRef.current.transliteration &&
      transJson !== lastSavedTransliterationJsonRef.current;
    const bibChanged =
      !unsupportedSchemaRef.current.bibliography &&
      bibJson !== lastSavedBibliographyJsonRef.current;

    if (!transChanged && !bibChanged) return;

    try {
      if (transChanged) {
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
      }

      if (bibChanged) {
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
      }

      setPersistenceStatus('saved');
    } catch {
      setPersistenceStatus('error');
    }
  };

  // 2. Debounced Autosave (strictly disabled while not ready or restoring)
  useEffect(() => {
    if (!ready || isRestoringRef.current) return;

    const transJson = toSerializableTransliterationJson(transliteration);
    const bibJson = JSON.stringify(bibliography);

    const transChanged =
      !unsupportedSchemaRef.current.transliteration &&
      transJson !== lastSavedTransliterationJsonRef.current;
    const bibChanged =
      !unsupportedSchemaRef.current.bibliography &&
      bibJson !== lastSavedBibliographyJsonRef.current;

    if (!transChanged && !bibChanged) return;

    setPersistenceStatus('saving');

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      await flushSave();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [transliteration, bibliography, ready]);

  // 3. Lifecycle listeners for pagehide & document visibilitychange
  useEffect(() => {
    if (!ready) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        flushSave();
      }
    };

    const handlePageHide = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      flushSave();
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
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const defaultWorkspace = toRuntimeTransliterationWorkspace(
      createDefaultTransliterationWorkspace()
    );
    setTransliteration(defaultWorkspace);
    lastSavedTransliterationJsonRef.current = toSerializableTransliterationJson(defaultWorkspace);
    unsupportedSchemaRef.current.transliteration = false;
    setCrossTabNotice((prev) => ({ ...prev, transliteration: false }));

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
      setPersistenceStatus('saved');
    } catch {
      setPersistenceStatus('error');
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
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const defaultWorkspace = createDefaultBibliographyWorkspace();
    setBibliography(defaultWorkspace);
    lastSavedBibliographyJsonRef.current = JSON.stringify(defaultWorkspace);
    unsupportedSchemaRef.current.bibliography = false;
    setCrossTabNotice((prev) => ({ ...prev, bibliography: false }));

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
      setPersistenceStatus('saved');
    } catch {
      setPersistenceStatus('error');
    }
  };

  const dismissCrossTabNotice = (workspace: 'transliteration' | 'bibliography') => {
    setCrossTabNotice((prev) => ({ ...prev, [workspace]: false }));
  };

  const reloadFromStorage = async (workspace: 'transliteration' | 'bibliography') => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (workspace === 'transliteration') {
      const res = await workspaceRepository.getTransliterationWorkspace();
      if (res.status === 'ok' && res.value) {
        const runtime = toRuntimeTransliterationWorkspace(res.value);
        setTransliteration(runtime);
        lastSavedTransliterationJsonRef.current = toSerializableTransliterationJson(runtime);
      }
      setCrossTabNotice((prev) => ({ ...prev, transliteration: false }));
    } else if (workspace === 'bibliography') {
      const res = await workspaceRepository.getBibliographyWorkspace();
      if (res.status === 'ok' && res.value) {
        setBibliography(res.value);
        lastSavedBibliographyJsonRef.current = JSON.stringify(res.value);
      }
      setCrossTabNotice((prev) => ({ ...prev, bibliography: false }));
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
    crossTabNotice,
    dismissCrossTabNotice,
    reloadFromStorage
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
