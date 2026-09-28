import { useSyncExternalStore } from "react";
import type { Profile } from "@/lib/types";
import { prepareChatImage } from "./chat-media";
import { cachedWallpaperUrl } from "./wallpaper-media";

const STORAGE_KEY = "kdeji-wallpaper-v1";
const MAX_UPLOAD_EDGE = 2_160;

export interface WallpaperSnapshot {
  path: string;
  url: string;
  preset: string;
  blur: number;
  opacity: number;
}

const fallbackSnapshot: WallpaperSnapshot = {
  path: "",
  url: "",
  preset: "linen",
  blur: 0,
  opacity: 0.18,
};

function clampSnapshot(value: Partial<WallpaperSnapshot>): WallpaperSnapshot {
  return {
    path: value.path?.trim() || "",
    url: value.url?.trim() || "",
    preset: value.preset || "linen",
    blur: Math.min(24, Math.max(0, Number(value.blur ?? 0))),
    opacity: Math.min(0.75, Math.max(0, Number(value.opacity ?? 0.18))),
  };
}

function readStoredSnapshot(): WallpaperSnapshot {
  if (typeof window === "undefined") return fallbackSnapshot;
  try {
    const stored = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "null",
    ) as Partial<WallpaperSnapshot>;
    // Signed URLs are intentionally memory-only because they expire.
    return clampSnapshot({ ...stored, url: "" });
  } catch {
    return fallbackSnapshot;
  }
}

let snapshot = readStoredSnapshot();
let optimistic = false;
const listeners = new Set<() => void>();
const decodedImages = new Map<string, Promise<string>>();

function emit() {
  listeners.forEach((listener) => listener());
}

function writeStoredSnapshot(value: WallpaperSnapshot) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        path: value.path,
        preset: value.preset,
        blur: value.blur,
        opacity: value.opacity,
      }),
    );
  } catch {
    /* Browser storage may be unavailable; database persistence still works. */
  }
}

export function getWallpaperSnapshot() {
  return snapshot;
}

export function useWallpaperSnapshot() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getWallpaperSnapshot,
    () => fallbackSnapshot,
  );
}

export function syncWallpaperFromProfile(profile: Profile | null) {
  if (!profile || optimistic) return;
  const path = profile.wallpaper_url || "";
  const next = clampSnapshot({
    path,
    url: snapshot.path === path ? snapshot.url : "",
    preset: profile.wallpaper_preset,
    blur: profile.wallpaper_blur,
    opacity: profile.wallpaper_opacity,
  });
  if (
    next.path === snapshot.path &&
    next.url === snapshot.url &&
    next.preset === snapshot.preset &&
    next.blur === snapshot.blur &&
    next.opacity === snapshot.opacity
  )
    return;
  snapshot = next;
  writeStoredSnapshot(next);
  emit();
}

export function applyWallpaperOptimistically(value: WallpaperSnapshot) {
  optimistic = true;
  snapshot = clampSnapshot(value);
  writeStoredSnapshot(snapshot);
  emit();
}

export function commitWallpaper(value: WallpaperSnapshot) {
  optimistic = false;
  snapshot = clampSnapshot(value);
  writeStoredSnapshot(snapshot);
  emit();
}

export function rollbackWallpaper(value: WallpaperSnapshot) {
  optimistic = false;
  snapshot = clampSnapshot(value);
  writeStoredSnapshot(snapshot);
  emit();
}

export function cacheWallpaperUrl(path: string, url: string) {
  if (!path || !url) return;
  if (snapshot.path === path && snapshot.url !== url) {
    snapshot = { ...snapshot, url };
    emit();
  }
  void preloadWallpaperUrl(url);
}

export function preloadWallpaperUrl(url: string): Promise<string> {
  if (!url || typeof window === "undefined") return Promise.resolve(url);
  if (url.startsWith("blob:")) return Promise.resolve(url);
  const cached = decodedImages.get(url);
  if (cached) return cached;
  const promise = new Promise<string>((resolve) => {
    const image = new Image();
    const finish = (value: string) => {
      clearTimeout(timer);
      image.onload = image.onerror = null;
      if (!value) {
        decodedImages.delete(url);
        image.src = "";
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(""), 12_000);
    image.decoding = "async";
    image.onload = () => {
      const decode = typeof image.decode === "function" ? image.decode() : Promise.resolve();
      void decode.catch(() => undefined).finally(() => finish(url));
    };
    image.onerror = () => {
      finish("");
    };
    image.src = url;
  });
  if (decodedImages.size >= 12) decodedImages.delete(decodedImages.keys().next().value!);
  decodedImages.set(url, promise);
  return promise;
}

export async function resolveWallpaperUrl(path: string): Promise<string> {
  if (!path) return "";
  const url = await cachedWallpaperUrl(path);
  if (!url) return "";
  const decoded = await preloadWallpaperUrl(url);
  if (decoded) cacheWallpaperUrl(path, decoded);
  return decoded;
}

export async function optimizeWallpaperUpload(file: File): Promise<File> {
  const image = await prepareChatImage(file, MAX_UPLOAD_EDGE, 5 * 1024 * 1024);
  URL.revokeObjectURL(image.previewUrl);
  const baseName = file.name.replace(/\.[^.]+$/, "") || "wallpaper";
  return new File([image.blob], `${baseName}.${image.extension}`, { type: image.blob.type });
}
