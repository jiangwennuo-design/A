import { supabase } from "@/integrations/supabase/client";

const PRIVATE_MEDIA_BUCKET = "wallpapers";
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const signedMedia = new Map<string, { expires: number; promise: Promise<string> }>();

export async function resolveAvatarUrl(value: string | null | undefined): Promise<string> {
  const avatar = value?.trim();
  if (!avatar) return "";
  if (/^(https?:|data:|blob:)/i.test(avatar)) return avatar;

  const cached = signedMedia.get(avatar);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = supabase.storage
    .from(PRIVATE_MEDIA_BUCKET)
    .createSignedUrl(avatar, 3600)
    .then(({ data }) => {
      if (!data?.signedUrl) signedMedia.delete(avatar);
      return data?.signedUrl ?? "";
    })
    .catch(() => {
      signedMedia.delete(avatar);
      return "";
    });
  // Share in-flight requests and expire before the signed URL does. Keep memory bounded.
  if (signedMedia.size >= 100) signedMedia.delete(signedMedia.keys().next().value!);
  signedMedia.set(avatar, { expires: Date.now() + 45 * 60_000, promise });
  return promise;
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
