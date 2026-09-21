const MAX_PERSONA_FILE_BYTES = 1_000_000;

function decode(bytes: Uint8Array) {
  return new TextDecoder("utf-8").decode(bytes);
}

/** Read plain text or the main document XML from a small DOCX in the browser. */
async function readDocx(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let offset = 0;
  while (offset + 30 < bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    if (view.getUint32(0, true) !== 0x04034b50) break;
    const flags = view.getUint16(6, true);
    const method = view.getUint16(8, true);
    const compressedSize = view.getUint32(18, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const nameStart = offset + 30;
    const name = decode(bytes.slice(nameStart, nameStart + nameLength));
    const bodyStart = nameStart + nameLength + extraLength;
    if (name === "word/document.xml") {
      if (flags & 0x08) throw new Error("该 DOCX 格式暂不支持，请另存为标准 .docx 后重试。");
      const body = bytes.slice(bodyStart, bodyStart + compressedSize);
      const xml = method === 0
        ? decode(body)
        : decode(new Uint8Array(await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()));
      const document = new DOMParser().parseFromString(xml, "application/xml");
      return Array.from(document.querySelectorAll("w\\:p, p"))
        .map((node) => Array.from(node.querySelectorAll("w\\:t, t")).map((text) => text.textContent ?? "").join(""))
        .filter(Boolean)
        .join("\n");
    }
    offset = bodyStart + compressedSize;
  }
  throw new Error("无法读取 DOCX 正文。");
}

export async function importPersonaFile(file: File): Promise<string> {
  if (file.size === 0) throw new Error("文件为空。");
  if (file.size > MAX_PERSONA_FILE_BYTES) throw new Error("文件不能超过 1MB。");
  const lowerName = file.name.toLowerCase();
  const text = lowerName.endsWith(".txt") ? await file.text() : lowerName.endsWith(".docx") ? await readDocx(file) : "";
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) throw new Error("文件中没有可用文字。");
  return clean;
}
