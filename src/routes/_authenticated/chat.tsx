import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  Copy,
  MoreHorizontal,
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
import type { AiPersona, ChatMessage, DiaryContextMode } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/chat")({
  validateSearch: z.object({ diary: z.string().optional() }),
  component: ChatPage,
});

function ChatPage() {
  const db = supabase as any;
  const { profile } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const { diary: initialDiaryId } = Route.useSearch();
  const send = useServerFn(sendPenpalMessage);
  const reroll = useServerFn(rerollPenpalTurn);
  const clear = useServerFn(clearCurrentChat);
  const [chars, setChars] = useState<AiPersona[]>([]);
  const [charId, setCharId] = useState("");
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
  const current = chars.find((item) => item.id === charId);

  const loadForChar = useCallback(
    async (selected: string, list = chars) => {
      if (!selected) return;
      setLoading(true);
      const { data: existing } = await db
        .from("chat_sessions")
        .select("*")
        .eq("char_id", selected)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let currentSession = existing;
      if (!currentSession) {
        const { data } = await db
          .from("chat_sessions")
          .insert({
            char_id: selected,
            diary_context_mode: initialDiaryId ? "current" : "none",
            context_diary_id: initialDiaryId ?? null,
          })
          .select("*")
          .single();
        currentSession = data;
      }
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
      setMessages((rows ?? []) as ChatMessage[]);
      setChars(list);
      setLoading(false);
    },
    [chars, db, initialDiaryId],
  );

  useEffect(() => {
    void (async () => {
      const { data } = await db
        .from("ai_personas")
        .select("*")
        .order("updated_at", { ascending: false });
      const list = (data ?? []) as AiPersona[];
      const saved = localStorage.getItem("current-char-id");
      const selected = list.find((item) => item.id === saved)?.id ?? list[0]?.id ?? "";
      setChars(list);
      setCharId(selected);
      if (selected) await loadForChar(selected, list);
      else setLoading(false);
    })();
  }, []);

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

  async function switchChar(id: string) {
    localStorage.setItem("current-char-id", id);
    setCharId(id);
    setMenu(null);
    await loadForChar(id);
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
  if (!chars.length)
    return (
      <div className="page-container">
        <EmptyState
          icon="✉️"
          title="先创建一位笔友"
          subtitle="笔友名录中的每一位都有独立聊天记录。"
        />
        <button onClick={() => navigate({ to: "/persona" })} className="btn-primary w-full mt-5">
          创建笔友
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
          aria-label="返回"
          onClick={() => router.history.back()}
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
        <select
          value={charId}
          disabled={sending}
          onChange={(event) => void switchChar(event.target.value)}
          className="flex-1 bg-transparent font-semibold text-center"
        >
          <option value="">选择笔友</option>
          {chars.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
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

function pause(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}
