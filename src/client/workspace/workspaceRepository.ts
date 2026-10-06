import type {
  TransliterationWorkspaceV1,
  BibliographyWorkspaceV1,
  WorkspaceLoadResult,
  WorkspaceSaveResult,
  WorkspaceClearResult,
  RuntimeTransliterationWorkspace,
  StoredWorkspaceEnvelope
} from './types';
import {
  parseTransliterationWorkspace,
  parseBibliographyWorkspace,
  toPersistedAcceptedPhraseDecision,
  validateAndMigrateTransliterationWorkspace,
  validateAndMigrateBibliographyWorkspace
} from './validation';
import { OperationQueue } from './operationQueue';

const DB_NAME = 'persian-scholarly-transliterator';
const DB_VERSION = 1;
const STORE_NAME = 'workspaces';

const KEY_TRANSLITERATION = 'transliteration';
const KEY_BIBLIOGRAPHY = 'bibliography';

function isIndexedDbAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined' && window.indexedDB !== null;
  } catch {
    return false;
  }
}

let cachedDb: IDBDatabase | null = null;
let dbOpenPromise: Promise<IDBDatabase | null> | null = null;

function getDatabase(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) {
    return Promise.resolve(null);
  }

  if (cachedDb) {
    try {
      if (cachedDb.objectStoreNames.contains(STORE_NAME)) {
        return Promise.resolve(cachedDb);
      }
    } catch {
      cachedDb = null;
    }
  }

  if (dbOpenPromise) {
    return dbOpenPromise;
  }

  dbOpenPromise = new Promise<IDBDatabase | null>((resolve, reject) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        cachedDb = db;
        dbOpenPromise = null;

        db.onversionchange = () => {
          db.close();
          if (cachedDb === db) cachedDb = null;
        };

        db.onclose = () => {
          if (cachedDb === db) cachedDb = null;
        };

        resolve(db);
      };

      request.onerror = () => {
        dbOpenPromise = null;
        cachedDb = null;
        reject(request.error);
      };

      request.onblocked = () => {
        dbOpenPromise = null;
        resolve(null);
      };
    } catch (err) {
      dbOpenPromise = null;
      cachedDb = null;
      reject(err);
    }
  });

  return dbOpenPromise;
}

export const transliterationQueue = new OperationQueue();
export const bibliographyQueue = new OperationQueue();

function unwrapEnvelope(raw: unknown): { value: unknown; storageRevision: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  if ('storageRevision' in raw && 'value' in raw && typeof (raw as any).storageRevision === 'number') {
    return {
      value: (raw as any).value,
      storageRevision: (raw as any).storageRevision
    };
  }
  // Backward compatibility with raw un-enveloped workspace
  return {
    value: raw,
    storageRevision: 1
  };
}

async function getWorkspaceRawDirect<T>(
  key: string,
  validator: (data: unknown) => ReturnType<typeof parseTransliterationWorkspace> | ReturnType<typeof parseBibliographyWorkspace>
): Promise<WorkspaceLoadResult<T>> {
  if (!isIndexedDbAvailable()) {
    return { status: 'unavailable' };
  }

  try {
    const db = await getDatabase();
    if (!db) {
      return { status: 'unavailable' };
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(key);

        let loadResult: WorkspaceLoadResult<T> = { status: 'ok', value: null, storageRevision: null };

        request.onsuccess = () => {
          const raw = request.result;
          if (raw === undefined || raw === null) {
            loadResult = { status: 'ok', value: null, storageRevision: null };
            return;
          }

          const unwrapped = unwrapEnvelope(raw);
          if (!unwrapped) {
            loadResult = { status: 'ok', value: null, storageRevision: null };
            return;
          }

          const parseRes = validator(unwrapped.value);
          if (parseRes.success) {
            loadResult = {
              status: 'ok',
              value: parseRes.data as unknown as T,
              storageRevision: unwrapped.storageRevision
            };
          } else if (parseRes.reason === 'UNSUPPORTED_SCHEMA') {
            loadResult = {
              status: 'unsupported-schema',
              rawVersion: parseRes.rawVersion
            };
          } else {
            // Corrupted data
            loadResult = {
              status: 'ok',
              value: null,
              storageRevision: unwrapped.storageRevision
            };
          }
        };

        tx.oncomplete = () => {
          resolve(loadResult);
        };

        tx.onerror = () => {
          reject(tx.error);
        };

        tx.onabort = () => {
          reject(tx.error || new Error('TRANSACTION_ABORTED'));
        };
      } catch (err) {
        reject(err);
      }
    });
  } catch (error) {
    return { status: 'error', error };
  }
}

