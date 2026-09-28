// Best-effort, account/path-scoped image bytes. No tokens, Base64 or database changes.
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_AGE = 7 * 24 * 60 * 60_000;
type CachedImage = { key: string; blob: Blob; touched: number };
let database: Promise<IDBDatabase | null> | undefined;
let writes = Promise.resolve();

function openCache() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  database ??= new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open("kdeji-media-v1", 1);
      const timer = setTimeout(() => resolve(null), 1500);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("images", { keyPath: "key" });
        request.result.createObjectStore("metadata", { keyPath: "key" });
      };
      request.onsuccess = () => {
        clearTimeout(timer);
        resolve(request.result);
      };
      request.onerror = request.onblocked = () => {
        clearTimeout(timer);
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
  return database;
}

export async function readMediaBlob(bucket: string, path: string): Promise<Blob | null> {
  try {
    const db = await openCache();
    if (!db) return null;
    return await new Promise<Blob | null>((resolve) => {
      const request = db.transaction("images").objectStore("images").get(`${bucket}:${path}`);
      const timer = setTimeout(() => resolve(null), 500);
      request.onsuccess = () => {
        clearTimeout(timer);
        const record = request.result as CachedImage | undefined;
        resolve(record && record.touched > Date.now() - MAX_AGE ? record.blob : null);
      };
      request.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

export function cacheMediaBlob(bucket: string, path: string, blob: Blob) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(blob.type) || blob.size > 8 * 1024 * 1024)
    return Promise.resolve();
  writes = writes
    .then(async () => {
      const db = await openCache();
      if (!db) return;
      await new Promise<void>((resolve) => {
        const transaction = db.transaction(["images", "metadata"], "readwrite");
        const store = transaction.objectStore("images");
        const metadata = transaction.objectStore("metadata");
        const records = metadata.getAll();
        records.onsuccess = () => {
          const key = `${bucket}:${path}`;
          const rows = (records.result as { key: string; size: number; touched: number }[])
            .filter((row) => row.key !== key)
            .sort((a, b) => b.touched - a.touched);
          let bytes = blob.size;
          for (const row of rows) {
            bytes += row.size;
            if (bytes > MAX_BYTES || row.touched < Date.now() - MAX_AGE) {
              store.delete(row.key);
              metadata.delete(row.key);
            }
          }
          store.put({ key, blob, touched: Date.now() } satisfies CachedImage);
          metadata.put({ key, size: blob.size, touched: Date.now() });
        };
        transaction.oncomplete = transaction.onerror = transaction.onabort = () => resolve();
      });
    })
    .catch(() => undefined);
  return writes;
}
