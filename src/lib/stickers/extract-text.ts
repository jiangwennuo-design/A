const MAX_MANIFEST_BYTES = 10 * 1024 * 1024;
const textExtensions = [".txt", ".text", ".md", ".manifest"];

export const stickerManifestAccept = [
  ...textExtensions,
  ".docx",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
].join(",");

export async function extractStickerManifestText(file: File) {
  if (!file.size) throw new Error("索引文件为空。");
  if (file.size > MAX_MANIFEST_BYTES) throw new Error("索引文件不能超过 10 MB。");
  const lower = file.name.toLowerCase();
  const text = lower.endsWith(".docx")
    ? await extractDocxText(file)
    : textExtensions.some((extension) => lower.endsWith(extension))
      ? await file.text()
      : "";
  if (!text) throw new Error("请选择 TXT、DOCX、MD 或 MANIFEST 文件。");
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (!clean) throw new Error("索引文件中没有可解析的文字。");
  return clean;
}

async function extractDocxText(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entry = readCentralDirectory(bytes).find(
    (value) => value.name.replaceAll("\\", "/") === "word/document.xml",
  );
  if (!entry) throw new Error("DOCX 中没有找到正文内容。");
  const xmlBytes = await inflateEntry(bytes, entry);
  const document = new DOMParser().parseFromString(
    new TextDecoder("utf-8").decode(xmlBytes),
    "application/xml",
  );
  if (document.querySelector("parsererror")) throw new Error("DOCX 正文格式已损坏。");
  return Array.from(document.getElementsByTagNameNS("*", "p"))
    .map((paragraph) =>
      Array.from(paragraph.getElementsByTagNameNS("*", "t"))
        .map((node) => node.textContent ?? "")
        .join(""),
    )
    .filter((value) => value.trim())
    .join("\n");
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function readCentralDirectory(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("无法读取 DOCX 文件结构。");
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error("DOCX 文件目录已损坏。");
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    entries.push({
      name: new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength)),
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      localHeaderOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateEntry(bytes: Uint8Array, entry: ZipEntry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localHeaderOffset;
  if (offset + 30 > bytes.length || view.getUint32(offset, true) !== 0x04034b50)
    throw new Error("DOCX 正文资源已损坏。");
  const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
  if (start + entry.compressedSize > bytes.length) throw new Error("DOCX 正文资源不完整。");
  const compressed = bytes.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method !== 8) throw new Error("DOCX 使用了暂不支持的压缩格式。");
  const stream = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
