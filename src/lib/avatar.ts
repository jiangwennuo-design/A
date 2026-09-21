import { supabase } from "@/integrations/supabase/client";

const PRIVATE_MEDIA_BUCKET = "wallpapers";
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function resolveAvatarUrl(value: string | null | undefined): Promise<string> {
  const avatar = value?.trim();
  if (!avatar) return "";
  if (/^(https?:|data:|blob:)/i.test(avatar)) return avatar;

  const { data } = await supabase.storage.from(PRIVATE_MEDIA_BUCKET).createSignedUrl(avatar, 3600);
  return data?.signedUrl ?? "";
}

export async function uploadAvatar(userId: string, file: File, owner: "profile" | "penpal") {
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    throw new Error("头像需为 JPG、PNG 或 WebP 图片。");
  }
  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error("头像图片不能超过 5MB。");
  }

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const unique =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${userId}/avatars/${owner}-${unique}.${extension}`;
  const { error } = await supabase.storage
    .from(PRIVATE_MEDIA_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });

  if (error) throw new Error("头像上传失败，请稍后重试。");
  return { path, previewUrl: await resolveAvatarUrl(path) };
}