async function saveWorkspaceAtomicCAS<T>(
  key: string,
  value: T,
  expectedRevision: number | null
): Promise<WorkspaceSaveResult> {
  if (!isIndexedDbAvailable()) {
    throw new Error('INDEXED_DB_UNAVAILABLE');
  }

  const db = await getDatabase();
  if (!db) {
    throw new Error('INDEXED_DB_UNAVAILABLE');
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(key);

      let saveOutcome: WorkspaceSaveResult = { status: 'conflict', actualRevision: null };

      getReq.onsuccess = () => {
        const raw = getReq.result;
        const currentEnvelope = unwrapEnvelope(raw);
        const currentRevision = currentEnvelope ? currentEnvelope.storageRevision : null;

        if (currentRevision !== expectedRevision) {
          saveOutcome = {
            status: 'conflict',
            actualRevision: currentRevision
          };
          return;
        }

        const nextRevision = (currentRevision ?? 0) + 1;
        const newEnvelope: StoredWorkspaceEnvelope<T> = {
          storageRevision: nextRevision,
          value
        };

        store.put(newEnvelope, key);
        saveOutcome = {
          status: 'saved',
          revision: nextRevision
        };
      };

      tx.oncomplete = () => {
        resolve(saveOutcome);
      };

      tx.onerror = () => {
        reject(tx.error);
      };

      tx.onabort = () => {
        reject(tx.error || new Error('TRANSACTION_ABORTED'));
      };
    } catch (err) {
      reject(err);
    }
  });
}

async function forceSaveWorkspaceDirect<T>(
  key: string,
  value: T
): Promise<WorkspaceSaveResult> {
  if (!isIndexedDbAvailable()) {
    throw new Error('INDEXED_DB_UNAVAILABLE');
  }

  const db = await getDatabase();
  if (!db) {
    throw new Error('INDEXED_DB_UNAVAILABLE');
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(key);

      let saveOutcome: WorkspaceSaveResult = { status: 'saved', revision: 1 };

      getReq.onsuccess = () => {
        const raw = getReq.result;
        const currentEnvelope = unwrapEnvelope(raw);
        const currentRevision = currentEnvelope ? currentEnvelope.storageRevision : 0;
        const nextRevision = currentRevision + 1;

        const newEnvelope: StoredWorkspaceEnvelope<T> = {
          storageRevision: nextRevision,
          value
        };

        store.put(newEnvelope, key);
        saveOutcome = {
          status: 'saved',
          revision: nextRevision
        };
      };

      tx.oncomplete = () => {
        resolve(saveOutcome);
      };

      tx.onerror = () => {
        reject(tx.error);
      };

      tx.onabort = () => {
        reject(tx.error || new Error('TRANSACTION_ABORTED'));
      };
    } catch (err) {
      reject(err);
    }
  });
}

async function clearWorkspaceAtomicCAS(
  key: string,
  expectedRevision: number | null
): Promise<WorkspaceClearResult> {
  if (!isIndexedDbAvailable()) {
    return { status: 'cleared' };
  }

  const db = await getDatabase();
  if (!db) return { status: 'cleared' };

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(key);

      let clearOutcome: WorkspaceClearResult = { status: 'cleared' };

      getReq.onsuccess = () => {
        const raw = getReq.result;
        if (raw === undefined || raw === null) {
          clearOutcome = { status: 'cleared' };
          return;
        }

        const currentEnvelope = unwrapEnvelope(raw);
        const currentRevision = currentEnvelope ? currentEnvelope.storageRevision : null;

        if (currentRevision !== expectedRevision) {
          clearOutcome = {
            status: 'conflict',
            actualRevision: currentRevision
          };
          return;
        }

        store.delete(key);
        clearOutcome = { status: 'cleared' };
      };

      tx.oncomplete = () => {
        resolve(clearOutcome);
      };

      tx.onerror = () => {
        reject(tx.error);
      };

      tx.onabort = () => {
        reject(tx.error || new Error('TRANSACTION_ABORTED'));
      };
    } catch (err) {
      reject(err);
    }
  });
}

async function forceClearWorkspaceDirect(key: string): Promise<WorkspaceClearResult> {
  if (!isIndexedDbAvailable()) {
    return { status: 'cleared' };
  }

  const db = await getDatabase();
  if (!db) return { status: 'cleared' };

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);

      tx.oncomplete = () => {
        resolve({ status: 'cleared' });
      };

      tx.onerror = () => {
        reject(tx.error);
      };

      tx.onabort = () => {
        reject(tx.error || new Error('TRANSACTION_ABORTED'));
      };
    } catch (err) {
      reject(err);
    }
  });
}

