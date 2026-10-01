import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Pencil,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { SystemModal } from "@/components/system-ui";
import { useKeyboardViewport } from "@/hooks/useKeyboardViewport";
import { closeSystemApp, popSystemPage, pushSystemPage } from "@/lib/app-transition";
import {
  parseWorldBook,
  type WorldBook,
  type WorldBookSummary,
  type WorldEntry,
} from "@/lib/world-books";
import { importWorldBookFile, worldBookFileAccept } from "@/lib/world-book-file";
import {
  deleteWorldBook,
  getWorldBook,
  importWorldBook,
  listWorldBooks,
  saveWorldEntry,
  updateWorldBook,
  worldBookBindings,
} from "@/lib/world-books.functions";
import "@/styles/world-books.css";

type ImportDraft = ReturnType<typeof parseWorldBook>;
type Dialog =
  | { kind: "import"; draft: ImportDraft }
  | { kind: "rename"; book: WorldBookSummary }
  | { kind: "delete"; book: WorldBookSummary; names: string[] };

export function WorldBooksApp() {
  const navigate = useNavigate();
  const list = useServerFn(listWorldBooks);
  const get = useServerFn(getWorldBook);
  const upload = useServerFn(importWorldBook);
  const update = useServerFn(updateWorldBook);
  const save = useServerFn(saveWorldEntry);
  const bindings = useServerFn(worldBookBindings);
  const remove = useServerFn(deleteWorldBook);
  const [books, setBooks] = useState<WorldBookSummary[]>([]);
  const [book, setBook] = useState<WorldBook | null>(null);
  const [editing, setEditing] = useState<{ index: number; entry: WorldEntry } | null>(null);
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(50);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [name, setName] = useState("");
  const page = useRef<HTMLElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useKeyboardViewport(page);
  useEffect(() => {
    alive.current = true;
    void list()
      .then((rows) => {
        if (alive.current) setBooks(rows);
      })
      .catch((e: unknown) => {
        if (alive.current) setError(message(e));
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
    return () => {
      alive.current = false;
    };
  }, [list]);
  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (alive.current) setError(message(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function merge(summary: WorldBookSummary) {
    setBooks((rows) => rows.map((item) => (item.id === summary.id ? summary : item)));
    setBook((current) => (current?.id === summary.id ? { ...current, ...summary } : current));
  }
  function back() {
    if (busy) return;
    setError("");
    if (editing) void popSystemPage(() => setEditing(null));
    else if (book)
      void popSystemPage(() => {
        setBook(null);
        setQuery("");
      });
    else void closeSystemApp("world-books", () => navigate({ to: "/" }));
  }
  async function openBook(id: string) {
    await action(async () => {
      const found = await get({ data: { id } });
      if (!alive.current) return;
      await pushSystemPage(() => {
        setBook(found);
        setQuery("");
        setVisible(50);
      });
    });
  }
  function changeEntry(patch: Partial<WorldEntry>) {
    setEditing((current) =>
      current ? { ...current, entry: { ...current.entry, ...patch } } : current,
    );
  }
  const filteredEntries =
    book?.entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) =>
        `${entry.name} ${entry.comment} ${entry.content}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ) ?? [];
  const filteredBooks = books.filter((item) =>
    item.name.toLowerCase().includes(query.toLowerCase()),
  );
  const current = editing?.entry;
  return (
    <main className="world-books-app" ref={page}>
      <header className="world-books-app__header">
        <button type="button" aria-label="返回" disabled={busy} onClick={back}>
          <ChevronLeft size={24} />
        </button>
        <h1>{editing ? "编辑条目" : book ? book.name : "世界书"}</h1>
        {editing && book ? (
          <button
            key="save-entry"
            type="button"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const saved = await save({
                  data: {
                    id: book.id,
                    index: editing.index,
                    updated_at: book.updated_at,
                    entry: editing.entry,
                  },
                });
                if (alive.current) {
                  setBook(saved);
                  merge(saved);
                  setEditing(null);
                }
              })
            }
          >
            {busy ? "保存中" : "完成"}
          </button>
        ) : (
          <button
            key="import-book"
            type="button"
            aria-label="导入 JSON / DOCX"
            disabled={busy}
            onClick={() => file.current?.click()}
          >
            <Upload size={21} />
          </button>
        )}
      </header>
      <input
        ref={file}
        type="file"
        accept={worldBookFileAccept}
        hidden
        onChange={(e) => {
          const selected = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (!selected) return;
          void action(async () => {
            const draft = await importWorldBookFile(selected);
            if (alive.current) {
              setName(draft.name);
              setDialog({ kind: "import", draft });
            }
          });
        }}
      />
      <div className="world-books-app__scroll" key={editing ? "entry" : (book?.id ?? "list")}>
        {error && (
          <p className="world-books-app__error" role="alert">
            {error}
          </p>
        )}
        {!editing && (
          <label className="world-books-app__search">
            <Search size={18} />
            <input
              aria-label={book ? "搜索条目" : "搜索世界书"}
              placeholder={book ? "搜索条目" : "搜索世界书"}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisible(50);
              }}
            />
          </label>
        )}
        {loading && (
          <p className="world-books-app__hint" role="status">
            正在读取世界书…
          </p>
        )}
        {busy && !editing && (
          <p className="world-books-app__hint" role="status">
            正在处理…
          </p>
        )}
        {!book && !editing && (
          <>
            <p className="world-books-app__hint">集中管理设定，再为聊天中的角色单独绑定。</p>
            <section className="world-books-app__group">
              {filteredBooks.map((item) => (
                <article className="world-books-app__book" key={item.id}>
                  <button
                    type="button"
                    className="world-books-app__open"
                    disabled={busy}
                    onClick={() => void openBook(item.id)}
                  >
                    <BookOpen size={23} />
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.entry_count} 个条目 · {item.enabled ? "已启用" : "已停用"}
                      </small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <div className="world-books-app__tools">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={item.enabled}
                      aria-label={`启用${item.name}`}
                      disabled={busy}
                      onClick={() =>
                        void action(async () =>
                          merge(await update({ data: { id: item.id, enabled: !item.enabled } })),
                        )
                      }
                    >
                      {item.enabled ? "启用" : "停用"}
                    </button>
                    <button
                      type="button"
                      aria-label={`重命名${item.name}`}
                      disabled={busy}
                      onClick={() => {
                        setName(item.name);
                        setDialog({ kind: "rename", book: item });
                      }}
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      type="button"
                      aria-label={`删除${item.name}`}
                      className="is-danger"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          const chars = await bindings({ data: { id: item.id } });
                          if (alive.current)
                            setDialog({
                              kind: "delete",
                              book: item,
                              names: chars.map((char) => char.name),
                            });
                        })
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </article>
              ))}
            </section>
            {!loading && filteredBooks.length === 0 && (
              <div className="world-books-app__empty">
                <BookOpen size={38} />
                <p>{query ? "没有匹配的世界书" : "还没有世界书"}</p>
                <button type="button" disabled={busy} onClick={() => file.current?.click()}>
                  导入 JSON / DOCX
                </button>
              </div>
            )}
          </>
        )}
        {book && !editing && (
          <>
            <p className="world-books-app__hint">
              {book.entries.length} 个条目 · {book.enabled ? "已启用" : "整本已停用"}
            </p>
            <section className="world-books-app__group">
              {filteredEntries.slice(0, visible).map(({ entry, index }) => (
                <button
                  className="world-books-app__entry"
                  type="button"
                  key={`${entry.uid}:${index}`}
                  disabled={busy}
                  onClick={() =>
                    void pushSystemPage(() => setEditing({ index, entry: structuredClone(entry) }))
                  }
                >
                  {entry.disable ? (
                    <Circle size={21} />
                  ) : (
                    <CheckCircle2 className="is-blue" size={21} />
                  )}
                  <span>
                    <strong>{entry.name || entry.comment || `条目 ${index + 1}`}</strong>
                    <small className="world-books-app__preview">
                      {entry.content || "暂无内容"}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </section>
            {filteredEntries.length > visible && (
              <button
                className="world-books-app__more"
                type="button"
                onClick={() => setVisible((count) => count + 50)}
              >
                显示更多（剩余 {filteredEntries.length - visible}）
              </button>
            )}
            {filteredEntries.length === 0 && (
              <p className="world-books-app__hint">没有匹配的条目。</p>
            )}
          </>
        )}
        {current && (
          <>
            <section className="world-books-app__group world-books-app__fields">
              <label>
                条目名称
                <input
                  value={current.name}
                  maxLength={1000}
                  onChange={(e) => changeEntry({ name: e.target.value })}
                />
              </label>
              <label>
                内容
                <textarea
                  value={current.content}
                  rows={12}
                  maxLength={200000}
                  onChange={(e) => changeEntry({ content: e.target.value })}
                />
              </label>
              <label className="world-books-app__toggle">
                启用条目
                <input
                  type="checkbox"
                  checked={!current.disable}
                  onChange={(e) => changeEntry({ disable: !e.target.checked })}
                />
              </label>
            </section>
            <details className="world-books-app__advanced">
              <summary>
                高级设置
                <ChevronRight size={17} />
              </summary>
              <div className="world-books-app__fields">
                <label className="world-books-app__toggle">
                  常驻条目（constant）
                  <input
                    type="checkbox"
                    checked={current.constant}
                    onChange={(e) => changeEntry({ constant: e.target.checked })}
                  />
                </label>
                <label>
                  备注（comment）
                  <textarea
                    rows={2}
                    value={current.comment}
                    onChange={(e) => changeEntry({ comment: e.target.value })}
                  />
                </label>
                <label>
                  主关键词（key）
                  <textarea
                    rows={2}
                    value={current.key.join("\n")}
                    onChange={(e) => changeEntry({ key: e.target.value.split("\n") })}
                  />
                </label>
                <label>
                  次关键词（keysecondary）
                  <textarea
                    rows={2}
                    value={current.keysecondary.join("\n")}
                    onChange={(e) => changeEntry({ keysecondary: e.target.value.split("\n") })}
                  />
                </label>
                <label className="world-books-app__toggle">
                  选择性触发（selective）
                  <input
                    type="checkbox"
                    checked={current.selective}
                    onChange={(e) => changeEntry({ selective: e.target.checked })}
                  />
                </label>
                {(["position", "role"] as const).map((field) => (
                  <label key={field}>
                    {field}
                    <input
                      value={current[field]}
                      onChange={(e) =>
                        changeEntry({
                          [field]:
                            typeof current[field] === "number" && /^-?\d+$/.test(e.target.value)
                              ? Number(e.target.value)
                              : e.target.value,
                        })
                      }
                    />
                  </label>
                ))}
                {(["depth", "probability", "order"] as const).map((field) => (
                  <label key={field}>
                    {field}
                    <input
                      type="number"
                      value={current[field]}
                      min={field === "probability" ? 0 : undefined}
                      max={field === "probability" ? 100 : undefined}
                      onChange={(e) => {
                        if (Number.isFinite(e.target.valueAsNumber))
                          changeEntry({ [field]: e.target.valueAsNumber });
                      }}
                    />
                  </label>
                ))}
                <p className="world-books-app__hint">
                  第一版注入启用条目，常驻条目优先并按 order
                  排序。关键词、位置、深度和概率参数保留，尚不执行完整触发规则。未知字段原样保留。
                </p>
              </div>
            </details>
          </>
        )}
      </div>
      <SystemModal
        open={!!dialog}
        title={
          dialog?.kind === "delete"
            ? "删除世界书"
            : dialog?.kind === "rename"
              ? "重命名"
              : "导入世界书"
        }
        onClose={() => {
          if (!busy) {
            setDialog(null);
            setError("");
          }
        }}
      >
        <div className="world-books-app__dialog">
          {dialog?.kind === "delete" ? (
            <p>
              {dialog.names.length
                ? `已绑定角色：${dialog.names.join("、")}。删除后将自动解除这些绑定。`
                : "删除后无法恢复。"}
            </p>
          ) : (
            <label>
              世界书名称
              <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          {dialog?.kind === "import" && (
            <p>解析出 {dialog.draft.entries.length} 个条目，将保留所有原始参数。</p>
          )}
          {error && (
            <p role="alert" className="world-books-app__error">
              {error}
            </p>
          )}
          <button
            type="button"
            className={dialog?.kind === "delete" ? "is-danger" : ""}
            disabled={busy || (dialog?.kind !== "delete" && !name.trim())}
            onClick={() => {
              if (!dialog) return;
              void action(async () => {
                if (dialog.kind === "import") {
                  const saved = await upload({ data: { ...dialog.draft, name: name.trim() } });
                  if (alive.current) {
                    setBooks((rows) => [saved, ...rows]);
                    setBook(null);
                    setEditing(null);
                    setQuery("");
                  }
                } else if (dialog.kind === "rename") {
                  const saved = await update({ data: { id: dialog.book.id, name: name.trim() } });
                  if (alive.current) merge(saved);
                } else {
                  await remove({
                    data: { id: dialog.book.id, confirmedBindings: dialog.names.length > 0 },
                  });
                  if (alive.current)
                    setBooks((rows) => rows.filter((item) => item.id !== dialog.book.id));
                }
                if (alive.current) setDialog(null);
              });
            }}
          >
            {busy
              ? "处理中…"
              : dialog?.kind === "delete"
                ? "确认删除"
                : dialog?.kind === "import"
                  ? "导入"
                  : "保存"}
          </button>
        </div>
      </SystemModal>
    </main>
  );
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请重试。";
}
