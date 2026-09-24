import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { ErrorBanner, LoadingSpinner } from "@/components/ui-kit";
import { AvatarPicker } from "@/components/AvatarPicker";
import { importPersonaFile } from "@/lib/persona-file";
import { ChatNav } from "@/components/ChatNav";
import { popSystemPage } from "@/lib/app-transition";
import { resolveAvatarUrl } from "@/lib/avatar";

export const Route = createFileRoute("/_authenticated/profile")({ component: ProfilePage });
interface ProfileForm {
  display_name: string;
  avatar_url: string;
  gender: string;
  persona_text: string;
  signature: string;
}

function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [avatar, setAvatar] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (profile)
      setForm({
        display_name: profile.display_name ?? "",
        avatar_url: profile.avatar_url ?? "",
        gender: profile.gender ?? "",
        persona_text: profile.persona_text ?? "",
        signature: profile.signature ?? "",
      });
  }, [profile]);
  useEffect(() => {
    let alive = true;
    void resolveAvatarUrl(profile?.avatar_url).then((url) => {
      if (alive) setAvatar(url);
    });
    return () => {
      alive = false;
    };
  }, [profile?.avatar_url]);
  if (!form)
    return (
      <div className="page-container">
        <LoadingSpinner />
      </div>
    );
  const current = form;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!user || !current.display_name.trim()) return setError("请填写显示名称。");
    setSaving(true);
    setError("");
    const { error: saveError } = await supabase
      .from("profiles")
      .update({
        ...current,
        display_name: current.display_name.trim(),
        avatar_url: current.avatar_url || null,
        gender: current.gender || null,
      })
      .eq("id", user.id);
    setSaving(false);
    if (saveError) return setError("保存失败，请稍后重试。");
    await refreshProfile();
    setEditing(false);
  }
  async function importText(file?: File) {
    if (!file) return;
    try {
      setForm({ ...current, persona_text: await importPersonaFile(file) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "文件读取失败。");
    }
  }
  const back = () =>
    editing ? setEditing(false) : void popSystemPage(() => navigate({ to: "/chat", search: {} }));
  return (
    <main className="user-profile-page">
      <header className="contacts-header">
        <button type="button" aria-label="返回" onClick={back}>
          <ArrowLeft size={21} />
        </button>
        <span>{editing ? "编辑资料" : "我的资料"}</span>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="user-profile-edit">
            <Pencil size={15} /> 编辑
          </button>
        )}
      </header>
      {error && <ErrorBanner message={error} />}
      {!editing ? (
        <section className="user-profile-view fade-in">
          <div className="user-profile-hero">
            {avatar ? (
              <img src={avatar} alt={profile?.display_name || "我"} />
            ) : (
              <span>{(profile?.display_name || "我").charAt(0)}</span>
            )}
            <h1>{profile?.display_name || "我"}</h1>
            <p>{profile?.signature || user?.email || "还没有填写简介"}</p>
          </div>
          <div className="user-profile-info">
            <div>
              <small>昵称</small>
              <p>{profile?.display_name || "未填写"}</p>
            </div>
            <div>
              <small>简介</small>
              <p>{profile?.signature || "未填写"}</p>
            </div>
            <div>
              <small>性别</small>
              <p>
                {profile?.gender === "male"
                  ? "男"
                  : profile?.gender === "female"
                    ? "女"
                    : profile?.gender === "non_binary"
                      ? "非二元"
                      : "未填写"}
              </p>
            </div>
            <div>
              <small>Persona / 用户设定</small>
              <p>{profile?.persona_text || "未填写"}</p>
            </div>
          </div>
          <button type="button" className="contact-message-button" onClick={() => setEditing(true)}>
            <Pencil size={18} /> 编辑资料
          </button>
        </section>
      ) : (
        <form onSubmit={save} className="contact-editor fade-in">
          {user && (
            <AvatarPicker
              label="头像"
              owner="profile"
              userId={user.id}
              value={current.avatar_url}
              onChange={(value) => setForm({ ...current, avatar_url: value })}
              onError={setError}
            />
          )}
          <ProfileField
            label="显示名称"
            value={current.display_name}
            onChange={(value) => setForm({ ...current, display_name: value })}
          />
          <ProfileField
            label="简介"
            value={current.signature}
            multiline
            onChange={(value) => setForm({ ...current, signature: value })}
          />
          <label className="contact-editor__field">
            <span>性别</span>
            <select
              value={current.gender}
              onChange={(event) => setForm({ ...current, gender: event.target.value })}
            >
              <option value="">不设置</option>
              <option value="male">男</option>
              <option value="female">女</option>
              <option value="non_binary">非二元</option>
            </select>
          </label>
          <ProfileField
            label="Persona / 用户设定"
            value={current.persona_text}
            multiline
            onChange={(value) => setForm({ ...current, persona_text: value })}
          />
          <input
            ref={fileInput}
            hidden
            type="file"
            accept=".txt,.docx"
            onChange={(event) => void importText(event.target.files?.[0])}
          />
          <button
            type="button"
            className="contact-import"
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={15} /> 导入 TXT 或 DOCX
          </button>
          <button className="btn-primary w-full" disabled={saving}>
            {saving ? "保存中…" : "保存资料"}
          </button>
        </form>
      )}
      {!editing && <ChatNav />}
    </main>
  );
}

function ProfileField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="contact-editor__field">
      <span>{label}</span>
      {multiline ? (
        <textarea rows={5} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}
