import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Header, LoadingSpinner, ErrorBanner } from "@/components/ui-kit";
import type { Diary } from "@/lib/types";

export function DiaryEditPage({ id }: { id?: string }) {
  const navigate = useNavigate();
  const router = useRouter();
  const isEditing = Boolean(id && id !== "new");

  const [diaryDate, setDiaryDate] = useState(new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
      void navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page-container">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="page-container">
      <form onSubmit={handleSave} className="fade-in flex flex-col min-h-[100dvh]">
        <Header
          title={isEditing ? "编辑日记" : "写日记"}
          onBack={() => router.history.back()}
        />

        {error && <ErrorBanner message={error} />}

        <div className="space-y-4 flex-1">
          <div>
            <label className="text-sm text-[var(--color-text-secondary)] mb-2 block">日期</label>
            <input
              type="date"
              value={diaryDate}
              onChange={(e) => setDiaryDate(e.target.value)}
              className="input-field"
              required
            />
          </div>

          <div>
            <label className="text-sm text-[var(--color-text-secondary)] mb-2 block">标题</label>
            <input
              type="text"
              placeholder="给这篇日记起个标题..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
            />
          </div>

          <div className="flex-1">
            <label className="text-sm text-[var(--color-text-secondary)] mb-2 block">正文</label>
            <textarea
              placeholder="今天发生了什么？想记录些什么..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="input-field resize-none"
              rows={16}
              style={{ minHeight: "300px", lineHeight: "1.8" }}
            />
          </div>
        </div>

        <div className="pt-4 pb-2">
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? <LoadingSpinner /> : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}
