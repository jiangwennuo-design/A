import { useSyncExternalStore } from "react";
import {
  readAppearanceModule,
  type AppearancePreset,
  type ChatBubbleConfig,
  type ChatChromeConfig,
  type FullChatConfig,
} from "./appearance";

type ThemeType = "chatBubble" | "chatChrome" | "chatFull";
type Config = ChatBubbleConfig | ChatChromeConfig | FullChatConfig;
interface Library {
  presets: AppearancePreset<Config>[];
  migratedCharacterIds: string[];
  updatedAt?: string;
}
const empty: Library = { presets: [], migratedCharacterIds: [] };
const cache = new Map<string, Library>();
const listeners = new Map<string, Set<() => void>>();
const key = (userId: string, type: ThemeType) => `kdeji.chatAppearancePresets.v1:${userId}:${type}`;

function validatedPresets(type: ThemeType, raw: unknown): AppearancePreset<Config>[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("预设数据格式不兼容，已保留原始数据。");
  const module =
    type === "chatBubble"
      ? readAppearanceModule(type, { presets: raw })
      : type === "chatChrome"
        ? readAppearanceModule(type, { presets: raw })
        : readAppearanceModule("chatFull", { presets: raw });
  if (module.presets.length !== raw.length)
    throw new Error("存在不兼容的旧预设，已停止迁移并保留原始数据。");
  return module.presets;
}

function assertStoredLibrary(userId: string, type: ThemeType) {
  const raw = localStorage.getItem(key(userId, type));
  if (raw) validatedPresets(type, JSON.parse(raw)?.presets);
}

export function readChatAppearanceLibrary(userId: string, type: ThemeType): Library {
  const storageKey = key(userId, type);
  if (typeof window === "undefined") return empty;
  if (cache.has(storageKey)) return cache.get(storageKey)!;
  let value = empty;
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
    value = {
      presets: validatedPresets(type, stored?.presets),
      updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : "",
      migratedCharacterIds: Array.isArray(stored.migratedCharacterIds)
        ? stored.migratedCharacterIds.filter((id: unknown) => typeof id === "string")
        : [],
    };
  } catch {
    /* Keep malformed legacy storage untouched. */
  }
  cache.set(storageKey, value);
  return value;
}

function write(userId: string, type: ThemeType, value: Library) {
  // Write before notifying: failed persistence must not be reported as success.
  localStorage.setItem(key(userId, type), JSON.stringify(value));
  cache.set(key(userId, type), value);
  listeners.get(key(userId, type))?.forEach((listener) => listener());
}

export function saveChatAppearanceLibrary(
  userId: string,
  type: ThemeType,
  presets: AppearancePreset<Config>[],
) {
  assertStoredLibrary(userId, type);
  write(userId, type, {
    ...readChatAppearanceLibrary(userId, type),
    presets: structuredClone(presets),
    updatedAt: new Date().toISOString(),
  });
}

/** Reconcile the account record before migrating legacy character libraries. */
export function hydrateChatAppearanceLibraries(userId: string, remote: unknown) {
  if (!remote || typeof remote !== "object") return;
  for (const type of ["chatBubble", "chatChrome", "chatFull"] as const) {
    const source = remote as Partial<Record<ThemeType, Library & { fullChatLibrary?: Library }>>;
    const raw = type === "chatFull" ? source.chatChrome?.fullChatLibrary : source[type];
    if (!raw || !Array.isArray(raw.presets)) continue;
    const current = readChatAppearanceLibrary(userId, type);
    if ((current.updatedAt ?? "") > (raw.updatedAt ?? "")) continue;
    const presets = validatedPresets(type, raw.presets);
    assertStoredLibrary(userId, type);
    write(userId, type, {
      presets,
      migratedCharacterIds: Array.isArray(raw.migratedCharacterIds) ? raw.migratedCharacterIds : [],
      updatedAt: raw.updatedAt ?? "",
    });
  }
}

/** Reuse the existing JSON/RPC without a schema change. Full CSS has its own local key
 * and library, transported in a namespaced JSON member of the existing chrome envelope. */
export function chatAppearanceLibraryPayload(userId: string, type: ThemeType) {
  if (type !== "chatBubble") assertStoredLibrary(userId, "chatFull");
  return type === "chatBubble"
    ? readChatAppearanceLibrary(userId, type)
    : {
        ...readChatAppearanceLibrary(userId, "chatChrome"),
        fullChatLibrary: readChatAppearanceLibrary(userId, "chatFull"),
      };
}

/** Copy old libraries once. Keep character CSS/selections and original records intact. */
export function migrateChatAppearanceLibraries(
  userId: string,
  characters: readonly { id: string; chat_preferences?: unknown }[],
) {
  for (const type of ["chatBubble", "chatChrome"] as const) {
    assertStoredLibrary(userId, type);
    const current = readChatAppearanceLibrary(userId, type);
    const next = structuredClone(current);
    for (const character of characters) {
      if (next.migratedCharacterIds.includes(character.id)) continue;
      const raw = character.chat_preferences as
        { appearance?: Partial<Record<ThemeType, { presets?: unknown }>> } | undefined;
      const legacyPresets = validatedPresets(type, raw?.appearance?.[type]?.presets);
      for (const preset of legacyPresets) {
        const existing = next.presets.find((item) => item.id === preset.id);
        if (!existing) next.presets.push(preset);
        else if (JSON.stringify(existing) !== JSON.stringify(preset)) {
          next.presets.push({ ...preset, id: `legacy-${character.id}-${preset.id}` });
        }
      }
      next.migratedCharacterIds.push(character.id);
    }
    if (next.migratedCharacterIds.length !== current.migratedCharacterIds.length) {
      next.updatedAt = new Date().toISOString();
      write(userId, type, next);
    }
  }
}

export function useChatAppearanceLibrary(userId: string, type: ThemeType) {
  const storageKey = key(userId, type);
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
    () => readChatAppearanceLibrary(userId, type),
    () => empty,
  );
}
