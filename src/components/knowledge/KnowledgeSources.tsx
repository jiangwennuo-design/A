import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Check, BookOpen, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cardFromDiary, newKnowledgeCard, type KnowledgeCard } from "@/lib/knowledge";
import type { Diary, ChatSession, ChatMessage } from "@/lib/types";

export function KnowledgeSources({
  kind,
  userId,
  onBack,
  onPreview,
}: {
  kind: "diary" | "chat";
  userId: string;
  onBack: () => void;
  onPreview: (card: KnowledgeCard) => void;
}) {
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        if (kind === "diary") {
          const result = await supabase
            .from("diaries")
            .select("*")
            .eq("user_id", userId)
            .order("diary_date", { ascending: false })
            .range(offset, offset + 29);
          if (result.error) throw result.error;
          if (active) {
            setDiaries((previous) => (offset ? [...previous, ...result.data] : result.data));
            setMore(result.data.length === 30);
          }
        } else if (!session) {
          const [result, characters] = await Promise.all([
            supabase
              .from("chat_sessions")
              .select("*")
              .eq("user_id", userId)
              .order("updated_at", { ascending: false })
              .range(offset, offset + 29),
            supabase.from("ai_personas").select("id,name").eq("user_id", userId),
          ]);
          if (result.error) throw result.error;
          if (characters.error) throw characters.error;
          if (active) {
            const rows = result.data as unknown as ChatSession[];
            setSessions((previous) => (offset ? [...previous, ...rows] : rows));
            setMore(result.data.length === 30);
            setNames(Object.fromEntries(characters.data.map((card) => [card.id, card.name])));
          }
        } else {
          const result = await supabase
            .from("chat_messages")
            .select("*")
            .eq("user_id", userId)
            .eq("session_id", session.id)
            .order("created_at", { ascending: false })
            .order("message_order", { ascending: false })
            .range(offset, offset + 49);
          if (result.error) throw result.error;
          if (active) {
            setMessages((previous) =>
              offset
                ? [...previous, ...(result.data as ChatMessage[])]
                : (result.data as ChatMessage[]),
            );
            setMore(result.data.length === 50);
          }
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "读取来源失败，请重试。");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [kind, userId, session, offset]);
  const makeChatCard = () => {
    if (!session) return;
    const rows = messages
      .filter((message) => selected.includes(message.id))
      .sort(
        (a, b) => a.created_at.localeCompare(b.created_at) || a.message_order - b.message_order,
      );
    const name = session.char_id ? names[session.char_id] || "角色" : "聊天";
    const content = rows
      .map((row) => `${row.role === "user" ? "我" : name}：${row.content || "（图片或附件）"}`)
      .join("\n\n");
    const images = rows.flatMap((row) =>
      row.payload && "image_path" in row.payload && typeof row.payload.image_path === "string"
        ? [row.payload.image_path]
        : [],
    );
    onPreview(
      newKnowledgeCard({
        title: `与${name}的聊天`,
        content,
        images,
        sourceType: "chat",
        sourceLabel: `聊天 · ${name}`,
        sourceId: rows[0]?.id || "",
        sourceContextId: session.char_id || "",
        originalCreatedAt: rows[0]?.created_at || "",
      }),
    );
  };
  const match = (text: string) => text.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  return (
    <>
      <header className="knowledge-header">
        <button
          type="button"
          aria-label="返回"
          onClick={() => {
            if (session) {
              setSession(null);
              setMessages([]);
              setSelected([]);
              setOffset(0);
            } else onBack();
          }}
        >
          <ChevronLeft size={22} />
        </button>
        <strong>{kind === "diary" ? "选择日记" : session ? "选择聊天内容" : "选择聊天"}</strong>
        <span />
      </header>
      <div className="knowledge-scroll">
        <p className="knowledge-muted knowledge-inset">只读取原内容，确认后才保存为知识卡片。</p>
        <input
          className="knowledge-search"
          placeholder={kind === "diary" ? "搜索已加载日记…" : "搜索已加载内容…"}
          aria-label="搜索来源"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {error && (
          <p role="alert" className="knowledge-error">
            {error}
          </p>
        )}
        {kind === "diary"
          ? diaries
              .filter((diary) => match(diary.title + diary.content))
              .map((diary) => (
                <button
                  type="button"
                  key={diary.id}
                  className="knowledge-source-row"
                  onClick={() => onPreview(cardFromDiary(diary))}
                >
                  <BookOpen size={19} />
                  <span>
                    <strong>{diary.title || "无题"}</strong>
                    <p>{diary.content.slice(0, 90)}</p>
                    <small>{diary.diary_date}</small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))
          : !session
            ? sessions
                .filter((item) => match(names[item.char_id || ""] || "聊天"))
                .map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="knowledge-source-row"
                    onClick={() => {
                      setSession(item);
                      setOffset(0);
                      setQuery("");
                    }}
                  >
                    <MessageCircle size={20} />
                    <span>
                      <strong>{names[item.char_id || ""] || "聊天"}</strong>
                      <small>{item.updated_at.slice(0, 10)}</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                ))
            : messages
                .filter((item) => match(item.content))
                .map((message) => (
                  <button
                    type="button"
                    key={message.id}
                    className="knowledge-source-row"
                    aria-pressed={selected.includes(message.id)}
                    onClick={() =>
                      setSelected((previous) =>
                        previous.includes(message.id)
                          ? previous.filter((id) => id !== message.id)
                          : [...previous, message.id],
                      )
                    }
                  >
                    <span
                      className={`knowledge-checkbox ${selected.includes(message.id) ? "is-selected" : ""}`}
                    >
                      {selected.includes(message.id) && <Check size={14} />}
                    </span>
                    <span>
                      <strong>
                        {message.role === "user" ? "我" : names[session.char_id || ""] || "角色"}
                      </strong>
                      <p>{message.content || "图片 / 附件"}</p>
                      <small>{message.created_at.slice(0, 16).replace("T", " ")}</small>
                    </span>
                  </button>
                ))}
        {loading && <p className="knowledge-empty">读取中…</p>}
        {!loading &&
          !error &&
          (kind === "diary" ? !diaries.length : session ? !messages.length : !sessions.length) && (
            <p className="knowledge-empty">还没有可选择的内容</p>
          )}
        {more && (
          <button
            className="knowledge-load-more"
            type="button"
            disabled={loading}
            onClick={() => setOffset((previous) => previous + (session ? 50 : 30))}
          >
            加载更多
          </button>
        )}
      </div>
      {session && (
        <footer className="knowledge-source-footer">
          <button
            type="button"
            disabled={!selected.length}
            className="knowledge-primary"
            onClick={makeChatCard}
          >
            预览 {selected.length} 条内容
          </button>
        </footer>
      )}
    </>
  );
}
