/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, FileArchive, ImagePlus, Settings2, Trash2 } from "lucide-react";
import { SystemSheet } from "@/components/system-ui";
import { supabase } from "@/integrations/supabase/client";
import { prepareChatImage, uploadChatMedia } from "@/lib/chat-media";
import {
  extractDocxStickerImages,
  releaseDocxStickerImages,
  type DocxStickerImage,
} from "@/lib/docx-stickers";
import { resolveSignedMediaUrl } from "@/lib/signed-media";
import type { ChatSticker } from "@/lib/types";

const recentKey = "cxyj-recent-stickers";
type StickerView = "picker" | "manage" | "import";

export function StickerPicker({
  open,
  userId,
  onClose,
  onSend,
  onError,
}: {
  open: boolean;
  userId: string;
  onClose: () => void;
  onSend: (sticker: ChatSticker) => void;
  onError: (message: string) => void;
}) {
  const db = supabase as any;
  const imageInput = useRef<HTMLInputElement>(null);
  const docxInput = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ChatSticker[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [view, setView] = useState<StickerView>("picker");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [docxImages, setDocxImages] = useState<DocxStickerImage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void db
      .from("chat_stickers")
      .select("*")
      .order("created_at", { ascending: false })
      .then(async ({ data }: any) => {
        const next = (data ?? []) as ChatSticker[];
        const pairs = await Promise.all(
          next.map(
            async (item) =>
              [item.id, await resolveSignedMediaUrl("chat-media", item.file_path)] as const,
          ),
        );
        if (alive) {
          setItems(next);
          setUrls(Object.fromEntries(pairs));
        }
      });
    return () => {
      alive = false;
    };
  }, [db, open]);

  useEffect(() => () => releaseDocxStickerImages(docxImages), [docxImages]);

  async function saveSticker(file: File) {
    const image = await prepareChatImage(file, 640);
    try {
      const path = await uploadChatMedia(userId, image, "stickers");
      const { data, error } = await db
        .from("chat_stickers")
        .insert({ user_id: userId, file_path: path, width: image.width, height: image.height })
        .select("*")
        .single();
      if (error || !data) throw new Error("表情包保存失败。");
      return { item: data as ChatSticker, url: await resolveSignedMediaUrl("chat-media", path) };
    } finally {
      URL.revokeObjectURL(image.previewUrl);
    }
  }

  function addSaved(saved: Array<{ item: ChatSticker; url: string }>) {
    if (!saved.length) return;
    setItems((current) => [...saved.map(({ item }) => item), ...current]);
    setUrls((current) => ({
      ...current,
      ...Object.fromEntries(saved.map(({ item, url }) => [item.id, url])),
    }));
  }

  async function upload(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    try {
      addSaved([await saveSticker(file)]);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "表情包上传失败。");
    } finally {
      setBusy(false);
    }
  }

  async function readDocx(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    try {
      const images = await extractDocxStickerImages(file);
      setDocxImages(images);
      setSelected(new Set(images.map((image) => image.id)));
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "DOCX 解析失败。");
    } finally {
      setBusy(false);
    }
  }

  async function importSelected() {
    const chosen = docxImages.filter((image) => selected.has(image.id));
    if (!chosen.length || busy) return;
    setBusy(true);
    setProgress(0);
    const saved: Array<{ item: ChatSticker; url: string }> = [];
    let failed = 0;
    for (let offset = 0; offset < chosen.length; offset += 3) {
      const batch = chosen.slice(offset, offset + 3);
      const results = await Promise.all(
        batch.map(async ({ file }) => {
          try {
            return await saveSticker(file);
          } catch {
            failed += 1;
            return null;
          } finally {
            setProgress((value) => value + 1);
          }
        }),
      );
      saved.push(
        ...results.filter((result): result is NonNullable<typeof result> => Boolean(result)),
      );
    }
    addSaved(saved);
    setBusy(false);
    if (failed) onError(`${saved.length} 张已导入，${failed} 张导入失败。`);
    releaseDocxStickerImages(docxImages);
    setDocxImages([]);
    setSelected(new Set());
    setProgress(0);
    setView("manage");
  }

  function send(item: ChatSticker) {
    const recent = readRecent();
    localStorage.setItem(
      recentKey,
      JSON.stringify([item.id, ...recent.filter((id) => id !== item.id)].slice(0, 20)),
    );
    onSend(item);
  }

  async function remove(item: ChatSticker) {
    if (!confirm("删除这个表情包？")) return;
    const { error } = await db.from("chat_stickers").delete().eq("id", item.id);
    if (error) return onError("删除失败。");
    // Keep the stored file so stickers already sent in chat history do not break.
    setItems((current) => current.filter((value) => value.id !== item.id));
  }

  function close() {
    releaseDocxStickerImages(docxImages);
    setDocxImages([]);
    setSelected(new Set());
    setView("picker");
    onClose();
  }

  const recent = readRecent()
    .map((id) => items.find((item) => item.id === id))
    .filter(Boolean) as ChatSticker[];
  const title = view === "picker" ? "表情包" : view === "manage" ? "管理表情" : "从 DOCX 导入";

  return (
    <SystemSheet open={open} title={title} onClose={close} scrollable>
      <input
        ref={imageInput}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={(event) => {
          void upload(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={docxInput}
        hidden
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(event) => {
          void readDocx(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />

      {view === "picker" && (
        <>
          {recent.length > 0 && (
            <StickerSection title="最近使用" items={recent} urls={urls} onSend={send} />
          )}
          <StickerSection title="我的表情" items={items} urls={urls} onSend={send} />
          <button type="button" className="sticker-upload" onClick={() => setView("manage")}>
            <Settings2 size={18} /> 管理表情
          </button>
        </>
      )}

      {view === "manage" && (
        <>
          <button type="button" className="sticker-subpage-back" onClick={() => setView("picker")}>
            <ArrowLeft size={17} /> 返回表情包
          </button>
          <div className="sticker-manage-actions">
            <button type="button" disabled={busy} onClick={() => imageInput.current?.click()}>
              <ImagePlus size={20} />
              <span>{busy ? "处理中…" : "导入图片"}</span>
            </button>
            <button type="button" disabled={busy} onClick={() => setView("import")}>
              <FileArchive size={20} />
              <span>从 DOCX 导入</span>
            </button>
          </div>
          <StickerSection
            title="我的表情"
            items={items}
            urls={urls}
            onSend={send}
            onDelete={remove}
          />
        </>
      )}

      {view === "import" && (
        <>
          <button type="button" className="sticker-subpage-back" onClick={() => setView("manage")}>
            <ArrowLeft size={17} /> 返回管理表情
          </button>
          {!docxImages.length ? (
            <button
              type="button"
              className="sticker-docx-choose"
              disabled={busy}
              onClick={() => docxInput.current?.click()}
            >
              <FileArchive size={24} />
              <strong>{busy ? "正在解析…" : "选择 DOCX 文件"}</strong>
              <span>将提取文档中的 JPG、PNG、WebP 和 GIF 图片</span>
            </button>
          ) : (
            <>
              <div className="sticker-import-summary">
                <strong>已发现 {docxImages.length} 张图片</strong>
                <div>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set(docxImages.map((image) => image.id)))}
                  >
                    全选
                  </button>
                  <button type="button" onClick={() => setSelected(new Set())}>
                    取消选择
                  </button>
                </div>
              </div>
              <div className="sticker-import-grid">
                {docxImages.map((image) => {
                  const checked = selected.has(image.id);
                  return (
                    <button
                      key={image.id}
                      type="button"
                      className={checked ? "is-selected" : ""}
                      aria-pressed={checked}
                      onClick={() =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (next.has(image.id)) next.delete(image.id);
                          else next.add(image.id);
                          return next;
                        })
                      }
                    >
                      <img src={image.previewUrl} alt={image.name} />
                      {checked && (
                        <span>
                          <Check size={13} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="btn-primary w-full"
                disabled={busy || selected.size === 0}
                onClick={() => void importSelected()}
              >
                {busy ? `正在导入 ${progress}/${selected.size}` : `导入选中的 ${selected.size} 张`}
              </button>
            </>
          )}
        </>
      )}
    </SystemSheet>
  );
}

function StickerSection({
  title,
  items,
  urls,
  onSend,
  onDelete,
}: {
  title: string;
  items: ChatSticker[];
  urls: Record<string, string>;
  onSend: (item: ChatSticker) => void;
  onDelete?: (item: ChatSticker) => void;
}) {
  return (
    <section className="sticker-section">
      <h3>{title}</h3>
      {items.length ? (
        <div className="sticker-grid">
          {items.map((item) => (
            <div key={item.id} className="sticker-tile">
              <button type="button" onClick={() => onSend(item)}>
                <img src={urls[item.id] || ""} alt="表情包" loading="lazy" />
              </button>
              {onDelete && (
                <button
                  type="button"
                  aria-label="删除表情"
                  onClick={() => void onDelete(item)}
                  className="sticker-delete"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p>还没有表情包</p>
      )}
    </section>
  );
}

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentKey) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, 20)
      : [];
  } catch {
    return [];
  }
}
