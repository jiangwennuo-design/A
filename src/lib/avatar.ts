import { supabase } from "@/integrations/supabase/client";
import { resolveSignedMediaUrl } from "./signed-media";
import { prepareChatImage } from "./chat-media";
import { cacheMediaBlob } from "./media-cache";

const PRIVATE_MEDIA_BUCKET = "wallpapers";
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function resolveAvatarUrl(value: string | null | undefined): Promise<string> {
  const avatar = value?.trim();
  if (!avatar) return "";
  if (/^(https?:|data:|blob:)/i.test(avatar)) return avatar;

  return resolveSignedMediaUrl(PRIVATE_MEDIA_BUCKET, avatar);
}

export async function uploadAvatar(userId: string, file: File, owner: "profile" | "penpal") {
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    throw new Error("头像需为 JPG、PNG 或 WebP 图片。");
  }
  const image = await prepareChatImage(file, 384, MAX_AVATAR_SIZE);
  try {
    const extension = image.extension;
    const unique =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const path = `${userId}/avatars/${owner}-${unique}.${extension}`;
    const { error } = await supabase.storage
      .from(PRIVATE_MEDIA_BUCKET)
      .upload(path, image.blob, { upsert: false, contentType: image.blob.type });

    if (error) throw new Error("头像上传失败，请稍后重试。");
    void cacheMediaBlob(PRIVATE_MEDIA_BUCKET, path, image.blob);
    return { path, previewUrl: image.previewUrl };
  } catch (error) {
    URL.revokeObjectURL(image.previewUrl);
    throw error;
  }
}
