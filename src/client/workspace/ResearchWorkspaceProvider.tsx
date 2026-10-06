'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type {
  TransliterationWorkspaceV1,
  BibliographyWorkspaceV1,
  PersistenceStatus,
  ResearchWorkspaceContextValue
} from './types';
import {
  createDefaultTransliterationWorkspace,
  createDefaultBibliographyWorkspace
} from './defaults';
import { workspaceRepository } from './workspaceRepository';

export const ResearchWorkspaceContext = createContext<ResearchWorkspaceContextValue | null>(null);

const BROADCAST_CHANNEL_NAME = 'persian-scholarly-transliterator-sync';
const AUTOSAVE_DEBOUNCE_MS = 300;

export function ResearchWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>('restoring');

  const [transliteration, setTransliteration] = useState<TransliterationWorkspaceV1>(
    createDefaultTransliterationWorkspace
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
  const latestTransliterationRef = useRef<TransliterationWorkspaceV1>(transliteration);
  const latestBibliographyRef = useRef<BibliographyWorkspaceV1>(bibliography);
  const lastSavedTransliterationJsonRef = useRef<string>('');
  const lastSavedBibliographyJsonRef = useRef<string>('');
  const isRestoringRef = useRef<boolean>(true);

  latestTransliterationRef.current = transliteration;
  latestBibliographyRef.current = bibliography;

  // 1. Initial restoration barrier
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        const [savedTrans, savedBib] = await Promise.all([
          workspaceRepository.getTransliterationWorkspace(),
          workspaceRepository.getBibliographyWorkspace()
        ]);

        if (cancelled) return;

        if (savedTrans) {
          setTransliteration(savedTrans);
          lastSavedTransliterationJsonRef.current = JSON.stringify(savedTrans);
        } else {
          lastSavedTransliterationJsonRef.current = JSON.stringify(latestTransliterationRef.current);
        }

        if (savedBib) {
          setBibliography(savedBib);
          lastSavedBibliographyJsonRef.current = JSON.stringify(savedBib);
        } else {
          lastSavedBibliographyJsonRef.current = JSON.stringify(latestBibliographyRef.current);
        }

        isRestoringRef.current = false;
        setReady(true);
        setPersistenceStatus('saved');
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
          if (data && typeof data === 'object' && data.type === 'WORKSPACE_SAVED') {
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
    const transJson = JSON.stringify(currentTrans);
    const bibJson = JSON.stringify(currentBib);

    const transChanged = transJson !== lastSavedTransliterationJsonRef.current;
    const bibChanged = bibJson !== lastSavedBibliographyJsonRef.current;

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

    const transJson = JSON.stringify(transliteration);
    const bibJson = JSON.stringify(bibliography);

    const transChanged = transJson !== lastSavedTransliterationJsonRef.current;
    const bibChanged = bibJson !== lastSavedBibliographyJsonRef.current;

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

  // 3. Lifecycle listeners for pagehide & visibilitychange
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushSave();
      }
    };

    const handlePageHide = () => {
      flushSave();
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [ready]);

  // Context methods
  const updateTransliteration = (
    updater:
      | Partial<Omit<TransliterationWorkspaceV1, 'schemaVersion' | 'updatedAt'>>
      | ((prev: TransliterationWorkspaceV1) => TransliterationWorkspaceV1)
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
    const defaultWorkspace = createDefaultTransliterationWorkspace();
    setTransliteration(defaultWorkspace);
    lastSavedTransliterationJsonRef.current = JSON.stringify(defaultWorkspace);
    setCrossTabNotice((prev) => ({ ...prev, transliteration: false }));
    try {
      await workspaceRepository.clearTransliterationWorkspace();
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
    const defaultWorkspace = createDefaultBibliographyWorkspace();
    setBibliography(defaultWorkspace);
    lastSavedBibliographyJsonRef.current = JSON.stringify(defaultWorkspace);
    setCrossTabNotice((prev) => ({ ...prev, bibliography: false }));
    try {
      await workspaceRepository.clearBibliographyWorkspace();
      setPersistenceStatus('saved');
    } catch {
      setPersistenceStatus('error');
    }
  };

  const dismissCrossTabNotice = (workspace: 'transliteration' | 'bibliography') => {
    setCrossTabNotice((prev) => ({ ...prev, [workspace]: false }));
  };

  const reloadFromStorage = async (workspace: 'transliteration' | 'bibliography') => {
    if (workspace === 'transliteration') {
      const saved = await workspaceRepository.getTransliterationWorkspace();
      if (saved) {
        setTransliteration(saved);
        lastSavedTransliterationJsonRef.current = JSON.stringify(saved);
      }
      setCrossTabNotice((prev) => ({ ...prev, transliteration: false }));
    } else if (workspace === 'bibliography') {
      const saved = await workspaceRepository.getBibliographyWorkspace();
      if (saved) {
        setBibliography(saved);
        lastSavedBibliographyJsonRef.current = JSON.stringify(saved);
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
