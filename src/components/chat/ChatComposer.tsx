import { useEffect, useRef, type FormEvent } from "react";
import { ArrowUp, Plus, Reply, X } from "lucide-react";
import type { QuotedMessage } from "@/lib/types";

export function ChatComposer({
  value,
  disabled,
  canReply,
  replying,
  onChange,
  onSubmit,
  onAttachments,
  onReply,
  quote,
  onCancelQuote,
}: {
  value: string;
  disabled: boolean;
  canReply: boolean;
  replying: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onAttachments: () => void;
  onReply: () => void;
  quote?: QuotedMessage | null;
  onCancelQuote?: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 112)}px`;
  }, [value]);
  return (
    <form onSubmit={onSubmit} className="chat-composer chat-composer--system" data-ui="chat-footer">
      {quote && (
        <div className="chat-quote-preview" data-ui="chat-reply-preview" role="status">
          <div>
            <strong>引用 {quote.sender}</strong>
            <span>{quote.content}</span>
          </div>
          <button type="button" aria-label="取消引用" onClick={onCancelQuote}>
            <X size={16} />
          </button>
        </div>
      )}
      <button
        type="button"
        aria-label="附件"
        onClick={onAttachments}
        className="chat-composer__more"
        data-ui="chat-add"
      >
        <Plus size={19} />
      </button>
      <textarea
        ref={input}
        aria-label="消息内容"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="说点什么…"
        rows={1}
        className="chat-composer__input"
        data-ui="chat-input"
      />
      <button
        type="button"
        aria-label={replying ? "角色回复中" : "让角色回复"}
        title={replying ? "回复中" : "让角色回复"}
        disabled={!canReply || disabled}
        onClick={onReply}
        className={`chat-composer__reply ${replying ? "is-replying" : ""}`}
        data-ui="chat-reply"
      >
        <Reply size={18} />
      </button>
      <button
        disabled={disabled || !value.trim()}
        aria-label="发送消息"
        className="chat-composer__send"
        data-ui="chat-send"
      >
        <ArrowUp size={19} />
      </button>
    </form>
  );
}
