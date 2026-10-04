import { useEffect, useState } from "react";
import { knowledgeCardSchema, type KnowledgeCard } from "./knowledge";

export interface KnowledgeProfile {
  avatar: string;
  displayName: string;
  signature: string;
}
const defaultProfile: KnowledgeProfile = { avatar: "", displayName: "K", signature: "" };
export interface KnowledgeState {
  cards: KnowledgeCard[];
  tagOrder: string[];
  profile: KnowledgeProfile;
}
const empty: KnowledgeState = { cards: [], tagOrder: [], profile: defaultProfile };
let database: Promise<IDBDatabase> | undefined;
const listeners = new Map<string, Set<(state: KnowledgeState) => void>>();
const queues = new Map<string, Promise<unknown>>();

function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前浏览器不支持知识库持久化，请退出无痕模式后重试。"));
      return;
    }
    const request = indexedDB.open("kdeji-knowledge-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("libraries");
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      resolve(db);
    };
    request.onerror = () => {
      database = undefined;
      reject(new Error("无法打开知识库，原数据未被清空。"));
    };
    request.onblocked = () => {
      database = undefined;
      reject(new Error("知识库被其他窗口占用，请关闭旧窗口重试。"));
    };
  });
  return database;
}
function normalize(raw: unknown): KnowledgeState {
  if (raw === undefined) return empty;
  if (!raw || typeof raw !== "object" || !("cards" in raw) || !Array.isArray(raw.cards))
    throw new Error("知识库数据无法读取，未覆盖原数据。");
  return {
    cards: raw.cards.map((card) => knowledgeCardSchema.parse(card)),
    profile: {
      ...defaultProfile,
      ...("profile" in raw && raw.profile && typeof raw.profile === "object"
        ? Object.fromEntries(
            Object.entries(raw.profile).filter(
              ([key, value]) => key in defaultProfile && typeof value === "string",
            ),
          )
        : {}),
    },
    tagOrder:
      "tagOrder" in raw && Array.isArray(raw.tagOrder)
        ? raw.tagOrder.filter((tag): tag is string => typeof tag === "string")
        : [],
  };
}
export async function readKnowledge(userId: string) {
  const db = await openDatabase();
  return new Promise<KnowledgeState>((resolve, reject) => {
    const request = db.transaction("libraries").objectStore("libraries").get(userId);
    request.onsuccess = () => {
      try {
        resolve(normalize(request.result));
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(new Error("知识库读取失败，请重试。"));
  });
}

export function updateKnowledge(
  userId: string,
  change: (state: KnowledgeState) => KnowledgeState,
): Promise<KnowledgeState> {
  const write = (queues.get(userId) ?? Promise.resolve())
    .catch(() => undefined)
    .then(async () => {
      const db = await openDatabase();
      const next = await new Promise<KnowledgeState>((resolve, reject) => {
        const transaction = db.transaction("libraries", "readwrite");
        const store = transaction.objectStore("libraries");
        const request = store.get(userId);
        let value: KnowledgeState;
        request.onsuccess = () => {
          try {
            value = normalize(change(normalize(request.result)));
            store.put(value, userId);
          } catch (error) {
            transaction.abort();
            reject(error);
          }
        };
        transaction.oncomplete = () => resolve(value!);
        transaction.onerror = transaction.onabort = () =>
          reject(new Error("知识库保存失败，请检查浏览器存储空间；原数据未被清空。"));
      });
      listeners.get(userId)?.forEach((listener) => listener(next));
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("kdeji-knowledge-v1");
        channel.postMessage(userId);
        channel.close();
      }
      return next;
    });
  queues.set(userId, write);
  return write;
}
export function saveKnowledgeCards(userId: string, cards: KnowledgeCard[]) {
  const validated = cards.map((card) => knowledgeCardSchema.parse(card));
  return updateKnowledge(userId, (state) => {
    const replacements = new Map(validated.map((card) => [card.id, card]));
    return {
      ...state,
      cards: [
        ...validated.filter((card) => !state.cards.some((old) => old.id === card.id)),
        ...state.cards.map((card) => replacements.get(card.id) ?? card),
      ],
    };
  });
}
export function saveKnowledgeProfile(userId: string, patch: Partial<KnowledgeProfile>) {
  return updateKnowledge(userId, (state) => ({
    ...state,
    profile: { ...state.profile, ...patch },
  }));
}
export function useKnowledge(userId: string) {
  const [state, setState] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let revision = 0;
    setState(empty);
    setLoading(true);
    setError("");
    const update = (value: KnowledgeState) => {
      if (active) {
        revision++;
        setState(value);
        setLoading(false);
      }
    };
    const load = async () => {
      const before = revision;
      try {
        const value = await readKnowledge(userId);
        if (active && before === revision) update(value);
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : "知识库读取失败。");
          setLoading(false);
        }
      }
    };
    const group = listeners.get(userId) ?? new Set();
    group.add(update);
    listeners.set(userId, group);
    const channel =
      typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("kdeji-knowledge-v1") : null;
    if (channel)
      channel.onmessage = (event) => {
        if (event.data === userId) void load();
      };
    void load();
    return () => {
      active = false;
      group.delete(update);
      if (!group.size) listeners.delete(userId);
      channel?.close();
    };
  }, [userId]);
  return { ...state, loading, error };
}
