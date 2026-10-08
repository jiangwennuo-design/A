import { useEffect, useState } from "react";
import {
  applyLedgerChange,
  defaultLedger,
  normalizeLedger,
  type LedgerChange,
  type LedgerState,
} from "./ledger";

// Same account-keyed IndexedDB and transaction-completion pattern used by Knowledge.
// No mount-time default writes, no localStorage mirror, and no other App's stores touched.
let database: Promise<IDBDatabase> | undefined;
const listeners = new Map<string, Set<(state: LedgerState) => void>>();
function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前浏览器无法保存账本，请退出无痕模式后重试。"));
      return;
    }
    const request = indexedDB.open("kdeji-ledger-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("books");
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
      reject(new Error("账本存储暂时无法打开，原数据未被清空。"));
    };
  });
  return database;
}
export async function readLedger(userId: string) {
  if (!userId) throw new Error("请先登录。");
  const db = await openDatabase();
  return new Promise<LedgerState>((resolve, reject) => {
    const request = db.transaction("books").objectStore("books").get(userId);
    request.onsuccess = () => {
      try {
        resolve(normalizeLedger(request.result));
      } catch {
        reject(new Error("账本数据无法读取，未覆盖原数据。"));
      }
    };
    request.onerror = () => reject(new Error("账本读取失败，请重试。"));
  });
}
export async function changeLedger(userId: string, change: LedgerChange) {
  if (!userId) throw new Error("请先登录。");
  const db = await openDatabase();
  const next = await new Promise<LedgerState>((resolve, reject) => {
    // A single read-modify-write transaction also serializes saves from other tabs.
    const tx = db.transaction("books", "readwrite");
    const store = tx.objectStore("books"),
      request = store.get(userId);
    let state: LedgerState;
    let failure: unknown;
    request.onsuccess = () => {
      try {
        state = applyLedgerChange(normalizeLedger(request.result), change);
        store.put(state, userId);
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(state!);
    tx.onerror = tx.onabort = () => {
      const detail =
        failure && typeof failure === "object" && "issues" in failure
          ? (failure as { issues: { message: string }[] }).issues[0]?.message
          : failure instanceof Error
            ? failure.message
            : "保存失败，请检查浏览器空间；原数据未被清空。";
      reject(new Error(detail));
    };
  });
  listeners.get(userId)?.forEach((listener) => listener(next));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("kdeji-ledger-v1");
    channel.postMessage(userId);
    channel.close();
  }
  return next;
}
export function useLedger(userId: string) {
  const [state, setState] = useState<LedgerState>(defaultLedger);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true,
      revision = 0,
      loadId = 0;
    setState(defaultLedger());
    setLoading(true);
    setError("");
    const update = (value: LedgerState) => {
      if (active) {
        revision++;
        setState(value);
        setLoading(false);
        setError("");
      }
    };
    const load = async () => {
      const before = revision;
      const currentLoad = ++loadId;
      try {
        const value = await readLedger(userId);
        if (active && currentLoad === loadId && before === revision) update(value);
      } catch (reason) {
        if (active && currentLoad === loadId && before === revision) {
          setError(reason instanceof Error ? reason.message : "账本读取失败。");
          setLoading(false);
        }
      }
    };
    const group = listeners.get(userId) ?? new Set();
    group.add(update);
    listeners.set(userId, group);
    const channel =
      typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("kdeji-ledger-v1") : null;
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
  }, [userId, retry]);
  return { state, loading, error, reload: () => setRetry((n) => n + 1) };
}
