import { useState, useEffect, useRef, useCallback, type FormEvent } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { sendPenpalMessage } from "@/lib/penpal.functions";
import { useAuth } from "@/context/AuthContext";
import { LoadingSpinner, EmptyState } from "@/components/ui-kit";
import type { ChatMessage, DiaryContextMode } from "@/lib/types";
import { Send, Settings } from "lucide-react";

export const Route = createFileRoute("/_authenticated/chat")({
  validateSearch: z.object({ diary: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "和笔友聊聊 · 此心一笺" },
      { name: "description", content: "和你设定的 AI 笔友聊天，并自由决定它能读哪些日记。" },
      { property: "og:title", content: "和笔友聊聊 · 此心一笺" },
      {
        property: "og:description",
        content: "和你设定的 AI 笔友聊天，并自由决定它能读哪些日记。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const { diary: initialDiaryId } = Route.useSearch();
  const { session } = useAuth();
  const sendMessage = useServerFn(sendPenpalMessage);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [contextMode, setContextMode] = useState<DiaryContextMode>("none");
  const [contextDiaryId, setContextDiaryId] = useState<string | null>(initialDiaryId ?? null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const initSession = useCallback(async () => {
    const { data: existingSession } = await supabase
      .from("chat_sessions")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let sid: string;

    if (existingSession) {
      sid = existingSession.id;
      setSessionId(sid);
      const mode = existingSession.diary_context_mode as DiaryContextMode;
      setContextMode(mode);
      setContextDiaryId(existingSession.context_diary_id);

      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("session_id", sid)
        .order("created_at", { ascending: true });
      setMessages((msgs ?? []) as ChatMessage[]);
    } else {
      const initialMode: DiaryContextMode = initialDiaryId ? "current" : "none";
      const { data: newSession, error } = await supabase
        .from("chat_sessions")
        .insert({
          diary_context_mode: initialMode,
          context_diary_id: initialDiaryId ?? null,
        })
        .select("*")
        .single();

      if (error || !newSession) {
        setLoading(false);
        return;
      }
      sid = newSession.id;
      setSessionId(sid);
      setContextMode(initialMode);
    }

    setLoading(false);
  }, [initialDiaryId]);

  useEffect(() => {
    void initSession();
  }, [initSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function updateContextMode(mode: DiaryContextMode, diaryId: string | null = null) {
    setContextMode(mode);
    setContextDiaryId(diaryId);
    setShowContextMenu(false);

    if (sessionId) {
      await supabase
        .from("chat_sessions")
        .update({ diary_context_mode: mode, context_diary_id: diaryId })
        .eq("id", sessionId);
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || !sessionId || sending) return;

    const userMessage = input.trim();
    setInput("");
    setSending(true);

    const tempUserMsg: ChatMessage = {
      id: "temp-" + Date.now(),
      session_id: sessionId,
      user_id: session?.user.id || "",
      role: "user",
      content: userMessage,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const result = await sendMessage({
        data: {
          message: userMessage,
          session_id: sessionId,
          diary_context_mode: contextMode,
          context_diary_id: contextDiaryId,
        },
      });

      const aiMsg: ChatMessage = {
        id: "ai-" + Date.now(),
        session_id: sessionId,
        user_id: session?.user.id || "",
        role: "assistant",
        content: result.reply,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      const errMsg: ChatMessage = {
        id: "err-" + Date.now(),
        session_id: sessionId,
        user_id: session?.user.id || "",
        role: "assistant",
        content: "抱歉，回复出了点问题。请稍后再试。",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  }

  const contextLabel: Record<DiaryContextMode, string> = {
    none: "不读取日记",
    current: "读取当前日记",
    recent: "读取最近日记",
    all: "读取全部日记",
  };

  if (loading) {
    return (
      <div className="page-container">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col"
      style={{ height: "100dvh", maxWidth: "480px", margin: "0 auto" }}
    >
      <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg)]">
        <button
          onClick={() => router.history.back()}
          className="text-sm text-[var(--color-text-secondary)]"
        >
          ←
        </button>
        <h1 className="text-lg font-semibold">笔友</h1>
        <button
          onClick={() => navigate({ to: "/persona" })}
          className="w-9 h-9 rounded-full flex items-center justify-center"
        >
          <Settings size={18} className="text-[var(--color-text-secondary)]" />
        </button>
      </div>

      <div className="px-5 py-3 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
        <button
          onClick={() => setShowContextMenu(!showContextMenu)}
          className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-white border border-[var(--color-border)] text-sm"
        >
          <span className="text-[var(--color-text-secondary)]">
            笔友阅读范围：
            <span className="text-[var(--color-primary)] font-medium">
              {contextLabel[contextMode]}
            </span>
          </span>
          <span className="text-xs text-[var(--color-text-secondary)]">
            {showContextMenu ? "收起" : "展开"}
          </span>
        </button>

        {showContextMenu && (
          <div className="mt-2 space-y-2 slide-up">
            <ContextOption
              label="不读取日记"
              desc="笔友只根据对话内容回复"
              active={contextMode === "none"}
              onClick={() => void updateContextMode("none")}
            />
            <ContextOption
              label="读取当前日记"
              desc="笔友只读取你选定的那一篇"
              active={contextMode === "current"}
              onClick={() => void updateContextMode("current", contextDiaryId)}
            />
            <ContextOption
              label="读取最近的日记"
              desc="笔友读取最近 5 篇日记"
              active={contextMode === "recent"}
              onClick={() => void updateContextMode("recent")}
            />
            <ContextOption
              label="允许笔友阅读全部日记"
              desc="笔友可以阅读你所有的日记"
              active={contextMode === "all"}
              onClick={() => void updateContextMode("all")}
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.length === 0 ? (
          <EmptyState icon="✉️" title="开始和笔友聊天" subtitle="说点什么吧，笔友会认真回复你" />
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`message-bubble ${
                  msg.role === "user"
                    ? "bg-[var(--color-primary)] text-white rounded-br-md"
                    : "bg-white text-[var(--color-text)] rounded-bl-md border border-[var(--color-border)]"
                }`}
              >
                <p className="text-[15px] whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="message-bubble bg-white border border-[var(--color-border)] rounded-bl-md">
              <div className="flex gap-1">
                <span
                  className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="px-5 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)] flex gap-2 items-end"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="说点什么..."
          rows={1}
          className="input-field resize-none flex-1"
          style={{ maxHeight: "120px", minHeight: "44px" }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend(e as unknown as FormEvent);
            }
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="w-11 h-11 rounded-xl bg-[var(--color-primary)] text-white flex items-center justify-center disabled:opacity-40 shrink-0"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

function ContextOption({
  label,
  desc,
  active,
  onClick,
}: {
  label: string;
  desc: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary)] bg-opacity-5"
          : "border-[var(--color-border)] bg-white"
      }`}
    >
      <p
        className={`text-sm font-medium ${active ? "text-[var(--color-primary)]" : "text-[var(--color-text)]"}`}
      >
        {label}
      </p>
      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{desc}</p>
    </button>
  );
}
