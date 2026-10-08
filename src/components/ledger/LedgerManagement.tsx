import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, Pencil, Plus, Archive, Trash2 } from "lucide-react";
import { SystemSheet } from "@/components/system-ui";
import { changeLedger } from "@/lib/ledger-store";
import {
  ledgerColors,
  ledgerAmountInput,
  parseLedgerAmount,
  type LedgerAccount,
  type LedgerCategory,
  type LedgerChange,
  type LedgerGroup,
  type LedgerKind,
  type LedgerState,
  type LedgerTag,
} from "@/lib/ledger";
import { LedgerColorPicker, LedgerEmoji } from "./LedgerShared";

export function LedgerManagement({
  userId,
  state,
  view,
  onClose,
}: {
  userId: string;
  state: LedgerState;
  view: "categories" | "tags";
  onClose: () => void;
}) {
  const [kind, setKind] = useState<LedgerKind>("expense");
  const [edit, setEdit] = useState<
    | { type: "category"; value: LedgerCategory }
    | { type: "tag"; value: LedgerTag }
    | { type: "group"; value: LedgerGroup }
    | null
  >(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState<{
    type: "delete-tag" | "delete-group";
    id: string;
    name: string;
  } | null>(null);
  const run = async (change: LedgerChange) => {
    setError("");
    setBusy(true);
    try {
      await changeLedger(userId, change);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败。");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const roots = state.categories
    .filter((c) => c.kind === kind && !c.parentId)
    .sort((a, b) => a.order - b.order);
  const editCategory = (parentId: string | null = null) =>
    setEdit({
      type: "category",
      value: {
        id: crypto.randomUUID(),
        kind,
        parentId,
        name: "",
        emoji: "✨",
        color: parentId ? state.categories.find((c) => c.id === parentId)!.color : ledgerColors[0],
        order:
          Math.max(
            -1,
            ...state.categories
              .filter((c) => c.parentId === parentId && c.kind === kind)
              .map((c) => c.order),
          ) + 1,
        archived: false,
      },
    });
  const categoryRow = (category: LedgerCategory) => (
    <div className="ledger-management-row" key={category.id}>
      <LedgerEmoji emoji={category.emoji} color={category.color} />
      <button
        type="button"
        className="ledger-row-name"
        onClick={() => setEdit({ type: "category", value: { ...category } })}
      >
        {category.name}
        {category.archived && <small>已归档</small>}
      </button>
      <button
        type="button"
        aria-label={`上移 ${category.name}`}
        disabled={busy}
        onClick={() => void run({ type: "move-category", id: category.id, direction: -1 })}
      >
        <ArrowUp size={15} />
      </button>
      <button
        type="button"
        aria-label={`下移 ${category.name}`}
        disabled={busy}
        onClick={() => void run({ type: "move-category", id: category.id, direction: 1 })}
      >
        <ArrowDown size={15} />
      </button>
      <button
        type="button"
        aria-label={`编辑 ${category.name}`}
        onClick={() => setEdit({ type: "category", value: { ...category } })}
      >
        <Pencil size={15} />
      </button>
      <button
        type="button"
        aria-label={`${category.archived ? "恢复" : "归档"} ${category.name}`}
        disabled={busy}
        onClick={() =>
          void run({
            type: "save-category",
            category: { ...category, archived: !category.archived },
          })
        }
      >
        <Archive size={15} />
      </button>
    </div>
  );
  return (
    <SystemSheet
      open
      title={
        edit
          ? edit.type === "category"
            ? "编辑分类"
            : edit.type === "tag"
              ? "编辑标签"
              : "编辑标签分组"
          : view === "categories"
            ? "分类管理"
            : "标签管理"
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      scrollable
    >
      <div className="ledger-management">
        {error && (
          <p className="ledger-error" role="alert">
            {error}
          </p>
        )}
        {edit ? (
          <form
            className="ledger-form"
            onSubmit={(event) => {
              event.preventDefault();
              const change: LedgerChange =
                edit.type === "category"
                  ? { type: "save-category", category: edit.value }
                  : edit.type === "tag"
                    ? { type: "save-tag", tag: edit.value }
                    : { type: "save-group", group: edit.value };
              void run(change).then((ok) => {
                if (ok) setEdit(null);
              });
            }}
          >
            <button
              type="button"
              className="ledger-icon-link"
              onClick={() => {
                setEdit(null);
                setError("");
              }}
            >
              <ChevronLeft size={16} />
              返回列表
            </button>
            <label>
              名称
              <input
                autoFocus
                value={edit.value.name}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    value: { ...edit.value, name: e.target.value },
                  } as typeof edit)
                }
                maxLength={40}
                required
              />
            </label>
            {edit.type === "category" && (
              <>
                <label>
                  Emoji
                  <input
                    aria-label="分类 Emoji"
                    value={edit.value.emoji}
                    onChange={(e) =>
                      setEdit({ ...edit, value: { ...edit.value, emoji: e.target.value } })
                    }
                    maxLength={12}
                    required
                  />
                </label>
                <label>
                  上级分类
                  <select
                    value={edit.value.parentId ?? ""}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        value: { ...edit.value, parentId: e.target.value || null },
                      })
                    }
                  >
                    <option value="">一级分类</option>
                    {roots
                      .filter((c) => c.id !== edit.value.id && !c.archived)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="ledger-check">
                  <input
                    type="checkbox"
                    checked={!edit.value.archived}
                    onChange={(e) =>
                      setEdit({ ...edit, value: { ...edit.value, archived: !e.target.checked } })
                    }
                  />
                  启用分类
                </label>
              </>
            )}
            {edit.type === "tag" && (
              <label>
                分组
                <select
                  value={edit.value.groupId ?? ""}
                  onChange={(e) =>
                    setEdit({ ...edit, value: { ...edit.value, groupId: e.target.value || null } })
                  }
                >
                  <option value="">未分组</option>
                  {state.tagGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {edit.type !== "group" && (
              <LedgerColorPicker
                value={edit.value.color}
                onChange={(color) => {
                  if (edit.type === "category")
                    setEdit({ type: "category", value: { ...edit.value, color } });
                  else if (edit.type === "tag")
                    setEdit({ type: "tag", value: { ...edit.value, color } });
                }}
              />
            )}
            <button type="submit" className="ledger-primary" disabled={busy}>
              {busy ? "保存中…" : "保存"}
            </button>
          </form>
        ) : view === "categories" ? (
          <>
            <div className="ledger-segment">
              <button
                type="button"
                aria-pressed={kind === "expense"}
                onClick={() => setKind("expense")}
              >
                支出分类
              </button>
              <button
                type="button"
                aria-pressed={kind === "income"}
                onClick={() => setKind("income")}
              >
                收入分类
              </button>
            </div>
            <p className="ledger-muted">
              选择末级分类记账。归档保留历史统计；一级分类归档后，其二级分类也不再出现在记账入口。
            </p>
            {roots.map((category) => (
              <details key={category.id} className="ledger-category-group" open>
                <summary>
                  {category.emoji} {category.name}
                  {category.archived ? " · 已归档" : ""}
                </summary>
                {categoryRow(category)}
                {state.categories
                  .filter((c) => c.parentId === category.id)
                  .sort((a, b) => a.order - b.order)
                  .map(categoryRow)}
                <button
                  type="button"
                  className="ledger-icon-link"
                  onClick={() => editCategory(category.id)}
                >
                  <Plus size={15} />
                  添加二级分类
                </button>
              </details>
            ))}
            <button type="button" className="ledger-add-row" onClick={() => editCategory()}>
              <Plus size={17} />
              新增一级分类
            </button>
          </>
        ) : (
          <>
            <p className="ledger-muted">标签独立于分类，一笔账单可以选择多个标签。</p>
            {[null, ...state.tagGroups].map((group) => (
              <section className="ledger-tag-group" key={group?.id ?? "ungrouped"}>
                <header>
                  <h3>{group?.name ?? "未分组"}</h3>
                  {group && (
                    <>
                      <button
                        type="button"
                        aria-label={`编辑分组 ${group.name}`}
                        onClick={() => setEdit({ type: "group", value: { ...group } })}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={`删除分组 ${group.name}`}
                        onClick={() =>
                          setRemove({ type: "delete-group", id: group.id, name: group.name })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </header>
                {state.tags
                  .filter((t) => t.groupId === (group?.id ?? null))
                  .map((tag) => (
                    <div className="ledger-tag-manage-row" key={tag.id}>
                      <button
                        type="button"
                        style={{ color: tag.color }}
                        onClick={() => setEdit({ type: "tag", value: { ...tag } })}
                      >
                        #{tag.name} <Pencil size={12} />
                      </button>
                      <span>
                        {state.entries.filter((e) => e.tagIds.includes(tag.id)).length} 笔
                      </span>
                      <button
                        type="button"
                        aria-label={`删除标签 ${tag.name}`}
                        onClick={() =>
                          setRemove({ type: "delete-tag", id: tag.id, name: tag.name })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                <button
                  type="button"
                  className="ledger-icon-link"
                  onClick={() =>
                    setEdit({
                      type: "tag",
                      value: {
                        id: crypto.randomUUID(),
                        name: "",
                        color: ledgerColors[4],
                        groupId: group?.id ?? null,
                      },
                    })
                  }
                >
                  <Plus size={15} />
                  添加标签
                </button>
              </section>
            ))}
            <button
              type="button"
              className="ledger-add-row"
              onClick={() =>
                setEdit({ type: "group", value: { id: crypto.randomUUID(), name: "" } })
              }
            >
              <Plus size={16} />
              新增分组
            </button>
            {remove && (
              <div className="ledger-inline-confirm" role="alert">
                <p>
                  删除「{remove.name}」？
                  {remove.type === "delete-group"
                    ? "已有标签将移到未分组。"
                    : "账单本身不会被删除。"}
                </p>
                <button type="button" onClick={() => setRemove(null)}>
                  取消
                </button>
                <button
                  type="button"
                  className="ledger-danger"
                  disabled={busy}
                  onClick={() =>
                    void run({ type: remove.type, id: remove.id }).then((ok) => {
                      if (ok) setRemove(null);
                    })
                  }
                >
                  确认删除
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </SystemSheet>
  );
}

export function LedgerAccountEditor({
  userId,
  initial,
  onClose,
}: {
  userId: string;
  initial?: LedgerAccount | undefined;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<LedgerAccount>(
    initial ?? {
      id: crypto.randomUUID(),
      name: "",
      type: "cash",
      initialCents: 0,
      currency: "CNY",
      archived: false,
    },
  );
  const [balance, setBalance] = useState(ledgerAmountInput(draft.initialCents));
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <SystemSheet
      open
      title={initial ? "编辑账户" : "新增账户"}
      onClose={() => {
        if (!busy) onClose();
      }}
      scrollable
    >
      <form
        className="ledger-form"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          void (async () => {
            try {
              await changeLedger(userId, {
                type: "save-account",
                account: { ...draft, initialCents: parseLedgerAmount(balance, true) },
              });
              onClose();
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "账户保存失败。");
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <label>
          账户名称
          <input
            autoFocus
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            required
            maxLength={40}
          />
        </label>
        <label>
          账户类型
          <select
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value as LedgerAccount["type"] })}
          >
            <option value="cash">现金</option>
            <option value="bank">银行卡</option>
            <option value="wallet">电子钱包</option>
          </select>
        </label>
        <label>
          初始余额（¥）
          <input
            aria-label="初始余额"
            inputMode="decimal"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            required
          />
        </label>
        <p className="ledger-muted">
          当前余额 = 初始余额 + 收入 − 支出 + 转入 − 转出。调整初始余额将重新计算真实余额。
        </p>
        <label className="ledger-check">
          <input
            type="checkbox"
            checked={!draft.archived}
            onChange={(e) => setDraft({ ...draft, archived: !e.target.checked })}
          />
          启用账户
        </label>
        {error && (
          <p className="ledger-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="ledger-primary" disabled={busy}>
          {busy ? "保存中…" : "保存账户"}
        </button>
      </form>
    </SystemSheet>
  );
}
