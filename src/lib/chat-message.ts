import type { ChatMessage, ChatMessagePayload, MessageType } from "./types";

// Voice is a text presentation. Database rows remain compatible with text-only schemas/RPCs.
export function messageDisplayType(message: {
  message_type?: MessageType;
  payload?: unknown;
}): MessageType {
  const payload = message.payload as Record<string, unknown> | undefined;
  return (!message.message_type || message.message_type === "text") &&
    payload?.["display_type"] === "voice"
    ? "voice"
    : (message.message_type ?? "text");
}

export function normalizeChatMessage(
  row: Partial<ChatMessage> &
    Pick<ChatMessage, "id" | "session_id" | "user_id" | "role" | "content" | "created_at">,
): ChatMessage {
  return {
    ...row,
    turn_id: row.turn_id ?? null,
    message_order: row.message_order ?? 0,
    edited: row.edited ?? false,
    updated_at: row.updated_at ?? row.created_at,
    message_type: messageDisplayType(row),
    payload: (row.payload && typeof row.payload === "object"
      ? row.payload
      : {}) as ChatMessagePayload,
    delivery_status: row.delivery_status ?? "sent",
  };
}

export function messagePreview(message?: ChatMessage) {
  if (!message) return "点击开始聊天";
  const labels: Record<MessageType, string> = {
    text: message.content,
    image: "[图片]",
    sticker: "[表情]",
    transfer: "[转账]",
    call: "[语音通话]",
    voice: "[语音]",
  };
  return labels[messageDisplayType(message)];
}

// A reading-time estimate, not an audio recording. Persist seconds alongside text.
export function voiceDuration(text: string) {
  return Math.min(600, Math.max(1, Math.ceil(Array.from(text.replace(/\s/g, "")).length / 4)));
}

export function formatCallDuration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
