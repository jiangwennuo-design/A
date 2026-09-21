import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, UserRound } from "lucide-react";
import { resolveAvatarUrl, uploadAvatar } from "@/lib/avatar";

interface AvatarPickerProps {
  label: string;
  owner: "profile" | "penpal";
  userId: string;
  value: string;
  onChange: (value: string) => void;
  onError: (message: string) => void;
}

export function AvatarPicker({
  label,
  owner,
  userId,
  value,
  onChange,
  onError,
}: AvatarPickerProps) {
  const albumInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let active = true;
    void resolveAvatarUrl(value).then((url) => {
      if (active) setPreview(url);
    });
    return () => {
      active = false;
    };
  }, [value]);

  async function choose(file?: File) {
    if (!file) return;
    const temporaryUrl = URL.createObjectURL(file);
    setPreview(temporaryUrl);
    setUploading(true);
    onError("");
    try {
      const uploaded = await uploadAvatar(userId, file, owner);
      onChange(uploaded.path);
      setPreview(uploaded.previewUrl);
    } catch (error) {
      setPreview(await resolveAvatarUrl(value));
      onError(error instanceof Error ? error.message : "头像上传失败。");
    } finally {
      URL.revokeObjectURL(temporaryUrl);
      setUploading(false);
      if (albumInput.current) albumInput.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
    }
  }

  return (
    <section className="mb-5">
      <p className="text-sm font-medium mb-2">{label}</p>
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 shrink-0 rounded-full overflow-hidden bg-white border border-[var(--color-border)] flex items-center justify-center">
          {preview ? (
            <img src={preview} alt="头像预览" className="w-full h-full object-cover" />
          ) : (
            <UserRound size={30} className="text-[var(--color-text-secondary)]" />
          )}
        </div>
        <div className="flex-1 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => albumInput.current?.click()}
            className="btn-secondary !px-3 !py-2 text-sm flex items-center justify-center gap-1.5"
          >
            <ImagePlus size={16} />
            从相册选择
          </button>
          <button
            type="button"
            disabled={uploading}
            onClick={() => cameraInput.current?.click()}
            className="btn-secondary !px-3 !py-2 text-sm flex items-center justify-center gap-1.5"
          >
            <Camera size={16} />
            拍照
          </button>
          <p className="col-span-2 text-xs text-[var(--color-text-secondary)]">
            {uploading ? "正在上传…" : "JPG、PNG 或 WebP，不超过 5MB"}
          </p>
        </div>
      </div>
      <input
        ref={albumInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => void choose(event.target.files?.[0])}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => void choose(event.target.files?.[0])}
      />
      <label className="block text-xs text-[var(--color-text-secondary)] mt-3">
        或粘贴图片网址
        <input
          className="input-field mt-1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://..."
        />
      </label>
    </section>
  );
}
