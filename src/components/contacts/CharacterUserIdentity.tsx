import { useEffect, useState, type FormEvent } from "react";
import { AvatarPicker } from "@/components/AvatarPicker";
import { ErrorBanner } from "@/components/ui-kit";
import { ContactAvatar } from "./ContactList";
import { supabase } from "@/integrations/supabase/client";
import { resolveAvatarUrl } from "@/lib/avatar";
import {
  characterChatSchema,
  readCharacterChatPreferences,
  characterUserIdentity,
} from "@/lib/character-chat";
import type { AiPersona, Profile } from "@/lib/types";

export function CharacterUserIdentity({
  character,
  profile,
  userId,
  onSaved,
}: {
  character: AiPersona;
  profile: Profile | null;
  userId: string;
  onSaved: (character: AiPersona) => void;
}) {
  const initial = readCharacterChatPreferences(character.chat_preferences);
  const [avatar, setAvatar] = useState(initial.userAvatarOverride);
  const [nickname, setNickname] = useState(initial.userNicknameOverride);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const identity = characterUserIdentity(
    { userAvatarOverride: avatar, userNicknameOverride: nickname },
    profile,
  );
  useEffect(() => {
    let active = true;
    setPreview("");
    void resolveAvatarUrl(identity.avatar).then((url) => {
      if (active) setPreview(url);
    });
    return () => {
      active = false;
    };
  }, [identity.avatar]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || saving) return;
    setSaving(true);
    setError("");
    try {
      // Fetch fresh preferences so changing identity never discards wallpaper, memory or books.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data: latest, error: loadError } = await db
        .from("ai_personas")
        .select("chat_preferences")
        .eq("id", character.id)
        .eq("user_id", userId)
        .single();
      if (loadError || !latest) throw new Error("读取角色资料失败，请重试。");
      const overrides = characterChatSchema
        .pick({ userAvatarOverride: true, userNicknameOverride: true })
        .parse({
          userAvatarOverride: avatar.trim(),
          userNicknameOverride: nickname.trim(),
        });
      const { data, error: saveError } = await db
        .from("ai_personas")
        .update({ chat_preferences: { ...latest.chat_preferences, ...overrides } })
        .eq("id", character.id)
        .eq("user_id", userId)
        .select("*")
        .single();
      if (saveError || !data) throw new Error("保存失败，请重试。");
      onSaved(data as AiPersona);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="contact-editor roster-identity" onSubmit={save}>
      <div className="roster-identity__preview">
        {!avatar && <ContactAvatar url={preview} name={identity.nickname} large />}
        <strong>{identity.nickname}</strong>
        <p>仅对此角色生效</p>
      </div>
      {error && <ErrorBanner message={error} />}
      <fieldset disabled={saving}>
        <div className="roster-card">
          <AvatarPicker
            label="专属 User 头像"
            owner="profile"
            userId={userId}
            value={avatar}
            onChange={setAvatar}
            onError={setError}
            onUploadBusy={setBusy}
          />
          {!avatar && <p className="roster-hint">使用全局头像</p>}
        </div>
        <label className="contact-editor__field">
          <span>专属 User 昵称</span>
          <input
            value={nickname}
            maxLength={80}
            placeholder="使用全局昵称"
            onChange={(event) => setNickname(event.target.value)}
          />
          {!nickname.trim() && <small>使用全局昵称：{profile?.display_name || "我"}</small>}
        </label>
        <button
          type="button"
          className="roster-reset"
          disabled={busy}
          onClick={() => {
            setAvatar("");
            setNickname("");
          }}
        >
          恢复使用全局资料
        </button>
      </fieldset>
      <button type="submit" className="btn-primary w-full" disabled={busy || saving}>
        {saving ? "保存中…" : "保存资料"}
      </button>
    </form>
  );
}
