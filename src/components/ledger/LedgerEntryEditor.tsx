import { useState } from "react";
import { Delete, Settings2 } from "lucide-react";
import { SystemSheet } from "@/components/system-ui";
import { localDate } from "@/lib/goals";
import { changeLedger } from "@/lib/ledger-store";
import {
  ledgerAmountInput,
  ledgerCategoryAvailable,
  ledgerLeafCategories,
  parseLedgerAmount,
  type LedgerEntry,
  type LedgerState,
} from "@/lib/ledger";
import { LedgerEmoji } from "./LedgerShared";

export function LedgerEntryEditor({
  userId,
  state,
  initial,
  transfer = false,
  onClose,
  onSaved,
  onManage,
}: {
  userId: string;
  state: LedgerState;
  initial?: LedgerEntry | undefined;
  transfer?: boolean;
  onClose: () => void;
  onSaved: (entry: LedgerEntry) => void;
  onManage: () => void;
}) {
  const [kind, setKind] = useState<LedgerEntry["kind"]>(
    initial?.kind ?? (transfer ? "transfer" : "expense"),
  );
  const [amount, setAmount] = useState(initial ? ledgerAmountInput(initial.amountCents) : "0");
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId ?? ledgerLeafCategories(state, "expense")[0]?.id ?? "",
  );
  const [parentId, setParentId] = useState(
    state.categories.find((c) => c.id === categoryId)?.parentId ?? "",
  );
  const [accountId, setAccountId] = useState(
    initial?.accountId ?? state.accounts.find((a) => !a.archived)?.id ?? "",
  );
  const [toAccountId, setToAccountId] = useState(
    initial?.toAccountId ?? state.accounts.find((a) => !a.archived && a.id !== accountId)?.id ?? "",
  );
  const [date, setDate] = useState(initial?.date ?? localDate());
  const [time, setTime] = useState(initial?.time ?? new Date().toTimeString().slice(0, 5));
  const [note, setNote] = useState(initial?.note ?? ""),
    [tagIds, setTags] = useState(initial?.tagIds ?? []);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const available = state.categories.filter(
    (c) =>
      c.kind === kind &&
      (ledgerCategoryAvailable(state, c) ||
        c.id === initial?.categoryId ||
        c.id === state.categories.find((old) => old.id === initial?.categoryId)?.parentId),
  );
  const roots = available.filter((c) => !c.parentId).sort((a, b) => a.order - b.order);
  const children = available
    .filter((c) => c.parentId === parentId)
    .sort((a, b) => a.order - b.order);
  const accounts = state.accounts.filter(
    (a) => !a.archived || a.id === initial?.accountId || a.id === initial?.toAccountId,
  );
  const chooseKind = (value: "expense" | "income") => {
    const category = ledgerLeafCategories(state, value)[0];
    setKind(value);
    setCategoryId(category?.id ?? "");
    setParentId(category?.parentId ?? "");
  };
  const press = (key: string) =>
    setAmount((current) => {
      if (key === "⌫") return current.slice(0, -1) || "0";
      if (key === ".") return current.includes(".") ? current : current + ".";
      if (current.includes(".") && (current.split(".")[1]?.length ?? 0) >= 2) return current;
      if (current.replace(".", "").length >= 12) return current;
      return current === "0" ? key : current + key;
    });
  const save = async () => {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const entry: LedgerEntry = {
        id: initial?.id ?? crypto.randomUUID(),
        kind,
        amountCents: parseLedgerAmount(amount),
        currency: "CNY",
        categoryId: kind === "transfer" ? null : categoryId || null,
        accountId,
        toAccountId: kind === "transfer" ? toAccountId || null : null,
        date,
        time,
        note,
        tagIds,
        createdAt: initial?.createdAt ?? now,
        updatedAt: now,
      };
      await changeLedger(userId, { type: "save-entry", entry });
      onSaved(entry);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <SystemSheet
      open
      title={initial ? "编辑账单" : kind === "transfer" ? "账户转账" : "记一笔"}
      onClose={() => {
        if (!busy) onClose();
      }}
      scrollable
    >
      <form
        className="ledger-editor"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {kind !== "transfer" && (
          <div className="ledger-segment">
            <button
              type="button"
              aria-pressed={kind === "expense"}
              onClick={() => chooseKind("expense")}
            >
              支出
            </button>
            <button
              type="button"
              aria-pressed={kind === "income"}
              onClick={() => chooseKind("income")}
            >
              收入
            </button>
          </div>
        )}
        <label className="ledger-amount-input">
          <span>¥</span>
          <input
            aria-label="记账金额"
            inputMode="none"
            autoComplete="off"
            value={amount}
            onChange={(event) => {
              if (/^\d{0,10}(?:\.\d{0,2})?$/.test(event.target.value))
                setAmount(event.target.value || "0");
            }}
          />
        </label>
        {kind !== "transfer" && (
          <>
            <div className="ledger-category-grid">
              {roots.map((category) => {
                const hasChildren = available.some((c) => c.parentId === category.id);
                return (
                  <button
                    type="button"
                    key={category.id}
                    aria-pressed={categoryId === category.id || parentId === category.id}
                    onClick={() => {
                      if (hasChildren) {
                        setParentId(category.id);
                        setCategoryId(available.find((c) => c.parentId === category.id)?.id ?? "");
                      } else {
                        setCategoryId(category.id);
                        setParentId("");
                      }
                    }}
                  >
                    <LedgerEmoji emoji={category.emoji} color={category.color} />
                    <span>{category.name}</span>
                  </button>
                );
              })}
            </div>
            {children.length > 0 && (
              <div className="ledger-subcategories" aria-label="二级分类">
                {children.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    aria-pressed={categoryId === c.id}
                    onClick={() => setCategoryId(c.id)}
                  >
                    {c.emoji} {c.name}
                  </button>
                ))}
              </div>
            )}
            {roots.length === 0 && (
              <p className="ledger-muted">暂无启用分类，请在分类管理中添加。</p>
            )}
          </>
        )}
        <div className="ledger-form-row">
          <label>
            {kind === "transfer" ? "转出账户" : "账户"}
            <select
              aria-label={kind === "transfer" ? "转出账户" : "记账账户"}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="" disabled>
                请选择账户
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.archived ? "（已归档）" : ""}
                </option>
              ))}
            </select>
          </label>
          {kind === "transfer" && (
            <label>
              转入账户
              <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                <option value="" disabled>
                  请选择账户
                </option>
                {accounts
                  .filter((a) => a.id !== accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>
        <input
          className="ledger-note-input"
          aria-label="账单备注"
          placeholder="备注（可选）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
        />
        <details className="ledger-options">
          <summary>
            日期、时间与标签 <span>{date}</span>
          </summary>
          <div className="ledger-form-row">
            <label>
              日期
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label>
              时间
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            </label>
          </div>
          {state.tags.length ? (
            <div className="ledger-tag-pills">
              {state.tags.map((tag) => (
                <button
                  type="button"
                  key={tag.id}
                  aria-pressed={tagIds.includes(tag.id)}
                  style={{ color: tag.color }}
                  onClick={() =>
                    setTags((current) =>
                      current.includes(tag.id)
                        ? current.filter((id) => id !== tag.id)
                        : [...current, tag.id],
                    )
                  }
                >
                  #{tag.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="ledger-muted">暂无标签，可在首页右上角管理中创建。</p>
          )}
        </details>
        {error && (
          <p className="ledger-error" role="alert">
            {error}
          </p>
        )}
        <div className="ledger-keypad" aria-label="金额数字键盘">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((key) => (
            <button
              type="button"
              key={key}
              aria-label={key === "⌫" ? "金额退格" : key === "." ? "小数点" : `数字 ${key}`}
              onClick={() => press(key)}
            >
              {key === "⌫" ? <Delete size={22} /> : key}
            </button>
          ))}
        </div>
        <div className="ledger-editor-actions">
          {kind !== "transfer" && (
            <button type="button" className="ledger-icon-link" onClick={onManage} disabled={busy}>
              <Settings2 size={17} />
              分类管理
            </button>
          )}
          <button type="submit" className="ledger-primary" disabled={busy || !accountId}>
            {busy ? "保存中…" : initial ? "保存修改" : "保存账单"}
          </button>
        </div>
      </form>
    </SystemSheet>
  );
}
