const CACHE_DURATION_MS = 2 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 50;
const MAX_SIZE_CACHE_ENTRIES = 200;

const DB_NAME = "originchats";
const STORE_NAME = "imageCache";
const SIZE_STORE_NAME = "imageSizeCache";
const DB_VERSION = 3;

interface CachedImage {
  dataUri: string;
  timestamp: number;
}

interface CachedImageSize {
  width: number;
  height: number;
  timestamp: number;
}

const memoryCache = new Map<string, CachedImage>();
const sizeMemoryCache = new Map<string, CachedImageSize>();
const channelLoadingState = new Map<
  string,
  {
    pending: Set<string>;
    timeout: ReturnType<typeof setTimeout> | null;
    resolve: (() => void) | null;
  }
>();

let _db: IDBDatabase | null = null;
let _dbReady: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  if (_dbReady) return _dbReady;

  _dbReady = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(SIZE_STORE_NAME)) {
        db.createObjectStore(SIZE_STORE_NAME);
      }
    };

    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });

  return _dbReady;
}

async function getFromCache(url: string): Promise<CachedImage | undefined> {
  const memCached = memoryCache.get(url);
  if (memCached && Date.now() - memCached.timestamp < CACHE_DURATION_MS) {
    return memCached;
  }
  try {
    const db = await openDb();
    if (!db.objectStoreNames.contains(STORE_NAME)) return undefined;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(url);
      req.onsuccess = () => {
        const result = req.result as CachedImage | undefined;
        if (result) memoryCache.set(url, result);
        resolve(result);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function saveToCache(url: string, dataUri: string): Promise<void> {
  if (memoryCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) {
      memoryCache.delete(oldestKey);
    }
  }
  const entry: CachedImage = { dataUri, timestamp: Date.now() };
  memoryCache.set(url, entry);
  try {
    const db = await openDb();
    if (!db.objectStoreNames.contains(STORE_NAME)) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(entry, url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

async function deleteExpiredCache(): Promise<void> {
  try {
    const db = await openDb();

    // Clean imageCache
    if (db.objectStoreNames.contains(STORE_NAME)) {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const now = Date.now();
      const keysReq = store.getAllKeys();
      const valsReq = store.getAll();

      let keys: IDBValidKey[] = [];
      let vals: CachedImage[] = [];

      keysReq.onsuccess = () => {
        keys = keysReq.result;
      };
      valsReq.onsuccess = () => {
        vals = valsReq.result;
      };

      tx.oncomplete = () => {
        keys.forEach((key, i) => {
          const entry = vals[i];
          if (entry && now - entry.timestamp > CACHE_DURATION_MS) {
            const deleteTx = db.transaction(STORE_NAME, "readwrite");
            deleteTx.objectStore(STORE_NAME).delete(key);
          }
        });
      };
    }

    // Clean imageSizeCache
    if (db.objectStoreNames.contains(SIZE_STORE_NAME)) {
      const tx = db.transaction(SIZE_STORE_NAME, "readwrite");
      const store = tx.objectStore(SIZE_STORE_NAME);
      const now = Date.now();
      const keysReq = store.getAllKeys();
      const valsReq = store.getAll();

      let keys: IDBValidKey[] = [];
      let vals: CachedImageSize[] = [];

      keysReq.onsuccess = () => {
        keys = keysReq.result;
      };
      valsReq.onsuccess = () => {
        vals = valsReq.result;
      };

      tx.oncomplete = () => {
        keys.forEach((key, i) => {
          const entry = vals[i];
          if (entry && now - entry.timestamp > CACHE_DURATION_MS) {
            const deleteTx = db.transaction(SIZE_STORE_NAME, "readwrite");
            deleteTx.objectStore(SIZE_STORE_NAME).delete(key);
          }
        });
      };
    }
  } catch {}
}

async function fetchAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const pendingFetches = new Map<string, Promise<string | null>>();

export function getCachedImageSync(url: string): string | null {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
  const cached = memoryCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
    return cached.dataUri;
  }
  return null;
}

export async function getCachedImage(url: string): Promise<string | null> {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }

  const cached = await getFromCache(url);
  if (cached) {
    const age = Date.now() - cached.timestamp;
    if (age < CACHE_DURATION_MS) {
      return cached.dataUri;
    }
  }

  let pending = pendingFetches.get(url);
  if (!pending) {
    pending = fetchAsDataUri(url)
      .then((dataUri) => {
        pendingFetches.delete(url);
        if (dataUri) {
          saveToCache(url, dataUri);
        }
        return dataUri;
      })
      .catch((err) => {
        pendingFetches.delete(url);
        throw err;
      });
    pendingFetches.set(url, pending);
  }

  return pending;
}

function createCachedImageUrl(url: string): string {
  const blobUrl = URL.createObjectURL(new Blob());
  URL.revokeObjectURL(blobUrl);
  return blobUrl;
}

export function startChannelLoad(
  channelId: string,
  imageUrls: string[],
): Promise<void> {
  const state = channelLoadingState.get(channelId);
  if (state) {
    if (state.timeout) clearTimeout(state.timeout);
  }

  const urlsToLoad = imageUrls.filter((url) => !getCachedImageSync(url));

  if (urlsToLoad.length === 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const pending = new Set(urlsToLoad);
    const loadingState = {
      pending,
      timeout: null as ReturnType<typeof setTimeout> | null,
      resolve: null as (() => void) | null,
    };

    loadingState.resolve = () => {
      if (loadingState.timeout) {
        clearTimeout(loadingState.timeout);
        loadingState.timeout = null;
      }
      channelLoadingState.delete(channelId);
      resolve();
    };

    loadingState.timeout = setTimeout(() => {
      loadingState.resolve?.();
    }, 5000);

    channelLoadingState.set(channelId, loadingState);

    urlsToLoad.forEach((url) => {
      getCachedImage(url).then(() => {
        pending.delete(url);
        if (pending.size === 0) {
          loadingState.resolve?.();
        }
      });
    });
  });
}

export function isChannelLoading(channelId: string): boolean {
  return channelLoadingState.has(channelId);
}

let cleanupScheduled = false;

export function scheduleCleanup(): void {
  if (cleanupScheduled) return;
  cleanupScheduled = true;

  setTimeout(() => {
    deleteExpiredCache().finally(() => {
      cleanupScheduled = false;
    });
  }, 5000);
}

export function getCachedImageSize(
  url: string,
): { width: number; height: number } | null {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return null;
  const cached = sizeMemoryCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
    return { width: cached.width, height: cached.height };
  }
  return null;
}

async function getCachedImageSizeAsync(
  url: string,
): Promise<{ width: number; height: number } | null> {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return null;
  const memCached = sizeMemoryCache.get(url);
  if (memCached && Date.now() - memCached.timestamp < CACHE_DURATION_MS) {
    return { width: memCached.width, height: memCached.height };
  }
  try {
    const db = await openDb();
    if (!db.objectStoreNames.contains(SIZE_STORE_NAME)) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(SIZE_STORE_NAME, "readonly");
      const req = tx.objectStore(SIZE_STORE_NAME).get(url);
      req.onsuccess = () => {
        const result = req.result as CachedImageSize | undefined;
        if (result && Date.now() - result.timestamp < CACHE_DURATION_MS) {
          if (sizeMemoryCache.size >= MAX_SIZE_CACHE_ENTRIES) {
            const oldestKey = sizeMemoryCache.keys().next().value;
            if (oldestKey) sizeMemoryCache.delete(oldestKey);
          }
          sizeMemoryCache.set(url, result);
          resolve({ width: result.width, height: result.height });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveImageSize(
  url: string,
  width: number,
  height: number,
): Promise<void> {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return;
  if (sizeMemoryCache.size >= MAX_SIZE_CACHE_ENTRIES) {
    const oldestKey = sizeMemoryCache.keys().next().value;
    if (oldestKey) sizeMemoryCache.delete(oldestKey);
  }
  const entry: CachedImageSize = { width, height, timestamp: Date.now() };
  sizeMemoryCache.set(url, entry);
  try {
    const db = await openDb();
    if (!db.objectStoreNames.contains(SIZE_STORE_NAME)) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SIZE_STORE_NAME, "readwrite");
      tx.objectStore(SIZE_STORE_NAME).put(entry, url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

deleteExpiredCache();
