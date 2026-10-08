import type { CSSProperties } from "react";
import { ArrowLeftRight } from "lucide-react";
import { ledgerColors, ledgerMoney, type LedgerEntry, type LedgerState } from "@/lib/ledger";

export function LedgerEmoji({ emoji, color }: { emoji: string; color: string }) {
  return (
    <span
      className="ledger-emoji"
      data-ui="ledger-category-icon"
      style={{ "--category-color": color } as CSSProperties}
    >
      {emoji}
    </span>
  );
}
export function LedgerColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <fieldset className="ledger-colors">
      <legend>颜色</legend>
      {ledgerColors.map((color) => (
        <button
          type="button"
          key={color}
          aria-label={`选择颜色 ${color}`}
          aria-pressed={value === color}
          style={{ background: color }}
          onClick={() => onChange(color)}
        >
          {value === color ? "✓" : ""}
        </button>
      ))}
    </fieldset>
  );
}
export function LedgerEntryRow({
  entry,
  state,
  onOpen,
}: {
  entry: LedgerEntry;
  state: LedgerState;
  onOpen: (entry: LedgerEntry) => void;
}) {
  const category = state.categories.find((c) => c.id === entry.categoryId);
  const account = state.accounts.find((a) => a.id === entry.accountId);
  const destination = state.accounts.find((a) => a.id === entry.toAccountId);
  return (
    <button
      type="button"
      className="ledger-entry"
      data-ui="ledger-entry"
      data-entry-type={entry.kind}
      onClick={() => onOpen(entry)}
    >
      {category ? (
        <LedgerEmoji emoji={category.emoji} color={category.color} />
      ) : (
        <span className="ledger-emoji ledger-transfer-icon">
          <ArrowLeftRight size={19} />
        </span>
      )}
      <span className="ledger-entry-copy">
        <strong>{category?.name || "账户转账"}</strong>
        <span>
          {entry.note ||
            (entry.kind === "transfer" ? `${account?.name} → ${destination?.name}` : account?.name)}
        </span>
        <small>
          {entry.time}
          {entry.tagIds.length > 0 &&
            ` · ${entry.tagIds
              .map((id) => state.tags.find((t) => t.id === id)?.name)
              .filter(Boolean)
              .join(" / ")}`}
        </small>
      </span>
      <strong className={`ledger-entry-amount is-${entry.kind}`}>
        {entry.kind === "income" ? "+" : entry.kind === "expense" ? "−" : ""}
        {ledgerMoney(entry.amountCents)}
      </strong>
    </button>
  );
}
