import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Brain, ChevronRight, ImagePlus, Palette, Pencil, Plus, Trash2 } from "lucide-react";
import { SystemSheet } from "@/components/system-ui";
import { CharacterWorldBooks } from "./CharacterWorldBooks";
import { bubbleStyles, safeBubbleDeclarations } from "@/lib/bubble-css";
import type { CharacterChatPreferences, CharacterMemory } from "@/lib/character-chat";
import {
  listCharacterMemories,
  saveCharacterMemory,
  deleteCharacterMemory,
  summarizeCharacterMemory,
} from "@/lib/character-memory.functions";
import { characterWallpaperUrl, uploadCharacterWallpaper } from "@/lib/character-wallpaper";
import { retainWallpaperUrl } from "@/lib/wallpaper-media";
import { assertSafeRemoteUrl } from "@/lib/stickers/resolve-resource";
import { supabase } from "@/integrations/supabase/client";
import "@/styles/character-chat.css";

export function CharacterChatExtras({
  charId,
  userId,
  value,
  onChange,
  onUploadedPath,
  onUploadBusy,
}: {
  charId: string;
  userId: string;
  value: CharacterChatPreferences;
  onChange: Dispatch<SetStateAction<CharacterChatPreferences>>;
  onUploadedPath: (path: string) => void;
  onUploadBusy: (busy: boolean) => void;
}) {
  const [wallpaper, setWallpaper] = useState("");
  useEffect(() => retainWallpaperUrl(wallpaper), [wallpaper]);
  const [link, setLink] = useState(value.wallpaperUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [memories, setMemories] = useState<CharacterMemory[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ id: string | null; content: string } | null>(null);
  const alive = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const cancelLink = useRef<(() => void) | null>(null);
  const localWallpaper = useRef<{ path: string; url: string } | null>(null);
  const wallpaperVersion = useRef(0);
  const { wallpaperPath, wallpaperUrl } = value;
  const list = useServerFn(listCharacterMemories);
  const saveMemory = useServerFn(saveCharacterMemory);
  const deleteMemory = useServerFn(deleteCharacterMemory);
  const summarize = useServerFn(summarizeCharacterMemory);
  const update = (patch: Partial<CharacterChatPreferences>) =>
    onChange((current) => ({ ...current, ...patch }));
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelLink.current?.();
      if (localWallpaper.current) URL.revokeObjectURL(localWallpaper.current.url);
    };
  }, []);
  useEffect(() => {
    let active = true;
    const version = wallpaperVersion.current;
    if (localWallpaper.current?.path === wallpaperPath) return;
    if (localWallpaper.current) {
      URL.revokeObjectURL(localWallpaper.current.url);
      localWallpaper.current = null;
    }
    void characterWallpaperUrl({ wallpaperPath, wallpaperUrl }).then((url) => {
      if (active && version === wallpaperVersion.current) setWallpaper(url);
    });
    return () => {
      active = false;
    };
  }, [wallpaperPath, wallpaperUrl]);
  useEffect(() => onUploadBusy(uploading), [uploading, onUploadBusy]);

  const cssErrors = [value.userBubbleCss, value.charBubbleCss].map((css) => {
    try {
      safeBubbleDeclarations(css);
      return "";
    } catch (reason) {
      return reason instanceof Error ? reason.message : "CSS 格式不正确。";
    }
  });
  const scope = `preview-${charId}`;

  async function upload(file?: File) {
    if (!file || uploading) return;
    setUploading(true);
    setError("");
    wallpaperVersion.current++;
    const previous = wallpaper;
    const previewUrl = URL.createObjectURL(file);
    setWallpaper(previewUrl);
    try {
      const path = await uploadCharacterWallpaper(userId, charId, file);
      if (alive.current) {
        onUploadedPath(path);
        if (localWallpaper.current) URL.revokeObjectURL(localWallpaper.current.url);
        localWallpaper.current = { path, url: previewUrl };
        update({ wallpaperPath: path, wallpaperUrl: null });
        setLink("");
      } else {
        URL.revokeObjectURL(previewUrl);
        await supabase.storage.from("wallpapers").remove([path]);
      }
    } catch (reason) {
      URL.revokeObjectURL(previewUrl);
      if (alive.current) {
        setWallpaper(previous);
        setError(reason instanceof Error ? reason.message : "上传失败。");
      }
    } finally {
      if (alive.current) setUploading(false);
    }
  }
  async function applyWallpaperLink() {
    setError("");
    try {
      const url = assertSafeRemoteUrl(link.trim()).toString();
      setUploading(true);
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        const cleanup = () => {
          window.clearTimeout(timer);
          image.onload = image.onerror = null;
          cancelLink.current = null;
        };
        const timer = window.setTimeout(() => {
          cleanup();
          image.src = "";
          reject(new Error("壁纸加载超时。"));
        }, 12_000);
        cancelLink.current = () => {
          cleanup();
          image.src = "";
          reject(new Error("已取消壁纸加载。"));
        };
        image.onload = () => {
          cleanup();
          resolve();
        };
        image.onerror = () => {
          cleanup();
          reject(new Error("图片链接无法读取。"));
        };
        image.src = url;
      });
      if (alive.current) update({ wallpaperUrl: url, wallpaperPath: null });
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : "图片链接无效。");
    } finally {
      if (alive.current) setUploading(false);
    }
  }
  async function action(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : "操作失败。");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const openLibrary = () => {
    setLibraryOpen(true);
    setDraft(null);
    void action(async () => {
      const rows = await list({ data: { char_id: charId } });
      if (alive.current) setMemories(rows);
    });
  };

  return (
    <div className="character-extras">
      <details className="character-extras__section">
        <summary>
          <Palette size={20} />
          <span>
            <strong>自定义美化</strong>
            <small>
              {value.userBubbleCss ||
              value.charBubbleCss ||
              value.wallpaperPath ||
              value.wallpaperUrl
                ? "已自定义"
                : "默认外观"}
            </small>
          </span>
          <ChevronRight size={17} />
        </summary>
        <div className="character-extras__body">
          <p className="character-extras__hint">仅作用于当前角色。修改后点击顶部“完成”保存。</p>
          {(["userBubbleCss", "charBubbleCss"] as const).map((key, index) => (
            <section className="character-extras__card" key={key}>
              <div className="character-extras__row">
                <h3>{index === 0 ? "User 气泡 CSS" : "Char 气泡 CSS"}</h3>
                <button type="button" onClick={() => update({ [key]: "" })}>
                  恢复默认
                </button>
              </div>
              <textarea
                aria-label={index === 0 ? "User 气泡 CSS" : "Char 气泡 CSS"}
                className="character-extras__css"
                rows={4}
                maxLength={4000}
                placeholder="background-color: #1886f7;\ncolor: #fff;\nborder-radius: 18px;"
                value={value[key]}
                onChange={(event) => update({ [key]: event.target.value })}
              />
              {cssErrors[index] && <p className="character-extras__error">{cssErrors[index]}</p>}
            </section>
          ))}
          <section className="character-extras__card">
            <h3>聊天壁纸</h3>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()}>
              <ImagePlus size={17} />
              {uploading ? "正在处理…" : wallpaper ? "从相册更换" : "从相册上传"}
            </button>
            <label className="character-extras__field">
              图片链接
              <input
                type="url"
                value={link}
                placeholder="https://…"
                onChange={(event) => setLink(event.target.value)}
              />
            </label>
            <div className="character-extras__row">
              <button
                type="button"
                disabled={uploading || !link.trim()}
                onClick={() => void applyWallpaperLink()}
              >
                使用图片链接
              </button>
              <button
                type="button"
                className="is-danger"
                disabled={uploading}
                onClick={() => {
                  update({ wallpaperPath: null, wallpaperUrl: null });
                  setLink("");
                }}
              >
                删除壁纸
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={() => {
                  update({ wallpaperPath: null, wallpaperUrl: null });
                  setLink("");
                }}
              >
                恢复默认
              </button>
            </div>
          </section>
          <div
            className="character-extras__preview"
            data-chat-scope={scope}
            style={wallpaper ? { backgroundImage: `url(${JSON.stringify(wallpaper)})` } : undefined}
          >
            <style>{bubbleStyles(scope, value.userBubbleCss, value.charBubbleCss, true)}</style>
            <small>实时预览</small>
            <div className="chat-message-row is-char">
              <div className="message-content-wrapper">
                <div className="message-bubble">
                  <p>今天过得怎么样？</p>
                </div>
              </div>
            </div>
            <div className="chat-message-row is-user">
              <div className="message-content-wrapper">
                <div className="message-bubble">
                  <p>想和你分享今天的小事。</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </details>
      <details className="character-extras__section">
        <summary>
          <Brain size={20} />
          <span>
            <strong>AI记忆</strong>
            <small>
              最近 {value.contextDepth} 条 · 长期记忆{value.longTermMemory ? "开启" : "关闭"}
            </small>
          </span>
          <ChevronRight size={17} />
        </summary>
        <div className="character-extras__body">
          <section className="character-extras__card">
            <h3>短期记忆</h3>
            <label className="character-extras__field">
              上下文深度
              <input
                type="number"
                min={1}
                max={200}
                step={1}
                value={value.contextDepth}
                onChange={(event) => update({ contextDepth: Number(event.target.value) })}
              />
            </label>
            <p className="character-extras__hint">
              默认 20 条；读取最近的消息（包含图片），保存后用于后续回复。
            </p>
          </section>
          <section className="character-extras__card">
            <h3>长期记忆</h3>
            <label className="character-extras__row">
              启用长期记忆
              <input
                type="checkbox"
                role="switch"
                checked={value.longTermMemory}
                onChange={(event) => update({ longTermMemory: event.target.checked })}
              />
            </label>
            <div className="character-extras__row">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const result = await summarize({ data: { char_id: charId } });
                    if (alive.current) {
                      setMemories(result.memories);
                      setNotice(`已新增 ${result.added} 条记忆。`);
                    }
                  })
                }
              >
                {busy ? "处理中…" : "立即总结"}
              </button>
              <button type="button" disabled={busy} onClick={openLibrary}>
                记忆库 <ChevronRight size={15} />
              </button>
            </div>
            <p className="character-extras__hint">
              总结最近 300 条聊天，使用当前已配置的模型。关闭后保留记忆，但不传给模型。
            </p>
          </section>
        </div>
      </details>
      <CharacterWorldBooks value={value} onChange={onChange} />
      {error && (
        <p className="character-extras__error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="character-extras__notice" role="status">
          {notice}
        </p>
      )}
      <div data-memory-library={libraryOpen ? "open" : undefined}>
        <SystemSheet
          open={libraryOpen}
          title="记忆库"
          onClose={() => setLibraryOpen(false)}
          scrollable
        >
          <div className="character-memory-library">
            <div className="character-extras__row">
              <span>{memories.length} 条记忆</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDraft({ id: null, content: "" })}
              >
                <Plus size={16} />
                手动新增
              </button>
            </div>
            {error && (
              <p className="character-extras__error" role="alert">
                {error}
              </p>
            )}
            {busy && <p role="status">正在处理…</p>}
            {draft && (
              <section className="character-extras__card">
                <label className="character-extras__field">
                  {draft.id ? "编辑记忆" : "新增记忆"}
                  <textarea
                    rows={4}
                    maxLength={1000}
                    value={draft.content}
                    onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                  />
                </label>
                <div className="character-extras__row">
                  <button
                    type="button"
                    disabled={busy || !draft.content.trim()}
                    onClick={() =>
                      void action(async () => {
                        const saved = await saveMemory({
                          data: { char_id: charId, id: draft.id, content: draft.content },
                        });
                        if (alive.current) {
                          setMemories((rows) => [
                            saved,
                            ...rows.filter((row) => row.id !== saved.id),
                          ]);
                          setDraft(null);
                        }
                      })
                    }
                  >
                    保存
                  </button>
                  <button type="button" onClick={() => setDraft(null)}>
                    取消
                  </button>
                </div>
              </section>
            )}
            {!busy && memories.length === 0 && (
              <p className="character-extras__hint">还没有记忆，可以手动新增或立即总结。</p>
            )}
            {memories.map((entry) => (
              <article className="character-extras__card" key={entry.id}>
                <p className="character-memory-library__content">{entry.content}</p>
                <time dateTime={entry.updated_at}>
                  {new Date(entry.updated_at).toLocaleString()}
                </time>
                <div className="character-extras__row">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDraft({ id: entry.id, content: entry.content })}
                  >
                    <Pencil size={15} />
                    编辑
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    disabled={busy}
                    onClick={() => {
                      if (confirm("删除这条记忆？"))
                        void action(async () => {
                          await deleteMemory({ data: { char_id: charId, id: entry.id } });
                          if (alive.current) {
                            setMemories((rows) => rows.filter((row) => row.id !== entry.id));
                            if (draft?.id === entry.id) setDraft(null);
                          }
                        });
                    }}
                  >
                    <Trash2 size={15} />
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>
        </SystemSheet>
      </div>
    </div>
  );
}
