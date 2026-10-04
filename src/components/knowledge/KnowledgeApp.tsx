import { useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Archive,
  ArrowUpRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FileUp,
  Hash,
  Home,
  ImagePlus,
  Link2,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Share2,
  UserRound,
  X,
} from "lucide-react";
import {
  cardSummary,
  cardTitle,
  knowledgeGraph,
  knowledgeDate,
  knowledgeRelations,
  newKnowledgeCard,
  parseKnowledgeImport,
  searchKnowledge,
  type KnowledgeCard,
} from "@/lib/knowledge";
import { saveKnowledgeCards, updateKnowledge, useKnowledge } from "@/lib/knowledge-store";
import { useKeyboardViewport } from "@/hooks/useKeyboardViewport";
import { prepareChatImage, uploadChatMedia } from "@/lib/chat-media";
import { recognizeKnowledgeImage } from "@/lib/knowledge.functions";
import { KnowledgeEditor } from "./KnowledgeEditor";
import { KnowledgeSources } from "./KnowledgeSources";
import { KnowledgeImage } from "./KnowledgeImage";
import "@/styles/knowledge.css";

export type KnowledgeView =
  "home" | "search" | "archive" | "me" | "tags" | "unconnected" | "detail" | "graph";
type Sheet = "add" | "menu" | "detail-menu" | "clip" | "import" | null;

