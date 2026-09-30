import { supabase } from "@/integrations/supabase/client";
import { prepareChatImage } from "./chat-media";
import { cachedWallpaperUrl, rememberWallpaper } from "./wallpaper-media";
import { assertSafeRemoteUrl } from "./stickers/resolve-resource";
import type { CharacterChatPreferences } from "./character-chat";
import type { AiPersona } from "./types";
import {
  beginCharacterWallpaper,
  commitCharacterWallpaper,
  failCharacterWallpaper,
  isCurrentWallpaperOperation,
  readCharacterWallpaper,
} from "./chat-wallpaper-state";

export interface WallpaperTimings {
  previewMs: number;
  processingMs: number;
  uploadMs: number;
  urlMs: number;
  saveMs: number;
  totalMs: number;
  inputBytes: number;
  uploadBytes: number;
}
const timings = new Map<string, WallpaperTimings>();
const saves = new Map<string, Promise<unknown>>();
const uploads = new Map<string, { file: File; promise: Promise<AiPersona | null> }>();
function allowPreviewPaint() {
  if (typeof requestAnimationFrame !== "function") return Promise.resolve();
  return new Promise<void>((resolve) => {
    let frame = 0;
    const finish = () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      resolve();
    };
    // Background Safari tabs may suspend animation frames; persistence must still progress.
    const timer = setTimeout(finish, 80);
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(finish);
    });
  });
}
export const characterWallpaperTimings = (userId: string, charId: string) =>
  timings.get(`${userId}:${charId}`);

/** Persist only wallpaper fields, preserving saved appearance, identity and memory settings. */
export async function saveCharacterWallpaper(
  userId: string,
  charId: string,
  patch: Pick<CharacterChatPreferences, "wallpaperPath" | "wallpaperUrl">,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db.rpc("save_character_wallpaper", {
    p_character_id: charId,
    p_wallpaper: patch,
  });
  if (error || !data) throw new Error("聊天壁纸保存失败，请重试。");
  if (data.id !== charId || data.user_id !== userId) throw new Error("角色壁纸保存范围错误。");
  // Do not immediately delete older files: other devices/old tabs may still display them.
  return data as AiPersona;
}

async function persistLatest(
  userId: string,
  charId: string,
  revision: number,
  patch: Pick<CharacterChatPreferences, "wallpaperPath" | "wallpaperUrl">,
) {
  const key = `${userId}:${charId}`;
  const request = (saves.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(() =>
      isCurrentWallpaperOperation(userId, charId, revision)
        ? saveCharacterWallpaper(userId, charId, patch)
        : null,
    );
  saves.set(key, request);
  try {
    return await request;
  } finally {
    if (saves.get(key) === request) saves.delete(key);
  }
}

/** Preview is synchronous and shared with the conversation; work outlives the editor. */
export function changeCharacterWallpaper(userId: string, charId: string, file: File) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 16 * 1024 * 1024)
    return Promise.reject(new Error("请选择不超过 16MB 的 JPG、PNG 或 WebP 图片。"));
  const key = `${userId}:${charId}`;
  const existing = uploads.get(key);
  if (existing?.file === file) return existing.promise;
  const started = performance.now();
  const preview = URL.createObjectURL(file);
  const operation = beginCharacterWallpaper(userId, charId, preview);
  const stages: WallpaperTimings = {
    previewMs: performance.now() - started,
    processingMs: 0,
    uploadMs: 0,
    urlMs: 0,
    saveMs: 0,
    totalMs: 0,
    inputBytes: file.size,
    uploadBytes: 0,
  };
  const promise = (async () => {
    let uploadedPath = "",
      saved = false;
    try {
      await allowPreviewPaint();
      if (!isCurrentWallpaperOperation(userId, charId, operation.revision)) return null;
      const path = await uploadCharacterWallpaper(userId, charId, file, stages);
      uploadedPath = path;
      const urlStarted = performance.now();
      const url = await cachedWallpaperUrl(path);
      stages.urlMs = performance.now() - urlStarted;
      const saveStarted = performance.now();
      const character = await persistLatest(userId, charId, operation.revision, {
        wallpaperPath: path,
        wallpaperUrl: null,
      });
      stages.saveMs = performance.now() - saveStarted;
      if (!character) {
        void supabase.storage.from("wallpapers").remove([path]);
        return null;
      }
      saved = true;
      return commitCharacterWallpaper(
        userId,
        charId,
        operation.revision,
        readCharacterWallpaper(character),
        url,
      )
        ? character
        : null;
    } catch (reason) {
      if (uploadedPath && !saved) void supabase.storage.from("wallpapers").remove([uploadedPath]);
      failCharacterWallpaper(
        userId,
        charId,
        operation,
        reason instanceof Error ? reason.message : "壁纸上传失败。",
      );
      throw reason;
    } finally {
      stages.totalMs = performance.now() - started;
      if (isCurrentWallpaperOperation(userId, charId, operation.revision)) timings.set(key, stages);
      // Let both preview consumers paint their replacement before releasing the original.
      setTimeout(() => URL.revokeObjectURL(preview), 1000);
    }
  })();
  uploads.set(key, { file, promise });
  void promise
    .finally(() => {
      if (uploads.get(key)?.promise === promise) uploads.delete(key);
    })
    .catch(() => {});
  return promise;
}

export async function changeCharacterWallpaperReference(
  userId: string,
  charId: string,
  patch: Pick<CharacterChatPreferences, "wallpaperPath" | "wallpaperUrl">,
) {
  const url = await characterWallpaperUrl(patch);
  const operation = beginCharacterWallpaper(userId, charId, url);
  try {
    const character = await persistLatest(userId, charId, operation.revision, patch);
    if (!character) return null;
    return commitCharacterWallpaper(
      userId,
      charId,
      operation.revision,
      readCharacterWallpaper(character),
      url,
    )
      ? character
      : null;
  } catch (reason) {
    failCharacterWallpaper(
      userId,
      charId,
      operation,
      reason instanceof Error ? reason.message : "壁纸保存失败。",
    );
    throw reason;
  }
}

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

export async function uploadCharacterWallpaper(
  userId: string,
  charId: string,
  file: File,
  stages?: WallpaperTimings,
) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type))
    throw new Error("请选择 JPG、PNG 或 WebP 图片。");
  const processingStarted = performance.now();
  // Wallpaper-only budget: encode once and avoid multi-megabyte original PNG uploads.
  const image = await prepareChatImage(file, 1600, 900_000, { alwaysEncode: true });
  if (stages) {
    stages.processingMs = performance.now() - processingStarted;
    stages.uploadBytes = image.blob.size;
  }
  try {
    if (image.blob.size > 5 * 1024 * 1024) throw new Error("处理后的壁纸不能超过 5MB。");
    const path = `${userId}/chat-wallpapers/${charId}/${crypto.randomUUID()}.${image.extension}`;
    const uploadStarted = performance.now();
    const { error } = await supabase.storage.from("wallpapers").upload(path, image.blob, {
      contentType: image.blob.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (stages) stages.uploadMs = performance.now() - uploadStarted;
    if (error) throw new Error("壁纸上传失败，请稍后重试。");
    rememberWallpaper(path, image.blob);
    return path;
  } finally {
    URL.revokeObjectURL(image.previewUrl);
  }
}
