import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ImagePlus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { ErrorBanner, Header, LoadingSpinner } from "@/components/ui-kit";
import { closeSystemApp } from "@/lib/app-transition";
import {
  applyWallpaperOptimistically,
  commitWallpaper,
  getWallpaperSnapshot,
  optimizeWallpaperUpload,
  resolveWallpaperUrl,
  rollbackWallpaper,
  syncWallpaperFromProfile,
  type WallpaperSnapshot,
} from "@/lib/wallpaper";
import { rememberWallpaper, retainWallpaperUrl } from "@/lib/wallpaper-media";

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
  const alive = useRef(true);
  const dirty = useRef(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<WallpaperSnapshot | null>(null);
  const saveQueue = useRef(Promise.resolve());
  const lastCommitted = useRef(getWallpaperSnapshot());
  const flushSave = useRef<() => void>(() => {});
  const [wallpaperUrl, setWallpaperUrl] = useState("");
  const [preview, setPreview] = useState("");
  const [blur, setBlur] = useState(0);
  const [opacity, setOpacity] = useState(0.18);
  const [preset, setPreset] = useState("linen");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => retainWallpaperUrl(preview), [preview]);

  useEffect(() => {
    if (!profile || dirty.current) return;
    syncWallpaperFromProfile(profile);
    lastCommitted.current = getWallpaperSnapshot();
    let active = true;
    setWallpaperUrl(profile.wallpaper_url ?? "");
    setBlur(Number(profile.wallpaper_blur ?? 0));
    setOpacity(Number(profile.wallpaper_opacity ?? 0.18));
    setPreset(profile.wallpaper_preset || "linen");
    if (!profile.wallpaper_url) {
      setPreview("");
      return;
    }
    void resolveWallpaperUrl(profile.wallpaper_url).then((url) => {
      if (active && !dirty.current) setPreview(url);
    });
    return () => {
      active = false;
    };
  }, [profile]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      flushSave.current();
      if (objectPreview.current) URL.revokeObjectURL(objectPreview.current);
    };
  }, []);

  async function upload(file?: File) {
    if (!file || !user || uploading || saving) return;
    setError("");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 16 * 1024 * 1024
    ) {
      setError("壁纸需为 JPG、PNG 或 WebP，且不超过 16MB（上传前会压缩）。");
      return;
    }
    setUploading(true);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    flushSave.current();
    await saveQueue.current;
    dirty.current = true;
    const previous = getWallpaperSnapshot();
    const previousPreview = preview;
    if (objectPreview.current) URL.revokeObjectURL(objectPreview.current);
    objectPreview.current = URL.createObjectURL(file);
    setPreview(objectPreview.current);
    applyWallpaperOptimistically({
      path: wallpaperUrl,
      url: objectPreview.current,
      preset,
      blur,
      opacity,
    });
    try {
      const optimizedFile = await optimizeWallpaperUpload(file);
      const ext = optimizedFile.name.split(".").pop() || "jpg";
      const path = `${user.id}/wallpaper-${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await db.storage
        .from("wallpapers")
        .upload(path, optimizedFile, { upsert: false, contentType: optimizedFile.type });
      if (uploadError) throw new Error("壁纸上传失败，请稍后重试。");
      const localUrl = rememberWallpaper(path, optimizedFile);
      try {
        await save({ path, url: localUrl, preset, blur, opacity }, previous);
      } catch (reason) {
        void db.storage.from("wallpapers").remove([path]);
        throw reason;
      }
      if (alive.current) {
        setWallpaperUrl(path);
        setPreview(localUrl);
      }
      URL.revokeObjectURL(objectPreview.current);
      objectPreview.current = "";
    } catch (reason) {
      rollbackWallpaper(previous);
      if (alive.current) {
        setError(reason instanceof Error ? reason.message : "壁纸处理失败。");
        setPreview(previousPreview);
      }
      if (objectPreview.current) URL.revokeObjectURL(objectPreview.current);
      objectPreview.current = "";
    } finally {
      if (alive.current) setUploading(false);
    }
  }

  async function save(next: WallpaperSnapshot, previous = getWallpaperSnapshot()) {
    if (!user) return;
    applyWallpaperOptimistically(next);
    if (alive.current) {
      setSaving(true);
      setError("");
    }
    const previousPath = previous.path;
    const { error: saveError } = await db
      .from("profiles")
      .update({
        wallpaper_url: next.path || null,
        wallpaper_blur: Math.min(24, Math.max(0, next.blur)),
        wallpaper_opacity: Math.min(0.75, Math.max(0, next.opacity)),
        wallpaper_preset: next.preset,
      })
      .eq("id", user.id);
    if (alive.current) setSaving(false);
    if (saveError) {
      rollbackWallpaper(previous);
      throw new Error("壁纸保存失败，请稍后重试。");
    }
    await refreshProfile();
    commitWallpaper(next);
    lastCommitted.current = next;
    if (previousPath && previousPath !== next.path && previousPath.startsWith(`${user.id}/`)) {
      void db.storage.from("wallpapers").remove([previousPath]);
    }
  }

  function queueOptions(patch: Partial<WallpaperSnapshot>) {
    dirty.current = true;
    const next = { ...getWallpaperSnapshot(), ...patch };
    applyWallpaperOptimistically(next);
    pendingSave.current = next;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => flushSave.current(), 250);
  }
  flushSave.current = () => {
    const next = pendingSave.current;
    pendingSave.current = null;
    if (!next) return;
    saveQueue.current = saveQueue.current
      .then(() => save(next, lastCommitted.current))
      .catch((reason) => {
        if (alive.current) setError(reason instanceof Error ? reason.message : "壁纸保存失败。");
      });
  };

  async function removeCustomWallpaper() {
    if (!user || !wallpaperUrl) return;
    dirty.current = true;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    flushSave.current();
    await saveQueue.current;
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
    lastCommitted.current = next;
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
            disabled={uploading || saving}
            onClick={() => {
              setPreset(item.id);
              queueOptions({ preset: item.id });
            }}
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
          disabled={!wallpaperUrl || saving || uploading}
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
          disabled={uploading || saving}
          onChange={(event) => {
            const next = Number(event.target.value);
            setBlur(next);
            queueOptions({ blur: next });
          }}
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
          disabled={uploading || saving}
          onChange={(event) => {
            const next = Number(event.target.value);
            setOpacity(next);
            queueOptions({ opacity: next });
          }}
          className="w-full mt-3 accent-[var(--color-primary)]"
        />
      </label>
    </div>
  );
}