function exportKnowledge(cards: KnowledgeCard[], name = "知识库") {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify({ schemaVersion: 1, cards }, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name.replace(/[\\/:*?"<>|]/g, "_")}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function KnowledgeApp({
  userId,
  displayName,
  view,
  selectedId,
  tag,
  onNavigate,
  onHome,
  onSource,
}: {
  userId: string;
  displayName: string;
  view: KnowledgeView;
  selectedId?: string | undefined;
  tag?: string | undefined;
  onNavigate: (view: KnowledgeView, id?: string, tag?: string) => void;
  onHome: () => void;
  onSource: (card: KnowledgeCard) => void;
}) {
  const library = useKnowledge(userId);
  const { cards } = library;
  const relations = useMemo(() => knowledgeRelations(cards), [cards]);
  const [draft, setDraft] = useState<KnowledgeCard | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [sourcePicker, setSourcePicker] = useState<"diary" | "chat" | null>(null);
  const [query, setQuery] = useState("");
  const [searchKind, setSearchKind] = useState("全部");
  const [filter, setFilter] = useState("全部");
  const [tagSort, setTagSort] = useState("按使用次数");
  const [graphDepth, setGraphDepth] = useState(1);
  const [limit, setLimit] = useState(40);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [importCards, setImportCards] = useState<KnowledgeCard[]>([]);
  const [importSelected, setImportSelected] = useState<string[]>([]);
  const [clipTitle, setClipTitle] = useState("");
  const [clipText, setClipText] = useState("");
  const [clipUrl, setClipUrl] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const ocrInput = useRef<HTMLInputElement>(null);
  const page = useRef<HTMLElement>(null);
  useKeyboardViewport(page);
  const selected = relations.byId.get(selectedId ?? "");
  const activeCards = cards.filter((card) => !card.archived);
  const unconnected = activeCards.filter((card) => !relations.adjacent.get(card.id)?.size);
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    cards.forEach((card) =>
      new Set(card.tags).forEach((value) => result.set(value, (result.get(value) ?? 0) + 1)),
    );
    return result;
  }, [cards]);
  const graph = useMemo(
    () => knowledgeGraph(cards, selectedId || cards[0]?.id || "", graphDepth),
    [cards, selectedId, graphDepth],
  );
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  };
  const go = (next: KnowledgeView, id?: string, nextTag?: string) => {
    setLimit(40);
    setSheet(null);
    setError("");
    onNavigate(next, id, nextTag);
  };
  const open = (card: KnowledgeCard) => go("detail", card.id);
  const newCard = () => {
    setSheet(null);
    setDraft(newKnowledgeCard());
  };
  const importFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!files.length) return;
    await run(async () => {
      if (files.reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024)
        throw new Error("单次导入文件总大小不超过 20 MB。");
      const rows: KnowledgeCard[] = [];
      for (const file of files) {
        const text = await file.text();
        let htmlText: string | undefined;
        if (/\.html?$/i.test(file.name)) {
          const doc = new DOMParser().parseFromString(text, "text/html");
          doc
            .querySelectorAll("script,style,noscript,iframe,svg")
            .forEach((element) => element.remove());
          const readable = doc.body.innerHTML.replace(
            /<br\s*\/?>|<\/(p|div|h[1-6]|li|section|article)>/gi,
            "\n",
          );
          htmlText =
            new DOMParser().parseFromString(readable, "text/html").body.textContent?.trim() || "";
        }
        rows.push(...parseKnowledgeImport(text, file.name, htmlText));
        if (rows.length > 2000) throw new Error("单次最多导入 2000 张卡片，请分批操作。");
      }
      setImportCards(rows);
      setImportSelected(rows.map((card) => card.id));
      setSheet("import");
    });
  };
  const recognize = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setSheet(null);
    await run(async () => {
      const image = await prepareChatImage(file, 2048, 2 * 1024 * 1024, { alwaysEncode: true });
      try {
        const path = await uploadChatMedia(userId, image, "messages");
        const result = await recognizeKnowledgeImage({ data: { imagePath: path } });
        setDraft(
          newKnowledgeCard({
            title: file.name.replace(/\.[^.]+$/, ""),
            content: result.text,
            images: [path],
            sourceType: "image",
            sourceLabel: file.name,
          }),
        );
      } finally {
        URL.revokeObjectURL(image.previewUrl);
      }
    });
  };
  const listCard = (card: KnowledgeCard, compact = false) => (
    <button
      className={`knowledge-card${compact ? " knowledge-card--compact" : ""}`}
      type="button"
      key={card.id}
      onClick={() => open(card)}
    >
      <div className="knowledge-card-head">
        <strong>{cardTitle(card)}</strong>
        <time>{knowledgeDate(card.originalCreatedAt || card.createdAt)}</time>
      </div>
      {card.images[0] && (
        <div className="knowledge-thumb">
          <KnowledgeImage path={card.images[0]} />
        </div>
      )}
      <p>{cardSummary(card)}</p>
      <div className="knowledge-card-meta">
        <span className="knowledge-chips">
          {card.tags.slice(0, 4).map((value) => (
            <span key={value}>#{value}</span>
          ))}
        </span>
        <span>
          <ArrowUpRight size={13} />
          {relations.adjacent.get(card.id)?.size ?? 0}
        </span>
      </div>
    </button>
  );
  const list = (items: KnowledgeCard[], compact = false) => (
    <>
      {items.slice(0, limit).map((card) => listCard(card, compact))}
      {items.length > limit && (
        <button
          type="button"
          className="knowledge-load-more"
          onClick={() => setLimit((previous) => previous + 40)}
        >
          显示更多（剩余 {items.length - limit}）
        </button>
      )}
      {!items.length && <p className="knowledge-empty">还没有卡片，记下第一个想法吧</p>}
    </>
  );
  const sortedTags = [...counts.keys()].sort((a, b) =>
    tagSort === "按字母"
      ? a.localeCompare(b, "zh-CN")
      : tagSort === "自定义"
        ? (library.tagOrder.indexOf(a) < 0 ? 999999 : library.tagOrder.indexOf(a)) -
            (library.tagOrder.indexOf(b) < 0 ? 999999 : library.tagOrder.indexOf(b)) ||
          a.localeCompare(b, "zh-CN")
        : counts.get(b)! - counts.get(a)! || a.localeCompare(b, "zh-CN"),
  );
  const reorderTag = (value: string, direction: number) =>
    void run(async () => {
      const order = [...sortedTags];
      const index = order.indexOf(value);
      const target = index + direction;
      if (target < 0 || target >= order.length) return;
      [order[index], order[target]] = [order[target]!, order[index]!];
      await updateKnowledge(userId, (state) => ({ ...state, tagOrder: order }));
    });

  return (
    <main ref={page} className="knowledge-app" data-ui="knowledge-app">
      {draft ? (
        <KnowledgeEditor
          key={draft.id}
          initial={draft}
          cards={cards}
          userId={userId}
          onCancel={() => setDraft(null)}
          onCreateLink={async (card) => {
            await saveKnowledgeCards(userId, [card]);
          }}
          onSave={async (card) => {
            await saveKnowledgeCards(userId, [card]);
            setDraft(null);
            setSourcePicker(null);
            open(card);
          }}
        />
      ) : sourcePicker ? (
        <KnowledgeSources
          key={`${userId}:${sourcePicker}`}
          kind={sourcePicker}
          userId={userId}
          onBack={() => setSourcePicker(null)}
          onPreview={(card) => setDraft(card)}
        />
      ) : (
        <>
          <header className={`knowledge-header ${view === "home" ? "knowledge-header--home" : ""}`}>
            {view === "home" ? (
              <h1>知识库</h1>
            ) : (
              <button type="button" aria-label="返回" onClick={() => go("home")}>
                <ChevronLeft size={22} />
              </button>
            )}
            {view !== "home" && (
              <strong>
                {
                  (
                    {
                      search: "搜索",
                      archive: "归档",
                      me: "我的",
                      tags: "标签",
                      unconnected: `未连接的卡片 ${unconnected.length}`,
                      detail: "",
                      graph: "关系图谱",
                    } as const
                  )[view]
                }
              </strong>
            )}
            <button
              type="button"
              aria-label="更多知识库功能"
              onClick={() => setSheet(view === "detail" ? "detail-menu" : "menu")}
            >
              <MoreHorizontal size={21} />
            </button>
          </header>
          {(error || library.error) && (
            <p className="knowledge-error" role="alert">
              {error || library.error}
            </p>
          )}
          {busy && (
            <p className="knowledge-status" role="status">
              正在处理，请稍候…
            </p>
          )}
          <div className="knowledge-scroll">
            {library.loading ? (
              <p className="knowledge-empty">读取知识库…</p>
            ) : view === "home" ? (
              <>
                <button type="button" className="knowledge-search" onClick={() => go("search")}>
                  <Search size={17} />
                  <span>搜索你的知识…</span>
                </button>
                <div className="knowledge-tabs">
                  {["全部", "主题", "关系", `未连接 ${unconnected.length}`].map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={filter === value ? "is-active" : ""}
                      onClick={() => {
                        if (value.startsWith("未连接")) go("unconnected");
                        else if (value === "主题") go("tags");
                        else {
                          setFilter(value);
                          setLimit(40);
                        }
                      }}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <div className="knowledge-feed">
                  {list(
                    filter === "关系"
                      ? activeCards.filter((card) => relations.adjacent.get(card.id)?.size)
                      : activeCards,
                  )}
                </div>
              </>
            ) : view === "search" ? (
              <>
                <div className="knowledge-search">
                  <Search size={17} />
                  <input
                    aria-label="搜索知识库"
                    placeholder="搜索你的知识…"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setLimit(40);
                    }}
                  />
                  {query && (
                    <button type="button" aria-label="清空搜索" onClick={() => setQuery("")}>
                      <X size={16} />
                    </button>
                  )}
                </div>
                <div className="knowledge-tabs">
                  {["全部", "卡片", "标签", "内容"].map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={searchKind === value ? "is-active" : ""}
                      onClick={() => {
                        setSearchKind(value);
                        setLimit(40);
                      }}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <div className="knowledge-feed">
                  {list(searchKnowledge(cards, query, searchKind))}
                </div>
              </>
            ) : view === "archive" ? (
              <div className="knowledge-feed">{list(cards.filter((card) => card.archived))}</div>
            ) : view === "unconnected" ? (
              <div className="knowledge-feed">{list(unconnected, true)}</div>
            ) : view === "tags" ? (
              <>
                <div className="knowledge-tabs">
                  {["按使用次数", "按字母", "自定义"].map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={tagSort === value ? "is-active" : ""}
                      onClick={() => setTagSort(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                {tag ? (
                  <>
                    <button type="button" className="knowledge-tag-back" onClick={() => go("tags")}>
                      全部标签 / #{tag}
                    </button>
                    <div className="knowledge-feed">
                      {list(cards.filter((card) => card.tags.includes(tag)))}
                    </div>
                  </>
                ) : (
                  <div className="knowledge-tag-grid">
                    {sortedTags.map((value, index) => (
                      <div key={value}>
                        <button type="button" onClick={() => go("tags", undefined, value)}>
                          <span>#{value}</span>
                          <small>{counts.get(value)}</small>
                        </button>
                        {tagSort === "自定义" && (
                          <span className="knowledge-tag-order">
                            <button
                              type="button"
                              aria-label={`向前移动${value}`}
                              disabled={busy || !index}
                              onClick={() => reorderTag(value, -1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label={`向后移动${value}`}
                              disabled={busy || index === sortedTags.length - 1}
                              onClick={() => reorderTag(value, 1)}
                            >
                              ↓
                            </button>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {!counts.size && <p className="knowledge-empty">在卡片中添加标签后会显示在这里</p>}
              </>
            ) : view === "me" ? (
              <section className="knowledge-my">
                <UserRound size={42} strokeWidth={1.2} />
                <h2>{displayName || "我的知识"}</h2>
                <p>把零散的想法，慢慢连接起来。</p>
                <div className="knowledge-stats">
                  <span>
                    <strong>{cards.length}</strong>卡片
                  </span>
                  <span>
                    <strong>{counts.size}</strong>标签
                  </span>
                  <span>
                    <strong>
                      {cards.reduce(
                        (sum, card) =>
                          sum + card.links.filter((id) => relations.byId.has(id)).length,
                        0,
                      )}
                    </strong>
                    关联
                  </span>
                </div>
                <button className="knowledge-menu-row" type="button" onClick={() => go("tags")}>
                  <Hash size={18} />
                  管理标签
                  <ChevronRight size={17} />
                </button>
                <button className="knowledge-menu-row" type="button" onClick={() => go("archive")}>
                  <Archive size={18} />
                  我的归档
                  <ChevronRight size={17} />
                </button>
                <button
                  className="knowledge-menu-row"
                  type="button"
                  onClick={() => exportKnowledge(cards)}
                >
                  <Share2 size={18} />
                  导出知识库备份
                </button>
                <p className="knowledge-muted">
                  知识卡片按账号保存在此设备浏览器中。清除网站数据前，请导出备份；不会改动聊天与日记原文。
                </p>
              </section>
            ) : view === "detail" ? (
              selected ? (
                <article className="knowledge-detail">
                  <h1>{cardTitle(selected)}</h1>
                  <div className="knowledge-chips">
                    {selected.tags.map((value) => (
                      <button
                        type="button"
                        key={value}
                        onClick={() => go("tags", undefined, value)}
                      >
                        #{value}
                      </button>
                    ))}
                    <button type="button" aria-label="编辑标签" onClick={() => setDraft(selected)}>
                      ＋
                    </button>
                  </div>
                  <div className="knowledge-detail-meta">
                    <time>
                      {new Date(selected.createdAt).toLocaleString("zh-CN", { hour12: false })}
                    </time>
                    <button type="button" aria-label="编辑卡片" onClick={() => setDraft(selected)}>
                      编辑
                    </button>
                  </div>
                  <div className="knowledge-content">
                    {selected.content.split(/(\[\[[^\]\n]+\]\])/g).map((part, index) => {
                      const title = part.match(/^\[\[(.*)\]\]$/)?.[1];
                      const target = title
                        ? cards.find(
                            (card) =>
                              cardTitle(card).toLocaleLowerCase() ===
                              title.trim().toLocaleLowerCase(),
                          )
                        : undefined;
                      return target ? (
                        <button type="button" key={index} onClick={() => open(target)}>
                          {title}
                        </button>
                      ) : (
                        <span key={index}>{part}</span>
                      );
                    })}
                  </div>
                  {selected.images.length > 0 && (
                    <div className="knowledge-detail-images">
                      {selected.images.map((path) => (
                        <KnowledgeImage key={path} path={path} />
                      ))}
                    </div>
                  )}
                  {(selected.sourceLabel || selected.sourceType !== "manual") && (
                    <div className="knowledge-origin">
                      <button
                        type="button"
                        onClick={() => {
                          if (["diary", "chat"].includes(selected.sourceType) && selected.sourceId)
                            onSource(selected);
                          else if (/^https?:\/\//i.test(selected.sourceUrl))
                            window.open(selected.sourceUrl, "_blank", "noopener,noreferrer");
                          else setDraft(selected);
                        }}
                      >
                        来自：{selected.sourceLabel || "导入"}
                        {selected.originalCreatedAt
                          ? ` · ${selected.originalCreatedAt.slice(0, 10)}`
                          : ""}
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  )}
                  <section className="knowledge-relations">
                    <h2>
                      关联{" "}
                      <button
                        type="button"
                        aria-label="添加关联"
                        onClick={() => setDraft(selected)}
                      >
                        <Plus size={19} />
                      </button>
                    </h2>
                    <div className="knowledge-chips">
                      {selected.links
                        .map((id) => relations.byId.get(id))
                        .filter((card): card is KnowledgeCard => Boolean(card))
                        .map((card) => (
                          <button type="button" key={card.id} onClick={() => open(card)}>
                            {cardTitle(card)}
                          </button>
                        ))}
                    </div>
                    {!selected.links.some((id) => relations.byId.has(id)) && (
                      <p className="knowledge-muted">还没有主动关联</p>
                    )}
                    <button
                      type="button"
                      className="knowledge-graph-link"
                      onClick={() => go("graph", selected.id)}
                    >
                      <Link2 size={16} />
                      查看关系图谱
                      <ChevronRight size={16} />
                    </button>
                  </section>
                  <section className="knowledge-relations">
                    <h2>
                      谁提到了它 <small>{relations.incoming.get(selected.id)?.length ?? 0}</small>
                    </h2>
                    {(relations.incoming.get(selected.id) ?? []).map((id) =>
                      listCard(relations.byId.get(id)!, true),
                    )}
                    {!relations.incoming.get(selected.id)?.length && (
                      <p className="knowledge-muted">还没有其他卡片提到它</p>
                    )}
                  </section>
                </article>
              ) : (
                <p className="knowledge-empty">卡片不存在或已删除</p>
              )
            ) : view === "graph" ? (
              <>
                <div className="knowledge-tabs">
                  {[0, 1, 2, 3].map((depth) => (
                    <button
                      type="button"
                      key={depth}
                      className={graphDepth === depth ? "is-active" : ""}
                      onClick={() => setGraphDepth(depth)}
                    >
                      {depth === 0 ? "全部" : `${depth}层`}
                    </button>
                  ))}
                </div>
                <KnowledgeGraph
                  nodes={graph.nodes}
                  edges={graph.edges}
                  onCenter={(card) => go("graph", card.id)}
                />
                {graph.truncated && (
                  <p className="knowledge-muted knowledge-inset">
                    仅显示附近 40 个节点，可点击节点继续探索。
                  </p>
                )}
                <section className="knowledge-inset">
                  <h2>相关卡片</h2>
                  {graph.nodes.slice(1).map((card) => listCard(card, true))}
                  {!graph.nodes.length && <p className="knowledge-empty">先新建卡片并添加关联</p>}
                </section>
              </>
            ) : null}
          </div>
          <nav className="knowledge-bottom-nav" aria-label="知识库导航">
            {(
              [
                { value: "home", label: "首页", Icon: Home },
                { value: "search", label: "搜索", Icon: Search },
                { value: "add", label: "新建知识", Icon: Plus },
                { value: "archive", label: "归档", Icon: Archive },
                { value: "me", label: "我的", Icon: UserRound },
              ] as const
            ).map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                className={`${value === "add" ? "knowledge-nav-add" : ""}${view === value ? " is-active" : ""}`}
                aria-label={label}
                aria-current={view === value ? "page" : undefined}
                onClick={() => (value === "add" ? setSheet("add") : go(value))}
              >
                <span>
                  <Icon size={value === "add" ? 24 : 22} strokeWidth={1.5} />
                </span>
                {value !== "add" && <small>{label}</small>}
              </button>
            ))}
          </nav>
        </>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".json,.txt,.md,.markdown,.html,.htm"
        multiple
        hidden
        onChange={(event) => void importFiles(event)}
      />
      <input
        ref={ocrInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={(event) => void recognize(event)}
      />
      {sheet && (
        <div
          className="knowledge-sheet-backdrop"
          onClick={() => {
            if (!busy) setSheet(null);
          }}
        >
          <section
            className="knowledge-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={sheet === "add" ? "添加知识" : "知识库操作"}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="knowledge-sheet-handle" />
            <button
              className="knowledge-sheet-close"
              type="button"
              aria-label="关闭菜单"
              disabled={busy}
              onClick={() => setSheet(null)}
            >
              <X size={18} />
            </button>
            {sheet === "add" && (
              <>
                {[
                  { label: "新建卡片", Icon: FilePlus2, action: newCard },
                  { label: "导入剪藏", Icon: FileUp, action: () => setSheet("clip") },
                  {
                    label: "从聊天保存",
                    Icon: MessageCircle,
                    action: () => {
                      setSheet(null);
                      setSourcePicker("chat");
                    },
                  },
                  {
                    label: "从日记生成",
                    Icon: BookOpen,
                    action: () => {
                      setSheet(null);
                      setSourcePicker("diary");
                    },
                  },
                  {
                    label: "从图片识别文字",
                    Icon: ImagePlus,
                    action: () => ocrInput.current?.click(),
                  },
                  { label: "批量导入", Icon: FileUp, action: () => fileInput.current?.click() },
                ].map(({ label, Icon, action }) => (
                  <button
                    type="button"
                    className="knowledge-menu-row"
                    disabled={busy || library.loading || Boolean(library.error)}
                    key={label}
                    onClick={action}
                  >
                    <Icon size={20} strokeWidth={1.4} />
                    {label}
                  </button>
                ))}
              </>
            )}
            {sheet === "menu" && (
              <>
                <button
                  className="knowledge-menu-row"
                  type="button"
                  onClick={() => {
                    setSheet(null);
                    onHome();
                  }}
                >
                  <Home size={18} />
                  返回 K得机桌面
                </button>
                <button className="knowledge-menu-row" type="button" onClick={() => go("tags")}>
                  <Hash size={18} />
                  标签
                </button>
                <button
                  className="knowledge-menu-row"
                  type="button"
                  onClick={() => go("unconnected")}
                >
                  <FilePlus2 size={18} />
                  未连接的卡片 {unconnected.length}
                </button>
                <button
                  className="knowledge-menu-row"
                  type="button"
                  onClick={() => go("graph", selected?.id || cards[0]?.id)}
                >
                  <Link2 size={18} />
                  关系图谱
                </button>
                <button
                  className="knowledge-menu-row"
                  type="button"
                  onClick={() => exportKnowledge(cards)}
                >
                  <Share2 size={18} />
                  导出知识库
                </button>
              </>
            )}
            {sheet === "detail-menu" && selected && (
              <>
                <button
                  className="knowledge-menu-row"
                  type="button"
                  onClick={() => {
                    setSheet(null);
                    setDraft(selected);
                  }}
                >
                  编辑卡片
                </button>
                <button
                  className="knowledge-menu-row"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await saveKnowledgeCards(userId, [
                        {
                          ...selected,
                          archived: !selected.archived,
                          updatedAt: new Date().toISOString(),
                        },
                      ]);
                      setSheet(null);
                    })
                  }
                >
                  {selected.archived ? "取消归档" : "归档卡片"}
                </button>
                <button
                  className="knowledge-menu-row"
                  type="button"
                  onClick={() => exportKnowledge([selected], cardTitle(selected))}
                >
                  导出这张卡片
                </button>
                <button
                  className="knowledge-menu-row knowledge-danger"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm("删除这张知识卡片？原日记与聊天不会被修改。此操作不可撤销。")
                    )
                      void run(async () => {
                        await updateKnowledge(userId, (state) => ({
                          ...state,
                          cards: state.cards.filter((card) => card.id !== selected.id),
                        }));
                        go("home");
                      });
                  }}
                >
                  删除卡片
                </button>
              </>
            )}
            {sheet === "clip" && (
              <div className="knowledge-import-form">
                <h2>导入剪藏</h2>
                <label>
                  标题
                  <input value={clipTitle} onChange={(event) => setClipTitle(event.target.value)} />
                </label>
                <label>
                  来源网址
                  <input
                    type="url"
                    placeholder="https://…（可选）"
                    value={clipUrl}
                    onChange={(event) => setClipUrl(event.target.value)}
                  />
                </label>
                <label>
                  剪藏正文
                  <textarea
                    placeholder="粘贴文章或笔记内容，不会自动抓取网址"
                    value={clipText}
                    onChange={(event) => setClipText(event.target.value)}
                  />
                </label>
                <button
                  className="knowledge-primary"
                  type="button"
                  disabled={!clipText.trim()}
                  onClick={() => {
                    if (clipUrl && !/^https?:\/\//i.test(clipUrl)) {
                      setError("来源网址需以 http:// 或 https:// 开头。");
                      setSheet(null);
                      return;
                    }
                    setSheet(null);
                    setDraft(
                      newKnowledgeCard({
                        title: clipTitle,
                        content: clipText,
                        sourceType: "clip",
                        sourceLabel: "剪藏",
                        sourceUrl: clipUrl,
                      }),
                    );
                  }}
                >
                  预览卡片
                </button>
                <button
                  className="knowledge-menu-row"
                  type="button"
                  onClick={() => fileInput.current?.click()}
                >
                  从 JSON / TXT / Markdown / HTML 文件导入
                </button>
              </div>
            )}
            {sheet === "import" && (
              <div className="knowledge-import-form">
                <h2>导入 {importCards.length} 张卡片</h2>
                <p className="knowledge-muted">只在确认后新增卡片，不覆盖已有数据。</p>
                <div className="knowledge-import-toggle">
                  <button
                    type="button"
                    onClick={() => setImportSelected(importCards.map((card) => card.id))}
                  >
                    全选
                  </button>
                  <button type="button" onClick={() => setImportSelected([])}>
                    取消全选
                  </button>
                </div>
                <div className="knowledge-import-list">
                  {importCards.slice(0, limit).map((card) => (
                    <label key={card.id}>
                      <input
                        type="checkbox"
                        checked={importSelected.includes(card.id)}
                        onChange={(event) =>
                          setImportSelected((previous) =>
                            event.target.checked
                              ? [...previous, card.id]
                              : previous.filter((id) => id !== card.id),
                          )
                        }
                      />
                      <span>
                        <strong>{cardTitle(card)}</strong>
                        <small>{cardSummary(card, 70)}</small>
                      </span>
                    </label>
                  ))}
                  {importCards.length > limit && (
                    <button
                      className="knowledge-load-more"
                      type="button"
                      onClick={() => setLimit((previous) => previous + 40)}
                    >
                      显示更多
                    </button>
                  )}
                </div>
                <button
                  className="knowledge-primary"
                  type="button"
                  disabled={busy || !importSelected.length}
                  onClick={() =>
                    void run(async () => {
                      const chosen = importCards.filter((card) => importSelected.includes(card.id));
                      await saveKnowledgeCards(userId, chosen);
                      setImportCards([]);
                      setImportSelected([]);
                      go("home");
                    })
                  }
                >
                  导入 {importSelected.length} 张卡片
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function KnowledgeGraph({
  nodes,
  edges,
  onCenter,
}: {
  nodes: KnowledgeCard[];
  edges: [string, string][];
  onCenter: (card: KnowledgeCard) => void;
}) {
  const positions = new Map(
    nodes.map((card, index) => {
      if (!index) return [card.id, { x: 180, y: 180 }];
      const ring = Math.floor((index - 1) / 12);
      const radius = 100 + ring * 23;
      const count = Math.min(12, nodes.length - 1 - ring * 12);
      const angle = (((index - 1) % 12) / count) * Math.PI * 2 - Math.PI / 2;
      return [card.id, { x: 180 + Math.cos(angle) * radius, y: 180 + Math.sin(angle) * radius }];
    }),
  );
  return (
    <svg className="knowledge-graph" viewBox="0 0 360 360" role="group" aria-label="卡片关系图谱">
      {edges.map(([from, to], index) => (
        <line
          key={`${from}-${to}-${index}`}
          x1={positions.get(from)!.x}
          y1={positions.get(from)!.y}
          x2={positions.get(to)!.x}
          y2={positions.get(to)!.y}
        />
      ))}
      {nodes.map((card, index) => (
        <g
          key={card.id}
          role="button"
          tabIndex={0}
          aria-label={`以${cardTitle(card)}为中心`}
          onClick={() => onCenter(card)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onCenter(card);
            }
          }}
          transform={`translate(${positions.get(card.id)!.x},${positions.get(card.id)!.y})`}
          className={index === 0 ? "knowledge-graph-center" : ""}
        >
          <circle r={index ? 25 : 32} />
          <text textAnchor="middle" dominantBaseline="central">
            {cardTitle(card).slice(0, 6)}
          </text>
        </g>
      ))}
    </svg>
  );
}
