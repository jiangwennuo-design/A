import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, ChevronRight, Plus, X } from "lucide-react";
import type { CharacterChatPreferences } from "@/lib/character-chat";
import type { WorldBookSummary } from "@/lib/world-books";
import { listWorldBooks } from "@/lib/world-books.functions";

export function CharacterWorldBooks({
  value,
  onChange,
}: {
  value: CharacterChatPreferences;
  onChange: Dispatch<SetStateAction<CharacterChatPreferences>>;
}) {
  const list = useServerFn(listWorldBooks);
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [books, setBooks] = useState<WorldBookSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError("");
    void list()
      .then((rows) => {
        if (alive) setBooks(rows);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "读取失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, list]);
  const toggle = (id: string) =>
    onChange((current) => ({
      ...current,
      worldBookIds: current.worldBookIds.includes(id)
        ? current.worldBookIds.filter((item) => item !== id)
        : [...current.worldBookIds, id],
    }));
  return (
    <details className="character-extras__section" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <BookOpen size={20} />
        <span>
          <strong>世界书</strong>
          <small>
            {value.worldBookIds.length ? `已绑定 ${value.worldBookIds.length} 本` : "未绑定"}
          </small>
        </span>
        <ChevronRight size={16} />
      </summary>
      <div className="character-extras__body">
        <p className="character-extras__hint">
          为当前角色提供额外设定与规则。修改后点击顶部「完成」保存。
        </p>
        <button type="button" onClick={() => setChoosing((current) => !current)}>
          <Plus size={16} />
          绑定世界书
        </button>
        {loading && <p role="status">正在读取…</p>}
        {error && <p role="alert">{error}</p>}
        {value.worldBookIds.map((id) => {
          const book = books.find((item) => item.id === id);
          return (
            <div className="character-extras__card character-extras__row" key={id}>
              <span>
                ✓ {book?.name ?? (loading ? "读取中…" : "已删除或不可用的世界书")}
                {book && !book.enabled ? "（已停用）" : ""}
              </span>
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-label={`解绑${book?.name ?? "世界书"}`}
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
        {choosing && !loading && (
          <section className="character-extras__card">
            {books.length === 0 && (
              <p className="character-extras__hint">
                还没有世界书，请先在桌面的世界书 App 导入 JSON。
              </p>
            )}
            {books.map((book) => (
              <label className="character-extras__row" key={book.id}>
                <span>
                  {book.name}
                  <small>
                    {" "}
                    · {book.entry_count} 个条目{!book.enabled ? " · 已停用" : ""}
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={value.worldBookIds.includes(book.id)}
                  disabled={
                    !value.worldBookIds.includes(book.id) && value.worldBookIds.length >= 100
                  }
                  onChange={() => toggle(book.id)}
                />
              </label>
            ))}
          </section>
        )}
      </div>
    </details>
  );
}
