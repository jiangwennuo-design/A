import { useState, useEffect } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Header, LoadingSpinner, ErrorBanner } from "@/components/ui-kit";
import type { Diary } from "@/lib/types";
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
        <Header title="日记" onBack={() => router.history.back()} />
        <ErrorBanner message={error || "日记不存在"} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="fade-in">
        <Header
          title="日记详情"
          onBack={() => router.history.back()}
          rightAction={
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate({ to: "/diary/$id/edit", params: { id: diary.id } })}
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

        <div className="mb-6">
          <p className="text-sm text-[var(--color-text-secondary)] mb-2">
            {formatDateFull(diary.diary_date)}
          </p>
          <h1 className="text-2xl font-bold text-[var(--color-text)] mb-4">
            {diary.title || "无题"}
          </h1>
          <div className="text-[var(--color-text)] leading-relaxed whitespace-pre-wrap text-[15px]">
            {diary.content || "（空白）"}
          </div>
        </div>

        <button
          onClick={() => navigate({ to: "/chat", search: { diary: diary.id } })}
          className="w-full p-4 rounded-2xl bg-[var(--color-accent)] bg-opacity-10 border border-[var(--color-accent)] border-opacity-20 flex items-center justify-between transition-all active:scale-[0.98]"
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
