import { supabase } from "@/integrations/supabase/client";

export interface DiaryProfile {
  avatarPath: string | null;
  coverPath: string | null;
  displayName: string;
  username: string;
  bio: string;
  citizenTitle: string;
  badge: string;
  createdAt: string;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function initialDiaryProfile(
  userId: string,
  fallbackName: string,
  createdAt: string,
): DiaryProfile {
  return {
    avatarPath: null,
    coverPath: null,
    displayName: fallbackName.trim() || "我",
    username: `k${userId.slice(0, 8)}`,
    bio: "",
    citizenTitle: "",
    badge: "",
    createdAt,
  };
}

export function readDiaryProfile(value: unknown): DiaryProfile | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof data["displayName"] !== "string" || typeof data["username"] !== "string") return null;
  return {
    avatarPath: typeof data["avatarPath"] === "string" ? data["avatarPath"] : null,
    coverPath: typeof data["coverPath"] === "string" ? data["coverPath"] : null,
    displayName: data["displayName"],
    username: data["username"],
    bio: typeof data["bio"] === "string" ? data["bio"] : "",
    citizenTitle: typeof data["citizenTitle"] === "string" ? data["citizenTitle"] : "",
    badge: typeof data["badge"] === "string" ? data["badge"] : "",
    createdAt: typeof data["createdAt"] === "string" ? data["createdAt"] : new Date().toISOString(),
  };
}

export async function uploadDiaryProfileImage(
  userId: string,
  file: File,
  kind: "avatar" | "cover",
) {
  if (!IMAGE_TYPES.has(file.type)) throw new Error("请选择 JPG、PNG 或 WebP 图片。");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("图片不能超过 8MB。");
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/diary-profile/${kind}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("moments").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error("图片上传失败，请稍后重试。");
  return path;
}
