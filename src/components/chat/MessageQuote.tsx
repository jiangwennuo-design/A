import type { QuotedMessage } from "@/lib/types";

export function MessageQuote({
  quote,
  canJump,
  onJump,
}: {
  quote: QuotedMessage;
  canJump: boolean;
  onJump: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="chat-quote-block"
      data-ui="message-quote"
      data-css-ui="quoted-message"
      disabled={!canJump}
      aria-label={`引用 ${quote.sender}：${quote.content}${canJump ? "，定位原消息" : "，原消息已删除"}`}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (canJump) onJump(quote.messageId);
      }}
    >
      <strong data-ui="quoted-sender">{quote.sender}</strong>
      <span data-ui="quoted-content">{quote.content}</span>
    </button>
  );
}
