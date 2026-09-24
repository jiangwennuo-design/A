/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertSafeRemoteUrl } from "./resolve-resource";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const allowedTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const remoteInput = z.object({ sourceUrl: z.string().url().max(2_048) });
const importInput = remoteInput.extend({
  packId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
});

export const inspectRemoteSticker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => remoteInput.parse(data))
  .handler(async ({ data }) => {
    let response = await safeFetch(data.sourceUrl, { method: "HEAD" });
    if (!response.ok || !normalizedMime(response.headers.get("content-type"))) {
      await cancelBody(response);
      response = await safeFetch(data.sourceUrl, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
      });
    }
    if (!response.ok) {
      await cancelBody(response);
      throw new Error(httpError(response.status));
    }
    const mimeType = validateHeaders(response);
    const size = declaredSize(response.headers);
    await cancelBody(response);
    return { mimeType, size };
  });

export const importRemoteSticker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => importInput.parse(data))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: pack, error: packError } = await db
      .from("sticker_packs")
      .select("id")
      .eq("id", data.packId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (packError || !pack) throw new Error("表情包分组不存在或无权访问。");

    const response = await safeFetch(data.sourceUrl, { method: "GET" });
    if (!response.ok) {
      await cancelBody(response);
      throw new Error(httpError(response.status));
    }
    const mimeType = validateHeaders(response);
    const bytes = await readLimitedBody(response, MAX_IMAGE_BYTES);
    if (detectImageMime(bytes) !== mimeType)
      throw new Error("远程图片内容与 Content-Type 不一致。");
    const contentHash = await sha256(bytes);
    const { data: existing, error: existingError } = await db
      .from("chat_stickers")
      .select("*")
      .eq("user_id", context.userId)
      .eq("content_hash", contentHash)
      .maybeSingle();
    if (existingError) throw new Error("无法检查重复表情。");
    if (existing) return { status: "exists" as const, sticker: existing };

    const extension = allowedTypes[mimeType]!;
    const path = `${context.userId}/stickers/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await db.storage.from("chat-media").upload(path, bytes, {
      contentType: mimeType,
      upsert: false,
    });
    if (uploadError) throw new Error("图片上传失败，请稍后重试。");
    const values = {
      user_id: context.userId,
      pack_id: data.packId,
      file_path: path,
      name: data.name,
      tags: [...new Set(data.tags)],
      source_url: data.sourceUrl,
      mime_type: mimeType,
      content_hash: contentHash,
    };
    const { data: sticker, error: insertError } = await db
      .from("chat_stickers")
      .insert(values)
      .select("*")
      .single();
    if (insertError || !sticker) {
      await db.storage.from("chat-media").remove([path]);
      const { data: duplicate } = await db
        .from("chat_stickers")
        .select("*")
        .eq("user_id", context.userId)
        .eq("content_hash", contentHash)
        .maybeSingle();
      if (duplicate) return { status: "exists" as const, sticker: duplicate };
      throw new Error("表情元数据保存失败。");
    }
    return { status: "imported" as const, sticker };
  });

export const deleteStickerPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ packId: z.string().uuid(), deleteStickers: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: pack } = await db
      .from("sticker_packs")
      .select("id")
      .eq("id", data.packId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!pack) throw new Error("表情包分组不存在或无权访问。");
    if (data.deleteStickers) {
      const { data: stickers } = await db
        .from("chat_stickers")
        .select("file_path")
        .eq("pack_id", data.packId)
        .eq("user_id", context.userId);
      const paths = (stickers ?? []).map((item: { file_path: string }) => item.file_path);
      for (let offset = 0; offset < paths.length; offset += 100) {
        const { error } = await db.storage
          .from("chat-media")
          .remove(paths.slice(offset, offset + 100));
        if (error) throw new Error("表情图片删除失败，分组尚未修改。");
      }
      const { error } = await db
        .from("chat_stickers")
        .delete()
        .eq("pack_id", data.packId)
        .eq("user_id", context.userId);
      if (error) throw new Error("表情记录删除失败。");
    } else {
      const { error } = await db
        .from("chat_stickers")
        .update({ pack_id: null })
        .eq("pack_id", data.packId)
        .eq("user_id", context.userId);
      if (error) throw new Error("无法解除表情分组。");
    }
    const { error: packDeleteError } = await db
      .from("sticker_packs")
      .delete()
      .eq("id", data.packId)
      .eq("user_id", context.userId);
    if (packDeleteError) throw new Error("表情包分组删除失败。");
    return { ok: true };
  });

async function safeFetch(value: string, init: RequestInit) {
  let url = assertSafeRemoteUrl(value);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, { ...init, redirect: "manual", signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("资源请求超时。");
      throw new Error("资源无法读取或远程服务器拒绝访问。");
    } finally {
      clearTimeout(timeout);
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await cancelBody(response);
    if (!location) throw new Error("远程服务器返回了无效跳转。");
    url = assertSafeRemoteUrl(new URL(location, url).toString());
  }
  throw new Error("资源跳转次数过多。");
}

function validateHeaders(response: Response) {
  const mimeType = normalizedMime(response.headers.get("content-type"));
  if (!mimeType || !allowedTypes[mimeType])
    throw new Error("远程资源不是受支持的 PNG、JPG、WebP 或 GIF 图片。");
  const size = declaredSize(response.headers);
  if (size && size > MAX_IMAGE_BYTES) throw new Error("远程图片不能超过 8 MB。");
  return mimeType;
}

function normalizedMime(value: string | null) {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function declaredSize(headers: Headers) {
  const range = headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
  return Number(range ?? headers.get("content-length") ?? 0) || 0;
}

function detectImageMime(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  const header = new TextDecoder("ascii").decode(bytes.slice(0, 12));
  if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) return "image/gif";
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") return "image/webp";
  return "";
}

async function readLimitedBody(response: Response, limit: number) {
  if (!response.body) throw new Error("远程图片没有可读取的内容。");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      await reader.cancel();
      throw new Error("资源下载超时。");
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("资源下载超时。")), remaining);
        }),
      ]);
    } catch (error) {
      await reader.cancel();
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
    const { value, done } = chunk;
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error("远程图片不能超过 8 MB。");
    }
    chunks.push(value);
  }
  if (!total) throw new Error("远程图片内容为空。");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function sha256(bytes: Uint8Array) {
  const copied = new Uint8Array(bytes.byteLength);
  copied.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copied.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function cancelBody(response: Response) {
  try {
    await response.body?.cancel();
  } catch {
    /* nothing else to release */
  }
}

function httpError(status: number) {
  if (status === 404) return "远程图片不存在（404）。";
  if (status === 401 || status === 403) return "远程服务器拒绝访问该图片。";
  return `远程图片请求失败（${status}）。`;
}
