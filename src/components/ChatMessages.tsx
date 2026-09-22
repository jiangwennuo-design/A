import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/ui-kit";
import type { ChatMessage } from "@/lib/types";

interface Props {
  messages: ChatMessage[];
  sending: boolean;
  assistantAvatar: string;
  userAvatar: string;
  assistantName: string;
  userName: string;
  onSelect: (id: string) => void;
}

export const ChatMessages = memo(function ChatMessages({
  messages,
  sending,
  assistantAvatar,
  userAvatar,
  assistantName,
  userName,
  onSelect,
}: Props) {
  const viewport = useRef<HTMLElement>(null);
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [visibleCount, setVisibleCount] = useState(80);
  const preserveScroll = useRef<{ height: number; top: number } | null>(null);
  const lastId = messages.at(-1)?.id;
  const previousLastId = useRef<string | undefined>(undefined);
  const nearBottom = useRef(true);

  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const saved = preserveScroll.current;
    if (saved) {
      el.scrollTop = saved.top + el.scrollHeight - saved.height;
      preserveScroll.current = null;
    }
  }, [visibleCount]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    if (nearBottom.current || previousLastId.current === undefined) el.scrollTop = el.scrollHeight;
    previousLastId.current = lastId;
  }, [lastId, sending]);

  return (
    <main
      ref={viewport}
      className="chat-message-list"
      aria-label="聊天消息"
      onScroll={() => {
        const el = viewport.current!;
        nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      }}
    >
      {messages.length > visibleCount && (
        <button
          type="button"
          className="chat-history-button"
          onClick={() => {
            const el = viewport.current!;
            preserveScroll.current = { height: el.scrollHeight, top: el.scrollTop };
            setVisibleCount((count) => count + 80);
          }}
        >
          查看更早的消息
        </button>
      )}
      {messages.length === 0 && !sending && (
        <EmptyState icon="✉️" title={`和${assistantName}聊聊`} subtitle="慢慢说，我在这里。" />
      )}
      {messages.slice(-visibleCount).map((message, index, shown) => {
        const isUser = message.role === "user";
        const previous = shown[index - 1];
        const grouped =
          previous?.role === message.role &&
          new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() <
            5 * 60_000;
        return (
          <div
            key={message.id}
            className={`chat-message-row message-enter ${isUser ? "is-user" : "is-char"} ${grouped ? "is-grouped" : ""}`}
          >
            <MessageAvatar
              url={isUser ? userAvatar : assistantAvatar}
              name={isUser ? userName : assistantName}
            />
            <div
              role="button"
              tabIndex={0}
              aria-label="长按打开消息操作"
              className="message-bubble"
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                cancel();
                origin.current = { x: event.clientX, y: event.clientY };
                timer.current = window.setTimeout(() => {
                  onSelect(message.id);
                  cancel();
                  navigator.vibrate?.(12);
                }, 480);
              }}
              onPointerUp={cancel}
              onPointerCancel={cancel}
              onPointerLeave={cancel}
              onPointerMove={(event) => {
                if (
                  origin.current &&
                  Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) >
                    10
                )
                  cancel();
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                cancel();
                onSelect(message.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(message.id);
                }
              }}
            >
              <p>{message.content}</p>
            </div>
          </div>
        );
      })}
      {sending && (
        <div
          className="chat-message-row is-char message-enter"
          role="status"
          aria-label="笔友正在回复"
        >
          <MessageAvatar url={assistantAvatar} name={assistantName} />
          <div className="message-bubble typing-bubble">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        </div>
      )}
    </main>
  );
});

function MessageAvatar({ url, name }: { url: string; name: string }) {
  return (
    <div className="chat-avatar" title={name}>
      {url ? (
        <img src={url} alt={name} width={30} height={30} loading="lazy" decoding="async" />
      ) : (
        <span aria-hidden="true">{name.slice(0, 1)}</span>
      )}
    </div>
  );
}
