const MAX_DOCX_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 80 * 1024 * 1024;

const imageTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export interface DocxStickerImage {
  id: string;
  name: string;
  file: File;
  previewUrl: string;
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export async function extractDocxStickerImages(file: File): Promise<DocxStickerImage[]> {
  if (!file.name.toLowerCase().endsWith(".docx")) throw new Error("请选择 .docx 文件。");
  if (!file.size) throw new Error("DOCX 文件为空。");
  if (file.size > MAX_DOCX_BYTES) throw new Error("DOCX 文件不能超过 50 MB。");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = readCentralDirectory(bytes).filter((entry) => {
    const normalized = entry.name.replaceAll("\\", "/").toLowerCase();
    const extension = normalized.split(".").pop() ?? "";
    return normalized.startsWith("word/media/") && Boolean(imageTypes[extension]);
  });
  if (!entries.length) throw new Error("这个 DOCX 中没有找到可导入的图片。");

  let totalBytes = 0;
  const results: DocxStickerImage[] = [];
  try {
    for (const [index, entry] of entries.entries()) {
      if (entry.uncompressedSize > MAX_IMAGE_BYTES) continue;
      totalBytes += entry.uncompressedSize;
      if (totalBytes > MAX_TOTAL_IMAGE_BYTES)
        throw new Error("DOCX 中的图片总量过大，请分批导入。");
      const extension = entry.name.split(".").pop()?.toLowerCase() ?? "";
      const data = await inflateEntry(bytes, entry);
      const copied = new Uint8Array(data.byteLength);
      copied.set(data);
      const blob = new Blob([copied.buffer], { type: imageTypes[extension]! });
      const name = entry.name.split(/[\\/]/).pop() || `sticker-${index + 1}.${extension}`;
      const imageFile = new File([blob], name, { type: blob.type });
      results.push({
        id: `${entry.localHeaderOffset}-${index}`,
        name,
        file: imageFile,
        previewUrl: URL.createObjectURL(blob),
      });
    }
  } catch (error) {
    releaseDocxStickerImages(results);
    throw error;
  }
  if (!results.length) throw new Error("DOCX 中的图片过大或格式不受支持。");
  return results;
}

export function releaseDocxStickerImages(images: DocxStickerImage[]) {
  for (const image of images) URL.revokeObjectURL(image.previewUrl);
}

function readCentralDirectory(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimum = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("无法读取 DOCX 文件结构。");
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error("DOCX 文件目录已损坏。");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localHeaderOffset;
  if (offset + 30 > bytes.length || view.getUint32(offset, true) !== 0x04034b50)
    throw new Error("DOCX 图片资源已损坏。");
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const start = offset + 30 + nameLength + extraLength;
  if (start + entry.compressedSize > bytes.length) throw new Error("DOCX 图片资源不完整。");
  const compressed = bytes.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method !== 8) throw new Error("DOCX 中包含暂不支持的图片压缩格式。");
  const stream = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