export const workspaceRepository = {
  getTransliterationWorkspace(): Promise<WorkspaceLoadResult<TransliterationWorkspaceV1>> {
    return transliterationQueue.enqueue(() => {
      return getWorkspaceRawDirect<TransliterationWorkspaceV1>(
        KEY_TRANSLITERATION,
        parseTransliterationWorkspace
      );
    });
  },

  saveTransliterationWorkspace(
    workspace: TransliterationWorkspaceV1 | RuntimeTransliterationWorkspace,
    expectedRevision: number | null
  ): Promise<WorkspaceSaveResult> {
    return transliterationQueue.enqueue(async () => {
      const serializable: TransliterationWorkspaceV1 = {
        schemaVersion: 1,
        updatedAt: workspace.updatedAt || new Date().toISOString(),
        input: workspace.input,
        profile: workspace.profile,
        reviewDecisions: workspace.reviewDecisions,
        acceptedPhraseDecision: workspace.acceptedPhraseDecision
          ? toPersistedAcceptedPhraseDecision(workspace.acceptedPhraseDecision)
          : null
      };

      const validated = validateAndMigrateTransliterationWorkspace(serializable);
      return saveWorkspaceAtomicCAS(KEY_TRANSLITERATION, validated, expectedRevision);
    });
  },

  forceSaveTransliterationWorkspace(
    workspace: TransliterationWorkspaceV1 | RuntimeTransliterationWorkspace
  ): Promise<WorkspaceSaveResult> {
    return transliterationQueue.enqueue(async () => {
      const serializable: TransliterationWorkspaceV1 = {
        schemaVersion: 1,
        updatedAt: workspace.updatedAt || new Date().toISOString(),
        input: workspace.input,
        profile: workspace.profile,
        reviewDecisions: workspace.reviewDecisions,
        acceptedPhraseDecision: workspace.acceptedPhraseDecision
          ? toPersistedAcceptedPhraseDecision(workspace.acceptedPhraseDecision)
          : null
      };

      const validated = validateAndMigrateTransliterationWorkspace(serializable);
      return forceSaveWorkspaceDirect(KEY_TRANSLITERATION, validated);
    });
  },

  clearTransliterationWorkspace(
    expectedRevision: number | null
  ): Promise<WorkspaceClearResult> {
    return transliterationQueue.enqueue(() => {
      return clearWorkspaceAtomicCAS(KEY_TRANSLITERATION, expectedRevision);
    });
  },

  forceClearTransliterationWorkspace(): Promise<WorkspaceClearResult> {
    return transliterationQueue.enqueue(() => {
      return forceClearWorkspaceDirect(KEY_TRANSLITERATION);
    });
  },

  getBibliographyWorkspace(): Promise<WorkspaceLoadResult<BibliographyWorkspaceV1>> {
    return bibliographyQueue.enqueue(() => {
      return getWorkspaceRawDirect<BibliographyWorkspaceV1>(
        KEY_BIBLIOGRAPHY,
        parseBibliographyWorkspace
      );
    });
  },

  saveBibliographyWorkspace(
    workspace: BibliographyWorkspaceV1,
    expectedRevision: number | null
  ): Promise<WorkspaceSaveResult> {
    return bibliographyQueue.enqueue(async () => {
      const validated = validateAndMigrateBibliographyWorkspace(workspace);
      return saveWorkspaceAtomicCAS(KEY_BIBLIOGRAPHY, validated, expectedRevision);
    });
  },

  forceSaveBibliographyWorkspace(
    workspace: BibliographyWorkspaceV1
  ): Promise<WorkspaceSaveResult> {
    return bibliographyQueue.enqueue(async () => {
      const validated = validateAndMigrateBibliographyWorkspace(workspace);
      return forceSaveWorkspaceDirect(KEY_BIBLIOGRAPHY, validated);
    });
  },

  clearBibliographyWorkspace(
    expectedRevision: number | null
  ): Promise<WorkspaceClearResult> {
    return bibliographyQueue.enqueue(() => {
      return clearWorkspaceAtomicCAS(KEY_BIBLIOGRAPHY, expectedRevision);
    });
  },

  forceClearBibliographyWorkspace(): Promise<WorkspaceClearResult> {
    return bibliographyQueue.enqueue(() => {
      return forceClearWorkspaceDirect(KEY_BIBLIOGRAPHY);
    });
  }
};
