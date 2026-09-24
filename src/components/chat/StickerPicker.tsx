/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SystemSheet } from "@/components/system-ui";
import { supabase } from "@/integrations/supabase/client";
import { prepareChatImage, uploadChatMedia } from "@/lib/chat-media";
import { resolveSignedMediaUrl } from "@/lib/signed-media";
import type { ChatSticker } from "@/lib/types";

const recentKey = "cxyj-recent-stickers";

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
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ChatSticker[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void db
      .from("chat_stickers")
      .select("*")
      .order("created_at", { ascending: false })
      .then(async ({ data }: any) => {
        const next = (data ?? []) as ChatSticker[];
        const pairs = await Promise.all(
          next.map(
            async (item) =>
              [item.id, await resolveSignedMediaUrl("chat-media", item.file_path)] as const,
          ),
        );
        if (alive) {
          setItems(next);
          setUrls(Object.fromEntries(pairs));
        }
      });
    return () => {
      alive = false;
    };
  }, [db, open]);
  async function upload(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    try {
      const image = await prepareChatImage(file, 640);
      const path = await uploadChatMedia(userId, image, "stickers");
      URL.revokeObjectURL(image.previewUrl);
      const { data, error } = await db
        .from("chat_stickers")
        .insert({ user_id: userId, file_path: path, width: image.width, height: image.height })
        .select("*")
        .single();
      if (error || !data) throw new Error("表情包保存失败。");
      const url = await resolveSignedMediaUrl("chat-media", path);
      setItems((current) => [data as ChatSticker, ...current]);
      setUrls((current) => ({ ...current, [data.id]: url }));
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "表情包上传失败。");
    } finally {
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
    if (!confirm("删除这个表情包？")) return;
    const { error } = await db.from("chat_stickers").delete().eq("id", item.id);
    if (error) return onError("删除失败。");
    // Keep the stored file so stickers already sent in chat history do not break.
    setItems((current) => current.filter((value) => value.id !== item.id));
  }
  const recentIds = readRecent();
  const recent = recentIds
    .map((id) => items.find((item) => item.id === id))
    .filter(Boolean) as ChatSticker[];
  return (
    <SystemSheet
      open={open}
      title="表情包"
      description="最近使用保存在本设备"
      onClose={onClose}
      scrollable
    >
      <input
        ref={input}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={(event) => {
          void upload(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      {recent.length > 0 && (
        <StickerSection title="最近使用" items={recent} urls={urls} onSend={send} />
      )}
      <StickerSection title="我的表情" items={items} urls={urls} onSend={send} onDelete={remove} />
      <button
        type="button"
        className="sticker-upload"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <Plus size={18} />
        {busy ? "上传中…" : "上传表情包"}
      </button>
    </SystemSheet>
  );
}

function StickerSection({
  title,
  items,
  urls,
  onSend,
  onDelete,
}: {
  title: string;
  items: ChatSticker[];
  urls: Record<string, string>;
  onSend: (item: ChatSticker) => void;
  onDelete?: (item: ChatSticker) => void;
}) {
  return (
    <section className="sticker-section">
      <h3>{title}</h3>
      {items.length ? (
        <div className="sticker-grid">
          {items.map((item) => (
            <div key={item.id} className="sticker-tile">
              <button type="button" onClick={() => onSend(item)}>
                <img src={urls[item.id] || ""} alt="表情包" loading="lazy" />
              </button>
              {onDelete && (
                <button
                  type="button"
                  aria-label="删除表情"
                  onClick={() => void onDelete(item)}
                  className="sticker-delete"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p>还没有表情包</p>
      )}
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
