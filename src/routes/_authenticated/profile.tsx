import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { ErrorBanner, Header, LoadingSpinner } from "@/components/ui-kit";
import { AvatarPicker } from "@/components/AvatarPicker";
import { importPersonaFile } from "@/lib/persona-file";
import { ChatNav } from "@/components/ChatNav";

export const Route = createFileRoute("/_authenticated/profile")({ component: ProfilePage });

interface ProfileForm {
  display_name: string;
  avatar_url: string;
  gender: string;
  persona_text: string;
  signature: string;
}

function ProfilePage() {
  // The production profile fields are newer than the generated Supabase client types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (profile) {
      setForm({
        display_name: profile.display_name ?? "",
        avatar_url: profile.avatar_url ?? "",
        gender: profile.gender ?? "",
        persona_text: profile.persona_text ?? "",
        signature: profile.signature ?? "",
      });
    }
  }, [profile]);
  if (!form)
    return (
      <div className="page-container">
        <LoadingSpinner />
      </div>
    );
  const currentForm = form;
  async function importText(file?: File) {
    if (!file) return;
    try {
      setForm({ ...currentForm, persona_text: await importPersonaFile(file) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "文件读取失败。");
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!user || !currentForm.display_name.trim()) return setError("请填写昵称。");
    setSaving(true);
    const { error } = await db
      .from("profiles")
      .update({
        ...currentForm,
        avatar_url: currentForm.avatar_url || null,
        gender: currentForm.gender || null,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) setError("保存失败，请在完成数据库迁移后重试。");
    else {
      await refreshProfile();
      void navigate({ to: "/chat", search: {} });
    }
  }
  return (
    <div className="page-container pb-[calc(88px+env(safe-area-inset-bottom))]">
      <form onSubmit={save}>
        <Header title="我的资料" onBack={() => navigate({ to: "/chat", search: {} })} />
        {error && <ErrorBanner message={error} />}
        <p className="text-sm text-[var(--color-text-secondary)] mb-5">
          这里是你的个人资料，只会作为 AI 对话中的用户信息使用。
        </p>
        <Label
          label="昵称"
          value={currentForm.display_name}
          onChange={(v) => setForm({ ...currentForm, display_name: v })}
        />
        {user && (
          <AvatarPicker
            label="我的头像"
            owner="profile"
            userId={user.id}
            value={currentForm.avatar_url}
            onChange={(value) => setForm({ ...currentForm, avatar_url: value })}
            onError={setError}
          />
        )}
        <label className="block text-sm font-medium mb-4">
          性别
          <select
            className="input-field mt-2"
            value={currentForm.gender}
            onChange={(e) => setForm({ ...currentForm, gender: e.target.value })}
          >
            <option value="">不设置</option>
            <option value="male">男</option>
            <option value="female">女</option>
            <option value="non_binary">非二元</option>
          </select>
        </label>
        <div className="mb-4">
          <label className="text-sm font-medium">我的人设</label>
          <textarea
            className="input-field mt-2 resize-none"
            rows={6}
            value={currentForm.persona_text}
            onChange={(e) => setForm({ ...currentForm, persona_text: e.target.value })}
          />
          <input
            ref={input}
            className="hidden"
            type="file"
            accept=".txt,.docx"
            onChange={(e) => void importText(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="mt-2 text-sm text-[var(--color-primary)] flex gap-1 items-center"
          >
            <Upload size={15} />
            导入 TXT 或 DOCX
          </button>
        </div>
        <Label
          label="个性签名"
          value={currentForm.signature}
          onChange={(v) => setForm({ ...currentForm, signature: v })}
        />
        <button className="btn-primary w-full" disabled={saving}>
          {saving ? "保存中…" : "保存我的资料"}
        </button>
      </form>
      <ChatNav />
    </div>
  );
}
function Label({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium mb-4">
      {label}
      <input
        type={type}
        className="input-field mt-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
