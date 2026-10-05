import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  FileText,
  ImagePlus,
  MapPin,
  Smile,
  Music2,
  Link2,
  Paperclip,
  ListChecks,
  MoreHorizontal,
  X,
} from "lucide-react";
import { prepareChatImage, uploadChatMedia } from "@/lib/chat-media";
import {
  happenedTypes,
  newHappenedEntry,
  safeHappenedUrl,
  type HappenedEntry,
  type HappenedSettings,
} from "@/lib/happened";
import { readHappenedEntries, saveHappenedEntries, saveHappenedFile } from "@/lib/happened-store";
import { monthRange } from "@/lib/happened";
import { HappenedPhoto } from "./HappenedPhoto";

const choices = [
  ["text", "文字", FileText],
  ["photo", "照片", ImagePlus],
  ["location", "位置", MapPin],
  ["mood", "心情", Smile],
  ["music", "音乐", Music2],
  ["link", "链接", Link2],
  ["file", "文件", Paperclip],
  ["checklist", "清单", ListChecks],
  ["other", "其他", MoreHorizontal],
] as const;
function localInput(timestamp: string) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
export function HappenedQuickAdd({
  userId,
  date,
  initial,
  settings,
  onClose,
  onSaved,
}: {
  userId: string;
  date: string;
  initial?: HappenedEntry | undefined;
  settings: HappenedSettings;
  onClose: () => void;
  onSaved: (entry: HappenedEntry) => void;
}) {
  const [draft, setDraft] = useState(() => {
    if (initial) return initial;
    const time = localInput(new Date().toISOString()).slice(10);
    return newHappenedEntry(userId, { date, timestamp: new Date(`${date}${time}`).toISOString() });
  });
  const [dateTime, setDateTime] = useState(() => localInput(draft.timestamp));
  const [linkUrl, setLinkUrl] = useState(draft.links.find((link) => link.url)?.url || "");
  const [sourceApp, setSourceApp] = useState<"" | "knowledge" | "diary" | "goal">(
    draft.links.find((link) => link.sourceApp)?.sourceApp || "",
  );
  const [sourceId, setSourceId] = useState(
    draft.links.find((link) => link.sourceApp)?.sourceId || "",
  );
  const [sourceTitle, setSourceTitle] = useState(
    draft.links.find((link) => link.sourceApp)?.title || "",
  );
  const [sourceOptions, setSourceOptions] = useState<HappenedEntry[]>([]);
  useEffect(() => {
    let active = true;
    setSourceOptions([]);
    if (sourceApp)
      void readHappenedEntries(userId, { ...monthRange(date.slice(0, 7)), limit: 200 })
        .then((result) => {
          if (active)
            setSourceOptions(
              result.entries.filter(
                (entry) => entry.isSystemEvent && entry.sourceApp === sourceApp,
              ),
            );
        })
        .catch(() => {
          /* Manual source ID remains available when local event cache is unavailable. */
        });
    return () => {
      active = false;
    };
  }, [userId, date, sourceApp]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [busy, onClose]);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const patch = (value: Partial<HappenedEntry>) => setDraft((old) => ({ ...old, ...value }));
  const choose = (type: (typeof happenedTypes)[number]) => {
    patch({ type });
    if (type === "photo") photoInput.current?.click();
    if (type === "file") fileInput.current?.click();
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>, kind: "photo" | "file") => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!files.length || busy) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "photo") {
        if (files.length + draft.images.length > 20) throw new Error("每条记录最多 20 张照片。");
        // Reuse existing compressor, Storage and cache; small saved images avoid full-size decoding.
        for (const file of files) {
          const image = await prepareChatImage(file, 1280, 1024 * 1024, { alwaysEncode: true });
          try {
            const path = await uploadChatMedia(userId, image, "messages");
            setDraft((old) => ({ ...old, images: [...old.images, path] }));
          } finally {
            URL.revokeObjectURL(image.previewUrl);
          }
        }
      } else {
        if (files.length + draft.files.length > 10) throw new Error("每条记录最多 10 个文件。");
        for (const file of files) {
          const saved = await saveHappenedFile(userId, file);
          setDraft((old) => ({ ...old, files: [...old.files, saved] }));
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "附件保存失败。");
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setError("");
    if (
      !draft.title.trim() &&
      !draft.content.trim() &&
      !draft.images.length &&
      !draft.files.length &&
      !draft.location &&
      !draft.mood &&
      !draft.music.title &&
      !linkUrl &&
      !sourceId
    ) {
      setError("留下一点内容再保存吧。");
      return;
    }
    if (linkUrl && !safeHappenedUrl(linkUrl)) {
      setError("链接需要以 https:// 或 http:// 开头。");
      return;
    }
    if (draft.music.url && !safeHappenedUrl(draft.music.url)) {
      setError("音乐链接需要有效的 HTTP 地址。");
      return;
    }
    const timestamp = new Date(dateTime);
    if (!dateTime || Number.isNaN(timestamp.getTime())) {
      setError("请选择有效的日期和时间。");
      return;
    }
    if (sourceApp && !sourceId.trim()) {
      setError("请填写原内容 ID。");
      return;
    }
    setBusy(true);
    try {
      const entry = newHappenedEntry(userId, {
        ...draft,
        date: dateTime.slice(0, 10),
        timestamp: timestamp.toISOString(),
        updatedAt: new Date().toISOString(),
        links: [
          ...(linkUrl
            ? [
                {
                  title: "关联链接",
                  url: safeHappenedUrl(linkUrl),
                  sourceApp: "" as const,
                  sourceId: "",
                },
              ]
            : []),
          ...(sourceApp && sourceId
            ? [{ title: sourceTitle || "关联内容", url: "", sourceApp, sourceId: sourceId.trim() }]
            : []),
        ],
      });
      await saveHappenedEntries(userId, [entry]);
      onSaved(entry);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="happened-overlay"
      role="presentation"
      onPointerDown={() => {
        if (!busy) onClose();
      }}
    >
      <section
        className="happened-sheet"
        data-ui="happened-quick-add"
        role="dialog"
        aria-modal="true"
        aria-label="快速记录"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header>
          <span />
          <strong>{initial ? "编辑记录" : "快速记录"}</strong>
          <button type="button" aria-label="关闭快速记录" disabled={busy} onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        <div className="happened-sheet-body">
          <div className="happened-type-grid">
            {choices.map(([type, label, Icon]) => (
              <button
                type="button"
                key={type}
                aria-pressed={draft.type === type}
                disabled={busy}
                className={`happened-tone-${type}`}
                onClick={() => choose(type)}
              >
                <Icon size={21} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <input
            className="happened-title-input"
            aria-label="记录标题"
            placeholder="标题（可选）"
            maxLength={300}
            value={draft.title}
            onChange={(event) => patch({ title: event.target.value })}
          />
          <textarea
            className="happened-write"
            aria-label="记录内容"
            placeholder={draft.type === "checklist" ? "一行一个清单项……" : "这一刻在做什么……"}
            maxLength={20000}
            value={draft.content}
            onChange={(event) =>
              patch({ content: event.target.value, metadata: { ...draft.metadata, checks: [] } })
            }
          />
          {!!draft.images.length && (
            <div className="happened-photo-grid">
              {draft.images.map((path) => (
                <div key={path}>
                  <HappenedPhoto path={path} />
                  <button
                    type="button"
                    aria-label="移除照片"
                    onClick={() =>
                      patch({ images: draft.images.filter((value) => value !== path) })
                    }
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {draft.files.map((file) => (
            <div className="happened-file-row" key={file.id}>
              <Paperclip size={14} />
              <span>{file.name}</span>
              <button
                type="button"
                aria-label={`移除${file.name}`}
                onClick={() =>
                  patch({ files: draft.files.filter((value) => value.id !== file.id) })
                }
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="happened-subtle"
            disabled={busy}
            onClick={() => photoInput.current?.click()}
          >
            <ImagePlus size={15} />
            添加照片
          </button>
          <label className="happened-form-row">
            <span>日期 / 时间</span>
            <input
              type="datetime-local"
              aria-label="记录日期时间"
              value={dateTime}
              onChange={(event) => setDateTime(event.target.value)}
            />
          </label>
          <label className="happened-form-row">
            <span>地点</span>
            <input
              aria-label="地点"
              placeholder="在哪里（可选）"
              maxLength={500}
              value={draft.location}
              onChange={(event) => patch({ location: event.target.value })}
            />
          </label>
          <label className="happened-form-row">
            <span>心情</span>
            <input
              aria-label="心情"
              placeholder="此刻的心情（可选）"
              maxLength={100}
              value={draft.mood}
              onChange={(event) => patch({ mood: event.target.value })}
            />
          </label>
          {draft.type === "music" && (
            <div className="happened-music-fields">
              <input
                aria-label="音乐名称"
                placeholder="歌曲名称"
                value={draft.music.title}
                onChange={(event) =>
                  patch({ music: { ...draft.music, title: event.target.value } })
                }
              />
              <input
                aria-label="音乐作者"
                placeholder="歌手 / 作者"
                value={draft.music.artist}
                onChange={(event) =>
                  patch({ music: { ...draft.music, artist: event.target.value } })
                }
              />
              <input
                aria-label="音乐链接"
                placeholder="音乐链接（可选）"
                value={draft.music.url}
                onChange={(event) => patch({ music: { ...draft.music, url: event.target.value } })}
              />
            </div>
          )}
          {draft.type === "link" && (
            <input
              className="happened-link-input"
              aria-label="链接地址"
              type="url"
              placeholder="https://…"
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
            />
          )}
          <details className="happened-small-details">
            <summary>标签 / 关联内容</summary>
            <div className="happened-tag-pills">
              {settings.tags.map((tag) => (
                <button
                  type="button"
                  key={tag.id}
                  className={`happened-color-${tag.color}`}
                  aria-pressed={draft.tags.includes(tag.id)}
                  onClick={() =>
                    patch({
                      tags: draft.tags.includes(tag.id)
                        ? draft.tags.filter((value) => value !== tag.id)
                        : [...draft.tags, tag.id],
                    })
                  }
                >
                  {tag.name}
                </button>
              ))}
            </div>
            <label className="happened-form-row">
              <span>关联 App</span>
              <select
                aria-label="关联App"
                value={sourceApp}
                onChange={(event) => {
                  setSourceApp(event.target.value as typeof sourceApp);
                  setSourceId("");
                  setSourceTitle("");
                }}
              >
                <option value="">不关联</option>
                <option value="knowledge">知识库</option>
                <option value="diary">此心一笺</option>
                <option value="goal">规划</option>
              </select>
            </label>
            {!!sourceApp && (
              <>
                {!!sourceOptions.length && (
                  <label className="happened-form-row">
                    <span>选择本月内容</span>
                    <select
                      aria-label="选择关联内容"
                      value={
                        sourceOptions.some((entry) => entry.sourceId === sourceId) ? sourceId : ""
                      }
                      onChange={(event) => {
                        setSourceId(event.target.value);
                        setSourceTitle(
                          sourceOptions.find((entry) => entry.sourceId === event.target.value)
                            ?.title || "",
                        );
                      }}
                    >
                      <option value="">选择内容</option>
                      {sourceOptions.map((entry) => (
                        <option key={entry.id} value={entry.sourceId}>
                          {entry.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <input
                  aria-label="关联内容ID"
                  placeholder="原内容 ID（详情网址中的 id）"
                  value={sourceId}
                  onChange={(event) => setSourceId(event.target.value)}
                />
                <input
                  aria-label="关联内容名称"
                  placeholder="关联内容名称（可选）"
                  value={sourceTitle}
                  onChange={(event) => setSourceTitle(event.target.value)}
                />
              </>
            )}
          </details>
          <label className="happened-form-row">
            <span>进入回忆</span>
            <input
              type="checkbox"
              checked={draft.showInMemories}
              onChange={(event) => patch({ showInMemories: event.target.checked })}
            />
          </label>
          {error && (
            <p role="alert" className="happened-error">
              {error}
            </p>
          )}
        </div>
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="happened-save"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </footer>
        <input
          ref={photoInput}
          type="file"
          hidden
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(event) => void upload(event, "photo")}
        />
        <input
          ref={fileInput}
          type="file"
          hidden
          multiple
          onChange={(event) => void upload(event, "file")}
        />
      </section>
    </div>
  );
}
