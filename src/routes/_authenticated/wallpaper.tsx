import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ImagePlus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { ErrorBanner, Header, LoadingSpinner } from "@/components/ui-kit";
import { closeSystemApp } from "@/lib/app-transition";
import {
  applyWallpaperOptimistically,
  cacheWallpaperUrl,
  commitWallpaper,
  getWallpaperSnapshot,
  optimizeWallpaperUpload,
  preloadWallpaperUrl,
  resolveWallpaperUrl,
  rollbackWallpaper,
  type WallpaperSnapshot,
} from "@/lib/wallpaper";

// The production profile/storage fields are newer than the generated Supabase client types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const presets = [
  { id: "linen", label: "亚麻", colors: ["#f4eee5", "#d8e1d7"] },
  { id: "dawn", label: "晨曦", colors: ["#f8d9c7", "#c9d9e7"] },
  { id: "forest", label: "林间", colors: ["#b8c9b9", "#5d7563"] },
  { id: "night", label: "夜色", colors: ["#596275", "#252a37"] },
] as const;

export const Route = createFileRoute("/_authenticated/wallpaper")({
  head: () => ({ meta: [{ title: "壁纸 · K得机" }] }),
  component: WallpaperPage,
});

function WallpaperPage() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const objectPreview = useRef("");
  const [wallpaperUrl, setWallpaperUrl] = useState("");
  const [preview, setPreview] = useState("");
  const [blur, setBlur] = useState(0);
  const [opacity, setOpacity] = useState(0.18);
  const [preset, setPreset] = useState("linen");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    setWallpaperUrl(profile.wallpaper_url ?? "");
    setBlur(Number(profile.wallpaper_blur ?? 0));
    setOpacity(Number(profile.wallpaper_opacity ?? 0.18));
    setPreset(profile.wallpaper_preset || "linen");
    if (!profile.wallpaper_url) {
      setPreview("");
      return;
    }
    void resolveWallpaperUrl(profile.wallpaper_url).then(setPreview);
  }, [profile]);

  useEffect(
    () => () => {
      if (objectPreview.current) URL.revokeObjectURL(objectPreview.current);
    },
    [],
  );

  async function upload(file?: File) {
    if (!file || !user) return;
    setError("");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("壁纸需为 JPG、PNG 或 WebP，且不超过 5MB。");
      return;
    }
    setUploading(true);
    const optimizedFile = await optimizeWallpaperUpload(file);
    if (objectPreview.current) URL.revokeObjectURL(objectPreview.current);
    objectPreview.current = URL.createObjectURL(optimizedFile);
    setPreview(objectPreview.current);
    void preloadWallpaperUrl(objectPreview.current);
    const ext = optimizedFile.type === "image/webp" ? "webp" : file.name.split(".").pop() || "jpg";
    const path = `${user.id}/wallpaper-${Date.now()}.${ext}`;
    const { error: uploadError } = await db.storage
      .from("wallpapers")
      .upload(path, optimizedFile, { upsert: false, contentType: optimizedFile.type });
    if (uploadError) {
      setError("壁纸上传失败，请稍后重试。");
      URL.revokeObjectURL(objectPreview.current);
      objectPreview.current = "";
      setPreview("");
      setUploading(false);
      return;
    }
    const signedUrl = await resolveWallpaperUrl(path);
    setWallpaperUrl(path);
    setPreview(signedUrl);
    cacheWallpaperUrl(path, signedUrl);
    URL.revokeObjectURL(objectPreview.current);
    objectPreview.current = "";
    setUploading(false);
  }

  async function save() {
    if (!user) return;
    const previous = getWallpaperSnapshot();
    const next: WallpaperSnapshot = {
      path: wallpaperUrl,
      url: preview,
      preset,
      blur,
      opacity,
    };
    applyWallpaperOptimistically(next);
    setSaving(true);
    setError("");
    const previousPath = profile?.wallpaper_url;
    const { error: saveError } = await db
      .from("profiles")
      .update({
        wallpaper_url: wallpaperUrl || null,
        wallpaper_blur: Math.min(24, Math.max(0, blur)),
        wallpaper_opacity: Math.min(0.75, Math.max(0, opacity)),
        wallpaper_preset: preset,
      })
      .eq("id", user.id);
    setSaving(false);
    if (saveError) {
      rollbackWallpaper(previous);
      setError("壁纸保存失败，请稍后重试。");
      return;
    }
    commitWallpaper(next);
    if (previousPath && previousPath !== wallpaperUrl) {
      void db.storage.from("wallpapers").remove([previousPath]);
    }
    void refreshProfile();
  }

  async function removeCustomWallpaper() {
    if (!user || !wallpaperUrl) return;
    const previous = getWallpaperSnapshot();
    const next: WallpaperSnapshot = { path: "", url: "", preset, blur, opacity };
    applyWallpaperOptimistically(next);
    setWallpaperUrl("");
    setPreview("");
    setSaving(true);
    setError("");
    const path = wallpaperUrl;
    const { error: updateError } = await db
      .from("profiles")
      .update({ wallpaper_url: null, wallpaper_preset: preset })
      .eq("id", user.id);
    if (updateError) {
      rollbackWallpaper(previous);
      setWallpaperUrl(path);
      setPreview(previous.url);
      setError("删除自定义壁纸失败，请稍后重试。");
      setSaving(false);
      return;
    }
    commitWallpaper(next);
    void db.storage.from("wallpapers").remove([path]);
    void refreshProfile();
    setSaving(false);
  }

  if (!profile)
    return (
      <div className="page-container">
        <LoadingSpinner />
      </div>
    );

  return (
    <div className="page-container app-page">
      <Header
        title="壁纸"
        onBack={() => void closeSystemApp("wallpaper", () => navigate({ to: "/" }))}
      />
      {error && <ErrorBanner message={error} />}
      <section className={`wallpaper-preview wallpaper-preset--${preset}`}>
        {preview && (
          <span
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url(${preview})`,
              filter: `blur(${Math.min(24, Math.max(0, blur))}px)`,
              transform: blur ? "scale(1.06)" : undefined,
            }}
          />
        )}
        {preview && (
          <span
            className="absolute inset-0 bg-white"
            style={{ opacity: Math.min(0.75, Math.max(0, opacity)) }}
          />
        )}
        <div className="relative z-10 text-center">
          <p className="text-3xl font-semibold">K得机</p>
          <p className="text-sm mt-2 opacity-70">桌面预览</p>
        </div>
      </section>

      <p className="mt-6 mb-3 text-sm font-medium">默认背景</p>
      <div className="wallpaper-presets" role="radiogroup" aria-label="选择默认背景">
        {presets.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={preset === item.id}
            onClick={() => setPreset(item.id)}
            className={preset === item.id ? "wallpaper-swatch is-active" : "wallpaper-swatch"}
          >
            <span
              style={{
                background: `linear-gradient(145deg, ${item.colors[0]}, ${item.colors[1]})`,
              }}
            />
            <small>{item.label}</small>
          </button>
        ))}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => void upload(event.target.files?.[0])}
      />
      <div className="grid grid-cols-2 gap-3 mt-5">
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
          className="btn-secondary flex items-center justify-center gap-2"
        >
          <ImagePlus size={17} />
          {uploading ? "上传中…" : "选择图片"}
        </button>
        <button
          type="button"
          disabled={!wallpaperUrl || saving}
          onClick={() => void removeCustomWallpaper()}
          className="btn-secondary flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Trash2 size={17} />
          删除自定义
        </button>
      </div>

      <label className="block mt-7 text-sm font-medium">
        模糊程度 <span className="text-[var(--color-text-secondary)]">{blur}</span>
        <input
          type="range"
          min="0"
          max="24"
          step="1"
          value={blur}
          onChange={(event) => setBlur(Number(event.target.value))}
          className="w-full mt-3 accent-[var(--color-primary)]"
        />
      </label>
      <label className="block mt-6 text-sm font-medium">
        浅色遮罩{" "}
        <span className="text-[var(--color-text-secondary)]">{Math.round(opacity * 100)}%</span>
        <input
          type="range"
          min="0"
          max="0.75"
          step="0.05"
          value={opacity}
          onChange={(event) => setOpacity(Number(event.target.value))}
          className="w-full mt-3 accent-[var(--color-primary)]"
        />
      </label>

      <button
        type="button"
        disabled={saving || uploading}
        onClick={() => void save()}
        className="btn-primary w-full mt-8"
      >
        {saving ? "保存中…" : "应用壁纸"}
      </button>
    </div>
  );
}
