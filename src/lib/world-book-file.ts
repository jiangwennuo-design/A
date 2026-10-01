import { parseWorldBook, WORLD_BOOK_FILE_LIMIT } from "./world-books";
import { extractDocxText } from "./stickers/extract-text";

export const worldBookFileAccept =
  ".json,.docx,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function importWorldBookFile(file: File) {
  if (file.size > WORLD_BOOK_FILE_LIMIT) throw new Error("文件不能超过 10 MB。");
  if (file.name.toLowerCase().endsWith(".json"))
    return parseWorldBook(await file.text(), file.name);
  if (!file.name.toLowerCase().endsWith(".docx"))
    throw new Error("请选择 JSON 或 DOCX 世界书文件。");
  if (!file.size) throw new Error("DOCX 文件为空。");
  const text = (await extractDocxText(file, true)).trim();
  if (!text) throw new Error("DOCX 中没有可导入的正文。");
  return worldBookFromText(text, file.name);
}

export function worldBookFromText(text: string, fileName: string) {
  const name = fileName.replace(/\.docx$/i, "").slice(0, 120) || "世界书";
  // Respect the existing per-entry limit without truncating long documents.
  const entries = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 180_000, text.length);
    if (end < text.length) {
      const paragraph = text.lastIndexOf("\n", end - 1);
      if (paragraph > start + 90_000) end = paragraph + 1;
      else if (/^[\uDC00-\uDFFF]$/.test(text[end]!)) end -= 1;
    }
    entries.push({
      uid: entries.length,
      name: entries.length ? `${name} · ${entries.length + 1}` : name,
      content: text.slice(start, end),
      disable: false,
      constant: true,
      order: entries.length,
    });
    start = end;
  }
  return parseWorldBook(JSON.stringify({ name, entries, sourceFormat: "docx" }));
}
