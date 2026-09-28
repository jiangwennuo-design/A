import { supabase } from "@/integrations/supabase/client";

type Pending = { path: string; finish: (url: string) => void };
const signedMedia = new Map<string, { expires: number; promise: Promise<string> }>();
const batches = new Map<string, { bucket: string; expiresIn: number; rows: Pending[] }>();
let scheduled = false;

function flush() {
  scheduled = false;
  const work = [...batches.values()];
  batches.clear();
  for (const { bucket, expiresIn, rows } of work) {
    void (async () => {
      for (let offset = 0; offset < rows.length; offset += 100) {
        const part = rows.slice(offset, offset + 100);
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const result = await Promise.race([
            supabase.storage.from(bucket).createSignedUrls(
              part.map((row) => row.path),
              expiresIn,
            ),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("图片地址获取超时。")), 15_000);
            }),
          ]);
          const urls = new Map((result.data ?? []).map((row) => [row.path, row.signedUrl]));
          part.forEach((row) => row.finish(urls.get(row.path) || ""));
        } catch {
          part.forEach((row) => row.finish(""));
        } finally {
          clearTimeout(timer);
        }
      }
    })();
  }
}

/** Batch simultaneous lookups; LRU hits survive an ordered library scan. */
export function resolveSignedMediaUrl(bucket: string, path: string, expiresIn = 3_600) {
  if (!path) return Promise.resolve("");
  const key = `${bucket}:${path}:${expiresIn}`;
  const cached = signedMedia.get(key);
  if (cached && cached.expires > Date.now()) {
    signedMedia.delete(key);
    signedMedia.set(key, cached);
    return cached.promise;
  }
  const promise = new Promise<string>((resolve) => {
    const batchKey = `${bucket}:${expiresIn}`;
    let batch = batches.get(batchKey);
    if (!batch) {
      batch = { bucket, expiresIn, rows: [] };
      batches.set(batchKey, batch);
    }
    batch.rows.push({
      path,
      finish: (url) => {
        if (!url) signedMedia.delete(key);
        resolve(url);
      },
    });
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  });
  if (signedMedia.size >= 4096) signedMedia.delete(signedMedia.keys().next().value!);
  signedMedia.set(key, {
    expires: Date.now() + Math.max(1, expiresIn - Math.min(900, expiresIn / 4)) * 1_000,
    promise,
  });
  return promise;
}
