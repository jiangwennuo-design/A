import { supabase } from "@/integrations/supabase/client";
import { cacheMediaBlob } from "./media-cache";

export const MAX_CHAT_MEDIA_BYTES = 8 * 1024 * 1024;

async function decodeImage(file: File) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      /* Safari native decoder fallback */
    }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("图片读取超时。")), 15_000);
      image.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      image.onerror = () => {
        clearTimeout(timer);
        reject(new Error("图片无法读取。"));
      };
      image.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => {
        image.src = "";
        URL.revokeObjectURL(url);
      },
    };
  } catch (error) {
    image.onload = image.onerror = null;
    image.src = "";
    URL.revokeObjectURL(url);
    throw error;
  }
}

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  extension: "jpg" | "png" | "webp" | "gif";
  previewUrl: string;
}

export async function prepareChatImage(
  file: File,
  maxSide = 2_048,
  maxBytes = MAX_CHAT_MEDIA_BYTES,
  options: { alwaysEncode?: boolean } = {},
): Promise<PreparedImage> {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type))
    throw new Error("请选择 JPG、PNG、WebP 或 GIF 图片。");
  if (file.size > 16 * 1024 * 1024) throw new Error("图片不能超过 16 MB。");

  if (file.type === "image/gif" && file.size > maxBytes)
    throw new Error(
      `GIF 需不超过 ${Math.round(maxBytes / 1024 / 1024)} MB；不会将动画转换成静态图片。`,
    );
  const bitmap = await decodeImage(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * scale));
    let height = Math.max(1, Math.round(bitmap.height * scale));

    if (
      file.type === "image/gif" ||
      (!options.alwaysEncode && scale === 1 && file.size <= 2 * 1024 * 1024)
    ) {
      return {
        blob: file,
        width: bitmap.width,
        height: bitmap.height,
        extension: extensionFor(file.type),
        previewUrl: URL.createObjectURL(file),
      };
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法处理这张图片。");
    const outputType =
      file.type === "image/png" || file.type === "image/webp" ? "image/webp" : "image/jpeg";
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      canvas.width = width;
      canvas.height = height;
      context.drawImage(bitmap.source, 0, 0, width, height);
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, outputType, 0.84 - attempt * 0.08),
      );
      if (!blob) throw new Error("图片压缩失败。");
      if (blob.size <= maxBytes) break;
      width = Math.max(1, Math.round(width * 0.75));
      height = Math.max(1, Math.round(height * 0.75));
    }
    canvas.width = canvas.height = 0;
    if (!blob || blob.size > maxBytes) throw new Error("处理后的图片仍然过大，请选择较小的图片。");
    return {
      blob,
      width,
      height,
      extension: extensionFor(blob.type),
      previewUrl: URL.createObjectURL(blob),
    };
  } finally {
    bitmap.close();
  }
}

export async function uploadChatMedia(
  userId: string,
  image: PreparedImage,
  folder: "messages" | "stickers",
) {
  if (image.blob.size > MAX_CHAT_MEDIA_BYTES) throw new Error("处理后的图片不能超过 8 MB。");
  const path = `${userId}/${folder}/${crypto.randomUUID()}.${image.extension}`;
  const { error } = await supabase.storage.from("chat-media").upload(path, image.blob, {
    contentType: image.blob.type,
    upsert: false,
  });
  if (error) throw new Error("图片上传失败，请稍后重试。");
  // Uploaded stickers are already resized: don't decode/compress them again in the picker.
  void cacheMediaBlob("chat-media", folder === "stickers" ? `preview/${path}` : path, image.blob);
  return path;
}

function extensionFor(type: string): PreparedImage["extension"] {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}
