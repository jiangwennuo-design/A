import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { House, LockKeyhole, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { EmptyState, LoadingSpinner } from "@/components/ui-kit";
import type { Diary } from "@/lib/types";
import { closeSystemApp, pushSystemPage } from "@/lib/app-transition";
import { DiaryAvatar } from "@/components/DiaryAvatar";

export const Route = createFileRoute("/_authenticated/diary/")({
  head: () => ({
    meta: [
      { title: "此心一笺 · K得机" },
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
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

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

  const authorName = profile?.display_name || "我";
  const openDiary = (id: string) =>
    void pushSystemPage(() => navigate({ to: "/diary/$id", params: { id } }));
  const openEditor = () => void pushSystemPage(() => navigate({ to: "/diary/new" }));

  return (
    <div className="page-container diary-app diary-home">
      <div className="fade-in diary-home__inner">
        <header className="diary-topbar">
          <button
            type="button"
            aria-label="返回桌面"
            onClick={() => void closeSystemApp("diary", () => navigate({ to: "/" }))}
            className="diary-icon-button"
          >
            <House size={20} />
          </button>
          <h1>
            此心一笺 <span>· 我的日记</span>
          </h1>
          <button
            type="button"
            onClick={openEditor}
            className="diary-icon-button"
            aria-label="写日记"
          >
            <PenLine size={20} />
          </button>
        </header>

        <button onClick={openEditor} className="diary-compose-card">
          <DiaryAvatar name={authorName} url={profile?.avatar_url} />
          <span>写点什么</span>
        </button>

        <div className="diary-section-heading">
          <h2>日记</h2>
          {diaries.length > 0 && <span>{diaries.length} 篇</span>}
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : diaries.length === 0 ? (
          <EmptyState icon="📔" title="还没有日记" subtitle="点击上方按钮，写下你的第一篇日记吧" />
        ) : (
          <div className="diary-list">
            {diaries.map((diary) => {
              const isLong = diary.content.length > 260;
              const expanded = expandedIds.includes(diary.id);
              return (
                <article key={diary.id} className="diary-card" onClick={() => openDiary(diary.id)}>
                  <div className="diary-card__author">
                    <DiaryAvatar name={authorName} url={profile?.avatar_url} />
                    <div className="diary-card__identity">
                      <strong>{authorName}</strong>
                      <span>我的日记</span>
                    </div>
                    <time dateTime={diary.diary_date}>{formatDate(diary.diary_date)}</time>
                  </div>
                  <div className="diary-card__article">
                    {diary.title && <h3>{diary.title}</h3>}
                    <p className={!expanded && isLong ? "diary-card__excerpt" : undefined}>
                      {diary.content || "（空白）"}
                    </p>
                    {isLong && (
                      <button
                        type="button"
                        className="diary-card__expand"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedIds((current) =>
                            expanded
                              ? current.filter((item) => item !== diary.id)
                              : [...current, diary.id],
                          );
                        }}
                      >
                        {expanded ? "收起" : `点击展开（${Array.from(diary.content).length}字）`}
                      </button>
                    )}
                  </div>
                  <div className="diary-card__footer">
                    <span>
                      <LockKeyhole size={14} /> 私密
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openDiary(diary.id);
                      }}
                    >
                      阅读日记 <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
}
