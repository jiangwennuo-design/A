import { Trash2 } from "lucide-react";
import type { ChatSticker } from "@/lib/types";

export function StickerGrid({
  items,
  urls,
  onSend,
  onDelete,
}: {
  items: ChatSticker[];
  urls: Record<string, string>;
  onSend: (item: ChatSticker) => void;
  onDelete?: (item: ChatSticker) => void;
}) {
  if (!items.length) return <p className="sticker-empty">还没有表情</p>;
  return (
    <div className="sticker-grid">
      {items.map((item) => (
        <div key={item.id} className="sticker-tile">
          <button type="button" onClick={() => onSend(item)}>
            <img src={urls[item.id] || ""} alt={item.name || "表情"} loading="lazy" />
            <span>{item.name || "表情"}</span>
          </button>
          {onDelete && (
            <button
              type="button"
              aria-label={`删除${item.name || "表情"}`}
              onClick={() => void onDelete(item)}
              className="sticker-delete"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
