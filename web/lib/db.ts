// Tiny IndexedDB wrapper. Promise-based, no external dep.
//
// Stores we keep:
//   chats    keyed by id, indexed by updatedAt
//   decks    keyed by topic id
//   vocab    keyed by theme|level|difficulty|lang
//   grammar  keyed by topic|level|difficulty|lang
//   exams    keyed by exam id
//   progress single record (id="default")
//   meta     small kv (last exam timer minutes, etc.)
//
// Strategy:
//   1. In-memory Map is the fastest layer (already what React reads).
//   2. IDB is the durable, large-capacity store (chats, full decks).
//   3. localStorage is the synchronous fallback so first paint still works
//      before the IDB connection opens.

const DB_NAME = "quantara";
const DB_VERSION = 2;
const STORES = [
  "chats",
  "decks",
  "vocab",
  "grammar",
  "exams",
  "progress",
  "meta",
  "explanations",
] as const;

export type StoreName = (typeof STORES)[number];

type DBConn = {
  db: IDBDatabase;
  queues: Map<StoreName, Promise<unknown>>;
};

let connPromise: Promise<DBConn> | null = null;
const memoryCache = new Map<string, unknown>();

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: "id" });
          if (name === "chats") store.createIndex("updatedAt", "updatedAt");
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getConn(): Promise<DBConn> {
  if (!isBrowser()) throw new Error("IndexedDB unavailable");
  if (!connPromise) {
    connPromise = openDB().then((db) => ({ db, queues: new Map() }));
  }
  return connPromise;
}

function awaitTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function runWithStore<T>(
  conn: DBConn,
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => Promise<T>
): Promise<T> {
  const run = async () => {
    const tx = conn.db.transaction(store, mode);
    const s = tx.objectStore(store);
    const result = await fn(s);
    await awaitTx(tx);
    return result;
  };
  const prev = conn.queues.get(store) ?? Promise.resolve();
  const next = prev.then(run, run);
  conn.queues.set(
    store,
    next.catch(() => undefined) as Promise<unknown>
  );
  return next;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------- Public API ----------

export async function dbGet<T>(store: StoreName, id: string): Promise<T | null> {
  const memKey = `${store}:${id}`;
  if (memoryCache.has(memKey)) return memoryCache.get(memKey) as T;
  try {
    const conn = await getConn();
    const out = await runWithStore(conn, store, "readonly", (s) =>
      reqToPromise<T | undefined>(s.get(id))
    );
    if (out !== undefined && out !== null) memoryCache.set(memKey, out);
    return (out ?? null) as T | null;
  } catch {
    return null;
  }
}

export async function dbPut<T extends { id: string }>(
  store: StoreName,
  value: T
): Promise<void> {
  const memKey = `${store}:${value.id}`;
  memoryCache.set(memKey, value);
  try {
    const conn = await getConn();
    await runWithStore(conn, store, "readwrite", (s) =>
      reqToPromise<IDBValidKey>(s.put(value))
    );
  } catch {
    // best effort; memory cache already updated
  }
}

export async function dbList<T>(store: StoreName): Promise<T[]> {
  try {
    const conn = await getConn();
    return await runWithStore(conn, store, "readonly", (s) =>
      reqToPromise<T[]>(s.getAll() as IDBRequest<T[]>)
    );
  } catch {
    return [];
  }
}

export async function dbDelete(store: StoreName, id: string): Promise<void> {
  memoryCache.delete(`${store}:${id}`);
  try {
    const conn = await getConn();
    await runWithStore(conn, store, "readwrite", (s) =>
      reqToPromise<undefined>(s.delete(id) as IDBRequest<undefined>)
    );
  } catch {
    /* ignore */
  }
}

export async function dbClear(store: StoreName): Promise<void> {
  for (const key of Array.from(memoryCache.keys())) {
    if (key.startsWith(`${store}:`)) memoryCache.delete(key);
  }
  try {
    const conn = await getConn();
    await runWithStore(conn, store, "readwrite", (s) =>
      reqToPromise<undefined>(s.clear() as IDBRequest<undefined>)
    );
  } catch {
    /* ignore */
  }
}

// Make IDB records stay fresh across tabs / page loads.
export function invalidateMemory(store?: StoreName) {
  if (!store) {
    memoryCache.clear();
    return;
  }
  for (const key of Array.from(memoryCache.keys())) {
    if (key.startsWith(`${store}:`)) memoryCache.delete(key);
  }
}