import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  House,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import {
  clearCurrentChat,
  queuePenpalMessage,
  requestPenpalReply,
  rerollPenpalTurn,
} from "@/lib/penpal.functions";
import { resolveAvatarUrl } from "@/lib/avatar";
import { EmptyState, LoadingSpinner } from "@/components/ui-kit";
import { ChatNav } from "@/components/ChatNav";
import { ChatMessages, type MessageAnchor } from "@/components/ChatMessages";
import { useKeyboardViewport } from "@/hooks/useKeyboardViewport";
import { lastReadAt, markChatRead } from "@/lib/chat-read-state";
import type { AiPersona, ChatMessage, ChatSession, DiaryContextMode } from "@/lib/types";

// The live schema includes multi-penpal migration fields not present in the generated client types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const Route = createFileRoute("/_authenticated/chat")({
  validateSearch: z.object({ diary: z.string().optional(), char: z.string().optional() }),
  component: ChatPage,
});

function ChatPage() {
  const { diary, char } = Route.useSearch();
  return char ? (
    <ConversationPage key={char} charId={char} initialDiaryId={diary} />
  ) : (
    <ChatFriendList initialDiaryId={diary} />
  );
}

interface FriendPreview {
  persona: AiPersona;
  session: ChatSession;
  lastMessage: ChatMessage | undefined;
}

