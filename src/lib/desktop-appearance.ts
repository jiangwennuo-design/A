import { useSyncExternalStore } from "react";
import {
  defaultAppearanceModule,
  readAppearanceModule,
  type AppearanceModule,
  type DesktopAppearanceConfig,
} from "./appearance";

const PREFIX = "kdeji.desktopAppearance.v1";
const listeners = new Map<string, Set<() => void>>();
const cache = new Map<string, AppearanceModule<DesktopAppearanceConfig>>();
// React requires the SSR/hydration snapshot to retain the same identity.
const serverSnapshot = defaultAppearanceModule("desktop");

function key(userId: string) {
  return `${PREFIX}:${userId || "guest"}`;
}

export function readDesktopAppearance(userId: string) {
  const storageKey = key(userId);
  const remembered = cache.get(storageKey);
  if (remembered) return remembered;
  if (typeof window === "undefined") return serverSnapshot;
  try {
    const value = readAppearanceModule(
      "desktop",
      JSON.parse(localStorage.getItem(storageKey) || "{}"),
    );
    cache.set(storageKey, value);
    return value;
  } catch {
    const value = defaultAppearanceModule("desktop");
    cache.set(storageKey, value);
    return value;
  }
}

export function saveDesktopAppearance(
  userId: string,
  value: AppearanceModule<DesktopAppearanceConfig>,
) {
  const storageKey = key(userId);
  const normalized = readAppearanceModule("desktop", value);
  cache.set(storageKey, normalized);
  if (typeof window !== "undefined") localStorage.setItem(storageKey, JSON.stringify(normalized));
  listeners.get(storageKey)?.forEach((listener) => listener());
}

export function useDesktopAppearance(userId: string) {
  const storageKey = key(userId);
  return useSyncExternalStore(
    (listener) => {
      const group = listeners.get(storageKey) ?? new Set();
      group.add(listener);
      listeners.set(storageKey, group);
      const onStorage = (event: StorageEvent) => {
        if (event.key !== storageKey) return;
        cache.delete(storageKey);
        listener();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        group.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    () => readDesktopAppearance(userId),
    () => serverSnapshot,
  );
}
