import type {
  TransliterationWorkspaceV1,
  BibliographyWorkspaceV1,
  WorkspaceLoadResult,
  RuntimeTransliterationWorkspace
} from './types';
import {
  parseTransliterationWorkspace,
  parseBibliographyWorkspace,
  toPersistedAcceptedPhraseDecision,
  validateAndMigrateTransliterationWorkspace,
  validateAndMigrateBibliographyWorkspace
} from './validation';
import {
  createDefaultTransliterationWorkspace,
  createDefaultBibliographyWorkspace
} from './defaults';

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
      // Check if connection is still usable
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

class OperationQueue {
  private currentPromise: Promise<unknown> = Promise.resolve();

  enqueue<R>(op: () => Promise<R>): Promise<R> {
    const nextPromise = this.currentPromise.then(
      () => op(),
      () => op()
    );
    this.currentPromise = nextPromise.catch(() => {});
    return nextPromise;
  }
}

const transliterationQueue = new OperationQueue();
const bibliographyQueue = new OperationQueue();

async function getWorkspaceRawDirect<T>(key: string): Promise<WorkspaceLoadResult<T>> {
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

        let result: T | null = null;
        request.onsuccess = () => {
          result = (request.result as T) ?? null;
        };

        tx.oncomplete = () => {
          resolve({ status: 'ok', value: result });
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

async function saveWorkspaceRawDirect<T>(key: string, value: T): Promise<void> {
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
      store.put(value, key);

      tx.oncomplete = () => {
        resolve();
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

async function deleteWorkspaceRawDirect(key: string): Promise<void> {
  if (!isIndexedDbAvailable()) {
    return;
  }

  const db = await getDatabase();
  if (!db) return;

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);

      tx.oncomplete = () => {
        resolve();
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
    return transliterationQueue.enqueue(async () => {
      const loadRes = await getWorkspaceRawDirect<unknown>(KEY_TRANSLITERATION);
      if (loadRes.status !== 'ok') {
        return loadRes;
      }
      if (loadRes.value === null || loadRes.value === undefined) {
        return { status: 'ok', value: null };
      }

      const parseRes = parseTransliterationWorkspace(loadRes.value);
      if (parseRes.success) {
        return { status: 'ok', value: parseRes.data };
      }

      if (parseRes.reason === 'UNSUPPORTED_SCHEMA') {
        return {
          status: 'unsupported-schema',
          rawVersion: parseRes.rawVersion
        };
      }

      // Safe fallback on data corruption
      return {
        status: 'ok',
        value: createDefaultTransliterationWorkspace()
      };
    });
  },

  saveTransliterationWorkspace(
    workspace: TransliterationWorkspaceV1 | RuntimeTransliterationWorkspace
  ): Promise<void> {
    return transliterationQueue.enqueue(async () => {
      // Ensure accepted phrase decision has no renderedOutput persisted
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
      await saveWorkspaceRawDirect(KEY_TRANSLITERATION, validated);
    });
  },

  clearTransliterationWorkspace(): Promise<void> {
    return transliterationQueue.enqueue(async () => {
      await deleteWorkspaceRawDirect(KEY_TRANSLITERATION);
    });
  },

  getBibliographyWorkspace(): Promise<WorkspaceLoadResult<BibliographyWorkspaceV1>> {
    return bibliographyQueue.enqueue(async () => {
      const loadRes = await getWorkspaceRawDirect<unknown>(KEY_BIBLIOGRAPHY);
      if (loadRes.status !== 'ok') {
        return loadRes;
      }
      if (loadRes.value === null || loadRes.value === undefined) {
        return { status: 'ok', value: null };
      }

      const parseRes = parseBibliographyWorkspace(loadRes.value);
      if (parseRes.success) {
        return { status: 'ok', value: parseRes.data };
      }

      if (parseRes.reason === 'UNSUPPORTED_SCHEMA') {
        return {
          status: 'unsupported-schema',
          rawVersion: parseRes.rawVersion
        };
      }

      // Safe fallback on data corruption
      return {
        status: 'ok',
        value: createDefaultBibliographyWorkspace()
      };
    });
  },

  saveBibliographyWorkspace(workspace: BibliographyWorkspaceV1): Promise<void> {
    return bibliographyQueue.enqueue(async () => {
      const validated = validateAndMigrateBibliographyWorkspace(workspace);
      await saveWorkspaceRawDirect(KEY_BIBLIOGRAPHY, validated);
    });
  },

  clearBibliographyWorkspace(): Promise<void> {
    return bibliographyQueue.enqueue(async () => {
      await deleteWorkspaceRawDirect(KEY_BIBLIOGRAPHY);
    });
  }
};
