import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Pencil, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { ErrorBanner, LoadingSpinner } from "@/components/ui-kit";
import { AvatarPicker } from "@/components/AvatarPicker";
import { importPersonaFile } from "@/lib/persona-file";
import { ChatNav } from "@/components/ChatNav";
import { popSystemPage } from "@/lib/app-transition";
import { resolveAvatarUrl } from "@/lib/avatar";
import { readUserRoster } from "@/lib/user-roster";
import "@/styles/rosters.css";

export const Route = createFileRoute("/_authenticated/profile")({ component: ProfilePage });
interface ProfileForm {
  display_name: string;
  avatar_url: string;
  gender: string;
  persona_text: string;
  signature: string;
  username: string;
  bio: string;
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
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [personaView, setPersonaView] = useState(false);
  useEffect(() => {
    if (profile)
      setForm({
        display_name: profile.display_name ?? "",
        avatar_url: profile.avatar_url ?? "",
        gender: profile.gender ?? "",
        persona_text: profile.persona_text ?? "",
        signature: profile.signature ?? "",
        ...readUserRoster(user?.user_metadata, user?.id ?? ""),
      });
  }, [profile, user?.id, user?.user_metadata]);
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
    if (avatarBusy || saving) return;
    if (!user || !current.display_name.trim()) return setError("请填写显示名称。");
    setSaving(true);
    setError("");
    try {
      const { username, bio, ...profileFields } = current;
      const { error: saveError } = await supabase
        .from("profiles")
        .update({
          ...profileFields,
          display_name: current.display_name.trim(),
          avatar_url: current.avatar_url || null,
          gender: current.gender || null,
        })
        .eq("id", user.id)
        .select("id")
        .single();
      if (saveError) return setError("保存失败，请稍后重试。");
      const previousMetadata = user.user_metadata?.["chat_profile"];
      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          chat_profile: {
            ...(previousMetadata && typeof previousMetadata === "object" ? previousMetadata : {}),
            username: username.trim().replace(/^@/, ""),
            bio,
          },
        },
      });
      if (metadataError) return setError("基础资料已保存，用户名/简介保存失败，请重试。");
      await refreshProfile();
      setEditing(false);
      setPersonaView(false);
    } catch {
      setError("保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }
  async function importText(file?: File) {
    if (!file) return;
    try {
      setForm({ ...current, persona_text: await importPersonaFile(file) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "文件读取失败。");
    }
  }
  const back = () => {
    if (saving) return;
    if (editing) {
      setAvatarBusy(false);
      return setEditing(false);
    }
    if (personaView) return setPersonaView(false);
    void popSystemPage(() => navigate({ to: "/chat", search: {} }));
  };
  const roster = readUserRoster(user?.user_metadata, user?.id ?? "");
  return (
    <main className="user-profile-page roster-scope">
      <header className="contacts-header">
        <button type="button" aria-label="返回" onClick={back}>
          <ArrowLeft size={21} />
        </button>
        <span>{editing ? "编辑资料" : personaView ? "用户人设" : "我的资料"}</span>
        {editing ? (
          <button
            key="save-profile"
            type="submit"
            form="user-profile-form"
            className="user-profile-edit"
            disabled={saving || avatarBusy}
          >
            {saving ? "保存中…" : "完成"}
          </button>
        ) : (
          <button
            key="edit-profile"
            type="button"
            onClick={() => setEditing(true)}
            className="user-profile-edit"
          >
            <Pencil size={15} /> 编辑
          </button>
        )}
      </header>
      {error && <ErrorBanner message={error} />}
      {!editing && personaView ? (
        <section className="roster-card roster-full-text">
          <h2>用户人设</h2>
          <p>{profile?.persona_text || "未填写"}</p>
          <button type="button" className="roster-link" onClick={() => setEditing(true)}>
            编辑人设
          </button>
        </section>
      ) : !editing ? (
        <section className="user-profile-view fade-in">
          <div className="user-profile-hero">
            {avatar ? (
              <img src={avatar} alt={profile?.display_name || "我"} />
            ) : (
              <span>{(profile?.display_name || "我").charAt(0)}</span>
            )}
            <h1>{profile?.display_name || "我"}</h1>
            <p className="roster-username">@{roster.username}</p>
            <p>{profile?.signature || "还没有填写个性签名"}</p>
          </div>
          <div className="user-profile-info">
            <div>
              <small>昵称</small>
              <p>{profile?.display_name || "未填写"}</p>
            </div>
            <div>
              <small>个性签名</small>
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
              <small>简介</small>
              <p>{roster.bio || "未填写"}</p>
            </div>
            <button type="button" className="roster-menu-row" onClick={() => setPersonaView(true)}>
              <span>用户人设</span>
              <ChevronRight size={18} />
            </button>
          </div>
          <button type="button" className="contact-message-button" onClick={() => setEditing(true)}>
            <Pencil size={18} /> 编辑资料
          </button>
        </section>
      ) : (
        <form id="user-profile-form" onSubmit={save} className="contact-editor fade-in">
          {user && (
            <AvatarPicker
              label="头像"
              owner="profile"
              userId={user.id}
              value={current.avatar_url}
              onChange={(value) =>
                setForm((form) => (form ? { ...form, avatar_url: value } : form))
              }
              onUploadBusy={setAvatarBusy}
              onError={setError}
            />
          )}
          <ProfileField
            label="显示名称"
            value={current.display_name}
            onChange={(value) => setForm({ ...current, display_name: value })}
          />
          <ProfileField
            label="用户名"
            value={current.username}
            onChange={(value) => setForm({ ...current, username: value })}
          />
          <ProfileField
            label="个性签名"
            value={current.signature}
            multiline
            onChange={(value) => setForm({ ...current, signature: value })}
          />
          <ProfileField
            label="简介"
            value={current.bio}
            multiline
            onChange={(value) => setForm({ ...current, bio: value })}
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
          <details className="roster-disclosure">
            <summary>
              用户人设 <ChevronRight size={16} />
            </summary>
            <ProfileField
              label="用户人设 / Persona"
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
          </details>
          <button type="submit" className="btn-primary w-full" disabled={saving || avatarBusy}>
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
