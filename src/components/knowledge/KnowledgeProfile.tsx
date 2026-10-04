import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Pencil, UserRound } from "lucide-react";
import { prepareChatImage, uploadChatMedia } from "@/lib/chat-media";
import { resolveSignedMediaUrl } from "@/lib/signed-media";
import { saveKnowledgeProfile, type KnowledgeProfile as Profile } from "@/lib/knowledge-store";

export function KnowledgeProfile({ userId, profile }: { userId: string; profile: Profile }) {
  const [editing, setEditing] = useState<"displayName" | "signature" | null>(null);
  const [value, setValue] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [failedAvatar, setFailedAvatar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setAvatarUrl("");
    setFailedAvatar(false);
    if (profile.avatar) {
      void resolveSignedMediaUrl("chat-media", profile.avatar).then((url) => {
        if (active) setAvatarUrl(url);
      });
    }
    return () => {
      active = false;
    };
  }, [profile.avatar]);
  const edit = (field: "displayName" | "signature") => {
    setValue(profile[field]);
    setError("");
    setEditing(field);
  };
  const save = async () => {
    if (!editing || busy) return;
    if (editing === "displayName" && !value.trim()) {
      setError("请填写显示名。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await saveKnowledgeProfile(userId, { [editing]: value.trim() });
      if (mounted.current) setEditing(null);
    } catch (reason) {
      if (mounted.current)
        setError(reason instanceof Error ? reason.message : "保存失败，请重试。");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    setError("");
    let preview = "";
    try {
      const image = await prepareChatImage(file, 512, 1024 * 1024, { alwaysEncode: true });
      preview = image.previewUrl;
      const avatar = await uploadChatMedia(userId, image, "messages");
      await saveKnowledgeProfile(userId, { avatar });
    } catch (reason) {
      if (mounted.current)
        setError(reason instanceof Error ? reason.message : "头像保存失败，请重试。");
    } finally {
      if (preview) URL.revokeObjectURL(preview);
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <div className="knowledge-profile">
      <button
        type="button"
        className="knowledge-profile-avatar"
        aria-label="更换知识库头像"
        disabled={busy}
        onClick={() => fileInput.current?.click()}
      >
        {avatarUrl && !failedAvatar ? (
          <img
            src={avatarUrl}
            alt="知识库头像"
            decoding="async"
            onError={() => setFailedAvatar(true)}
          />
        ) : (
          <UserRound size={42} strokeWidth={1.2} />
        )}
      </button>
      <input
        ref={fileInput}
        type="file"
        hidden
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={(event) => void upload(event)}
      />
      <h2>
        <button
          type="button"
          disabled={busy}
          onClick={() => edit("displayName")}
          aria-label="修改知识库显示名"
        >
          {profile.displayName}
        </button>
      </h2>
      <button
        type="button"
        className="knowledge-profile-signature"
        disabled={busy}
        aria-label="编辑知识库个性签名"
        onClick={() => edit("signature")}
      >
        {profile.signature && <span>{profile.signature}</span>}
        <Pencil size={12} strokeWidth={1.5} aria-hidden="true" />
      </button>
      {editing && (
        <form
          className="knowledge-profile-edit"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {editing === "displayName" ? (
            <input
              aria-label="知识库显示名"
              autoFocus
              maxLength={80}
              value={value}
              disabled={busy}
              onChange={(event) => setValue(event.target.value)}
            />
          ) : (
            <textarea
              aria-label="知识库个性签名"
              autoFocus
              rows={3}
              maxLength={500}
              placeholder="个性签名（可留空）"
              value={value}
              disabled={busy}
              onChange={(event) => setValue(event.target.value)}
            />
          )}
          <div>
            <button type="button" disabled={busy} onClick={() => setEditing(null)}>
              取消
            </button>
            <button type="submit" disabled={busy}>
              保存
            </button>
          </div>
        </form>
      )}
      {busy && (
        <p className="knowledge-muted" role="status">
          保存中…
        </p>
      )}
      {error && (
        <p className="knowledge-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
