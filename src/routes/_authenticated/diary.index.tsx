import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { House, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDiaryProfile } from "@/context/DiaryProfileContext";
import { EmptyState, LoadingSpinner } from "@/components/ui-kit";
import type { Diary } from "@/lib/types";
import { closeSystemApp, pushSystemPage } from "@/lib/app-transition";
import { DiaryAvatar } from "@/components/DiaryAvatar";
import { DiaryFeed } from "@/components/DiaryFeed";

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
  const { diaryProfile, avatarUrl } = useDiaryProfile();
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
      .order("created_at", { ascending: false });
    if (error) console.error("Failed to load diaries:", error);
    else setDiaries((data ?? []) as Diary[]);
    setLoading(false);
  }

  const authorName = diaryProfile?.displayName || "我";
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
          <DiaryAvatar name={authorName} url={avatarUrl} />
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
          <DiaryFeed diaries={diaries} />
        )}
      </div>
    </div>
  );
}
