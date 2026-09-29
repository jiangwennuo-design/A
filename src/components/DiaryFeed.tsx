import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LockKeyhole } from "lucide-react";
import { DiaryAvatar } from "@/components/DiaryAvatar";
import { useDiaryProfile } from "@/context/DiaryProfileContext";
import { pushSystemPage } from "@/lib/app-transition";
import type { Diary } from "@/lib/types";

export function DiaryFeed({ diaries, listPage = false }: { diaries: Diary[]; listPage?: boolean }) {
  const navigate = useNavigate();
  const { diaryProfile, avatarUrl } = useDiaryProfile();
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const authorName = diaryProfile?.displayName || "我";
  const openDiary = (id: string) =>
    void pushSystemPage(() => navigate({ to: "/diary/$id", params: { id } }));

  return (
    <div className={listPage ? "diary-list diary-list--home" : "diary-list"}>
      {diaries.map((diary) => {
        const characters = Array.from(diary.content);
        const isLong = listPage ? characters.length > 300 : diary.content.length > 260;
        const expanded = expandedIds.includes(diary.id);
        return (
          <article key={diary.id} className="diary-card" onClick={() => openDiary(diary.id)}>
            <div className="diary-card__author">
              <DiaryAvatar name={authorName} url={avatarUrl} />
              <div className="diary-card__identity">
                <strong>{authorName}</strong>
                <span>@{diaryProfile?.username || "diary"}</span>
              </div>
              <time dateTime={diary.diary_date}>{formatDate(diary.diary_date)}</time>
            </div>
            <div className="diary-card__article">
              {diary.title && <h3>{diary.title}</h3>}
              <p className={!listPage && !expanded && isLong ? "diary-card__excerpt" : undefined}>
                {listPage && isLong && !expanded
                  ? `${characters.slice(0, 300).join("")}…`
                  : diary.content || "（空白）"}
              </p>
              {isLong && (
                <button
                  type="button"
                  className="diary-card__expand"
                  aria-expanded={expanded}
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpandedIds((current) =>
                      expanded
                        ? current.filter((item) => item !== diary.id)
                        : [...current, diary.id],
                    );
                  }}
                >
                  {expanded ? (
                    "收起"
                  ) : listPage ? (
                    <>
                      点击展开<span className="diary-card__count">（{characters.length}字）</span>
                    </>
                  ) : (
                    `点击展开（${characters.length}字）`
                  )}
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
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
}
