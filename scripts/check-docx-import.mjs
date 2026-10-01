// Browser DOMParser/DecompressionStream tests. Samples are read only, never stored/imported.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createRequire } from "node:module";
import { deflateRawSync } from "node:zlib";

const runtime = process.env.KDEJI_QA_MODULES;
if (!runtime) throw new Error("Set KDEJI_QA_MODULES to the existing Playwright package directory.");
const { chromium } = createRequire(`${runtime}/package.json`)("playwright");
function docx(xml, method = 8, descriptor = false) {
  const name = Buffer.from("word/document.xml"),
    raw = Buffer.from(xml);
  const data = method === 8 ? deflateRawSync(raw) : raw;
  const header = Buffer.alloc(30),
    directory = Buffer.alloc(46),
    end = Buffer.alloc(22);
  const checksum = crc32(raw),
    tail = descriptor ? Buffer.alloc(16) : Buffer.alloc(0);
  header.writeUInt32LE(0x04034b50);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(descriptor ? 8 : 0, 6);
  header.writeUInt16LE(method, 8);
  if (!descriptor) {
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(raw.length, 22);
  }
  header.writeUInt16LE(name.length, 26);
  if (descriptor) {
    tail.writeUInt32LE(0x08074b50);
    tail.writeUInt32LE(checksum, 4);
    tail.writeUInt32LE(data.length, 8);
    tail.writeUInt32LE(raw.length, 12);
  }
  directory.writeUInt32LE(0x02014b50);
  directory.writeUInt16LE(20, 4);
  directory.writeUInt16LE(20, 6);
  directory.writeUInt16LE(descriptor ? 8 : 0, 8);
  directory.writeUInt16LE(method, 10);
  directory.writeUInt32LE(checksum, 16);
  directory.writeUInt32LE(data.length, 20);
  directory.writeUInt32LE(raw.length, 24);
  directory.writeUInt16LE(name.length, 28);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(directory.length + name.length, 12);
  end.writeUInt32LE(header.length + name.length + data.length + tail.length, 16);
  return Buffer.concat([header, name, data, tail, directory, name, end]);
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const wrap = (body) =>
  `<?xml version="1.0"?><w:document xmlns:w="${ns}"><w:body>${body}</w:body></w:document>`;
const samples = [
  {
    name: "synthetic-structured.docx",
    bytes: [
      ...docx(
        wrap(
          '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>标题</w:t></w:r></w:p><w:p/><w:p><w:r><w:t>中文 &amp; English 😀</w:t><w:tab/><w:t>符号 &lt; &gt;</w:t><w:br/><w:t>换行</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>表格正文</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
        ),
        0,
      ),
    ],
    expected: "标题\n\n中文 & English 😀\t符号 < >\n换行\n表格正文",
  },
  {
    name: "synthetic-long-descriptor.docx",
    bytes: [
      ...docx(
        wrap(
          "<w:p><w:r><w:t>" + "长篇中文 English &amp; 😀。".repeat(20_000) + "</w:t></w:r></w:p>",
        ),
        8,
        true,
      ),
    ],
    expected: "长篇中文 English & 😀。".repeat(20_000),
  },
];
for (const path of process.argv.slice(2))
  samples.push({ name: basename(path), bytes: [...(await readFile(path))] });
const browser = await chromium.launch({
  executablePath: process.env.KDEJI_QA_BROWSER,
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(process.env.KDEJI_QA_URL || "http://127.0.0.1:3187/");
  const results = await page.evaluate(async (samples) => {
    const { extractDocxText, extractStickerManifestText } =
      await import("/src/lib/stickers/extract-text.ts");
    const { importWorldBookFile } = await import("/src/lib/world-book-file.ts");
    const results = [];
    for (const sample of samples) {
      const file = new File([new Uint8Array(sample.bytes)], sample.name);
      const started = performance.now();
      const text = await extractDocxText(file, true);
      const book = await importWorldBookFile(file);
      const joined = book.entries.map((entry) => entry.content).join("");
      if (joined !== text.trim()) throw new Error(sample.name + ": converted text changed");
      if (sample.expected && joined !== sample.expected)
        throw new Error(sample.name + ": text missing/reordered");
      if (joined.includes("<w:") || joined.includes("pStyle")) throw new Error("OOXML leaked");
      // Independent completeness check: the legacy reader's nonempty paragraph text
      // must all occur in the same order (structured extraction adds tabs/line breaks).
      const legacy = await extractStickerManifestText(file);
      const compact = joined.replace(/\s/g, ""),
        expected = legacy.replace(/\s/g, "");
      if (compact !== expected) throw new Error(sample.name + ": body completeness mismatch");
      results.push({
        file: sample.name,
        characters: Array.from(joined).length,
        paragraphs: text.split("\n").length,
        entries: book.entries.length,
        complete: true,
        milliseconds: Math.round(performance.now() - started),
      });
    }
    for (const file of [new File(["broken"], "bad.docx"), new File([], "empty.docx")]) {
      let rejected = false;
      try {
        await importWorldBookFile(file);
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error("Invalid DOCX accepted");
    }
    return results;
  }, samples);
  assert.equal(results.length, samples.length);
  console.log(JSON.stringify({ docxTests: results, malformedFilesRejected: true }, null, 2));
} finally {
  await browser.close();
}
