import { useEffect, useSyncExternalStore } from "react";
import { cachedWallpaperUrl, retainWallpaperUrl } from "./wallpaper-media";
import { assertSafeRemoteUrl } from "./stickers/resolve-resource";

export interface ChatWallpaper {
  wallpaperPath: string | null;
  wallpaperUrl: string | null;
  updatedAt?: string | undefined;
}
export interface ChatWallpaperSnapshot extends ChatWallpaper {
  displayUrl: string;
  busy: boolean;
  error: string;
  revision: number;
}
const empty: ChatWallpaperSnapshot = {
  wallpaperPath: null,
  wallpaperUrl: null,
  displayUrl: "",
  busy: false,
  error: "",
  revision: 0,
};
const states = new Map<string, ChatWallpaperSnapshot>();
const stable = new Map<string, ChatWallpaperSnapshot>();
const listeners = new Map<string, Set<() => void>>();
const keyFor = (userId: string, charId: string) => `kdeji-chat-wallpaper-v2:${userId}:${charId}`;

/** Read wallpaper independently of theme/other preference validation, including legacy records. */
export function readCharacterWallpaper(
  character:
    | {
        chat_wallpaper?: unknown;
        chat_preferences?: unknown;
      }
    | null
    | undefined,
): ChatWallpaper {
  const dedicated = character?.chat_wallpaper;
  const source =
    dedicated && typeof dedicated === "object" && !Array.isArray(dedicated)
      ? dedicated
      : character?.chat_preferences;
  const raw = source && typeof source === "object" ? (source as Record<string, unknown>) : {};
  return {
    wallpaperPath:
      typeof raw["wallpaperPath"] === "string" && raw["wallpaperPath"]
        ? raw["wallpaperPath"]
        : null,
    wallpaperUrl:
      typeof raw["wallpaperUrl"] === "string" && raw["wallpaperUrl"] ? raw["wallpaperUrl"] : null,
    updatedAt: typeof raw["updatedAt"] === "string" ? raw["updatedAt"] : undefined,
  };
}

