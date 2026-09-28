import { supabase } from "@/integrations/supabase/client";
import { prepareChatImage } from "./chat-media";
import { cachedWallpaperUrl, rememberWallpaper } from "./wallpaper-media";
import { assertSafeRemoteUrl } from "./stickers/resolve-resource";
import type { CharacterChatPreferences } from "./character-chat";

export function characterWallpaperUrl(
  preferences: Pick<CharacterChatPreferences, "wallpaperPath" | "wallpaperUrl">,
) {
  if (preferences.wallpaperPath) return cachedWallpaperUrl(preferences.wallpaperPath);
  try {
    return Promise.resolve(
      preferences.wallpaperUrl ? assertSafeRemoteUrl(preferences.wallpaperUrl).toString() : "",
    );
  } catch {
    return Promise.resolve("");
  }
}

export async function uploadCharacterWallpaper(userId: string, charId: string, file: File) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type))
    throw new Error("请选择 JPG、PNG 或 WebP 图片。");
  const image = await prepareChatImage(file, 1920, 5 * 1024 * 1024);
  try {
    if (image.blob.size > 5 * 1024 * 1024) throw new Error("处理后的壁纸不能超过 5MB。");
    const path = `${userId}/chat-wallpapers/${charId}/${crypto.randomUUID()}.${image.extension}`;
    const { error } = await supabase.storage
      .from("wallpapers")
      .upload(path, image.blob, { contentType: image.blob.type });
    if (error) throw new Error("壁纸上传失败，请稍后重试。");
    rememberWallpaper(path, image.blob);
    return path;
  } finally {
    URL.revokeObjectURL(image.previewUrl);
  }
}
