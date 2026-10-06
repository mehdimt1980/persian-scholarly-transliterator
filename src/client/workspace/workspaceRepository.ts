import type {
  TransliterationWorkspaceV1,
  BibliographyWorkspaceV1
} from './types';
import {
  validateAndMigrateTransliterationWorkspace,
  validateAndMigrateBibliographyWorkspace
} from './validation';

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

function openDatabase(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };

      request.onblocked = () => {
        resolve(null);
      };
    } catch (err) {
      reject(err);
    }
  });
}

export async function getWorkspaceRaw<T>(key: string): Promise<T | null> {
  try {
    const db = await openDatabase();
    if (!db) return null;

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onsuccess = () => {
          resolve((request.result as T) ?? null);
        };

        request.onerror = () => {
          reject(request.error);
        };
      } catch (err) {
        reject(err);
      }
    });
  } catch {
    return null;
  }
}

export async function saveWorkspaceRaw<T>(key: string, value: T): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    throw new Error('INDEXED_DB_UNAVAILABLE');
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(value, key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    } catch (err) {
      reject(err);
    }
  });
}

export async function deleteWorkspaceRaw(key: string): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    } catch (err) {
      reject(err);
    }
  });
}

export const workspaceRepository = {
  async getTransliterationWorkspace(): Promise<TransliterationWorkspaceV1 | null> {
    const raw = await getWorkspaceRaw(KEY_TRANSLITERATION);
    if (!raw) return null;
    return validateAndMigrateTransliterationWorkspace(raw);
  },

  async saveTransliterationWorkspace(workspace: TransliterationWorkspaceV1): Promise<void> {
    const validated = validateAndMigrateTransliterationWorkspace(workspace);
    await saveWorkspaceRaw(KEY_TRANSLITERATION, validated);
  },

  async clearTransliterationWorkspace(): Promise<void> {
    await deleteWorkspaceRaw(KEY_TRANSLITERATION);
  },

  async getBibliographyWorkspace(): Promise<BibliographyWorkspaceV1 | null> {
    const raw = await getWorkspaceRaw(KEY_BIBLIOGRAPHY);
    if (!raw) return null;
    return validateAndMigrateBibliographyWorkspace(raw);
  },

  async saveBibliographyWorkspace(workspace: BibliographyWorkspaceV1): Promise<void> {
    const validated = validateAndMigrateBibliographyWorkspace(workspace);
    await saveWorkspaceRaw(KEY_BIBLIOGRAPHY, validated);
  },

  async clearBibliographyWorkspace(): Promise<void> {
    await deleteWorkspaceRaw(KEY_BIBLIOGRAPHY);
  }
};
