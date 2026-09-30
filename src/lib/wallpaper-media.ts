import { cacheMediaBlob, readMediaBlob } from "./media-cache";
import { resolveSignedMediaUrl } from "./signed-media";

// Only the few wallpaper previews stay in memory; persisted bytes live in IndexedDB.
const previews = new Map<string, string>();
const retained = new Map<string, number>();
const loading = new Map<string, Promise<string>>();
function prune() {
  for (const [path, url] of previews) {
    if (previews.size <= 8) break;
    if (retained.has(url)) continue;
    previews.delete(path);
    URL.revokeObjectURL(url);
  }
}
export function retainWallpaperUrl(url: string) {
  if (!url.startsWith("blob:") || ![...previews.values()].includes(url)) return () => {};
  retained.set(url, (retained.get(url) || 0) + 1);
  return () => {
    const count = (retained.get(url) || 1) - 1;
    if (count) retained.set(url, count);
    else retained.delete(url);
    prune();
  };
}
export function rememberWallpaper(path: string, blob: Blob) {
  const existing = previews.get(path);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  previews.set(path, url);
  void cacheMediaBlob("wallpapers", path, blob);
  // Allow React to retain the new preview before evicting idle URLs.
  setTimeout(prune, 1000);
  return url;
}

export async function cachedWallpaperUrl(path: string, cacheRemote = false): Promise<string> {
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  const ready = previews.get(path);
  if (ready) return ready;
  const key = `${path}:${cacheRemote}`;
  const pending = loading.get(key);
  if (pending) return pending;
  const request = (async () => {
    const blob = await readMediaBlob("wallpapers", path);
    if (blob) return rememberWallpaper(path, blob);
    const url = await resolveSignedMediaUrl("wallpapers", path);
    if (!url || !cacheRemote) return url;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok || Number(response.headers.get("content-length")) > 8 * 1024 * 1024)
        return url;
      const downloaded = await response.blob();
      if (
        !/^image\/(jpeg|png|webp|gif)$/.test(downloaded.type) ||
        downloaded.size > 8 * 1024 * 1024
      )
        return url;
      return rememberWallpaper(path, downloaded);
    } catch {
      return url;
    } finally {
      clearTimeout(timer);
    }
  })();
  loading.set(key, request);
  try {
    return await request;
  } finally {
    if (loading.get(key) === request) loading.delete(key);
  }
}
