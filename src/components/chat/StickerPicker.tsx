/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";
import { FileArchive, FolderCog, ImagePlus, Search, Settings2 } from "lucide-react";
import { StickerGrid } from "@/components/stickers/StickerGrid";
import { StickerImportSheet } from "@/components/stickers/StickerImportSheet";
import { StickerPackManager } from "@/components/stickers/StickerPackManager";
import { SystemSheet } from "@/components/system-ui";
import { supabase } from "@/integrations/supabase/client";
import { prepareChatImage, uploadChatMedia } from "@/lib/chat-media";
import { sha256Hex } from "@/lib/stickers/hash";
import { mapWithConcurrency } from "@/lib/stickers/import-pack";
import { resolveSignedMediaUrl } from "@/lib/signed-media";
import type { ChatSticker, StickerPack } from "@/lib/types";

const recentKey = "cxyj-recent-stickers";
type StickerView = "picker" | "manage" | "manifest" | "packs";

export function StickerPicker({
  open,
  userId,
  onClose,
  onSend,
  onError,
}: {
  open: boolean;
  userId: string;
  onClose: () => void;
  onSend: (sticker: ChatSticker) => void;
  onError: (message: string) => void;
}) {
  const db = supabase as any;
  const imageInput = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ChatSticker[]>([]);
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [view, setView] = useState<StickerView>("picker");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const [{ data: stickerRows }, { data: packRows }] = await Promise.all([
      db.from("chat_stickers").select("*").order("created_at", { ascending: false }),
      db.from("sticker_packs").select("*").order("created_at", { ascending: false }),
    ]);
    const next = (stickerRows ?? []) as ChatSticker[];
    const pairs = await mapWithConcurrency(
      next,
      6,
      async (item) => [item.id, await resolveSignedMediaUrl("chat-media", item.file_path)] as const,
    );
    setItems(next);
    setPacks((packRows ?? []) as StickerPack[]);
    setUrls(Object.fromEntries(pairs));
  }, [db]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  async function saveImage(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    let path = "";
    let image: Awaited<ReturnType<typeof prepareChatImage>> | null = null;
    try {
      image = await prepareChatImage(file, 640);
      const contentHash = await sha256Hex(image.blob);
      const { data: existing } = await db
        .from("chat_stickers")
        .select("*")
        .eq("user_id", userId)
        .eq("content_hash", contentHash)
        .maybeSingle();
      if (existing) {
        onError("这个表情已经在“我的表情”中。");
        return;
      }
      path = await uploadChatMedia(userId, image, "stickers");
      const name =
        file.name
          .replace(/\.[^.]+$/, "")
          .trim()
          .slice(0, 80) || "表情";
      const { data, error } = await db
        .from("chat_stickers")
        .insert({
          user_id: userId,
          file_path: path,
          pack_id: null,
          name,
          tags: [name],
          source_url: null,
          mime_type: image.blob.type,
          content_hash: contentHash,
          width: image.width,
          height: image.height,
        })
        .select("*")
        .single();
      if (error || !data) throw new Error("表情保存失败。");
      await load();
    } catch (reason) {
      if (path) await db.storage.from("chat-media").remove([path]);
      onError(reason instanceof Error ? reason.message : "表情导入失败。");
    } finally {
      if (image) URL.revokeObjectURL(image.previewUrl);
      setBusy(false);
    }
  }

  function send(item: ChatSticker) {
    const recent = readRecent();
    localStorage.setItem(
      recentKey,
      JSON.stringify([item.id, ...recent.filter((id) => id !== item.id)].slice(0, 20)),
    );
    onSend(item);
  }

  async function remove(item: ChatSticker) {
    if (!window.confirm(`删除表情“${item.name || "表情"}”？`)) return;
    const { error } = await db.from("chat_stickers").delete().eq("id", item.id);
    if (error) return onError("删除失败。");
    setItems((current) => current.filter((value) => value.id !== item.id));
  }

  function close() {
    setView("picker");
    setQuery("");
    onClose();
  }

  const matching = items.filter((item) => {
    const keyword = query.trim().toLocaleLowerCase();
    if (!keyword) return true;
    return [item.name, ...(item.tags ?? [])].some((value) =>
      value.toLocaleLowerCase().includes(keyword),
    );
  });
  const recent = readRecent()
    .map((id) => items.find((item) => item.id === id))
    .filter(Boolean) as ChatSticker[];
  const title =
    view === "picker"
      ? "表情包"
      : view === "manage"
        ? "管理表情"
        : view === "packs"
          ? "管理表情包"
          : "导入表情包";

  return (
    <SystemSheet open={open} title={title} onClose={close} scrollable>
      <input
        ref={imageInput}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={(event) => {
          void saveImage(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />

      {view === "picker" && (
        <>
          <label className="sticker-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索表情名称或标签"
            />
          </label>
          {!query && recent.length > 0 && (
            <StickerSection title="最近使用" items={recent} urls={urls} onSend={send} />
          )}
          {packs.map((pack) => (
            <StickerSection
              key={pack.id}
              title={pack.name}
              items={matching.filter((item) => item.pack_id === pack.id)}
              urls={urls}
              onSend={send}
              hideEmpty
            />
          ))}
          <StickerSection
            title={packs.length ? "未分组" : "我的表情"}
            items={matching.filter((item) => !item.pack_id)}
            urls={urls}
            onSend={send}
            hideEmpty={packs.length > 0}
          />
          {query && !matching.length && <p className="sticker-empty">没有匹配的表情</p>}
          <button type="button" className="sticker-upload" onClick={() => setView("manage")}>
            <Settings2 size={18} /> 管理表情
          </button>
        </>
      )}

      {view === "manage" && (
        <>
          <button type="button" className="sticker-subpage-back" onClick={() => setView("picker")}>
            返回表情包
          </button>
          <div className="sticker-manage-actions">
            <button type="button" disabled={busy} onClick={() => imageInput.current?.click()}>
              <ImagePlus size={20} />
              <span>{busy ? "处理中…" : "从图片导入"}</span>
            </button>
            <button type="button" disabled={busy} onClick={() => setView("manifest")}>
              <FileArchive size={20} />
              <span>从文件导入</span>
            </button>
            <button type="button" disabled={busy} onClick={() => setView("packs")}>
              <FolderCog size={20} />
              <span>管理表情包</span>
            </button>
          </div>
          <StickerSection
            title="全部表情"
            items={items}
            urls={urls}
            onSend={send}
            onDelete={remove}
          />
        </>
      )}

      {view === "manifest" && (
        <StickerImportSheet
          userId={userId}
          onBack={() => setView("manage")}
          onDone={() => {
            void load();
            setView("manage");
          }}
          onError={onError}
        />
      )}

      {view === "packs" && (
        <StickerPackManager
          packs={packs}
          stickers={items}
          onBack={() => setView("manage")}
          onRefresh={load}
          onError={onError}
        />
      )}
    </SystemSheet>
  );
}

function StickerSection({
  title,
  items,
  urls,
  onSend,
  onDelete,
  hideEmpty = false,
}: {
  title: string;
  items: ChatSticker[];
  urls: Record<string, string>;
  onSend: (item: ChatSticker) => void;
  onDelete?: (item: ChatSticker) => void;
  hideEmpty?: boolean;
}) {
  if (hideEmpty && !items.length) return null;
  return (
    <section className="sticker-section">
      <h3>{title}</h3>
      <StickerGrid items={items} urls={urls} onSend={onSend} {...(onDelete ? { onDelete } : {})} />
    </section>
  );
}

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentKey) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, 20)
      : [];
  } catch {
    return [];
  }
}
