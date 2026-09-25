/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState } from "react";
import { ArrowLeft, FileArchive, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractStickerManifestText, stickerManifestAccept } from "@/lib/stickers/extract-text";
import { mapWithConcurrency } from "@/lib/stickers/import-pack";
import { parseStickerManifest } from "@/lib/stickers/parse-manifest";
import {
  discoverStickerResourceBase,
  isPostimagesResourceReference,
  resolveStickerResource,
} from "@/lib/stickers/resolve-resource";
import { importRemoteSticker, inspectRemoteSticker } from "@/lib/stickers/sticker-import.functions";
import type { StickerManifestEntry, StickerManifestIssue } from "@/lib/stickers/types";
import { StickerImportPreview } from "./StickerImportPreview";

export function StickerImportSheet({
  userId,
  onBack,
  onDone,
  onError,
}: {
  userId: string;
  onBack: () => void;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const db = supabase as any;
  const input = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<StickerManifestEntry[]>([]);
  const [issues, setIssues] = useState<StickerManifestIssue[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [packName, setPackName] = useState("");
  const [packId, setPackId] = useState("");
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  async function choose(file?: File) {
    if (!file || reading || importing) return;
    setReading(true);
    setPackId("");
    setEntries([]);
    setIssues([]);
    setSelected(new Set());
    try {
      const text = await extractStickerManifestText(file);
      const parsed = parseStickerManifest(text, file.name);
      if (!parsed.entries.length) throw new Error("索引文件中没有找到有效表情记录。");
      if (!parsed.metadata.baseUrl) {
        const baseUrl = await discoverStickerResourceBase(
          parsed.entries
            .filter((entry) => entry.status === "unresolved")
            .map((entry) => entry.reference),
          (sourceUrl) => inspectRemoteSticker({ data: { sourceUrl } }),
        );
        if (baseUrl) {
          parsed.entries = parsed.entries.map((entry) => {
            if (entry.status !== "unresolved" || !isPostimagesResourceReference(entry.reference))
              return entry;
            const resolved = resolveStickerResource(entry.reference, baseUrl);
            return "url" in resolved
              ? { ...entry, sourceUrl: resolved.url, status: "checking" as const, error: "" }
              : entry;
          });
        }
      }
      setPackName(parsed.metadata.packName || "导入的表情包");
      setEntries(parsed.entries);
      setIssues(parsed.issues);
      const candidates = parsed.entries.filter((entry) => entry.sourceUrl);
      await mapWithConcurrency(candidates, 4, async (entry) => {
        try {
          const result = await inspectRemoteSticker({ data: { sourceUrl: entry.sourceUrl! } });
          updateEntry(entry.id, {
            status: "ready",
            mimeType: result.mimeType,
            size: result.size,
            error: "",
          });
          setSelected((current) => new Set([...current, entry.id]));
        } catch (reason) {
          updateEntry(entry.id, {
            status: "failed",
            error: reason instanceof Error ? reason.message : "资源无法读取。",
          });
        }
        return null;
      });
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "索引文件解析失败。");
    } finally {
      setReading(false);
    }
  }

  function updateEntry(id: string, patch: Partial<StickerManifestEntry>) {
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  }

  async function ensurePack() {
    if (packId) return packId;
    const name = packName.trim().slice(0, 80) || "导入的表情包";
    const { data, error } = await db
      .from("sticker_packs")
      .insert({ user_id: userId, name })
      .select("id")
      .single();
    if (error || !data) throw new Error("无法创建表情包分组，请确认数据库已更新。");
    setPackId(data.id);
    return data.id as string;
  }

  async function importEntries(targets: StickerManifestEntry[]) {
    if (!targets.length || importing) return;
    setImporting(true);
    setProgress({ done: 0, total: targets.length });
    try {
      const nextPackId = await ensurePack();
      await mapWithConcurrency(targets, 4, async (entry) => {
        updateEntry(entry.id, { status: "importing", error: "" });
        try {
          const result = await importRemoteSticker({
            data: {
              packId: nextPackId,
              name: entry.name,
              tags: entry.tags,
              sourceUrl: entry.sourceUrl!,
            },
          });
          updateEntry(entry.id, { status: result.status });
          setSelected((current) => {
            const next = new Set(current);
            next.delete(entry.id);
            return next;
          });
        } catch (reason) {
          updateEntry(entry.id, {
            status: "failed",
            error: reason instanceof Error ? reason.message : "导入失败。",
          });
        } finally {
          setProgress((current) => ({ ...current, done: current.done + 1 }));
        }
        return null;
      });
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "表情包导入失败。");
    } finally {
      setImporting(false);
    }
  }

  const selectedEntries = entries.filter(
    (entry) => selected.has(entry.id) && entry.status === "ready" && entry.sourceUrl,
  );
  const imported = entries.filter((entry) => entry.status === "imported").length;
  const existing = entries.filter((entry) => entry.status === "exists").length;
  const failed = entries.filter((entry) => entry.status === "failed" && entry.sourceUrl);
  const finished =
    imported + existing > 0 && !entries.some((entry) => entry.status === "importing");

  return (
    <div className="sticker-import-page">
      <button type="button" className="sticker-subpage-back" onClick={onBack}>
        <ArrowLeft size={17} /> 返回管理表情
      </button>
      <input
        ref={input}
        hidden
        type="file"
        accept={stickerManifestAccept}
        onChange={(event) => {
          void choose(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      {!entries.length ? (
        <button
          type="button"
          className="sticker-docx-choose"
          disabled={reading}
          onClick={() => input.current?.click()}
        >
          <FileArchive size={24} />
          <strong>{reading ? "正在解析索引…" : "选择表情包索引文件"}</strong>
          <span>支持 TXT、DOCX、MD、MANIFEST；不会提取 DOCX 内嵌图片</span>
        </button>
      ) : (
        <>
          <label className="sticker-pack-name">
            <span>表情包名称</span>
            <input
              className="input-field"
              value={packName}
              maxLength={80}
              disabled={Boolean(packId)}
              onChange={(event) => setPackName(event.target.value)}
            />
          </label>
          <StickerImportPreview
            entries={entries}
            issues={issues}
            selected={selected}
            onToggle={(entry) =>
              setSelected((current) => {
                const next = new Set(current);
                if (next.has(entry.id)) next.delete(entry.id);
                else next.add(entry.id);
                return next;
              })
            }
            onSelectAll={() =>
              setSelected(
                new Set(
                  entries.filter((entry) => entry.status === "ready").map((entry) => entry.id),
                ),
              )
            }
            onClear={() => setSelected(new Set())}
          />
          {importing && (
            <p className="sticker-import-progress">
              正在导入 {progress.done} / {progress.total}
            </p>
          )}
          {finished && (
            <p className="sticker-import-result">
              成功 {imported} · 已存在 {existing} · 失败 {failed.length}
            </p>
          )}
          <div className="sticker-import-actions">
            {failed.length > 0 && !importing && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void importEntries(failed)}
              >
                <RotateCcw size={16} /> 重试失败项
              </button>
            )}
            {selectedEntries.length > 0 ? (
              <button
                type="button"
                className="btn-primary"
                disabled={importing || !packName.trim()}
                onClick={() => void importEntries(selectedEntries)}
              >
                {importing ? "正在导入…" : `导入 ${selectedEntries.length} 个表情`}
              </button>
            ) : finished ? (
              <button type="button" className="btn-primary" onClick={onDone}>
                完成
              </button>
            ) : (
              <button type="button" className="btn-primary" disabled>
                请选择可导入表情
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
