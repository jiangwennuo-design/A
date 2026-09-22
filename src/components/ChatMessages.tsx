import {
  Fragment,
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { EmptyState } from "@/components/ui-kit";
import type { ChatMessage } from "@/lib/types";

interface Props {
  messages: ChatMessage[];
  sending: boolean;
  assistantAvatar: string;
  userAvatar: string;
  assistantName: string;
  userName: string;
  onOpenMessageMenu: (messageId: string, anchor: MessageAnchor) => void;
  onDismissMessageMenu: () => void;
}

export interface MessageAnchor {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
}

export const ChatMessages = memo(function ChatMessages({
  messages,
  sending,
  assistantAvatar,
  userAvatar,
  assistantName,
  userName,
  onOpenMessageMenu,
  onDismissMessageMenu,
}: Props) {
  const viewport = useRef<HTMLElement>(null);
  const [visibleCount, setVisibleCount] = useState(80);
  const preserveScroll = useRef<{ height: number; top: number } | null>(null);
  const lastId = messages.at(-1)?.id;
  const previousLastId = useRef<string | undefined>(undefined);
  const nearBottom = useRef(true);
  const pressTimer = useRef<number | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);

  function cancelLongPress() {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressOrigin.current = null;
  }

  function openMessageMenu(messageId: string, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    onOpenMessageMenu(messageId, {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
    });
  }

  function startLongPress(messageId: string, event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    cancelLongPress();
    pressOrigin.current = { x: event.clientX, y: event.clientY };
    const element = event.currentTarget;
    pressTimer.current = window.setTimeout(() => {
      openMessageMenu(messageId, element);
      navigator.vibrate?.(12);
      cancelLongPress();
    }, 460);
  }

  function moveLongPress(event: ReactPointerEvent<HTMLDivElement>) {
    const origin = pressOrigin.current;
    if (!origin) return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) cancelLongPress();
  }

  function openContextMenu(messageId: string, event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    cancelLongPress();
    openMessageMenu(messageId, event.currentTarget);
  }

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
        onDismissMessageMenu();
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
        const firstShownIndex = messages.length - shown.length;
        const previous = messages[firstShownIndex + index - 1];
        const gapMilliseconds = previous
          ? new Date(message.created_at).getTime() - new Date(previous.created_at).getTime()
          : 0;
        const showTimeSeparator = isUser && Boolean(previous) && gapMilliseconds >= 10 * 60_000;
        const grouped = previous?.role === message.role && gapMilliseconds < 5 * 60_000;
        return (
          <Fragment key={message.id}>
            {showTimeSeparator && (
              <time className="chat-time-separator" dateTime={message.created_at}>
                {formatMessageTimestamp(message.created_at)}
              </time>
            )}
            <div
              className={`chat-message-row message-enter ${isUser ? "is-user" : "is-char"} ${grouped ? "is-grouped" : ""}`}
            >
              <MessageAvatar
                url={isUser ? userAvatar : assistantAvatar}
                name={isUser ? userName : assistantName}
              />
              <div
                className="message-bubble"
                aria-label={`${isUser ? userName : assistantName}的消息，长按可操作`}
                onPointerDown={(event) => startLongPress(message.id, event)}
                onPointerMove={moveLongPress}
                onPointerUp={cancelLongPress}
                onPointerCancel={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onContextMenu={(event) => openContextMenu(message.id, event)}
              >
                <p>{message.content}</p>
              </div>
            </div>
          </Fragment>
        );
      })}
      {sending && (
        <div
          className="chat-message-row is-char message-enter"
          role="status"
          aria-label="角色正在回复"
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

function formatMessageTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const now = new Date();
  const dateText =
    date.getFullYear() === now.getFullYear()
      ? `${date.getMonth() + 1}月${date.getDate()}日`
      : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  const timeText = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${dateText} ${weekdays[date.getDay()]} ${timeText}`;
}
