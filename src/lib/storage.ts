// Small persistence helpers. Storage can be unavailable (private windows, blocked site data), so
// every access is guarded and falls back to defaults.

export const pref = {
  get(k: string, d = ""): string {
    try {
      return localStorage.getItem("etna." + k) ?? d;
    } catch {
      return d;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem("etna." + k, v);
    } catch {
      /* ignore */
    }
  },
};

export function readJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

// IndexedDB key-value store, used to remember the last folder handle for "Reopen".
function openDb() {
  return new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open("etna", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export const idb = {
  async get<T>(k: string): Promise<T | null> {
    try {
      const db = await openDb();
      return await new Promise<T | null>((res) => {
        const r = db.transaction("kv").objectStore("kv").get(k);
        r.onsuccess = () => res((r.result as T) ?? null);
        r.onerror = () => res(null);
      });
    } catch {
      return null;
    }
  },
  async set(k: string, v: unknown) {
    try {
      const db = await openDb();
      db.transaction("kv", "readwrite").objectStore("kv").put(v, k);
    } catch {
      /* storage unavailable */
    }
  },
};
