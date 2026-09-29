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
      <strong>{quote.sender}</strong>
      <span>{quote.content}</span>
    </button>
  );
}
