import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PenLine, Settings2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useDiaryProfile } from "@/context/DiaryProfileContext";
import { DiaryAvatar } from "@/components/DiaryAvatar";
import { DiaryFeed } from "@/components/DiaryFeed";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, LoadingSpinner } from "@/components/ui-kit";
import { pushSystemPage } from "@/lib/app-transition";
import type { Diary } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/diary/me")({
  head: () => ({ meta: [{ title: "我的主页 · 此心一笺" }] }),
  component: DiaryMePage,
});

function DiaryMePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { diaryProfile, avatarUrl, coverUrl } = useDiaryProfile();
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void supabase
      .from("diaries")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (active) {
          setDiaries((data ?? []) as Diary[]);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [user]);

  const edit = () => void pushSystemPage(() => navigate({ to: "/diary/profile-edit" }));

  return (
    <div className="page-container diary-app diary-me">
      <div className="diary-me__inner">
        <header
          className="diary-me__cover"
          style={coverUrl ? { backgroundImage: `url("${coverUrl}")` } : undefined}
        >
          <div className="diary-me__cover-actions">
            <button type="button" aria-label="修改资料" onClick={edit}>
              <Settings2 size={21} />
            </button>
            <button
              type="button"
              aria-label="写日记"
              onClick={() => void navigate({ to: "/diary/new" })}
            >
              <PenLine size={21} />
            </button>
          </div>
        </header>
        <section className="diary-me__identity">
          <div className="diary-me__avatar">
            <DiaryAvatar name={diaryProfile?.displayName || "我"} url={avatarUrl} />
          </div>
          <h1>{diaryProfile?.displayName || "我"}</h1>
          <p className="diary-me__handle">@{diaryProfile?.username || "diary"}</p>
          {(diaryProfile?.citizenTitle || diaryProfile?.badge) && (
            <div className="diary-me__tags">
              {diaryProfile.citizenTitle && <span>{diaryProfile.citizenTitle}</span>}
              {diaryProfile.badge && <span>{diaryProfile.badge}</span>}
            </div>
          )}
          {diaryProfile?.bio && <p className="diary-me__bio">{diaryProfile.bio}</p>}
          <button type="button" className="diary-me__edit" onClick={edit}>
            修改资料
          </button>
          <div className="diary-me__stats">
            <span>
              <strong>—</strong>关注者
            </span>
            <span>
              <strong>—</strong>朋友
            </span>
            <span>
              <strong>{diaries.length}</strong>日记
            </span>
            <span>
              <strong>—</strong>被喜欢
            </span>
          </div>
        </section>
        <div className="diary-section-heading">
          <h2>我的日记</h2>
        </div>
        {loading ? (
          <LoadingSpinner />
        ) : diaries.length ? (
          <DiaryFeed diaries={diaries} />
        ) : (
          <EmptyState icon="📔" title="还没有日记" subtitle="点中间的钢笔，写下第一篇日记。" />
        )}
      </div>
    </div>
  );
}
