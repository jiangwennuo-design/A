import { Check, FileWarning, LoaderCircle } from "lucide-react";
import type { StickerManifestEntry, StickerManifestIssue } from "@/lib/stickers/types";

const statusLabels: Record<StickerManifestEntry["status"], string> = {
  checking: "检查中",
  ready: "可导入",
  unresolved: "无法解析",
  failed: "读取失败",
  importing: "导入中",
  imported: "已导入",
  exists: "已存在",
};

export function StickerImportPreview({
  entries,
  issues,
  selected,
  onToggle,
  onSelectAll,
  onClear,
}: {
  entries: StickerManifestEntry[];
  issues: StickerManifestIssue[];
  selected: Set<string>;
  onToggle: (entry: StickerManifestEntry) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const unavailable = entries.filter((entry) =>
    ["unresolved", "failed"].includes(entry.status),
  ).length;
  return (
    <>
      <div className="sticker-import-summary">
        <div>
          <strong>发现 {entries.length} 个表情</strong>
          <span>{unavailable ? `${unavailable} 个资源暂时无法读取` : "资源检查完成"}</span>
        </div>
        <div>
          <button type="button" onClick={onSelectAll}>
            全选
          </button>
          <button type="button" onClick={onClear}>
            取消全选
          </button>
        </div>
      </div>
      <div className="sticker-import-grid">
        {entries.map((entry) => {
          const selectable = entry.status === "ready";
          const checked = selected.has(entry.id);
          return (
            <button
              key={entry.id}
              type="button"
              className={`${checked ? "is-selected" : ""} is-${entry.status}`}
              aria-pressed={checked}
              disabled={!selectable}
              onClick={() => onToggle(entry)}
            >
              <span className="sticker-import-grid__media">
                {entry.sourceUrl && !["unresolved", "failed"].includes(entry.status) ? (
                  <img src={entry.sourceUrl} alt={entry.name} loading="lazy" />
                ) : (
                  <FileWarning size={24} />
                )}
                {entry.status === "checking" || entry.status === "importing" ? (
                  <i className="sticker-import-grid__loading">
                    <LoaderCircle size={15} />
                  </i>
                ) : null}
                {checked && (
                  <i className="sticker-import-grid__check">
                    <Check size={13} />
                  </i>
                )}
              </span>
              <strong>{entry.name}</strong>
              <small>{statusLabels[entry.status]}</small>
            </button>
          );
        })}
      </div>
      {(issues.length > 0 || unavailable > 0) && (
        <details className="sticker-import-errors">
          <summary>查看无法识别或读取的项目</summary>
          {issues.map((issue) => (
            <p key={`${issue.lineNumber}-${issue.raw}`}>
              第 {issue.lineNumber} 行：{issue.error}
            </p>
          ))}
          {entries
            .filter((entry) => ["unresolved", "failed"].includes(entry.status))
            .map((entry) => (
              <p key={entry.id}>
                第 {entry.lineNumber} 行（{entry.name}）：{entry.error || "资源无法读取"}
              </p>
            ))}
        </details>
      )}
    </>
  );
}
