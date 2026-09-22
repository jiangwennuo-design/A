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
    <div className="page-container diary-app diary-home">
      <div className="fade-in">
        <header className="diary-topbar">
          <button
            type="button"
            aria-label="返回桌面"
            onClick={() => navigate({ to: "/" })}
            className="diary-icon-button"
          >
            <House size={18} />
          </button>
          <p>{dateStr}</p>
        </header>

        <section className="diary-hero">
          <span>此心一笺</span>
          <h1>
            {greeting()}，{profile?.display_name || "朋友"}
          </h1>
          <p>今天，也留一点时间给自己。</p>
        </section>

        <button onClick={() => navigate({ to: "/diary/new" })} className="diary-compose-card">
          <div className="diary-compose-card__icon">
            <PenLine size={21} />
          </div>
          <div>
            <strong>写下此刻</strong>
            <span>文字会替你收好今天</span>
          </div>
          <span aria-hidden="true">＋</span>
        </button>

        <div className="diary-section-heading">
          <BookOpen size={18} className="text-[var(--color-text-secondary)]" />
          <h2>我的日记</h2>
          {diaries.length > 0 && <span>{diaries.length} 篇</span>}
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : diaries.length === 0 ? (
          <EmptyState icon="📔" title="还没有日记" subtitle="点击上方按钮，写下你的第一篇日记吧" />
        ) : (
          <div className="diary-list">
            {diaries.map((diary) => (
              <button
                key={diary.id}
                onClick={() => navigate({ to: "/diary/$id", params: { id: diary.id } })}
                className="diary-card"
              >
                <time dateTime={diary.diary_date}>
                  <b>{formatDateDay(diary.diary_date)}</b>
                  <span>{formatDateMonth(diary.diary_date)}</span>
                </time>
                <div>
                  <h3>{diary.title || "无题"}</h3>
                  <p>{diary.content || "（空白）"}</p>
                  <small>{formatDate(diary.diary_date)}</small>
                </div>
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

function formatDateDay(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).getDate().toString().padStart(2, "0");
}
function formatDateMonth(dateStr: string) {
  return `${new Date(`${dateStr}T00:00:00`).getMonth() + 1}月`;
}
