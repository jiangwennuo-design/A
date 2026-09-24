import type { ChatSticker } from "@/lib/types";

export type StickerImportStatus =
  "checking" | "ready" | "unresolved" | "failed" | "importing" | "imported" | "exists";

export interface StickerManifestMetadata {
  packName?: string;
  baseUrl?: string;
}

export interface StickerManifestIssue {
  lineNumber: number;
  raw: string;
  error: string;
}

export interface StickerManifestEntry {
  id: string;
  lineNumber: number;
  name: string;
  tags: string[];
  reference: string;
  sourceUrl?: string;
  status: StickerImportStatus;
  error?: string;
  mimeType?: string;
  size?: number;
}

export interface StickerManifestResult {
  entries: StickerManifestEntry[];
  issues: StickerManifestIssue[];
  metadata: StickerManifestMetadata;
}

export interface StickerImportResult {
  status: "imported" | "exists";
  sticker: ChatSticker;
}
