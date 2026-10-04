import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, Link2, MoreHorizontal, Hash, X } from "lucide-react";
import {
  cardTitle,
  newKnowledgeCard,
  resolveKnowledgeLinks,
  unlinkKnowledgeCard,
  type KnowledgeCard,
} from "@/lib/knowledge";
import { prepareChatImage, uploadChatMedia } from "@/lib/chat-media";
import { KnowledgeImage } from "./KnowledgeImage";

export function KnowledgeEditor({
  initial,
  cards,
  userId,
  onCancel,
  onSave,
  onCreateLink,
}: {
  initial: KnowledgeCard;
  cards: KnowledgeCard[];
  userId: string;
  onCancel: () => void;
  onSave: (card: KnowledgeCard) => Promise<void>;
  onCreateLink: (card: KnowledgeCard) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial);
  const [panel, setPanel] = useState<"tags" | "links" | "source" | "more" | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [linkQuery, setLinkQuery] = useState("");
  const [inlineStart, setInlineStart] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const patch = (value: Partial<KnowledgeCard>) =>
    setDraft((previous) => ({ ...previous, ...value }));
  const showPanel = (value: typeof panel) => {
    setInlineStart(null);
    setPanel(panel === value ? null : value);
  };
  const inspectCursor = (text: string, cursor: number) => {
    const prefix = text.slice(0, cursor);
    const start = prefix.lastIndexOf("[[");
    if (
      start >= 0 &&
      !prefix.slice(start + 2).includes("]]") &&
      !prefix.slice(start + 2).includes("\n")
    ) {
      setInlineStart(start);
      setLinkQuery(prefix.slice(start + 2));
      setPanel("links");
    } else if (inlineStart !== null) {
      setInlineStart(null);
      setPanel(null);
    }
  };
  const addLink = (card: KnowledgeCard) => {
    const label = cardTitle(card).replace(/[[\]\n]/g, " ");
    const start = inlineStart ?? textarea.current?.selectionStart ?? draft.content.length;
    const end =
      inlineStart === null
        ? (textarea.current?.selectionEnd ?? start)
        : start + 2 + linkQuery.length;
    const rest = draft.content.slice(end).replace(/^\]\]/, "");
    patch({
      content: `${draft.content.slice(0, start)}[[${label}]]${rest}`,
      links: [...new Set([...draft.links, card.id])],
    });
    setPanel(null);
    setInlineStart(null);
    setLinkQuery("");
    textarea.current?.focus();
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await onSave({
        ...draft,
        tags: [...new Set(draft.tags.map((tag) => tag.trim()).filter(Boolean))],
        links: resolveKnowledgeLinks(draft, cards),
        updatedAt: new Date().toISOString(),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    let preview = "";
    try {
      const image = await prepareChatImage(file);
      preview = image.previewUrl;
      const path = await uploadChatMedia(userId, image, "messages");
      if (mounted.current)
        setDraft((previous) => ({ ...previous, images: [...previous.images, path] }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "图片上传失败。");
    } finally {
      if (preview) URL.revokeObjectURL(preview);
      setBusy(false);
    }
  };
  const matches = cards
    .filter(
      (card) =>
        card.id !== draft.id &&
        cardTitle(card).toLocaleLowerCase().includes(linkQuery.trim().toLocaleLowerCase()),
    )
    .slice(0, 20);
  return (
    <section className="knowledge-editor">
      <header className="knowledge-header">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            mounted.current = false;
            onCancel();
          }}
        >
          取消
        </button>
        <span />
        <button
          className="knowledge-accent"
          type="button"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "处理中…" : "完成"}
        </button>
      </header>
      {error && (
        <p className="knowledge-error" role="alert">
          {error}
        </p>
      )}
      <div className="knowledge-editor-paper">
        <input
          aria-label="卡片标题"
          placeholder="标题（可选）"
          value={draft.title}
          maxLength={500}
          onChange={(event) => patch({ title: event.target.value })}
        />
        <textarea
          ref={textarea}
          aria-label="卡片正文"
          placeholder="记下这个想法…"
          value={draft.content}
          onChange={(event) => {
            patch({ content: event.target.value });
            inspectCursor(event.target.value, event.target.selectionStart);
          }}
          onSelect={(event) =>
            inspectCursor(event.currentTarget.value, event.currentTarget.selectionStart)
          }
        />
        {(draft.tags.length > 0 || draft.links.length > 0) && (
          <div className="knowledge-chips">
            {draft.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => patch({ tags: draft.tags.filter((item) => item !== tag) })}
              >
                #{tag} ×
              </button>
            ))}
            {draft.links.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() =>
                  setDraft((previous) =>
                    unlinkKnowledgeCard(
                      previous,
                      cards.find((card) => card.id === id),
                      id,
                    ),
                  )
                }
              >
                ↗{" "}
                {cards.find((card) => card.id === id)
                  ? cardTitle(cards.find((card) => card.id === id)!)
                  : "关联卡片"}{" "}
                ×
              </button>
            ))}
          </div>
        )}
        {draft.sourceLabel && (
          <small className="knowledge-source">
            来自：{draft.sourceLabel}
            {draft.originalCreatedAt ? ` · ${draft.originalCreatedAt.slice(0, 10)}` : ""}
          </small>
        )}
        {draft.images.length > 0 && (
          <div className="knowledge-editor-images">
            {draft.images.map((path) => (
              <div key={path}>
                <KnowledgeImage path={path} />
                <button
                  type="button"
                  aria-label="移除图片"
                  onClick={() => patch({ images: draft.images.filter((item) => item !== path) })}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {panel && (
        <section
          className="knowledge-editor-panel"
          aria-label={panel === "links" ? "关联卡片" : "编辑工具"}
        >
          <button
            className="knowledge-panel-close"
            type="button"
            aria-label="关闭工具"
            onClick={() => {
              setPanel(null);
              setInlineStart(null);
            }}
          >
            <X size={18} />
          </button>
          {panel === "tags" && (
            <>
              <label>
                标签
                <input
                  placeholder="输入标签，用逗号分隔"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="knowledge-accent"
                onClick={() => {
                  patch({
                    tags: [
                      ...new Set([
                        ...draft.tags,
                        ...tagInput
                          .split(/[,，#\n]/)
                          .map((tag) => tag.trim())
                          .filter(Boolean),
                      ]),
                    ],
                  });
                  setTagInput("");
                  setPanel(null);
                }}
              >
                添加标签
              </button>
              <div className="knowledge-chips">
                {[...new Set(cards.flatMap((card) => card.tags))].slice(0, 30).map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    onClick={() => patch({ tags: [...new Set([...draft.tags, tag])] })}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </>
          )}
          {panel === "links" && (
            <>
              <input
                aria-label="搜索关联卡片"
                placeholder="搜索已有卡片…"
                value={linkQuery}
                onChange={(event) => setLinkQuery(event.target.value)}
              />
              {matches.map((card) => (
                <button
                  className="knowledge-menu-row"
                  type="button"
                  key={card.id}
                  onClick={() => addLink(card)}
                >
                  {cardTitle(card)}
                </button>
              ))}
              {linkQuery.trim() &&
                !matches.some(
                  (card) =>
                    cardTitle(card).toLocaleLowerCase() === linkQuery.trim().toLocaleLowerCase(),
                ) && (
                  <button
                    className="knowledge-menu-row knowledge-accent"
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const card = newKnowledgeCard({ title: linkQuery.trim() });
                        await onCreateLink(card);
                        addLink(card);
                      } catch (reason) {
                        setError(reason instanceof Error ? reason.message : "创建失败。");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    ＋ 新建「{linkQuery.trim()}」并关联
                  </button>
                )}
            </>
          )}
          {panel === "source" && (
            <>
              <label>
                来源名称
                <input
                  value={draft.sourceLabel}
                  onChange={(event) => patch({ sourceLabel: event.target.value })}
                />
              </label>
              <label>
                来源链接
                <input
                  placeholder="https://…"
                  type="url"
                  value={draft.sourceUrl}
                  onChange={(event) => patch({ sourceUrl: event.target.value })}
                />
              </label>
              <label>
                原始日期
                <input
                  type="date"
                  value={draft.originalCreatedAt.slice(0, 10)}
                  onChange={(event) => patch({ originalCreatedAt: event.target.value })}
                />
              </label>
            </>
          )}
          {panel === "more" && (
            <>
              <label className="knowledge-switch">
                <input
                  type="checkbox"
                  checked={draft.archived}
                  onChange={(event) => patch({ archived: event.target.checked })}
                />
                保存至归档
              </label>
              <p className="knowledge-muted">
                {Array.from(draft.content).length} 字 · {draft.links.length} 个关联 ·{" "}
                {draft.images.length} 张图片
              </p>
            </>
          )}
        </section>
      )}
      <footer className="knowledge-editor-toolbar">
        <button type="button" onClick={() => showPanel("tags")}>
          <Hash size={18} />
          标签
        </button>
        <button type="button" onClick={() => showPanel("links")}>
          [[ 关联 ]]
        </button>
        <button type="button" onClick={() => showPanel("source")}>
          <Link2 size={17} />
          来源
        </button>
        <button
          type="button"
          disabled={busy}
          aria-label="添加图片"
          onClick={() => imageInput.current?.click()}
        >
          <ImagePlus size={20} />
        </button>
        <button type="button" aria-label="更多编辑工具" onClick={() => showPanel("more")}>
          <MoreHorizontal size={20} />
        </button>
        <input
          ref={imageInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          onChange={(event) => void upload(event)}
        />
      </footer>
    </section>
  );
}
