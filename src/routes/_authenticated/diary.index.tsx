import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookOpen, House, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { EmptyState, LoadingSpinner } from "@/components/ui-kit";
import type { Diary } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/diary/")({
  head: () => ({
    meta: [
      { title: "此心一笺 · 日记" },
      { name: "description", content: "记录每天的心情，随时和你的 AI 笔友聊聊今天发生的事。" },
    ],
  }),
  component: DiaryHomePage,
});

function DiaryHomePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadDiaries();
  }, []);

  async function loadDiaries() {
    setLoading(true);
    const { data, error } = await supabase
      .from("diaries")
      .select("*")
      .order("diary_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) console.error("Failed to load diaries:", error);
    else setDiaries((data ?? []) as Diary[]);
    setLoading(false);
  }

  const dateStr = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="page-container app-page">
      <div className="fade-in">
        <header className="app-header mb-6">
          <button type="button" onClick={() => navigate({ to: "/" })} className="app-home-button">
            <House size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">此心一笺</h1>
            <p className="text-xs text-[var(--color-text-secondary)]">{dateStr}</p>
          </div>
        </header>

        <h2 className="text-2xl font-bold text-[var(--color-text)] mb-6">
          {greeting()}，{profile?.display_name || "朋友"}
        </h2>

        <button
          onClick={() => navigate({ to: "/diary/new" })}
          className="w-full mb-6 p-5 rounded-2xl bg-[var(--color-primary)] text-white flex items-center justify-between transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <PenLine size={22} />
            <span className="font-medium text-base">写一篇日记</span>
          </div>
          <span className="text-lg opacity-60">→</span>
        </button>

        <div className="flex items-center gap-2 mb-4">
          <BookOpen size={18} className="text-[var(--color-text-secondary)]" />
          <h2 className="text-base font-semibold text-[var(--color-text)]">我的日记</h2>
          {diaries.length > 0 && (
            <span className="text-xs text-[var(--color-text-secondary)]">({diaries.length})</span>
          )}
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : diaries.length === 0 ? (
          <EmptyState icon="📔" title="还没有日记" subtitle="点击上方按钮，写下你的第一篇日记吧" />
        ) : (
          <div className="space-y-3 pb-5">
            {diaries.map((diary) => (
              <button
                key={diary.id}
                onClick={() => navigate({ to: "/diary/$id", params: { id: diary.id } })}
                className="card w-full text-left active:scale-[0.99] transition-transform"
              >
                <p className="text-sm text-[var(--color-text-secondary)] mb-2">
                  {formatDate(diary.diary_date)}
                </p>
                <h3 className="font-medium text-[var(--color-text)] mb-1 line-clamp-1">
                  {diary.title || "无题"}
                </h3>
                <p className="text-sm text-[var(--color-text-secondary)] line-clamp-2 leading-relaxed">
                  {diary.content || "（空白）"}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function formatDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
}