function ChatFriendList({ initialDiaryId }: { initialDiaryId: string | undefined }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [personas, setPersonas] = useState<AiPersona[]>([]);
  const [friends, setFriends] = useState<FriendPreview[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const [{ data: personaRows }, { data: sessionRows }] = await Promise.all([
        db.from("ai_personas").select("*").order("updated_at", { ascending: false }),
        db.from("chat_sessions").select("*").order("updated_at", { ascending: false }),
      ]);
      if (!active) return;
      const nextPersonas = (personaRows ?? []) as AiPersona[];
      const personaById = new Map(nextPersonas.map((persona) => [persona.id, persona]));
      const latestByPersona = new Map<string, ChatSession>();
      for (const session of (sessionRows ?? []) as ChatSession[]) {
        if (
          session.char_id &&
          personaById.has(session.char_id) &&
          !latestByPersona.has(session.char_id)
        ) {
          latestByPersona.set(session.char_id, session);
        }
      }
      const sessions = [...latestByPersona.values()];
      let messageRows: ChatMessage[] = [];
      if (sessions.length) {
        const { data } = await db
          .from("chat_messages")
          .select("*")
          .in(
            "session_id",
            sessions.map((session) => session.id),
          )
          .order("created_at", { ascending: false })
          .limit(500);
        messageRows = (data ?? []) as ChatMessage[];
      }
      if (!active) return;
      const lastBySession = new Map<string, ChatMessage>();
      for (const message of messageRows) {
        if (!lastBySession.has(message.session_id)) lastBySession.set(message.session_id, message);
      }
      setPersonas(nextPersonas);
      setFriends(
        sessions.map((session) => ({
          session,
          persona: personaById.get(session.char_id!)!,
          lastMessage: lastBySession.get(session.id),
        })),
      );
      const resolved = await Promise.all(
        nextPersonas.map(async (persona) => [
          persona.id,
          await resolveAvatarUrl(persona.avatar_url),
        ]),
      );
      if (!active) return;
      setAvatars(Object.fromEntries(resolved));
      setLoading(false);
    })().catch((reason) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : "聊天列表加载失败。");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function openChat(persona: AiPersona) {
    if (adding) return;
    setAdding(persona.id);
    setError("");
    try {
      const existing = friends.find((friend) => friend.persona.id === persona.id);
      if (!existing) {
        const { error: insertError } = await db.from("chat_sessions").insert({
          char_id: persona.id,
          diary_context_mode: initialDiaryId ? "current" : "none",
          context_diary_id: initialDiaryId ?? null,
        });
        if (insertError) throw new Error("新增聊天失败，请稍后重试。");
      }
      localStorage.setItem("current-char-id", persona.id);
      await navigate({
        to: "/chat",
        search: initialDiaryId ? { char: persona.id, diary: initialDiaryId } : { char: persona.id },
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "新增聊天失败。");
      setAdding("");
    }
  }

  if (loading)
    return (
      <div className="page-container">
        <LoadingSpinner />
      </div>
    );

  return (
    <div className="chat-app chat-inbox">
      <header className="chat-inbox__toolbar">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="返回桌面"
            onClick={() => navigate({ to: "/" })}
            className="chat-icon-button"
          >
            <House size={18} />
          </button>
        </div>
        <button
          type="button"
          aria-label="新增聊天"
          onClick={() => setPickerOpen(true)}
          className="chat-icon-button chat-icon-button--accent"
        >
          <Plus size={21} />
        </button>
      </header>
      <div className="chat-inbox__heading">
        <h1>消息</h1>
        <p>与你在意的人，慢慢聊。</p>
      </div>
      <label className="chat-search">
        <Search size={18} />
        <input
          type="search"
          aria-label="搜索角色或消息"
          placeholder="搜索角色或消息"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {error && <p className="mt-3 text-sm text-[var(--color-error)]">{error}</p>}
      {friends.length ? (
        <main className="chat-friends">
          {friends
            .filter(({ persona, lastMessage }) =>
              `${persona.name} ${lastMessage?.content || ""}`
                .toLocaleLowerCase()
                .includes(query.trim().toLocaleLowerCase()),
            )
            .map(({ persona, session, lastMessage }) => (
              <button
                key={session.id}
                type="button"
                onClick={() => void openChat(persona)}
                className="chat-friend"
              >
                <FriendAvatar url={avatars[persona.id] ?? ""} label={persona.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold truncate">{persona.name}</h2>
                    <time className="shrink-0 text-[11px] text-[var(--color-text-secondary)]">
                      {formatChatTime(lastMessage?.created_at ?? session.updated_at)}
                    </time>
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)] truncate">
                    {lastMessage
                      ? `${lastMessage.role === "user" ? "我：" : ""}${lastMessage.content}`
                      : "点击开始聊天"}
                  </p>
                </div>
                {lastMessage?.role === "assistant" &&
                  user &&
                  new Date(lastMessage.created_at).getTime() > lastReadAt(user.id, session.id) && (
                    <span className="chat-unread" aria-label="本设备有未读消息" />
                  )}
                <ChevronRight size={15} className="chat-friend__chevron" />
              </button>
            ))}
        </main>
      ) : (
        <div className="pt-14">
          <EmptyState icon="💬" title="还没有聊天" subtitle="点击右上角加号，选择一位角色。" />
        </div>
      )}
      {friends.length > 0 &&
        query.trim() &&
        !friends.some(({ persona, lastMessage }) =>
          `${persona.name} ${lastMessage?.content || ""}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
        ) && <p className="chat-search-empty">没有找到相关聊天</p>}

      {pickerOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/30 flex items-end justify-center"
          onClick={() => setPickerOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="选择角色"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[480px] max-h-[72dvh] overflow-hidden rounded-t-3xl bg-[var(--color-bg)] shadow-2xl"
          >
            <div className="p-5 pb-3 flex items-center justify-between border-b">
              <div>
                <h2 className="text-lg font-semibold">选择角色</h2>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  每位角色都有独立聊天记录
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setPickerOpen(false)}
                className="w-9 h-9 rounded-full bg-white border flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto p-3 pb-[calc(16px+env(safe-area-inset-bottom))]">
              {personas.length ? (
                personas.map((persona) => {
                  const exists = friends.some((friend) => friend.persona.id === persona.id);
                  return (
                    <button
                      key={persona.id}
                      type="button"
                      disabled={Boolean(adding)}
                      onClick={() => void openChat(persona)}
                      className="w-full p-3 rounded-2xl flex items-center gap-3 text-left hover:bg-white disabled:opacity-50"
                    >
                      <FriendAvatar url={avatars[persona.id] ?? ""} label={persona.name} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{persona.name}</p>
                        <p className="text-xs text-[var(--color-text-secondary)] truncate">
                          {adding === persona.id
                            ? "正在打开…"
                            : exists
                              ? "已有聊天，点击进入"
                              : persona.relationship || persona.description || "新建聊天"}
                        </p>
                      </div>
                      <span className="text-[var(--color-primary)]">›</span>
                    </button>
                  );
                })
              ) : (
                <div className="p-3">
                  <EmptyState icon="✉️" title="还没有角色" subtitle="先创建一位角色吧。" />
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/persona" })}
                    className="btn-primary w-full mt-4"
                  >
                    创建角色
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
      <ChatNav />
    </div>
  );
}

function ConversationPage({
  charId,
  initialDiaryId,
}: {
  charId: string;
  initialDiaryId: string | undefined;
}) {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const queueMessage = useServerFn(queuePenpalMessage);
  const requestReply = useServerFn(requestPenpalReply);
  const reroll = useServerFn(rerollPenpalTurn);
  const clear = useServerFn(clearCurrentChat);
  const [current, setCurrent] = useState<AiPersona | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingMessage, setSavingMessage] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const [messageMenu, setMessageMenu] = useState<{
    messageId: string;
    left: number;
    top: number;
  } | null>(null);
  const [assistantAvatar, setAssistantAvatar] = useState("");
  const [userAvatar, setUserAvatar] = useState("");
  const [mode, setMode] = useState<DiaryContextMode>(initialDiaryId ? "current" : "none");
  const conversationRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useKeyboardViewport(conversationRef, !loading && Boolean(current));
  const { latestTurnId, hasPendingMessages } = useMemo(() => {
    const latestTurnId = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.turn_id)?.turn_id;
    const lastAssistantIndex = messages.map((message) => message.role).lastIndexOf("assistant");
    const hasPendingMessages = messages
      .slice(lastAssistantIndex + 1)
      .some((message) => message.role === "user" && !message.id.startsWith("pending-"));

    return { latestTurnId, hasPendingMessages };
  }, [messages]);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input, loading]);
  useEffect(() => {
    const latest = messages.at(-1);
    if (!user || !sessionId || !latest) return;
    const mark = () => {
      if (document.visibilityState === "visible")
        markChatRead(user.id, sessionId, latest.created_at);
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [messages, sessionId, user]);
  useEffect(() => {
    if (!messageMenu) return;
    const closeMenu = () => setMessageMenu(null);
    window.addEventListener("resize", closeMenu);
    return () => window.removeEventListener("resize", closeMenu);
  }, [messageMenu]);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError("");
      const { data: persona } = await db
        .from("ai_personas")
        .select("*")
        .eq("id", charId)
        .maybeSingle();
      if (!active) return;
      if (!persona) {
        setCurrent(null);
        setLoading(false);
        return;
      }
      setCurrent(persona as AiPersona);
      localStorage.setItem("current-char-id", charId);
      const { data: existing } = await db
        .from("chat_sessions")
        .select("*")
        .eq("char_id", charId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let currentSession = existing;
      if (!currentSession) {
        const { data } = await db
          .from("chat_sessions")
          .insert({
            char_id: charId,
            diary_context_mode: initialDiaryId ? "current" : "none",
            context_diary_id: initialDiaryId ?? null,
          })
          .select("*")
          .single();
        currentSession = data;
      }
      if (!active) return;
      if (!currentSession) {
        setError("无法创建聊天会话，请先完成数据库迁移。");
        setLoading(false);
        return;
      }
      setSessionId(currentSession.id);
      setMode(currentSession.diary_context_mode);
      const { data: rows } = await db
        .from("chat_messages")
        .select("*")
        .eq("session_id", currentSession.id)
        .order("created_at", { ascending: true })
        .order("message_order", { ascending: true });
      if (!active) return;
      setMessages((rows ?? []) as ChatMessage[]);
      setLoading(false);
    })().catch((reason) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : "聊天加载失败。");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [charId, initialDiaryId]);

  useEffect(() => {
    let active = true;
    void resolveAvatarUrl(current?.avatar_url).then((url) => {
      if (active) setAssistantAvatar(url);
    });
    return () => {
      active = false;
    };
  }, [current?.avatar_url]);
  useEffect(() => {
    let active = true;
    void resolveAvatarUrl(profile?.avatar_url).then((url) => {
      if (active) setUserAvatar(url);
    });
    return () => {
      active = false;
    };
  }, [profile?.avatar_url]);

  async function revealAssistantMessages(nextMessages: ChatMessage[], insertionIndex?: number) {
    const ordered = [...nextMessages]
      .filter((message) => message.role === "assistant")
      .sort((a, b) => a.message_order - b.message_order);
    for (let index = 0; index < ordered.length; index += 1) {
      if (index > 0) await pause(480);
      const message = ordered[index]!;
      setMessages((previous) => {
        if (insertionIndex === undefined) return [...previous, message];
        const updated = [...previous];
        updated.splice(Math.min(insertionIndex + index, updated.length), 0, message);
        return updated;
      });
    }
  }

  async function changeMode(nextMode: DiaryContextMode) {
    setMode(nextMode);
    if (sessionId)
      await db.from("chat_sessions").update({ diary_context_mode: nextMode }).eq("id", sessionId);
  }

  function openMessageMenu(messageId: string, anchor: MessageAnchor) {
    if (messageId.startsWith("pending-")) return;
    const menuWidth = 196;
    const menuHeight = 46;
    const margin = 10;
    const shell = conversationRef.current?.getBoundingClientRect();
    const leftBoundary = (shell?.left ?? 0) + margin;
    const rightBoundary = (shell?.right ?? window.innerWidth) - margin;
    const centeredLeft = anchor.left + anchor.width / 2 - menuWidth / 2;
    const left = Math.min(rightBoundary - menuWidth, Math.max(leftBoundary, centeredLeft));
    const topBoundary = (shell?.top ?? 0) + 72;
    const top =
      anchor.top - menuHeight - 8 >= topBoundary ? anchor.top - menuHeight - 8 : anchor.bottom + 8;
    setMessageMenu({ messageId, left, top });
  }

  async function copyMessage(message: ChatMessage) {
    setMessageMenu(null);
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      setError("复制失败，请稍后重试。");
    }
  }

  async function updateMessage(message: ChatMessage) {
    setMessageMenu(null);
    const content = window.prompt("编辑消息", message.content)?.trim();
    if (!content || content === message.content) return;
    const updatedAt = new Date().toISOString();
    const { error: updateError } = await db
      .from("chat_messages")
      .update({ content, edited: true, updated_at: updatedAt })
      .eq("id", message.id)
      .eq("session_id", sessionId);
    if (updateError) {
      setError("编辑失败，请稍后重试。");
      return;
    }
    setMessages((previous) =>
      previous.map((item) =>
        item.id === message.id ? { ...item, content, edited: true, updated_at: updatedAt } : item,
      ),
    );
  }

  async function deleteMessage(message: ChatMessage) {
    setMessageMenu(null);
    if (!window.confirm("确定删除这条消息吗？")) return;
    const { error: deleteError } = await db
      .from("chat_messages")
      .delete()
      .eq("id", message.id)
      .eq("session_id", sessionId);
    if (deleteError) {
      setError("删除失败，请稍后重试。");
      return;
    }
    setMessages((previous) => previous.filter((item) => item.id !== message.id));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || !sessionId || !charId || savingMessage || sending) return;
    const text = input.trim();
    const now = new Date().toISOString();
    const optimisticId = `pending-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      session_id: sessionId,
      user_id: profile?.id ?? "",
      role: "user",
      content: text,
      turn_id: null,
      message_order: 0,
      edited: false,
      created_at: now,
      updated_at: now,
    };
    setInput("");
    setSavingMessage(true);
    setError("");
    setToolsOpen(false);
    setMessageMenu(null);
    setMessages((previous) => [...previous, optimisticMessage]);
    try {
      const result = await queueMessage({
        data: {
          message: text,
          session_id: sessionId,
          char_id: charId,
        },
      });
      const savedUser = result.message as ChatMessage;
      setMessages((previous) =>
        previous.map((message) => (message.id === optimisticId ? savedUser : message)),
      );
    } catch (reason) {
      setMessages((previous) => previous.filter((message) => message.id !== optimisticId));
      setInput((currentInput) => currentInput || text);
      setError(reason instanceof Error ? reason.message : "发送失败。");
    } finally {
      setSavingMessage(false);
    }
  }

  async function triggerReply() {
    if (!sessionId || !charId || sending || savingMessage || !hasPendingMessages) return;
    setSending(true);
    setError("");
    setToolsOpen(false);
    setMessageMenu(null);
    try {
      const result = await requestReply({
        data: {
          session_id: sessionId,
          char_id: charId,
          diary_context_mode: mode,
          context_diary_id: initialDiaryId ?? null,
        },
      });
      await revealAssistantMessages(result.messages as ChatMessage[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "回复失败，请稍后重试。");
    } finally {
      setSending(false);
    }
  }

  async function rerollTurn(turnId: string) {
    if (!sessionId || !charId || sending || savingMessage) return;
    const originalTurn = messages.filter((message) => message.turn_id === turnId);
    const insertionIndex = messages.findIndex((message) => message.turn_id === turnId);
    setMessages((previous) => previous.filter((message) => message.turn_id !== turnId));
    setSending(true);
    setToolsOpen(false);
    setMessageMenu(null);
    setError("");
    try {
      const result = await reroll({
        data: {
          session_id: sessionId,
          char_id: charId,
          turn_id: turnId,
          diary_context_mode: mode,
          context_diary_id: initialDiaryId ?? null,
        },
      });
      await revealAssistantMessages(result.messages as ChatMessage[], Math.max(insertionIndex, 0));
    } catch (reason) {
      setMessages((previous) => {
        const restored = [...previous];
        restored.splice(Math.max(insertionIndex, 0), 0, ...originalTurn);
        return restored;
      });
      setError(reason instanceof Error ? reason.message : "重新生成失败，原回复仍保留。");
    } finally {
      setSending(false);
    }
  }

  async function clearChat() {
    if (
      !sessionId ||
      !charId ||
      sending ||
      savingMessage ||
      !confirm(`确定清空与${current?.name ?? "当前角色"}的全部聊天记录吗？此操作无法撤销。`)
    )
      return;
    setSending(true);
    try {
      await clear({ data: { session_id: sessionId, char_id: charId } });
      setMessages([]);
      setChatSettingsOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "清空失败。");
    } finally {
      setSending(false);
    }
  }

  if (loading)
    return (
      <div className="page-container">
        <LoadingSpinner />
      </div>
    );
  if (!current)
    return (
      <div className="page-container">
        <EmptyState
          icon="✉️"
          title="找不到这位角色"
          subtitle="这位角色可能已被删除，请返回聊天列表重新选择。"
        />
        <button
          onClick={() => navigate({ to: "/chat", search: {} })}
          className="btn-primary w-full mt-5"
        >
          返回聊天列表
        </button>
      </div>
    );

  return (
    <div ref={conversationRef} className="chat-app chat-conversation">
      <header className="chat-conversation__header">
        <button
          type="button"
          aria-label="返回聊天列表"
          onClick={() => navigate({ to: "/chat", search: {} })}
          className="chat-header-back"
        >
          <ChevronLeft size={26} strokeWidth={1.8} />
          <span>消息</span>
        </button>
        <div className="chat-conversation__contact">
          <div className="chat-header-avatar">
            {assistantAvatar ? (
              <img
                src={assistantAvatar}
                alt={current?.name ?? "角色"}
                className="w-full h-full object-cover"
              />
            ) : (
              <UserRound size={18} className="text-[var(--color-text-secondary)]" />
            )}
          </div>
          <div className="chat-conversation__identity">
            <h1>{current.name}</h1>
            {sending && <p>正在回复…</p>}
          </div>
        </div>
        <button
          type="button"
          aria-label="聊天设置"
          onClick={() => setChatSettingsOpen(true)}
          className="chat-icon-button"
        >
          <Settings size={19} />
        </button>
      </header>

      {error && <p className="mx-4 mt-3 text-sm text-[var(--color-error)]">{error}</p>}
      <ChatMessages
        messages={messages}
        sending={sending}
        assistantAvatar={assistantAvatar}
        userAvatar={userAvatar}
        assistantName={current.name}
        userName={profile?.display_name || "我"}
        onOpenMessageMenu={openMessageMenu}
        onDismissMessageMenu={() => setMessageMenu(null)}
      />

      {messageMenu &&
        (() => {
          const selected = messages.find((message) => message.id === messageMenu.messageId);
          if (!selected) return null;
          return (
            <div className="chat-message-menu-backdrop" onPointerDown={() => setMessageMenu(null)}>
              <div
                role="menu"
                aria-label="消息操作"
                className="chat-message-menu"
                style={{ left: messageMenu.left, top: messageMenu.top }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <button type="button" role="menuitem" onClick={() => void copyMessage(selected)}>
                  <Copy size={15} />
                  <span>复制</span>
                </button>
                <button type="button" role="menuitem" onClick={() => void updateMessage(selected)}>
                  <Pencil size={15} />
                  <span>编辑</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  onClick={() => void deleteMessage(selected)}
                >
                  <Trash2 size={15} />
                  <span>删除</span>
                </button>
              </div>
            </div>
          );
        })()}

      <form onSubmit={submit} className="chat-composer">
        {toolsOpen && (
          <div className="absolute z-20 left-3 bottom-[calc(100%+8px)] min-w-48 rounded-2xl border bg-white p-2 shadow-xl slide-up">
            <button
              type="button"
              disabled={!latestTurnId || sending || savingMessage}
              onClick={() => latestTurnId && void rerollTurn(latestTurnId)}
              className="w-full px-3 py-3 rounded-xl flex items-center gap-2 text-left disabled:opacity-40 hover:bg-[var(--color-bg)]"
            >
              <RefreshCw size={17} />
              <span>重新生成本轮</span>
            </button>
          </div>
        )}
        <button
          type="button"
          aria-label="更多聊天功能"
          aria-expanded={toolsOpen}
          onClick={() => setToolsOpen((open) => !open)}
          className="chat-composer__more"
        >
          <Plus size={19} className={`transition-transform ${toolsOpen ? "rotate-45" : ""}`} />
        </button>
        <textarea
          ref={inputRef}
          aria-label="消息内容"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onFocus={() => setToolsOpen(false)}
          placeholder="说点什么…"
          className="chat-composer__input"
          rows={1}
        />
        <button
          disabled={savingMessage || sending || !input.trim()}
          aria-label="发送消息"
          className="chat-composer__send"
        >
          <ArrowUp size={20} strokeWidth={2.4} />
        </button>
        <button
          type="button"
          disabled={!hasPendingMessages || savingMessage || sending}
          onClick={() => void triggerReply()}
          className="chat-composer__reply"
        >
          {sending ? "回复中" : "回复"}
        </button>
      </form>

      {chatSettingsOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/30 flex items-end justify-center"
          onClick={() => setChatSettingsOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="聊天设置"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[480px] rounded-t-3xl bg-[var(--color-bg)] p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-2xl"
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold">聊天设置</h2>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{current?.name}</p>
              </div>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setChatSettingsOpen(false)}
                className="w-9 h-9 rounded-full bg-white border flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>
            <label className="block text-sm font-medium mb-4">
              日记读取权限
              <select
                value={mode}
                onChange={(event) => void changeMode(event.target.value as DiaryContextMode)}
                className="input-field mt-2"
              >
                <option value="none">不读取日记</option>
                <option value="current">读取当前日记</option>
                <option value="recent">读取最近日记</option>
                <option value="all">读取全部日记</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => navigate({ to: "/persona" })}
              className="btn-secondary w-full mb-3"
            >
              编辑当前角色与头像
            </button>
            <button
              type="button"
              disabled={sending || savingMessage || messages.length === 0}
              onClick={() => void clearChat()}
              className="w-full py-3 rounded-xl border border-[var(--color-error)] text-[var(--color-error)] disabled:opacity-40"
            >
              清空当前对话
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

function FriendAvatar({ url, label }: { url: string; label: string }) {
  return (
    <div className="chat-friend-avatar">
      {url ? (
        <img
          src={url}
          alt={label}
          width={54}
          height={54}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{label.trim().slice(0, 1) || "友"}</span>
      )}
    </div>
  );
}

function formatChatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function pause(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}
