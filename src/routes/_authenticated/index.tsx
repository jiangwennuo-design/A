import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { LoadingSpinner, EmptyState } from "@/components/ui-kit";
import type { Diary } from "@/lib/types";
import { PenLine, BookOpen, Settings, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "我的日记 · 此心一笺" },
      { name: "description", content: "记录每天的心情，随时和你的 AI 笔友聊聊今天发生的事。" },
      { property: "og:title", content: "我的日记 · 此心一笺" },
      {
        property: "og:description",
        content: "记录每天的心情，随时和你的 AI 笔友聊聊今天发生的事。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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

    if (error) {
      console.error("Failed to load diaries:", error);
    } else {
      setDiaries((data ?? []) as Diary[]);
    }
    setLoading(false);
  }

  const today = new Date();
  const dateStr = today.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="page-container">
      <div className="fade-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm text-[var(--color-text-secondary)] mb-1">{dateStr}</p>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">
              {greeting()}, {profile?.display_name || "朋友"}
            </h1>
          </div>
          <button
            onClick={() => navigate({ to: "/settings" })}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-[var(--color-border)]"
          >
            <Settings size={20} className="text-[var(--color-text-secondary)]" />
          </button>
        </div>

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

        <button
          onClick={() => navigate({ to: "/chat" })}
          className="w-full mb-6 p-4 rounded-2xl bg-white border border-[var(--color-border)] flex items-center justify-between transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-accent)] bg-opacity-15 flex items-center justify-center">
              <MessageCircle size={20} className="text-[var(--color-accent)]" />
            </div>
            <div className="text-left">
              <p className="font-medium text-[var(--color-text)] text-sm">和笔友聊聊</p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                分享你的故事，听听笔友怎么说
              </p>
            </div>
          </div>
          <span className="text-lg text-[var(--color-text-secondary)]">→</span>
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
          <div className="space-y-3">
            {diaries.map((diary) => (
              <button
                key={diary.id}
                onClick={() => navigate({ to: "/diary/$id", params: { id: diary.id } })}
                className="card w-full text-left active:scale-[0.99] transition-transform"
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {formatDate(diary.diary_date)}
                  </p>
                </div>
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
  const h = new Date().getHours();
  if (h < 6) return "夜深了";
  if (h < 12) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
}
