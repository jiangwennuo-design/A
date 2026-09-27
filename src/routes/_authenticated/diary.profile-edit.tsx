import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Camera, ImagePlus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useDiaryProfile } from "@/context/DiaryProfileContext";
import { DiaryAvatar } from "@/components/DiaryAvatar";
import { ErrorBanner, Header } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { uploadDiaryProfileImage } from "@/lib/diary-profile";
import { popSystemPage } from "@/lib/app-transition";

export const Route = createFileRoute("/_authenticated/diary/profile-edit")({
  head: () => ({ meta: [{ title: "修改资料 · 此心一笺" }] }),
  component: DiaryProfileEditPage,
});

function DiaryProfileEditPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const { user } = useAuth();
  const { diaryProfile, avatarUrl, coverUrl, saveDiaryProfile } = useDiaryProfile();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [citizenTitle, setCitizenTitle] = useState("");
  const [badge, setBadge] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [coverPreview, setCoverPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!diaryProfile) return;
    setDisplayName(diaryProfile.displayName);
    setUsername(diaryProfile.username);
    setBio(diaryProfile.bio);
    setCitizenTitle(diaryProfile.citizenTitle);
    setBadge(diaryProfile.badge);
  }, [diaryProfile]);

  useEffect(() => {
    if (!avatarFile) return;
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => {
      URL.revokeObjectURL(url);
      setAvatarPreview("");
    };
  }, [avatarFile]);
  useEffect(() => {
    if (!coverFile) return;
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => {
      URL.revokeObjectURL(url);
      setCoverPreview("");
    };
  }, [coverFile]);

  function chooseImage(file: File | undefined, kind: "avatar" | "cover") {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 8 * 1024 * 1024
    ) {
      setError("请选择不超过 8MB 的 JPG、PNG 或 WebP 图片。");
      return;
    }
    setError("");
    if (kind === "avatar") setAvatarFile(file);
    else setCoverFile(file);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!user || !diaryProfile || saving) return;
    const name = displayName.trim();
    const handle = username.trim().replace(/^@/, "");
    if (!name || !handle || /\s/.test(handle)) {
      setError("请填写昵称和不含空格的用户名。");
      return;
    }
    setSaving(true);
    setError("");
    const uploaded: string[] = [];
    try {
      const avatarPath = avatarFile
        ? await uploadDiaryProfileImage(user.id, avatarFile, "avatar")
        : diaryProfile.avatarPath;
      if (avatarFile && avatarPath) uploaded.push(avatarPath);
      const coverPath = coverFile
        ? await uploadDiaryProfileImage(user.id, coverFile, "cover")
        : diaryProfile.coverPath;
      if (coverFile && coverPath) uploaded.push(coverPath);
      await saveDiaryProfile({
        ...diaryProfile,
        avatarPath,
        coverPath,
        displayName: name,
        username: handle,
        bio: bio.trim(),
        citizenTitle: citizenTitle.trim(),
        badge: badge.trim(),
      });
      const oldPaths = [
        avatarFile ? diaryProfile.avatarPath : null,
        coverFile ? diaryProfile.coverPath : null,
      ].filter((path): path is string => Boolean(path?.startsWith(`${user.id}/diary-profile/`)));
      if (oldPaths.length) void supabase.storage.from("moments").remove(oldPaths);
      void navigate({ to: "/diary/me" });
    } catch (caught) {
      if (uploaded.length) await supabase.storage.from("moments").remove(uploaded);
      setError(caught instanceof Error ? caught.message : "资料保存失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-container diary-app diary-profile-editor">
      <Header
        className="diary-page-header"
        title="修改资料"
        onBack={() => void popSystemPage(() => router.history.back())}
      />
      <form className="diary-profile-editor__form" onSubmit={(event) => void save(event)}>
        {error && <ErrorBanner message={error} />}
        <label className="diary-profile-editor__cover">
          <span
            className="diary-profile-editor__cover-preview"
            style={
              coverPreview || coverUrl
                ? { backgroundImage: `url("${coverPreview || coverUrl}")` }
                : undefined
            }
          />
          <span>
            <ImagePlus size={18} /> 更换主页背景
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => chooseImage(event.target.files?.[0], "cover")}
          />
        </label>
        <label className="diary-profile-editor__avatar">
          <DiaryAvatar name={displayName || "我"} url={avatarPreview || avatarUrl} />
          <span>
            <Camera size={15} /> 更换头像
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => chooseImage(event.target.files?.[0], "avatar")}
          />
        </label>
        <div className="diary-profile-editor__fields">
          <label>
            昵称
            <input
              value={displayName}
              maxLength={40}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          </label>
          <label>
            用户名
            <input
              value={username}
              maxLength={40}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label>
            个人签名
            <textarea
              value={bio}
              maxLength={160}
              rows={3}
              onChange={(event) => setBio(event.target.value)}
            />
          </label>
          <label>
            市民称号
            <input
              value={citizenTitle}
              maxLength={30}
              placeholder="可选"
              onChange={(event) => setCitizenTitle(event.target.value)}
            />
          </label>
          <label>
            勋章
            <input
              value={badge}
              maxLength={30}
              placeholder="可选文字"
              onChange={(event) => setBadge(event.target.value)}
            />
          </label>
        </div>
        <button
          type="submit"
          className="diary-profile-editor__save"
          disabled={saving || !diaryProfile}
        >
          {saving ? "保存中…" : "保存资料"}
        </button>
      </form>
    </div>
  );
}
