import { memo, useEffect, useState } from "react";
import { ArrowDownLeft, ImageOff, Phone } from "lucide-react";
import { resolveSignedMediaUrl } from "@/lib/signed-media";
import { formatCallDuration } from "@/lib/chat-message";
import type { ChatMessage } from "@/lib/types";
import { readTransfer, transferStatusLabel } from "@/lib/chat-transfer";

export const MessageContent = memo(function MessageContent({
  message,
  onOpenImage,
  onOpenTransfer,
}: {
  message: ChatMessage;
  onOpenImage: (url: string, alt: string) => void;
  onOpenTransfer?: ((message: ChatMessage) => void) | undefined;
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
  if (type === "text")
    return (
      <div className="message-bubble">
        <p>{message.content}</p>
      </div>
    );
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
        {!loaded && type === "image" && <span className="chat-media-skeleton" />}
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
  if (type === "transfer") {
    const transfer = readTransfer(message);
    return (
      <button
        type="button"
        className={`transfer-message is-${transfer.status}`}
        onClick={() => onOpenTransfer?.(message)}
        aria-label={`转账 ¥${transfer.amount.toFixed(2)} ${transferStatusLabel(transfer.status)}`}
      >
        <span className="transfer-message__icon">
          <ArrowDownLeft size={23} />
        </span>
        <div>
          <strong>¥ {transfer.amount.toFixed(2)}</strong>
          <p>{transfer.remark || "转账"}</p>
          <small>{transferStatusLabel(transfer.status)}</small>
        </div>
      </button>
    );
  }
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

function callLabel(status: string, duration: number) {
  if (status === "missed") return "未接听";
  if (status === "cancelled") return "已取消";
  return formatCallDuration(duration);
}