export function getCharacterWallpaperSnapshot(userId: string, charId: string) {
  const key = keyFor(userId, charId);
  let state = states.get(key);
  if (!state) {
    let stored: ChatWallpaper = { wallpaperPath: null, wallpaperUrl: null };
    try {
      if (typeof localStorage !== "undefined")
        stored = readCharacterWallpaper({
          chat_wallpaper: JSON.parse(localStorage.getItem(key) || "null"),
        });
    } catch {
      /* Database remains authoritative if browser storage is unavailable. */
    }
    state = { ...empty, ...stored };
    states.set(key, state);
  }
  return state;
}
function publish(userId: string, charId: string, state: ChatWallpaperSnapshot, persist = false) {
  const key = keyFor(userId, charId);
  states.set(key, state);
  if (persist) {
    try {
      // Only durable metadata: never store Base64, signed URLs or temporary Blob URLs here.
      if (!/^(data:|blob:)/i.test(state.wallpaperPath || state.wallpaperUrl || ""))
        localStorage.setItem(
          key,
          JSON.stringify({
            wallpaperPath: state.wallpaperPath,
            wallpaperUrl: state.wallpaperUrl,
            updatedAt: state.updatedAt,
          }),
        );
    } catch {
      /* Safari private mode/quota must not break remote persistence. */
    }
  }
  if (!state.busy) stable.set(key, state);
  listeners.get(key)?.forEach((listener) => listener());
}
export function syncCharacterWallpaper(userId: string, charId: string, wallpaper: ChatWallpaper) {
  const current = getCharacterWallpaperSnapshot(userId, charId);
  if (current.busy) return;
  // Ignore stale role/editor fetches arriving after an auto-save completed.
  if (
    current.updatedAt &&
    (!wallpaper.updatedAt || Date.parse(wallpaper.updatedAt) < Date.parse(current.updatedAt))
  )
    return;
  if (
    current.wallpaperPath === wallpaper.wallpaperPath &&
    current.wallpaperUrl === wallpaper.wallpaperUrl &&
    current.updatedAt === wallpaper.updatedAt
  )
    return;
  publish(
    userId,
    charId,
    {
      ...current,
      ...wallpaper,
      displayUrl:
        current.wallpaperPath === wallpaper.wallpaperPath &&
        current.wallpaperUrl === wallpaper.wallpaperUrl
          ? current.displayUrl
          : "",
      error: "",
      revision: current.revision + 1,
    },
    true,
  );
}
export function beginCharacterWallpaper(userId: string, charId: string, previewUrl: string) {
  const previous = getCharacterWallpaperSnapshot(userId, charId);
  const revision = previous.revision + 1;
  publish(userId, charId, { ...previous, displayUrl: previewUrl, busy: true, error: "", revision });
  return {
    revision,
    previous: previous.busy ? (stable.get(keyFor(userId, charId)) ?? empty) : previous,
  };
}
export function isCurrentWallpaperOperation(userId: string, charId: string, revision: number) {
  return getCharacterWallpaperSnapshot(userId, charId).revision === revision;
}
export function commitCharacterWallpaper(
  userId: string,
  charId: string,
  revision: number,
  wallpaper: ChatWallpaper,
  displayUrl: string,
) {
  if (!isCurrentWallpaperOperation(userId, charId, revision)) return false;
  publish(userId, charId, { ...wallpaper, displayUrl, busy: false, error: "", revision }, true);
  return true;
}
export function failCharacterWallpaper(
  userId: string,
  charId: string,
  operation: ReturnType<typeof beginCharacterWallpaper>,
  error: string,
) {
  if (isCurrentWallpaperOperation(userId, charId, operation.revision))
    publish(userId, charId, {
      ...operation.previous,
      busy: false,
      error,
      revision: operation.revision,
    });
}
export function setCharacterWallpaperDisplay(
  userId: string,
  charId: string,
  revision: number,
  url: string,
) {
  const current = getCharacterWallpaperSnapshot(userId, charId);
  if (current.busy || current.revision !== revision || current.displayUrl === url) return;
  // An empty signed-URL result is a read failure, not a request to clear saved wallpaper.
  if (!url && (current.wallpaperPath || current.wallpaperUrl)) return;
  publish(userId, charId, { ...current, displayUrl: url });
}
export function useCharacterWallpaper(
  userId: string,
  charId: string,
  character?: { id: string; chat_wallpaper?: unknown; chat_preferences?: unknown } | null,
) {
  const state = useSyncExternalStore(
    (listener) => {
      const key = keyFor(userId, charId);
      let group = listeners.get(key);
      if (!group) listeners.set(key, (group = new Set()));
      group.add(listener);
      return () => {
        group.delete(listener);
        if (!group.size) listeners.delete(key);
      };
    },
    () => getCharacterWallpaperSnapshot(userId, charId),
    () => empty,
  );
  useEffect(() => {
    if (character?.id === charId)
      syncCharacterWallpaper(userId, charId, readCharacterWallpaper(character));
  }, [userId, charId, character]);
  useEffect(() => {
    let active = true;
    let resolving = false;
    function restore() {
      if (!active || state.busy || resolving) return;
      resolving = true;
      const resolve = state.wallpaperPath
        ? cachedWallpaperUrl(state.wallpaperPath, true).then((url) =>
            // Retry one transient signing failure without delaying or changing persistence.
            !url && active && isCurrentWallpaperOperation(userId, charId, state.revision)
              ? cachedWallpaperUrl(state.wallpaperPath!, true)
              : url,
          )
        : Promise.resolve().then(() =>
            state.wallpaperUrl ? assertSafeRemoteUrl(state.wallpaperUrl).toString() : "",
          );
      void resolve
        .then((url) => {
          if (active) setCharacterWallpaperDisplay(userId, charId, state.revision, url);
        })
        .catch(() => {
          /* Keep the last valid display if signing/loading fails. */
        })
        .finally(() => {
          resolving = false;
        });
    }
    const resume = () => {
      if (document.visibilityState === "visible") restore();
    };
    restore();
    // Resume from offline/background/PWA without requiring another page refresh.
    if (typeof window !== "undefined") {
      window.addEventListener("online", restore);
      window.addEventListener("pageshow", restore);
    }
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", resume);
    return () => {
      active = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("online", restore);
        window.removeEventListener("pageshow", restore);
      }
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", resume);
    };
  }, [userId, charId, state.wallpaperPath, state.wallpaperUrl, state.busy, state.revision]);
  useEffect(() => retainWallpaperUrl(state.displayUrl), [state.displayUrl]);
  return state;
}
