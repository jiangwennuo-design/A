import { memo, useEffect, useState } from "react";
import { ArrowDownLeft, ImageOff, Phone } from "lucide-react";
import { resolveSignedMediaUrl } from "@/lib/signed-media";
import { formatCallDuration } from "@/lib/chat-message";
import type { ChatMessage } from "@/lib/types";

export const MessageContent = memo(function MessageContent({
  message,
  onOpenImage,
}: {
  message: ChatMessage;
  onOpenImage: (url: string, alt: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [loaded, setLoaded] = useState(false);
  const type = message.message_type ?? "text";
  const payload = message.payload as Record<string, unknown>;
  const localPreview = String(payload["local_preview_url"] ?? "");
  const path =
    type === "image"
      ? String(payload["image_path"] ?? "")
      : type === "sticker"
        ? String(payload["sticker_path"] ?? "")
        : "";
  useEffect(() => {
    let alive = true;
    setLoaded(false);
    if (localPreview) {
      setUrl(localPreview);
      return;
    }
    if (!path) {
      setUrl("");
      return;
    }
    void resolveSignedMediaUrl("chat-media", path).then((value) => {
      if (alive) setUrl(value);
    });
    return () => {
      alive = false;
    };
  }, [localPreview, path]);
  if (type === "text") return <p>{message.content}</p>;
  if (type === "image" || type === "sticker") {
    const width = Math.max(1, Number(payload["width"]) || 1);
    const height = Math.max(1, Number(payload["height"]) || 1);
    if (!url)
      return (
        <span className={`chat-media-placeholder ${type === "sticker" ? "is-sticker" : ""}`}>
          <ImageOff size={22} />
        </span>
      );
    return (
      <button
        type="button"
        className={`chat-media ${type === "sticker" ? "is-sticker" : ""}`}
        onClick={() => onOpenImage(url, type === "sticker" ? "表情包" : "聊天图片")}
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {!loaded && <span className="chat-media-skeleton" />}
        <img
          src={url}
          alt={type === "sticker" ? "表情包" : "聊天图片"}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
        />
      </button>
    );
  }
  if (type === "transfer")
    return (
      <div className={`transfer-message is-${String(payload["status"] ?? "pending")}`}>
        <span className="transfer-message__icon">
          <ArrowDownLeft size={23} />
        </span>
        <div>
          <strong>¥ {Number(payload["amount"] ?? 0).toFixed(2)}</strong>
          <p>{String(payload["note"] || "模拟转账")}</p>
          <small>{transferStatus(String(payload["status"] ?? "pending"))}</small>
        </div>
      </div>
    );
  const duration = Number(payload["duration"] ?? 0);
  return (
    <div className="call-message">
      <Phone size={20} />
      <div>
        <strong>语音通话</strong>
        <p>{callLabel(String(payload["status"] ?? "cancelled"), duration)}</p>
      </div>
    </div>
  );
});

function transferStatus(status: string) {
  return status === "accepted" ? "已接收" : status === "returned" ? "已退回" : "待接收 · 虚拟功能";
}
function callLabel(status: string, duration: number) {
  if (status === "missed") return "未接听";
  if (status === "cancelled") return "已取消";
  return formatCallDuration(duration);
}
