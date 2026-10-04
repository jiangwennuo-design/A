import { memo, useEffect, useState } from "react";
import { ArrowDownLeft, AudioLines, ImageOff, Phone } from "lucide-react";
import { resolveSignedMediaUrl } from "@/lib/signed-media";
import { formatCallDuration, messageDisplayType, voiceDuration } from "@/lib/chat-message";
import type { ChatMessage } from "@/lib/types";
import { readTransfer, transferStatusLabel } from "@/lib/chat-transfer";
import { readQuotedMessage } from "@/lib/chat-quote";
import { MessageQuote } from "./MessageQuote";

export const MessageContent = memo(function MessageContent({
  message,
  onOpenImage,
  onOpenTransfer,
  quoteCanJump = false,
  onJumpToMessage,
}: {
  message: ChatMessage;
  onOpenImage: (url: string, alt: string) => void;
  onOpenTransfer?: ((message: ChatMessage) => void) | undefined;
  quoteCanJump?: boolean;
  onJumpToMessage?: (id: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const type = messageDisplayType(message);
  const quote = readQuotedMessage(message.payload);
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
      <div className="message-bubble" data-ui="message-bubble">
        {quote && (
          <MessageQuote
            quote={quote}
            canJump={quoteCanJump}
            onJump={(id) => onJumpToMessage?.(id)}
          />
        )}
        <p data-ui="message-content" className="content">
          {message.content}
        </p>
      </div>
    );
  if (type === "voice") {
    const seconds = Number(payload["duration"]);
    const duration =
      Number.isFinite(seconds) && seconds > 0
        ? Math.min(600, Math.round(seconds))
        : voiceDuration(message.content);
    return (
      <div className="chat-voice" data-ui="voice-message">
        <button
          type="button"
          className="chat-voice__bar"
          data-ui="voice-toggle"
          aria-label={`${duration}秒语音，${transcriptOpen ? "收起" : "展开"}文字`}
          aria-expanded={transcriptOpen}
          aria-controls={`voice-transcript-${message.id}`}
          onClick={() => setTranscriptOpen((open) => !open)}
        >
          <AudioLines size={22} data-ui="voice-icon" aria-hidden="true" />
          <span data-ui="voice-duration">{duration}″</span>
        </button>
        {transcriptOpen && (
          <div
            id={`voice-transcript-${message.id}`}
            className="chat-voice__transcript"
            data-ui="voice-transcript"
          >
            {message.content}
          </div>
        )}
      </div>
    );
  }
  if (type === "image" || type === "sticker") {
    const width = Math.max(1, Number(payload["width"]) || 1);
    const height = Math.max(1, Number(payload["height"]) || 1);
    if (!url)
      return (
        <span
          data-ui="media-placeholder"
          className={`chat-media-placeholder ${type === "sticker" ? "is-sticker" : ""}`}
        >
          <ImageOff size={22} />
        </span>
      );
    return (
      <button
        type="button"
        className={`chat-media ${type === "sticker" ? "is-sticker" : ""}`}
        data-ui={type === "sticker" ? "sticker" : "chat-image"}
        onClick={() => onOpenImage(url, type === "sticker" ? "表情包" : "聊天图片")}
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {!loaded && type === "image" && <span className="chat-media-skeleton" />}
        <img
          src={url}
          alt={type === "sticker" ? "表情包" : "聊天图片"}
          loading="lazy"
          decoding="async"
          data-ui="media-image"
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
        data-ui="transfer-card"
        data-transfer-status={transfer.status}
        onClick={() => onOpenTransfer?.(message)}
        aria-label={`转账 ¥${transfer.amount.toFixed(2)} ${transferStatusLabel(transfer.status)}`}
      >
        <span className="transfer-message__icon" data-ui="transfer-icon">
          <ArrowDownLeft size={23} />
        </span>
        <div>
          <strong data-ui="transfer-amount">¥ {transfer.amount.toFixed(2)}</strong>
          <p data-ui="transfer-remark">{transfer.remark || "转账"}</p>
          <small data-ui="transfer-status">{transferStatusLabel(transfer.status)}</small>
        </div>
      </button>
    );
  }
  const duration = Number(payload["duration"] ?? 0);
  return (
    <div className="call-message" data-ui="voice-message" data-css-ui="call-message">
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
