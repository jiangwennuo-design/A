import { useEffect, useRef, type FormEvent } from "react";
import { ArrowUp, Plus, Smile } from "lucide-react";

export function ChatComposer({
  value,
  disabled,
  canReply,
  replying,
  onChange,
  onSubmit,
  onAttachments,
  onStickers,
  onReply,
}: {
  value: string;
  disabled: boolean;
  canReply: boolean;
  replying: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onAttachments: () => void;
  onStickers: () => void;
  onReply: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 112)}px`;
  }, [value]);
  return (
    <form onSubmit={onSubmit} className="chat-composer chat-composer--system">
      <button
        type="button"
        aria-label="附件"
        onClick={onAttachments}
        className="chat-composer__more"
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
      />
      <button
        type="button"
        aria-label="表情包"
        onClick={onStickers}
        className="chat-composer__emoji"
      >
        <Smile size={19} />
      </button>
      <button
        disabled={disabled || !value.trim()}
        aria-label="发送消息"
        className="chat-composer__send"
      >
        <ArrowUp size={19} />
      </button>
      <button
        type="button"
        disabled={!canReply || disabled}
        onClick={onReply}
        className="chat-composer__reply"
      >
        {replying ? "回复中" : "回复"}
      </button>
    </form>
  );
}
