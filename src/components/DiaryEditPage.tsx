import { useState, useEffect, useRef, type FormEvent } from "react";
import { CalendarDays, X } from "lucide-react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LoadingSpinner, ErrorBanner } from "@/components/ui-kit";
import type { Diary } from "@/lib/types";
import { popSystemPage } from "@/lib/app-transition";
import { useKeyboardViewport } from "@/hooks/useKeyboardViewport";
import "@/styles/diary-editor.css";

export function DiaryEditPage({ id }: { id?: string }) {
  const navigate = useNavigate();
  const router = useRouter();
  const isEditing = Boolean(id && id !== "new");

  const [diaryDate, setDiaryDate] = useState(() => {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${today.getFullYear()}-${month}-${day}`;
  });
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);
  useKeyboardViewport(editorRef, !loading);

  useEffect(() => {
    if (!isEditing || !id) return;
    void supabase
      .from("diaries")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setError("日记加载失败");
        } else {
          const d = data as Diary;
          setDiaryDate(d.diary_date);
          setTitle(d.title);
          setContent(d.content);
        }
        setLoading(false);
      });
  }, [id, isEditing]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (isEditing) {
        const { error } = await supabase
          .from("diaries")
          .update({ title, content, diary_date: diaryDate })
          .eq("id", id!);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("diaries")
          .insert({ title, content, diary_date: diaryDate });
        if (error) throw error;
      }
      void navigate({ to: "/diary" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page-container diary-app">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div ref={editorRef} className="page-container diary-app diary-editor">
      <form
        onSubmit={handleSave}
        className="diary-editor__form"
        aria-label={isEditing ? "编辑日记" : "写日记"}
      >
        <header className="diary-editor__header">
          <button
            type="button"
            className="diary-editor__close"
            aria-label="关闭"
            onClick={() => void popSystemPage(() => router.history.back())}
          >
            <X size={25} strokeWidth={1.6} />
          </button>
          <button type="submit" disabled={saving} className="diary-editor__publish">
            {saving ? "发布中…" : "发布"}
          </button>
        </header>

        {error && <ErrorBanner message={error} />}

        <div className="diary-editor__paper">
          <div>
            <label className="sr-only">标题</label>
            <input
              type="text"
              placeholder="标题（可选）"
              aria-label="标题（可选）"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="diary-editor__title"
            />
          </div>

          <div className="diary-editor__body">
            <label className="sr-only">正文</label>
            <textarea
              placeholder="写点什么吧"
              aria-label="日记正文"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="diary-editor__content"
              rows={1}
            />
          </div>
        </div>

        <div className="diary-editor__actions">
          <label className="diary-editor__date-tool" title="修改日记日期">
            <CalendarDays size={22} strokeWidth={1.6} />
            <span>{diaryDate}</span>
            <input
              type="date"
              aria-label="日记日期"
              value={diaryDate}
              onChange={(e) => setDiaryDate(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={saving} className="diary-editor__publish">
            {saving ? "发布中…" : "发布"}
          </button>
        </div>
      </form>
    </div>
  );
}
