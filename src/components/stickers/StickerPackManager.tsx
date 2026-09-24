/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrowLeft, FolderPen, FolderX, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { deleteStickerPack } from "@/lib/stickers/sticker-import.functions";
import type { ChatSticker, StickerPack } from "@/lib/types";

export function StickerPackManager({
  packs,
  stickers,
  onBack,
  onRefresh,
  onError,
}: {
  packs: StickerPack[];
  stickers: ChatSticker[];
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const db = supabase as any;
  async function rename(pack: StickerPack) {
    const name = window.prompt("新的表情包名称", pack.name)?.trim();
    if (!name || name === pack.name) return;
    const { error } = await db
      .from("sticker_packs")
      .update({ name: name.slice(0, 80), updated_at: new Date().toISOString() })
      .eq("id", pack.id);
    if (error) return onError("重命名失败。");
    await onRefresh();
  }
  async function remove(pack: StickerPack, deleteStickers: boolean) {
    const message = deleteStickers
      ? `确定删除“${pack.name}”及其中全部表情吗？聊天记录中已发送的相关图片也可能无法继续显示。`
      : `只删除“${pack.name}”分组？其中表情会保留到未分组。`;
    if (!window.confirm(message)) return;
    try {
      await deleteStickerPack({ data: { packId: pack.id, deleteStickers } });
      await onRefresh();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "删除失败。");
    }
  }
  const ungrouped = stickers.filter((sticker) => !sticker.pack_id).length;
  return (
    <div className="sticker-pack-manager">
      <button type="button" className="sticker-subpage-back" onClick={onBack}>
        <ArrowLeft size={17} /> 返回管理表情
      </button>
      <div className="sticker-pack-list">
        {packs.map((pack) => {
          const count = stickers.filter((sticker) => sticker.pack_id === pack.id).length;
          return (
            <article key={pack.id}>
              <div>
                <strong>{pack.name}</strong>
                <span>{count} 个表情</span>
              </div>
              <div>
                <button type="button" title="重命名" onClick={() => void rename(pack)}>
                  <FolderPen size={16} />
                </button>
                <button type="button" title="仅删除分组" onClick={() => void remove(pack, false)}>
                  <FolderX size={16} />
                </button>
                <button
                  type="button"
                  title="删除分组和表情"
                  onClick={() => void remove(pack, true)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          );
        })}
        {ungrouped > 0 && (
          <article>
            <div>
              <strong>未分组</strong>
              <span>{ungrouped} 个表情</span>
            </div>
          </article>
        )}
        {!packs.length && !ungrouped && <p className="sticker-empty">还没有表情包</p>}
      </div>
    </div>
  );
}
