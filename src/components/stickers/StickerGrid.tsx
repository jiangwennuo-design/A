import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatSticker } from "@/lib/types";
import { StickerImage } from "./StickerImage";

export function StickerGrid({
  items,
  onSend,
  onDelete,
}: {
  items: ChatSticker[];
  onSend: (item: ChatSticker) => void;
  onDelete?: (item: ChatSticker) => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const [window, setWindow] = useState({ start: 0, end: 48, pitch: 101 });
  useEffect(() => {
    const element = grid.current;
    const root = element?.closest(".system-sheet__body");
    if (!element || !root) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const bounds = element.getBoundingClientRect();
      const visible = root.getBoundingClientRect();
      const tile = element.querySelector<HTMLElement>(".sticker-tile");
      const gap = parseFloat(getComputedStyle(element).rowGap) || 8;
      const pitch = tile ? tile.getBoundingClientRect().height + gap : 101;
      const rows = Math.ceil(items.length / 4);
      const first = Math.min(
        Math.max(0, rows - 4),
        Math.max(0, Math.floor((visible.top - bounds.top) / pitch) - 3),
      );
      const last = Math.min(
        rows,
        Math.max(first + 4, Math.ceil((visible.bottom - bounds.top) / pitch) + 3),
      );
      setWindow((current) =>
        current.start === first * 4 && current.end === last * 4 && current.pitch === pitch
          ? current
          : { start: first * 4, end: last * 4, pitch },
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(root);
    observer?.observe(element);
    root.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      root.removeEventListener("scroll", schedule);
    };
  }, [items.length]);
  if (!items.length) return <p className="sticker-empty">还没有表情</p>;
  const start = Math.min(window.start, Math.max(0, Math.ceil(items.length / 4) - 4) * 4);
  const end = Math.max(start + 16, window.end);
  const rowsAfter = Math.ceil(Math.max(0, items.length - end) / 4);
  return (
    <div className="sticker-grid" ref={grid}>
      {start > 0 && (
        <div aria-hidden style={{ gridColumn: "1 / -1", height: (start / 4) * window.pitch - 8 }} />
      )}
      {items.slice(start, end).map((item) => (
        <div key={item.id} className="sticker-tile">
          <button type="button" onClick={() => onSend(item)}>
            <StickerImage path={item.file_path} name={item.name || "表情"} />
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
      {rowsAfter > 0 && (
        <div aria-hidden style={{ gridColumn: "1 / -1", height: rowsAfter * window.pitch - 8 }} />
      )}
    </div>
  );
}
