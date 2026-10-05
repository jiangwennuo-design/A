import { useEffect, useState } from "react";
import {
  defaultHappenedSettings,
  happenedColors,
  happenedEntrySchema,
  type HappenedEntry,
  type HappenedSettings,
} from "./happened";

let database: Promise<IDBDatabase> | undefined;
const listeners = new Map<string, Set<() => void>>();
function notify(userId: string) {
  listeners.get(userId)?.forEach((listener) => listener());
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("kdeji-happened-v1");
    channel.postMessage(userId);
    channel.close();
  }
}
function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("此浏览器不支持手帐持久化。"));
      return;
    }
    const request = indexedDB.open("kdeji-happened-v1", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const entries = db.createObjectStore("entries", { keyPath: ["userId", "id"] });
      entries.createIndex("timeline", ["userId", "date", "timestamp", "id"]);
      entries.createIndex("tags", "tagKeys", { multiEntry: true });
      db.createObjectStore("meta");
      db.createObjectStore("files");
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      resolve(db);
    };
    request.onerror = request.onblocked = () => {
      database = undefined;
      reject(new Error("无法读取手帐，原数据未被清空。"));
    };
  });
  return database;
}
const tagPrefix = (userId: string, tag: string) => `${JSON.stringify([userId, tag])}|`;
const storedEntry = (entry: HappenedEntry) => ({
  ...entry,
  tagKeys: entry.hidden
    ? []
    : [...new Set(entry.tags)].map(
        (tag) => `${tagPrefix(entry.userId, tag)}${entry.timestamp}|${entry.id}`,
      ),
});
function range(userId: string, from: string, to: string) {
  return IDBKeyRange.bound([userId, from], [userId, to, "\uffff", "\uffff"]);
}
export async function happenedMeta<T>(userId: string, key: string, fallback: T): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("meta").objectStore("meta").get([userId, key]);
    request.onsuccess = () => resolve(request.result ?? fallback);
    request.onerror = () => reject(new Error("手帐设置读取失败。"));
  });
}
export async function saveHappenedMeta(userId: string, key: string, value: unknown) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("meta", "readwrite");
    tx.objectStore("meta").put(value, [userId, key]);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(new Error("手帐设置保存失败。"));
  });
  notify(userId);
}
export async function readHappenedSettings(userId: string) {
  const settings = await happenedMeta(userId, "settings", defaultHappenedSettings());
  return {
    tags: settings.tags.filter(
      (tag) =>
        tag &&
        typeof tag.id === "string" &&
        typeof tag.name === "string" &&
        happenedColors.includes(tag.color),
    ),
    sources: { ...defaultHappenedSettings().sources, ...settings.sources },
  } as HappenedSettings;
}
export async function getHappenedEntry(userId: string, id: string): Promise<HappenedEntry | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("entries").objectStore("entries").get([userId, id]);
    request.onsuccess = () => {
      try {
        resolve(request.result ? happenedEntrySchema.parse(request.result) : null);
      } catch {
        reject(new Error("记录格式异常，原数据未被清空。"));
      }
    };
    request.onerror = () => reject(new Error("记录读取失败。"));
  });
}
export async function saveHappenedEntries(userId: string, rows: HappenedEntry[], system = false) {
  const entries = rows.map((row) => happenedEntrySchema.parse(row));
  if (entries.some((entry) => entry.userId !== userId)) throw new Error("不能保存其他账号的记录。");
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("entries", "readwrite");
    const store = tx.objectStore("entries");
    for (const entry of entries) {
      const request = store.get([userId, entry.id]);
      request.onsuccess = () => {
        const old = request.result as HappenedEntry | undefined;
        // User-owned presentation flags survive every adapter refresh.
        const next =
          system && old
            ? {
                ...entry,
                hidden: old.hidden,
                showInMemories: old.showInMemories,
                tags: old.tags,
                timestamp: old.timestamp,
                date: old.date,
              }
            : entry;
        store.put(storedEntry(next));
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(new Error("手帐保存失败，请检查浏览器存储空间。"));
  });
  notify(userId);
}
export async function removeHappenedEntry(userId: string, id: string) {
  const entry = await getHappenedEntry(userId, id);
  if (!entry) return;
  if (entry.isSystemEvent) {
    await saveHappenedEntries(userId, [{ ...entry, hidden: true }]);
    return;
  }
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["entries", "files"], "readwrite");
    tx.objectStore("entries").delete([userId, id]);
    entry.files.forEach((file) => tx.objectStore("files").delete([userId, file.id]));
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(new Error("删除失败，原数据仍在。"));
  });
  notify(userId);
}
export interface HappenedQuery {
  from: string;
  to: string;
  tag?: string | undefined;
  limit?: number;
  query?: string;
  memories?: boolean;
  hidden?: boolean;
  sources?: HappenedSettings["sources"];
}
export async function readHappenedEntries(userId: string, options: HappenedQuery) {
  const db = await openDatabase();
  return new Promise<{ entries: HappenedEntry[]; more: boolean }>((resolve, reject) => {
    const entries: HappenedEntry[] = [];
    const tx = db.transaction("entries");
    const index = tx.objectStore("entries").index(options.tag ? "tags" : "timeline");
    const prefix = tagPrefix(userId, options.tag ?? "");
    const request = index.openCursor(
      options.tag
        ? IDBKeyRange.bound(`${prefix}${options.from}`, `${prefix}${options.to}\uffff`)
        : range(userId, options.from, options.to),
      "prev",
    );
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve({ entries, more: false });
        return;
      }
      const parsed = happenedEntrySchema.safeParse(cursor.value);
      if (!parsed.success) {
        reject(new Error("记录格式异常，原数据未被清空。"));
        return;
      }
      const entry = parsed.data;
      const matches =
        (options.hidden ? entry.hidden : !entry.hidden) &&
        (!entry.isSystemEvent ||
          options.sources?.[entry.sourceApp as keyof HappenedSettings["sources"]] !== false) &&
        (!options.memories || entry.showInMemories) &&
        (!options.query ||
          `${entry.title} ${entry.content} ${entry.location} ${entry.mood} ${entry.music.title}`
            .toLocaleLowerCase()
            .includes(options.query.toLocaleLowerCase()));
      if (matches) {
        if (entries.length >= (options.limit ?? 120)) {
          resolve({ entries, more: true });
          return;
        }
        entries.push(entry);
      }
      cursor.continue();
    };
    request.onerror = () => reject(new Error("时间线读取失败。"));
  });
}
export async function happenedMonthStats(
  userId: string,
  from: string,
  to: string,
  sources: HappenedSettings["sources"],
) {
  const db = await openDatabase();
  return new Promise<{
    total: number;
    days: number;
    photos: number;
    text: number;
    tags: Record<string, number>;
    dates: Record<string, { count: number; image: string }>;
  }>((resolve, reject) => {
    const result = {
      total: 0,
      days: 0,
      photos: 0,
      text: 0,
      tags: {} as Record<string, number>,
      dates: {} as Record<string, { count: number; image: string }>,
    };
    const request = db
      .transaction("entries")
      .objectStore("entries")
      .index("timeline")
      .openCursor(range(userId, from, to));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        result.days = Object.keys(result.dates).length;
        resolve(result);
        return;
      }
      const entry = cursor.value as HappenedEntry;
      if (
        !entry.hidden &&
        (!entry.isSystemEvent || sources[entry.sourceApp as keyof typeof sources] !== false)
      ) {
        result.total++;
        result.photos += entry.images.length;
        if (entry.content) result.text++;
        const day = (result.dates[entry.date] ??= { count: 0, image: "" });
        day.count++;
        day.image ||= entry.images[0] || "";
        for (const tag of new Set(entry.tags)) result.tags[tag] = (result.tags[tag] ?? 0) + 1;
      }
      cursor.continue();
    };
    request.onerror = () => reject(new Error("月度摘要读取失败。"));
  });
}
export async function countHappenedTag(
  userId: string,
  tag: string,
  sources?: HappenedSettings["sources"],
) {
  const db = await openDatabase();
  const prefix = tagPrefix(userId, tag);
  return new Promise<number>((resolve, reject) => {
    const index = db.transaction("entries").objectStore("entries").index("tags");
    const bounds = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
    if (!sources || Object.values(sources).every(Boolean)) {
      const request = index.count(bounds);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("标签读取失败。"));
      return;
    }
    let count = 0;
    const request = index.openCursor(bounds);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(count);
        return;
      }
      const entry = cursor.value as HappenedEntry;
      if (!entry.isSystemEvent || sources[entry.sourceApp as keyof typeof sources] !== false)
        count++;
      cursor.continue();
    };
    request.onerror = () => reject(new Error("标签读取失败。"));
  });
}
export async function deleteHappenedTag(userId: string, tagId: string) {
  const db = await openDatabase();
  const prefix = tagPrefix(userId, tagId);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["entries", "meta"], "readwrite");
    const store = tx.objectStore("entries");
    const request = store.index("tags").openCursor(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const parsed = happenedEntrySchema.safeParse(cursor.value);
      if (!parsed.success) {
        tx.abort();
        return;
      }
      const entry = parsed.data;
      cursor.update(storedEntry({ ...entry, tags: entry.tags.filter((id) => id !== tagId) }));
      cursor.continue();
    };
    // Hidden entries have no tag index. Their obsolete IDs are harmless and never display;
    // filter them out if later restored via the normal settings list.
    const meta = tx.objectStore("meta");
    const settings = meta.get([userId, "settings"]);
    settings.onsuccess = () => {
      const old = (settings.result ?? defaultHappenedSettings()) as HappenedSettings;
      meta.put({ ...old, tags: old.tags.filter((tag) => tag.id !== tagId) }, [userId, "settings"]);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(new Error("标签删除失败，原记录未被删除。"));
  });
  notify(userId);
}
export async function saveHappenedFile(userId: string, file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error("每个文件不能超过 10 MB。");
  const id = crypto.randomUUID();
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(file, [userId, id]);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(new Error("文件保存失败。"));
  });
  return { id, name: file.name, size: file.size, mime: file.type };
}
export async function readHappenedFile(userId: string, id: string) {
  const db = await openDatabase();
  return new Promise<Blob | null>((resolve, reject) => {
    const request = db.transaction("files").objectStore("files").get([userId, id]);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(new Error("文件读取失败。"));
  });
}
export function useHappenedRevision(userId: string) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const listener = () => setRevision((value) => value + 1);
    const group = listeners.get(userId) ?? new Set();
    group.add(listener);
    listeners.set(userId, group);
    const channel =
      typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("kdeji-happened-v1") : null;
    if (channel)
      channel.onmessage = (event) => {
        if (event.data === userId) listener();
      };
    return () => {
      group.delete(listener);
      if (!group.size) listeners.delete(userId);
      channel?.close();
    };
  }, [userId]);
  return revision;
}
