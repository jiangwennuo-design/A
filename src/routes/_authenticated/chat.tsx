import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  Copy,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { clearCurrentChat, rerollPenpalTurn, sendPenpalMessage } from "@/lib/penpal.functions";
import { resolveAvatarUrl } from "@/lib/avatar";
import { EmptyState, LoadingSpinner } from "@/components/ui-kit";
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
    <ConversationPage charId={char} initialDiaryId={diary} />
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
    <div className="page-container !py-0 min-h-0">
      <header className="h-16 flex items-center justify-between border-b border-[var(--color-border)]">
        <div>
          <h1 className="text-xl font-semibold">聊天</h1>
          <p className="text-xs text-[var(--color-text-secondary)]">选择一位笔友开始聊天</p>
        </div>
        <button
          type="button"
          aria-label="新增聊天"
          onClick={() => setPickerOpen(true)}
          className="w-10 h-10 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center shadow-sm"
        >
          <Plus size={21} />
        </button>
      </header>

      {error && <p className="mt-3 text-sm text-[var(--color-error)]">{error}</p>}
      {friends.length ? (
        <main className="divide-y divide-[var(--color-border)]">
          {friends.map(({ persona, session, lastMessage }) => (
            <button
              key={session.id}
              type="button"
              onClick={() => void openChat(persona)}
              className="w-full py-4 flex items-center gap-3 text-left active:bg-white/70 transition-colors"
            >
              <FriendAvatar url={avatars[persona.id] ?? ""} label={persona.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-medium truncate">{persona.name}</h2>
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
            </button>
          ))}
        </main>
      ) : (
        <div className="pt-14">
          <EmptyState icon="💬" title="还没有聊天" subtitle="点击右上角加号，选择一位笔友。" />
        </div>
      )}

      {pickerOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/30 flex items-end justify-center"
          onClick={() => setPickerOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="选择笔友"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[480px] max-h-[72dvh] overflow-hidden rounded-t-3xl bg-[var(--color-bg)] shadow-2xl"
          >
            <div className="p-5 pb-3 flex items-center justify-between border-b">
              <div>
                <h2 className="text-lg font-semibold">选择笔友</h2>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  每位笔友都有独立聊天记录
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
                  <EmptyState icon="✉️" title="还没有笔友" subtitle="先创建一位笔友人设吧。" />
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/persona" })}
                    className="btn-primary w-full mt-4"
                  >
                    创建笔友
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
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
  const { profile } = useAuth();
  const navigate = useNavigate();
  const send = useServerFn(sendPenpalMessage);
  const reroll = useServerFn(rerollPenpalTurn);
  const clear = useServerFn(clearCurrentChat);
  const [current, setCurrent] = useState<AiPersona | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const [assistantAvatar, setAssistantAvatar] = useState("");
  const [userAvatar, setUserAvatar] = useState("");
  const [mode, setMode] = useState<DiaryContextMode>(initialDiaryId ? "current" : "none");
  const bottom = useRef<HTMLDivElement>(null);

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

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [messages, sending]);
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || !sessionId || !charId || sending) return;
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
    setSending(true);
    setError("");
    setMenu(null);
    setMessages((previous) => [...previous, optimisticMessage]);
    try {
      const result = await send({
        data: {
          message: text,
          session_id: sessionId,
          char_id: charId,
          diary_context_mode: mode,
          context_diary_id: initialDiaryId ?? null,
        },
      });
      const returned = result.messages as ChatMessage[];
      const savedUser = returned.find((message) => message.role === "user");
      if (savedUser) {
        setMessages((previous) =>
          previous.map((message) => (message.id === optimisticId ? savedUser : message)),
        );
      }
      await revealAssistantMessages(returned);
    } catch (reason) {
      setMessages((previous) => previous.filter((message) => message.id !== optimisticId));
      setInput((currentInput) => currentInput || text);
      setError(reason instanceof Error ? reason.message : "发送失败。");
    } finally {
      setSending(false);
    }
  }

  async function updateMessage(message: ChatMessage) {
    const content = prompt("编辑消息", message.content);
    if (content === null || !content.trim()) return;
    const { error: updateError } = await db
      .from("chat_messages")
      .update({ content: content.trim(), edited: true })
      .eq("id", message.id);
    if (updateError) return setError("编辑失败。");
    setMessages((previous) =>
      previous.map((item) =>
        item.id === message.id ? { ...item, content: content.trim(), edited: true } : item,
      ),
    );
    setMenu(null);
  }

  async function deleteMessage(message: ChatMessage) {
    if (!confirm("确定删除这条消息吗？")) return;
    const { error: deleteError } = await db.from("chat_messages").delete().eq("id", message.id);
    if (deleteError) return setError("删除失败。");
    setMessages((previous) => previous.filter((item) => item.id !== message.id));
    setMenu(null);
  }

  async function rerollTurn(turnId: string) {
    if (!sessionId || !charId || sending) return;
    const originalTurn = messages.filter((message) => message.turn_id === turnId);
    const insertionIndex = messages.findIndex((message) => message.turn_id === turnId);
    setMessages((previous) => previous.filter((message) => message.turn_id !== turnId));
    setSending(true);
    setMenu(null);
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
      !confirm(`确定清空与${current?.name ?? "当前笔友"}的全部聊天记录吗？此操作无法撤销。`)
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
          title="找不到这位笔友"
          subtitle="这位笔友可能已被删除，请返回聊天列表重新选择。"
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
    <div
      className="flex flex-col"
      style={{
        height: "calc(100dvh - 64px - env(safe-area-inset-bottom))",
        maxWidth: 480,
        margin: "0 auto",
      }}
    >
      <header className="px-4 py-3 border-b bg-[var(--color-bg)] flex items-center gap-2">
        <button
          type="button"
          aria-label="返回聊天列表"
          onClick={() => navigate({ to: "/chat", search: {} })}
          className="w-9 h-9 flex items-center justify-center"
        >
          ←
        </button>
        <div className="w-9 h-9 rounded-full overflow-hidden border border-[var(--color-border)] bg-white flex items-center justify-center">
          {assistantAvatar ? (
            <img
              src={assistantAvatar}
              alt={current?.name ?? "笔友"}
              className="w-full h-full object-cover"
            />
          ) : (
            <UserRound size={18} className="text-[var(--color-text-secondary)]" />
          )}
        </div>
        <h1 className="flex-1 font-semibold text-center truncate">{current.name}</h1>
        <button
          type="button"
          aria-label="聊天设置"
          onClick={() => setChatSettingsOpen(true)}
          className="w-9 h-9 flex items-center justify-center"
        >
          <Settings size={19} />
        </button>
      </header>

      {error && <p className="mx-4 mt-3 text-sm text-[var(--color-error)]">{error}</p>}
      <main className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.length === 0 && !sending ? (
          <EmptyState icon="✉️" title={`和${current?.name}聊聊`} subtitle="说点什么吧。" />
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`message-enter flex items-end gap-2 relative ${message.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <ChatAvatar
                url={message.role === "user" ? userAvatar : assistantAvatar}
                label={
                  message.role === "user" ? profile?.display_name || "我" : current?.name || "笔友"
                }
              />
              <div
                className={`flex items-center gap-1 max-w-[78%] ${message.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`message-bubble max-w-full ${message.role === "user" ? "bg-[var(--color-primary)] text-white" : "bg-white border border-[var(--color-border)]"}`}
                >
                  <p className="whitespace-pre-wrap text-[15px]">{message.content}</p>
                </div>
                <button
                  type="button"
                  aria-label="消息操作"
                  onClick={() => setMenu(menu === message.id ? null : message.id)}
                  className="shrink-0 self-center p-1 text-[var(--color-text-secondary)]"
                >
                  <MoreHorizontal size={15} />
                </button>
              </div>
              {menu === message.id && (
                <div
                  className={`absolute z-10 top-full mt-1 bg-white border rounded-xl shadow p-1 text-xs ${message.role === "user" ? "right-10" : "left-10"}`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      void navigator.clipboard.writeText(message.content).then(() => setMenu(null))
                    }
                    className="block px-3 py-2"
                  >
                    <Copy size={13} className="inline mr-1" />
                    复制
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateMessage(message)}
                    className="block px-3 py-2"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteMessage(message)}
                    className="block px-3 py-2 text-[var(--color-error)]"
                  >
                    <Trash2 size={13} className="inline mr-1" />
                    删除
                  </button>
                  {message.role === "assistant" && message.turn_id && (
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => void rerollTurn(message.turn_id!)}
                      className="block px-3 py-2"
                    >
                      <RefreshCw size={13} className="inline mr-1" />
                      重新生成本轮
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
        {sending && (
          <div
            className="message-enter flex items-end gap-2"
            role="status"
            aria-label="笔友正在回复"
          >
            <ChatAvatar url={assistantAvatar} label={current?.name || "笔友"} />
            <div className="message-bubble typing-bubble bg-white border border-[var(--color-border)]">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
        <div ref={bottom} />
      </main>

      <form onSubmit={submit} className="p-3 border-t bg-[var(--color-bg)] flex gap-2">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="说点什么…"
          className="input-field flex-1 resize-none"
          rows={1}
        />
        <button
          disabled={sending || !input.trim()}
          className="w-11 rounded-xl bg-[var(--color-primary)] text-white flex justify-center items-center"
        >
          <Send size={18} />
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
              编辑当前笔友与头像
            </button>
            <button
              type="button"
              disabled={sending || messages.length === 0}
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

function ChatAvatar({ url, label }: { url: string; label: string }) {
  return (
    <div className="chat-avatar" title={label} aria-label={label}>
      {url ? (
        <img src={url} alt={label} className="w-full h-full object-cover" />
      ) : (
        <span aria-hidden="true">{label.trim().slice(0, 1) || "友"}</span>
      )}
    </div>
  );
}

function FriendAvatar({ url, label }: { url: string; label: string }) {
  return (
    <div className="w-13 h-13 shrink-0 rounded-2xl overflow-hidden border border-[var(--color-border)] bg-white flex items-center justify-center text-lg font-semibold text-[var(--color-primary)]">
      {url ? (
        <img src={url} alt={label} className="w-full h-full object-cover" />
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
