/**
 * db.ts — central IndexedDB wrapper for originChats
 *
 * Stores
 * ──────
 * "settings"    key-value  All user preferences (theme, font, ping sound, etc.)
 * "session"     key-value  Transient session state (token, last server URL, last channel per server)
 * "readTimes"   key-value  Per-server read timestamps  key = serverUrl, value = Record<channel, number>
 * "favGifs"     key-value  Favourite GIF URLs          key = "favGifs", value = string[]
 * "mediaServers" key-value Custom media server configs key = "mediaServers", value = MediaServer[]
 *
 * All reads return `undefined` when the key is absent so callers can supply
 * their own defaults.
 */

const DB_NAME = "originchats";
const DB_VERSION = 4;

const STORES = [
  "settings",
  "session",
  "readTimes",
  "favGifs",
  "mediaServers",
  "folders",
  "pings",
] as const;

type StoreName = (typeof STORES)[number];

// ── Open ──────────────────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

const _ready: Promise<IDBDatabase> = new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION);

  req.onupgradeneeded = (e) => {
    const db = (e.target as IDBOpenDBRequest).result;
    for (const name of STORES) {
      if (!db.objectStoreNames.contains(name)) {
        db.createObjectStore(name);
      }
    }
  };

  req.onsuccess = (e) => {
    _db = (e.target as IDBOpenDBRequest).result;
    resolve(_db);
  };

  req.onerror = () => reject(req.error);
});

async function db(): Promise<IDBDatabase> {
  if (_db) return _db;
  return _ready;
}

// ── Primitives ────────────────────────────────────────────────────────────────

async function dbGet<T = unknown>(
  store: StoreName,
  key: string,
): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function dbSet(
  store: StoreName,
  key: string,
  value: unknown,
): Promise<void> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDel(store: StoreName, key: string): Promise<void> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Read all key-value pairs in a store as a plain object. */
async function dbGetAll<T = unknown>(
  store: StoreName,
): Promise<Record<string, T>> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, "readonly");
    const os = tx.objectStore(store);
    const result: Record<string, T> = {};
    const keysReq = os.getAllKeys();
    const valsReq = os.getAll();
    let keys: IDBValidKey[] = [];
    let vals: T[] = [];
    keysReq.onsuccess = () => {
      keys = keysReq.result;
    };
    valsReq.onsuccess = () => {
      vals = valsReq.result as T[];
    };
    tx.oncomplete = () => {
      keys.forEach((k, i) => {
        result[String(k)] = vals[i];
      });
      resolve(result);
    };
    tx.onerror = () => reject(tx.error);
  });
}

// ── Typed helpers ─────────────────────────────────────────────────────────────

/** Settings store — user preferences. */
export const settings = {
  get: <T>(key: string, fallback: T): Promise<T> =>
    dbGet<T>("settings", key).then((v) => (v === undefined ? fallback : v)),
  set: (key: string, value: unknown) => dbSet("settings", key, value),
  del: (key: string) => dbDel("settings", key),
  getAll: () => dbGetAll("settings"),
};

/** Session store — token, last server URL, last channel per server. */
export const session = {
  get: <T>(key: string, fallback: T): Promise<T> =>
    dbGet<T>("session", key).then((v) => (v === undefined ? fallback : v)),
  set: (key: string, value: unknown) => dbSet("session", key, value),
  del: (key: string) => dbDel("session", key),
};

/** Read-times store — keyed by server URL. */
export const readTimes = {
  get: (serverUrl: string): Promise<Record<string, number>> =>
    dbGet<Record<string, number>>("readTimes", serverUrl).then((v) => v ?? {}),
  set: (serverUrl: string, value: Record<string, number>) =>
    dbSet("readTimes", serverUrl, value),
  getAll: (): Promise<Record<string, Record<string, number>>> =>
    dbGetAll<Record<string, number>>("readTimes"),
};

/** Favourite GIFs. */
export const favGifs = {
  get: (): Promise<any[]> =>
    dbGet<any[]>("favGifs", "favGifs").then((v) => v ?? []),
  set: (items: any[]) => dbSet("favGifs", "favGifs", items),
};

/** Custom media server configs. */
export const mediaServersDb = {
  get: <T>(): Promise<T | undefined> =>
    dbGet<T>("mediaServers", "mediaServers"),
  set: (value: unknown) => dbSet("mediaServers", "mediaServers", value),
};

/** Server folders. */
const foldersDb = {
  get: <T>(): Promise<T | undefined> => dbGet<T>("folders", "folders"),
  set: (value: unknown) => dbSet("folders", "folders", value),
};

/** Pings and unreads persistence. */
export const pings = {
  get: (): Promise<
    | { pings: Record<string, number>; unreads: Record<string, number> }
    | undefined
  > => dbGet("pings", "pings"),
  set: (value: {
    pings: Record<string, number>;
    unreads: Record<string, number>;
  }) => dbSet("pings", "pings", value),
};
