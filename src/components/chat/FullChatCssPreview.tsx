import { ChatMessages } from "@/components/ChatMessages";
import { ChatComposer } from "./ChatComposer";
import type { ChatMessage } from "@/lib/types";

const image =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='60'%3E%3Crect width='80' height='60' fill='%23daeafa'/%3E%3C/svg%3E";
const messages = [
  {
    id: "preview-char",
    role: "assistant",
    content: "慢慢说，我在听。",
    message_type: "text",
    payload: {},
  },
  {
    id: "preview-user",
    role: "user",
    content: "想和你分享今天的小事。",
    message_type: "text",
    payload: {},
  },
  {
    id: "preview-quote",
    role: "user",
    content: "就是这句话。",
    message_type: "text",
    payload: {
      replyToMessageId: "preview-char",
      quotedMessage: {
        messageId: "preview-char",
        sender: "角色",
        role: "assistant",
        content: "慢慢说，我在听。",
        messageType: "text",
      },
    },
  },
  {
    id: "preview-transfer",
    role: "assistant",
    content: "",
    message_type: "transfer",
    payload: { amount: 20, note: "今天的奶茶" },
  },
  {
    id: "preview-image",
    role: "user",
    content: "",
    message_type: "image",
    payload: { local_preview_url: image, width: 80, height: 60 },
  },
  {
    id: "preview-sticker",
    role: "assistant",
    content: "",
    message_type: "sticker",
    payload: { local_preview_url: image, width: 80, height: 60 },
  },
  {
    id: "preview-call",
    role: "assistant",
    content: "",
    message_type: "call",
    payload: { status: "ended", duration: 30 },
  },
].map((message, i) => ({
  ...message,
  created_at: new Date(Date.UTC(2026, 0, 1, 12, i * 11)).toISOString(),
  message_order: 1,
  delivery_status: "sent",
  turn_id: null,
  user_id: "preview",
  session_id: "preview",
  diary_id: null,
  edited: false,
  updated_at: "2026-01-01T12:00:00Z",
})) as ChatMessage[];
const noop = () => {};

export function FullChatCssPreview({ scope, css }: { scope: string; css: string }) {
  return (
    <div className="full-chat-css-preview">
      <style>{css}</style>
      <div
        className="chat-conversation"
        data-full-chat-root={scope}
        data-ui="chat-page"
        data-css-ui="chat-screen chat-background"
      >
        <header className="chat-conversation__header" data-ui="chat-header">
          <button data-ui="chat-back" type="button">
            ‹
          </button>
          <div>
            <strong data-ui="chat-title">角色</strong>
            <small data-ui="chat-status">聊天</small>
          </div>
          <button type="button" data-ui="chat-settings">
            ⚙
          </button>
        </header>
        <ChatMessages
          messages={messages}
          showThinking={false}
          sending={false}
          assistantAvatar=""
          userAvatar=""
          assistantName="角色"
          userName="我"
          onOpenMessageMenu={noop}
          onDismissMessageMenu={noop}
          onOpenImage={noop}
          onRetry={noop}
        />
        <ChatComposer
          value=""
          disabled={false}
          canReply={true}
          replying={false}
          onChange={noop}
          onSubmit={(event) => event.preventDefault()}
          onAttachments={noop}
          onReply={noop}
        />
      </div>
    </div>
  );
}
