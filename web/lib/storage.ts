// Storage facade: in-memory → IndexedDB → localStorage.
//
// Old API (readStorage / writeStorage) keeps working for callers that want a
// synchronous read at first paint (e.g. useState initializer). New async API
// (readStorageAsync / writeStorageAsync) prefers IDB for chats / decks / exams.

import {
  dbDelete as idbDelete,
  dbGet as idbGet,
  dbPut as idbPut,
  type StoreName,
} from './db';

export const STORAGE_KEYS = {
  chats: 'quantara.chats',
  flashcards: 'quantara.flashcards',
  vocab: 'quantara.vocab',
  grammar: 'quantara.grammar',
  progress: 'quantara.progress',
  examTimerMinutes: 'quantara.examTimerMinutes',
} as const;

const memoryCache = new Map<string, unknown>();

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsPut<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota — ignore, IDB still has it
  }
}

const LS_TO_STORE: Record<string, StoreName | null> = {
  [STORAGE_KEYS.chats]: 'chats',
  [STORAGE_KEYS.flashcards]: 'decks',
  [STORAGE_KEYS.vocab]: 'vocab',
  [STORAGE_KEYS.grammar]: 'grammar',
  [STORAGE_KEYS.progress]: 'progress',
  [STORAGE_KEYS.examTimerMinutes]: null,
};

// ---------- Sync (kept for backward compat / first paint) ----------

export function readStorage<T>(key: string, fallback: T): T {
  const cached = memoryCache.get(key);
  if (cached !== undefined) return cached as T;
  const value = lsGet<T>(key, fallback);
  memoryCache.set(key, value);
  return value;
}

export function writeStorage<T>(key: string, value: T): void {
  memoryCache.set(key, value);
  lsPut(key, value);
  // Fire-and-forget IDB write so the durable copy survives quota issues.
  const store = LS_TO_STORE[key];
  if (store && value && typeof value === 'object') {
    const id = deriveId(key, value);
    if (id) {
      void idbPut(store, { id, ...(value as object) });
    }
  }
}

// ---------- Async (preferred for large / structured data) ----------

export async function readStorageAsync<T>(key: string, fallback: T): Promise<T> {
  const store = LS_TO_STORE[key];
  if (store) {
    const id = stableId(key);
    try {
      const fromIdb = await idbGet<T & { id?: string }>(store, id);
      if (fromIdb !== null) {
        memoryCache.set(key, fromIdb);
        lsPut(key, fromIdb);
        return fromIdb as T;
      }
    } catch {
      /* fall through */
    }
  }
  return readStorage<T>(key, fallback);
}

export async function writeStorageAsync<T>(key: string, value: T): Promise<void> {
  memoryCache.set(key, value);
  lsPut(key, value);
  const store = LS_TO_STORE[key];
  if (store && value && typeof value === 'object') {
    const id = stableId(key);
    try {
      await idbPut(store, { id, ...(value as object) });
    } catch {
      /* best effort */
    }
  }
}

export async function deleteStorageAsync(key: string): Promise<void> {
  memoryCache.delete(key);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  const store = LS_TO_STORE[key];
  if (store) await idbDelete(store, stableId(key));
}

// ---------- helpers ----------

function stableId(key: string): string {
  // Derive a single canonical id per storage key so write/read pair up.
  // Older callers that already store arrays/objects with their own ids keep
  // working through the LS→IDB upgrade because we put {id, ...value}.
  if (key === STORAGE_KEYS.examTimerMinutes) return 'default';
  return 'default';
}

function deriveId(key: string, value: unknown): string | null {
  if (key === STORAGE_KEYS.examTimerMinutes) return 'default';
  return 'default';
}

// ---------- Progress helpers (kept for compatibility) ----------

export function getProgress() {
  return readStorage(STORAGE_KEYS.progress, {
    quizzes: 0,
    streak: 0,
    accuracy: 0,
    weakTopics: [] as string[],
  });
}

export function saveProgress(value: unknown) {
  writeStorage(STORAGE_KEYS.progress, value);
}

export async function getProgressAsync() {
  return readStorageAsync(STORAGE_KEYS.progress, {
    quizzes: 0,
    streak: 0,
    accuracy: 0,
    weakTopics: [] as string[],
  });
}

export async function saveProgressAsync(value: unknown) {
  return writeStorageAsync(STORAGE_KEYS.progress, value);
}

// Exam timer (minutes) — kept as a small LS-only setting, no IDB needed.
export function getExamTimerMinutes(defaultMinutes = 10): number {
  const v = readStorage<number>(STORAGE_KEYS.examTimerMinutes, defaultMinutes);
  return typeof v === 'number' && v > 0 ? v : defaultMinutes;
}

export function saveExamTimerMinutes(minutes: number): void {
  writeStorage(STORAGE_KEYS.examTimerMinutes, minutes);
}