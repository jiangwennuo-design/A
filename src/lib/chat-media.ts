import { supabase } from "@/integrations/supabase/client";

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  extension: "jpg" | "png" | "webp" | "gif";
  previewUrl: string;
}

export async function prepareChatImage(file: File, maxSide = 2_048): Promise<PreparedImage> {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type))
    throw new Error("请选择 JPG、PNG、WebP 或 GIF 图片。");
  if (file.size > 16 * 1024 * 1024) throw new Error("图片不能超过 16 MB。");

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  if (file.type === "image/gif" || (scale === 1 && file.size <= 2 * 1024 * 1024)) {
    bitmap.close();
    return {
      blob: file,
      width,
      height,
      extension: extensionFor(file.type),
      previewUrl: URL.createObjectURL(file),
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法处理这张图片。");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("图片压缩失败。"))),
      outputType,
      0.84,
    ),
  );
  return {
    blob,
    width,
    height,
    extension: outputType === "image/png" ? "png" : "jpg",
    previewUrl: URL.createObjectURL(blob),
  };
}

export async function uploadChatMedia(
  userId: string,
  image: PreparedImage,
  folder: "messages" | "stickers",
) {
  const path = `${userId}/${folder}/${crypto.randomUUID()}.${image.extension}`;
  const { error } = await supabase.storage.from("chat-media").upload(path, image.blob, {
    contentType: image.blob.type,
    upsert: false,
  });
  if (error) throw new Error("图片上传失败，请稍后重试。");
  return path;
}

function extensionFor(type: string): PreparedImage["extension"] {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}
