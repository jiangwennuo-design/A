import { resolveStickerResource } from "./resolve-resource";
import type {
  StickerManifestEntry,
  StickerManifestIssue,
  StickerManifestMetadata,
  StickerManifestResult,
} from "./types";

const MAX_ENTRIES = 300;

export function parseStickerManifest(text: string, defaultPackName: string): StickerManifestResult {
  const metadata: StickerManifestMetadata = {};
  const entries: StickerManifestEntry[] = [];
  const issues: StickerManifestIssue[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  for (const [index, rawValue] of lines.entries()) {
    const raw = rawValue.trim();
    if (!raw) continue;
    const directive = parseDirective(raw);
    if (!directive) continue;
    if (directive.key === "name") metadata.packName = directive.value.slice(0, 80);
    if (directive.key === "base-url") {
      const resolved = resolveStickerResource(directive.value);
      if ("url" in resolved) metadata.baseUrl = resolved.url;
      else issues.push({ lineNumber: index + 1, raw, error: `base URL 无效：${resolved.error}` });
    }
  }

  for (const [index, rawValue] of lines.entries()) {
    const lineNumber = index + 1;
    const raw = rawValue.trim();
    if (!raw) continue;
    const directive = parseDirective(raw);
    if (directive) continue;
    if (entries.length >= MAX_ENTRIES) {
      issues.push({ lineNumber, raw, error: `单次最多解析 ${MAX_ENTRIES} 个表情。` });
      continue;
    }
    const separator = firstSeparator(raw);
    if (separator < 1) {
      issues.push({ lineNumber, raw, error: "无法识别“标签:资源地址”结构。" });
      continue;
    }
    const label = raw.slice(0, separator).trim();
    const reference = raw.slice(separator + 1).trim();
    const tags = parseTags(label);
    if (!tags.length || !reference) {
      issues.push({ lineNumber, raw, error: "标签或资源地址为空。" });
      continue;
    }
    const resolved = resolveStickerResource(reference, metadata.baseUrl);
    entries.push({
      id: `${lineNumber}-${entries.length}`,
      lineNumber,
      name: tags[0]!,
      tags,
      reference,
      ...(resolved && "url" in resolved ? { sourceUrl: resolved.url } : {}),
      status: resolved && "url" in resolved ? "checking" : "unresolved",
      ...(resolved && "error" in resolved ? { error: resolved.error } : {}),
    });
  }

  return {
    entries,
    issues,
    metadata: { ...metadata, packName: metadata.packName || cleanPackName(defaultPackName) },
  };
}

function parseDirective(line: string) {
  const match = line.match(/^@(name|base-url|baseurl)\s*[:：]\s*(.+)$/i);
  if (!match?.[1] || !match[2]) return null;
  return {
    key: match[1].toLowerCase() === "name" ? "name" : "base-url",
    value: match[2].trim(),
  } as const;
}

function firstSeparator(line: string) {
  const ascii = line.indexOf(":");
  const wide = line.indexOf("：");
  if (ascii < 0) return wide;
  if (wide < 0) return ascii;
  return Math.min(ascii, wide);
}

function parseTags(label: string) {
  return [
    ...new Set(
      label
        .split(new RegExp("[/／|｜,，]+"))
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ]
    .slice(0, 20)
    .map((tag) => tag.slice(0, 40));
}

function cleanPackName(fileName: string) {
  const value = fileName.replace(/\.(txt|text|md|manifest|docx)$/i, "").trim();
  return value.slice(0, 80) || "导入的表情包";
}
