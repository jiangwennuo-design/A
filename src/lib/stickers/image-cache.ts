import { cacheMediaBlob, readMediaBlob } from "../media-cache";
import { prepareChatImage } from "../chat-media";
import { resolveSignedMediaUrl } from "../signed-media";

const pending = new Map<string, Promise<Blob>>();
let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(task: () => Promise<T>) {
  if (active >= 4) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try {
    return await task();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

async function download(path: string) {
  const key = `preview/${path}`;
  const cached = await readMediaBlob("chat-media", key);
  if (cached) return cached;
  return limited(async () => {
    let blob = await readMediaBlob("chat-media", path);
    if (!blob) {
      const url = await resolveSignedMediaUrl("chat-media", path);
      if (!url) throw new Error("表情地址暂时不可用。");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(url, { signal: controller.signal, cache: "default" });
        if (
          !response.ok ||
          !/^image\/(jpeg|png|webp|gif)(;|$)/i.test(response.headers.get("content-type") || "")
        )
          throw new Error("表情图片无法读取。");
        if (Number(response.headers.get("content-length")) > 8 * 1024 * 1024)
          throw new Error("表情图片过大。");
        if (!response.body) throw new Error("表情图片为空。");
        const reader = response.body.getReader();
        const parts: Uint8Array<ArrayBuffer>[] = [];
        let bytes = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 8 * 1024 * 1024) {
            await reader.cancel();
            throw new Error("表情图片过大。");
          }
          parts.push(new Uint8Array(value));
        }
        blob = new Blob(parts, {
          type: (response.headers.get("content-type") || "").split(";")[0]!.toLowerCase(),
        });
      } finally {
        clearTimeout(timer);
      }
    }
    // Never flatten GIF. Only the picker preview is resized, not the sent original.
    if (blob.type !== "image/gif") {
      const image = await prepareChatImage(new File([blob], "preview", { type: blob.type }), 320);
      URL.revokeObjectURL(image.previewUrl);
      blob = image.blob;
    }
    void cacheMediaBlob("chat-media", key, blob);
    return blob;
  });
}

export function loadStickerPreview(path: string) {
  const existing = pending.get(path);
  if (existing) return existing;
  const promise = download(path).finally(() => pending.delete(path));
  pending.set(path, promise);
  return promise;
}
