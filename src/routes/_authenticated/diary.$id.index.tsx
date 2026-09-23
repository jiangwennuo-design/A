import { useState, useEffect } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Header, LoadingSpinner, ErrorBanner } from "@/components/ui-kit";
import { popSystemPage, pushSystemPage } from "@/lib/app-transition";
import { createDiaryReply } from "@/lib/penpal.functions";
import type { AiPersona, Diary, DiaryReply } from "@/lib/types";
import { MessageCircle, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/diary/$id/")({
  head: () => ({
    meta: [
      { title: "日记详情 · 此心一笺" },
      { name: "description", content: "回看这篇日记，或者让你的 AI 笔友读一读并聊聊它。" },
      { property: "og:title", content: "日记详情 · 此心一笺" },
      {
        property: "og:description",
        content: "回看这篇日记，或者让你的 AI 笔友读一读并聊聊它。",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DiaryDetailPage,
});

function DiaryDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const [diary, setDiary] = useState<Diary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [chars, setChars] = useState<AiPersona[]>([]);
  const [charId, setCharId] = useState("");
  const [replies, setReplies] = useState<DiaryReply[]>([]);
  const [replying, setReplying] = useState(false);
  const makeReply = useServerFn(createDiaryReply);

  useEffect(() => {
    if (!id) return;
    void supabase
      .from("diaries")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setError("日记加载失败");
        } else {
          setDiary(data as Diary);
        }
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    // The live schema includes diary_replies added after generated Supabase types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    void Promise.all([
      db.from("ai_personas").select("*").order("updated_at", { ascending: false }),
      db
        .from("diary_replies")
        .select("*")
        .eq("diary_id", id)
        .order("created_at", { ascending: false }),
    ]).then(([personas, savedReplies]) => {
      const list = (personas.data ?? []) as AiPersona[];
      setChars(list);
      setCharId(localStorage.getItem("current-char-id") || list[0]?.id || "");
      setReplies((savedReplies.data ?? []) as DiaryReply[]);
    });
  }, [id]);

  async function handleDiaryReply() {
    if (!charId || replying) return;
    setReplying(true);
    setError("");
    try {
      const result = await makeReply({ data: { diary_id: id, char_id: charId } });
      setReplies((previous) => [result.reply as DiaryReply, ...previous]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "生成回信失败。");
    } finally {
      setReplying(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const { error } = await supabase.from("diaries").delete().eq("id", id);
    if (error) {
      setError("删除失败");
      setDeleting(false);
    } else {
      void navigate({ to: "/" });
    }
  }

  if (loading) {
    return (
      <div className="page-container">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !diary) {
    return (
      <div className="page-container">
        <Header title="日记" onBack={() => void popSystemPage(() => router.history.back())} />
        <ErrorBanner message={error || "日记不存在"} />
      </div>
    );
  }

  return (
    <div className="page-container diary-app diary-detail">
      <div className="fade-in">
        <Header
          className="diary-page-header"
          title="日记详情"
          onBack={() => void popSystemPage(() => router.history.back())}
          rightAction={
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  void pushSystemPage(() =>
                    navigate({ to: "/diary/$id/edit", params: { id: diary.id } }),
                  )
                }
                className="w-9 h-9 rounded-full flex items-center justify-center bg-white border border-[var(--color-border)]"
              >
                <Pencil size={16} className="text-[var(--color-text-secondary)]" />
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-white border border-[var(--color-border)]"
              >
                <Trash2 size={16} className="text-[var(--color-error)]" />
              </button>
            </div>
          }
        />

        <article className="diary-entry">
          <p className="diary-entry__date">{formatDateFull(diary.diary_date)}</p>
          <h1>{diary.title || "无题"}</h1>
          <div className="diary-entry__content">{diary.content || "（空白）"}</div>
        </article>

        <button
          onClick={() => navigate({ to: "/chat", search: { diary: diary.id } })}
          className="diary-letter-cta"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-accent)] bg-opacity-15 flex items-center justify-center">
              <MessageCircle size={20} className="text-[var(--color-accent)]" />
            </div>
            <div className="text-left">
              <p className="font-medium text-[var(--color-text)] text-sm">让笔友读这篇</p>
              <p className="text-xs text-[var(--color-text-secondary)]">和笔友聊聊这篇日记</p>
            </div>
          </div>
          <span className="text-lg text-[var(--color-text-secondary)]">→</span>
        </button>

        <section className="diary-replies">
          <h2 className="font-semibold text-[var(--color-text)]">你的回信</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            选择一位笔友，为这篇日记写一封完整的回信。
          </p>
          {chars.length ? (
            <div className="flex gap-2 mt-3">
              <select
                value={charId}
                onChange={(e) => setCharId(e.target.value)}
                className="input-field flex-1"
              >
                <option value="">选择笔友</option>
                {chars.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => void handleDiaryReply()}
                disabled={!charId || replying}
                className="btn-primary px-4"
              >
                {replying ? "生成中…" : "写回信"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate({ to: "/persona" })}
              className="mt-3 text-sm text-[var(--color-primary)]"
            >
              先创建一位笔友
            </button>
          )}
          <div className="diary-reply-list">
            {replies.map((reply) => {
              const character = chars.find((item) => item.id === reply.char_id);
              return (
                <article key={reply.id} className="diary-reply">
                  <p>{character?.name ?? "笔友"}的回信</p>
                  <div>{reply.content}</div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 flex items-end justify-center z-50"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="bg-white rounded-t-3xl w-full max-w-[480px] p-6 slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-center mb-2">删除这篇日记？</h3>
            <p className="text-sm text-[var(--color-text-secondary)] text-center mb-6">
              删除后无法恢复，确定要继续吗？
            </p>
            <div className="space-y-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="w-full py-3 rounded-xl bg-[var(--color-error)] text-white font-medium"
              >
                {deleting ? "删除中..." : "确认删除"}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="w-full py-3 rounded-xl bg-gray-100 text-[var(--color-text)] font-medium"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}
