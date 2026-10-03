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
import { EmptyState, LoadingSpinner } from "@/components/ui-kit";
import type { ChatMessage } from "@/lib/types";
import type { AvatarDisplayMode } from "@/lib/character-chat";
import { MessageContent } from "@/components/chat/MessageContent";
import { readQuotedMessage } from "@/lib/chat-quote";
import { MessageQuote } from "@/components/chat/MessageQuote";

interface Props {
  loading?: boolean;
  selectedMessageIds?: Set<string> | null;
  onToggleMessageSelection?: (id: string) => void;
  avatarDisplayMode?: AvatarDisplayMode;
  wallpaperUrl?: string;
  messages: ChatMessage[];
  showThinking: boolean;
  sending: boolean;
  assistantAvatar: string;
  userAvatar: string;
  assistantName: string;
  userName: string;
  onOpenMessageMenu: (messageId: string, anchor: MessageAnchor) => void;
  onDismissMessageMenu: () => void;
  onOpenImage: (url: string, alt: string) => void;
  onOpenTransfer?: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
}

export interface MessageAnchor {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
}

export const ChatMessages = memo(function ChatMessages({
  loading = false,
  selectedMessageIds = null,
  onToggleMessageSelection,
  avatarDisplayMode = "simple",
  wallpaperUrl,
  messages,
  showThinking,
  sending,
  assistantAvatar,
  userAvatar,
  assistantName,
  userName,
  onOpenMessageMenu,
  onDismissMessageMenu,
  onOpenImage,
  onOpenTransfer,
  onRetry,
}: Props) {
  const viewport = useRef<HTMLElement>(null);
  const [visibleCount, setVisibleCount] = useState(80);
  const preserveScroll = useRef<{ height: number; top: number } | null>(null);
  const lastId = messages.at(-1)?.id;
  const previousLastId = useRef<string | undefined>(undefined);
  const nearBottom = useRef(true);
  const pressTimer = useRef<number | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);

  function jumpToMessage(id: string) {
    const index = messages.findIndex((message) => message.id === id);
    if (index < 0) return;
    preserveScroll.current = null;
    setVisibleCount((count) => Math.max(count, messages.length - index));
    setJumpTarget(id);
  }

  useLayoutEffect(() => {
    if (!jumpTarget) return;
    const target = Array.from(
      viewport.current?.querySelectorAll<HTMLElement>("[data-message-id]") ?? [],
    ).find((element) => element.dataset["messageId"] === jumpTarget);
    if (target) {
      target.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
      setJumpTarget(null);
    }
  }, [jumpTarget, visibleCount]);

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
    if (selectedMessageIds) return;
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
    if (selectedMessageIds) return;
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
      data-ui="chat-messages"
      data-css-ui="chat-background"
      style={
        wallpaperUrl
          ? {
              backgroundImage: `url(${JSON.stringify(wallpaperUrl)})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }
          : undefined
      }
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
          data-ui="history-button"
          onClick={() => {
            const el = viewport.current!;
            preserveScroll.current = { height: el.scrollHeight, top: el.scrollTop };
            setVisibleCount((count) => count + 80);
          }}
        >
          查看更早的消息
        </button>
      )}
      {loading && <LoadingSpinner />}
      {messages.length === 0 && !sending && !loading && (
        <EmptyState icon="✉️" title={`和${assistantName}聊聊`} subtitle="慢慢说，我在这里。" />
      )}
      {messages.slice(-visibleCount).map((message, index, shown) => {
        const quote = readQuotedMessage(message.payload);
        const quoteCanJump = Boolean(quote && messages.some((item) => item.id === quote.messageId));
        const isUser = message.role === "user";
        const firstShownIndex = messages.length - shown.length;
        const previous = messages[firstShownIndex + index - 1];
        const gapMilliseconds = previous
          ? new Date(message.created_at).getTime() - new Date(previous.created_at).getTime()
          : 0;
        const showTimeSeparator = Boolean(previous) && gapMilliseconds >= 10 * 60_000;
        const grouped = previous?.role === message.role && gapMilliseconds < 5 * 60_000;
        return (
          <Fragment key={message.id}>
            {showTimeSeparator && (
              <time
                className="chat-time-separator"
                data-ui="timestamp"
                dateTime={message.created_at}
              >
                {formatMessageTimestamp(message.created_at)}
              </time>
            )}
            <div
              data-message-id={message.id}
              data-ui="message"
              data-role={isUser ? "user" : "char"}
              data-message-type={message.message_type ?? "text"}
              className={`chat-message-row message-enter ${isUser ? "is-user user" : "is-char ai"} ${grouped ? "is-grouped" : ""}`}
            >
              {selectedMessageIds && (
                <input
                  type="checkbox"
                  className="chat-message-select"
                  data-ui="message-selection"
                  aria-label={`选择${isUser ? userName : assistantName}的消息`}
                  checked={selectedMessageIds.has(message.id)}
                  disabled={message.id.startsWith("pending-")}
                  onChange={() => onToggleMessageSelection?.(message.id)}
                />
              )}
              <MessageAvatar
                alwaysVisible={avatarDisplayMode === "qq"}
                url={isUser ? userAvatar : assistantAvatar}
                name={isUser ? userName : assistantName}
              />
              <div
                className="message-content-wrapper message-wrapper"
                data-ui="message-wrapper"
                aria-label={`${isUser ? userName : assistantName}的消息，长按可操作`}
                onPointerDown={(event) => startLongPress(message.id, event)}
                onPointerMove={moveLongPress}
                onPointerUp={cancelLongPress}
                onPointerCancel={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onContextMenu={(event) => openContextMenu(message.id, event)}
                onClickCapture={
                  selectedMessageIds
                    ? (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!message.id.startsWith("pending-"))
                          onToggleMessageSelection?.(message.id);
                      }
                    : undefined
                }
              >
                {!isUser &&
                  showThinking &&
                  message.message_order === 1 &&
                  typeof (message.payload as Record<string, unknown>)["thinking"] === "string" && (
                    <details
                      className="chat-thinking"
                      data-ui="thinking"
                      onPointerDown={(event) => event.stopPropagation()}
                      onContextMenu={(event) => event.stopPropagation()}
                    >
                      <summary data-ui="thinking-toggle">思考</summary>
                      <div className="chat-thinking__content" data-ui="thinking-content">
                        {(message.payload as Record<string, unknown>)["thinking_source"] ===
                          "nuojiji" && <span className="chat-thinking-source">@糯叽机</span>}
                        {(message.payload as Record<string, unknown>)["thinking"] as string}
                      </div>
                    </details>
                  )}
                {quote && (message.message_type ?? "text") !== "text" && (
                  <MessageQuote quote={quote} canJump={quoteCanJump} onJump={jumpToMessage} />
                )}
                <MessageContent
                  message={message}
                  quoteCanJump={quoteCanJump}
                  onJumpToMessage={jumpToMessage}
                  onOpenImage={onOpenImage}
                  onOpenTransfer={onOpenTransfer}
                />
              </div>
              {message.delivery_status === "failed" && (
                <button
                  type="button"
                  className="chat-message-retry"
                  data-ui="message-retry"
                  onClick={() => onRetry(message)}
                >
                  发送失败 · 点击重试
                </button>
              )}
              {message.delivery_status === "sending" && (
                <span className="chat-message-sending" data-ui="system-message">
                  发送中…
                </span>
              )}
            </div>
          </Fragment>
        );
      })}
      {sending && (
        <div
          className="chat-message-row is-char message-enter"
          data-ui="message"
          data-role="char"
          role="status"
          aria-label="角色正在回复"
        >
          <MessageAvatar url={assistantAvatar} name={assistantName} />
          <div
            className="message-bubble typing-bubble"
            data-ui="system-message"
            data-css-ui="typing-indicator"
          >
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        </div>
      )}
    </main>
  );
});

export function MessageAvatar({
  url,
  name,
  alwaysVisible = false,
}: {
  url: string;
  name: string;
  alwaysVisible?: boolean;
}) {
  return (
    <div
      className="chat-avatar"
      data-ui="message-avatar"
      data-css-ui="avatar"
      title={name}
      style={alwaysVisible ? { visibility: "visible" } : undefined}
    >
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
