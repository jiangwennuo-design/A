import { z } from "zod";
import { calendarDay, localDate } from "./goals";

export const ledgerColors = [
  "#FF717C",
  "#FF9A4D",
  "#FFD166",
  "#4DD9C0",
  "#7DBBFF",
  "#B8A1F5",
  "#FF91C4",
] as const;
const cents = z.number().int().safe().min(-1_000_000_000_000).max(1_000_000_000_000);
const id = z.string().min(1).max(150);
const name = z.string().trim().min(1, "请填写名称。").max(40);
const color = z.string().regex(/^#[\da-f]{6}$/i, "请选择有效颜色。");
const date = z.string().refine((value) => calendarDay(value) !== null, "请选择有效日期。");
const timestamp = z.string().datetime();
export const ledgerCategorySchema = z.object({
  id,
  name,
  kind: z.enum(["expense", "income"]),
  parentId: id.nullable(),
  emoji: z.string().trim().min(1).max(12),
  color,
  order: z.number().int(),
  archived: z.boolean().default(false),
});
export const ledgerAccountSchema = z.object({
  id,
  name,
  type: z.enum(["cash", "bank", "wallet"]),
  initialCents: cents,
  currency: z.literal("CNY").default("CNY"),
  archived: z.boolean().default(false),
});
export const ledgerTagSchema = z.object({ id, name, color, groupId: id.nullable() });
export const ledgerGroupSchema = z.object({ id, name });
export const ledgerEntrySchema = z.object({
  id,
  kind: z.enum(["expense", "income", "transfer"]),
  amountCents: cents.refine((n) => n > 0, "金额须大于 0。"),
  currency: z.literal("CNY").default("CNY"),
  categoryId: id.nullable(),
  accountId: id,
  toAccountId: id.nullable(),
  date,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  note: z.string().max(1000).default(""),
  tagIds: z.array(id).max(50),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const ledgerStateSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(ledgerEntrySchema),
  categories: z.array(ledgerCategorySchema),
  accounts: z.array(ledgerAccountSchema),
  tags: z.array(ledgerTagSchema),
  tagGroups: z.array(ledgerGroupSchema),
  budgets: z.record(cents.refine((n) => n >= 0)),
});
export type LedgerState = z.infer<typeof ledgerStateSchema>;
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
export type LedgerCategory = z.infer<typeof ledgerCategorySchema>;
export type LedgerAccount = z.infer<typeof ledgerAccountSchema>;
export type LedgerTag = z.infer<typeof ledgerTagSchema>;
export type LedgerGroup = z.infer<typeof ledgerGroupSchema>;
export type LedgerKind = LedgerCategory["kind"];

export function defaultLedger(): LedgerState {
  const expense = [
    ["餐饮", "🍜"],
    ["购物", "🛍️"],
    ["交通", "🚇"],
    ["日常", "🧴"],
    ["住房", "🏠"],
    ["娱乐", "🎮"],
    ["健康", "💊"],
    ["其他", "✨"],
  ];
  const income = [
    ["工资", "💼"],
    ["奖金", "🎁"],
    ["兼职", "💻"],
    ["其他收入", "🪙"],
  ];
  return {
    schemaVersion: 1,
    entries: [],
    categories: [
      ...expense.map((item, i) => ({ item, i, kind: "expense" as const })),
      ...income.map((item, i) => ({ item, i, kind: "income" as const })),
    ].map(({ item, i, kind }) => ({
      id: `${kind}-${i}`,
      kind,
      name: item[0]!,
      emoji: item[1]!,
      color: ledgerColors[i % ledgerColors.length]!,
      parentId: null,
      order: i,
      archived: false,
    })),
    accounts: [
      { id: "cash", name: "现金", type: "cash", initialCents: 0, currency: "CNY", archived: false },
    ],
    tags: [],
    tagGroups: [],
    budgets: {},
  };
}
/** Parse decimal text, never multiply a floating point amount to produce cents. */
export function parseLedgerAmount(value: string, signed = false): number {
  const text = value.trim();
  if (!(signed ? /^-?\d+(?:\.\d{0,2})?$/ : /^\d+(?:\.\d{0,2})?$/).test(text))
    throw new Error("请输入金额，最多两位小数。");
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace(/^-/, "").split(".");
  const result = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (result > 1_000_000_000_000n) throw new Error("金额过大，请检查输入。");
  return Number(negative ? -result : result);
}
export function ledgerAmountInput(value: number) {
  const abs = Math.abs(value);
  return `${value < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
export function ledgerMoney(value: number) {
  return `${value < 0 ? "−" : ""}¥${Math.floor(Math.abs(value) / 100).toLocaleString("zh-CN")}.${String(Math.abs(value) % 100).padStart(2, "0")}`;
}
export function ledgerMonthShift(month: string, delta: number) {
  const [year, m] = month.split("-").map(Number);
  const shifted = new Date(year!, m! - 1 + delta, 1, 12);
  return localDate(shifted).slice(0, 7);
}
export function ledgerCategoryAvailable(state: LedgerState, category: LedgerCategory) {
  return (
    !category.archived &&
    (!category.parentId || !state.categories.find((c) => c.id === category.parentId)?.archived)
  );
}
export function ledgerLeafCategories(state: LedgerState, kind: LedgerKind) {
  return state.categories
    .filter(
      (c) =>
        c.kind === kind &&
        ledgerCategoryAvailable(state, c) &&
        !state.categories.some((child) => child.parentId === c.id),
    )
    .sort((a, b) => a.order - b.order);
}
export function ledgerCategoryMatches(state: LedgerState, entry: LedgerEntry, categoryId: string) {
  return (
    entry.categoryId === categoryId ||
    state.categories.some((c) => c.id === entry.categoryId && c.parentId === categoryId)
  );
}
export function ledgerTotals(entries: LedgerEntry[]) {
  const sum = (kind: LedgerKind) =>
    entries.reduce((total, e) => total + (e.kind === kind ? e.amountCents : 0), 0);
  const expense = sum("expense"),
    income = sum("income");
  return { expense, income, balance: income - expense };
}
export function ledgerBalances(state: LedgerState) {
  const balances = new Map(state.accounts.map((a) => [a.id, a.initialCents]));
  for (const entry of state.entries) {
    balances.set(
      entry.accountId,
      (balances.get(entry.accountId) ?? 0) +
        (entry.kind === "income" ? entry.amountCents : -entry.amountCents),
    );
    if (entry.kind === "transfer" && entry.toAccountId)
      balances.set(entry.toAccountId, (balances.get(entry.toAccountId) ?? 0) + entry.amountCents);
  }
  return balances;
}
/** Largest-remainder allocation makes the displayed percentages sum to exactly 100%. */
export function ledgerBreakdown(state: LedgerState, entries: LedgerEntry[], kind: LedgerKind) {
  const grouped = new Map<string, { category: LedgerCategory; amount: number; count: number }>();
  for (const entry of entries) {
    if (entry.kind !== kind || !entry.categoryId) continue;
    const category = state.categories.find((c) => c.id === entry.categoryId);
    if (!category) continue;
    const row = grouped.get(category.id) ?? { category, amount: 0, count: 0 };
    row.amount += entry.amountCents;
    row.count++;
    grouped.set(category.id, row);
  }
  const rows = [...grouped.values()].sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((n, row) => n + row.amount, 0);
  if (!total) return [];
  const values = rows.map((row) => ({
    ...row,
    basisPoints: Number((BigInt(row.amount) * 10000n) / BigInt(total)),
    remainder: (BigInt(row.amount) * 10000n) % BigInt(total),
  }));
  const remaining = 10000 - values.reduce((n, row) => n + row.basisPoints, 0);
  [...values]
    .sort((a, b) => (a.remainder === b.remainder ? 0 : a.remainder > b.remainder ? -1 : 1))
    .slice(0, remaining)
    .forEach((row) => row.basisPoints++);
  return values.map(({ remainder: _remainder, ...row }) => ({
    ...row,
    percent: row.basisPoints / 100,
  }));
}
export function ledgerTrend(entries: LedgerEntry[], month: string, kind: LedgerKind) {
  const [year, m] = month.split("-").map(Number);
  return Array.from({ length: new Date(year!, m!, 0).getDate() }, (_, i) => ({
    day: i + 1,
    amount: entries
      .filter((e) => e.kind === kind && e.date === `${month}-${String(i + 1).padStart(2, "0")}`)
      .reduce((n, e) => n + e.amountCents, 0),
  }));
}
export function ledgerBudget(state: LedgerState, month: string) {
  const budget = state.budgets[month] ?? 0;
  const spent = ledgerTotals(state.entries.filter((e) => e.date.startsWith(month))).expense;
  return {
    budget,
    spent,
    remaining: budget - spent,
    percent: budget ? Math.min(100, (spent / budget) * 100) : 0,
    exceeded: budget > 0 && spent > budget,
  };
}
export type LedgerChange =
  | { type: "save-entry"; entry: LedgerEntry }
  | { type: "delete-entry"; id: string }
  | { type: "save-account"; account: LedgerAccount }
  | { type: "delete-account"; id: string }
  | { type: "save-category"; category: LedgerCategory }
  | { type: "move-category"; id: string; direction: -1 | 1 }
  | { type: "save-tag"; tag: LedgerTag }
  | { type: "delete-tag"; id: string }
  | { type: "save-group"; group: LedgerGroup }
  | { type: "delete-group"; id: string }
  | { type: "budget"; month: string; amount: number };
const upsert = <T extends { id: string }>(rows: T[], item: T) =>
  rows.some((row) => row.id === item.id)
    ? rows.map((row) => (row.id === item.id ? item : row))
    : [...rows, item];
function assertState(state: LedgerState) {
  for (const rows of [state.entries, state.accounts, state.categories, state.tags, state.tagGroups])
    if (new Set(rows.map((row) => row.id)).size !== rows.length)
      throw new Error("重复记录 ID，保存已取消。");
  for (const category of state.categories) {
    if (!category.parentId) continue;
    const parent = state.categories.find((c) => c.id === category.parentId);
    if (!parent || parent.parentId || parent.id === category.id || parent.kind !== category.kind)
      throw new Error("分类仅支持同类型的一级 / 二级结构。");
  }
  for (const tag of state.tags)
    if (tag.groupId && !state.tagGroups.some((g) => g.id === tag.groupId))
      throw new Error("标签分组不存在。");
  for (const entry of state.entries) {
    if (!state.accounts.some((a) => a.id === entry.accountId)) throw new Error("账户不存在。");
    if (entry.kind === "transfer") {
      if (
        !entry.toAccountId ||
        entry.toAccountId === entry.accountId ||
        !state.accounts.some((a) => a.id === entry.toAccountId)
      )
        throw new Error("请选择不同的转出和转入账户。");
      if (entry.categoryId) throw new Error("转账不属于收入或支出分类。");
    } else if (
      !state.categories.some((c) => c.id === entry.categoryId && c.kind === entry.kind) ||
      entry.toAccountId
    )
      throw new Error("账单分类与收支类型不一致。");
    if (
      new Set(entry.tagIds).size !== entry.tagIds.length ||
      entry.tagIds.some((tag) => !state.tags.some((t) => t.id === tag))
    )
      throw new Error("标签已更改，请重新选择。");
  }
  for (const month of Object.keys(state.budgets))
    if (!/^\d{4}-\d{2}$/.test(month) || calendarDay(`${month}-01`) === null)
      throw new Error("预算月份无效。");
  const balances = [...ledgerBalances(state).values()];
  const values = [
    ...balances,
    balances.reduce((total, balance) => total + balance, 0),
    ...Object.values(ledgerTotals(state.entries)),
  ];
  if (values.some((n) => !Number.isSafeInteger(n))) throw new Error("累计金额过大，保存已取消。");
  return state;
}
export function normalizeLedger(value: unknown): LedgerState {
  return assertState(ledgerStateSchema.parse(value === undefined ? defaultLedger() : value));
}
export function applyLedgerChange(previous: LedgerState, change: LedgerChange): LedgerState {
  let next = { ...previous };
  switch (change.type) {
    case "save-entry": {
      const entry = ledgerEntrySchema.parse(change.entry);
      const old = previous.entries.find((e) => e.id === entry.id);
      if (entry.kind !== "transfer") {
        const category = previous.categories.find((c) => c.id === entry.categoryId);
        if (
          !category ||
          ((old?.categoryId !== entry.categoryId || old.kind !== entry.kind) &&
            !ledgerLeafCategories(previous, entry.kind).some((c) => c.id === category.id))
        )
          throw new Error("请选择一个启用的末级分类。");
      }
      for (const key of [entry.accountId, entry.toAccountId].filter(Boolean))
        if (
          previous.accounts.find((a) => a.id === key)?.archived &&
          old?.accountId !== key &&
          old?.toAccountId !== key
        )
          throw new Error("该账户已归档。");
      next.entries = upsert(previous.entries, {
        ...entry,
        createdAt: old?.createdAt ?? entry.createdAt,
      });
      break;
    }
    case "delete-entry":
      next.entries = previous.entries.filter((e) => e.id !== change.id);
      break;
    case "save-account":
      next.accounts = upsert(previous.accounts, ledgerAccountSchema.parse(change.account));
      break;
    case "delete-account":
      if (previous.entries.some((e) => e.accountId === change.id || e.toAccountId === change.id))
        throw new Error("该账户有流水，请归档而非删除。");
      next.accounts = previous.accounts.filter((a) => a.id !== change.id);
      break;
    case "save-category":
      next.categories = upsert(previous.categories, ledgerCategorySchema.parse(change.category));
      break;
    case "move-category": {
      const category = previous.categories.find((c) => c.id === change.id);
      if (!category) throw new Error("分类不存在。");
      const siblings = previous.categories
        .filter((c) => c.kind === category.kind && c.parentId === category.parentId)
        .sort((a, b) => a.order - b.order);
      const i = siblings.findIndex((c) => c.id === category.id),
        target = i + change.direction;
      if (target >= 0 && target < siblings.length)
        [siblings[i], siblings[target]] = [siblings[target]!, siblings[i]!];
      const orders = new Map(siblings.map((c, index) => [c.id, index]));
      next.categories = previous.categories.map((c) =>
        orders.has(c.id) ? { ...c, order: orders.get(c.id)! } : c,
      );
      break;
    }
    case "save-tag":
      next.tags = upsert(previous.tags, ledgerTagSchema.parse(change.tag));
      break;
    case "delete-tag":
      next.tags = previous.tags.filter((t) => t.id !== change.id);
      next.entries = previous.entries.map((e) => ({
        ...e,
        tagIds: e.tagIds.filter((id) => id !== change.id),
      }));
      break;
    case "save-group":
      next.tagGroups = upsert(previous.tagGroups, ledgerGroupSchema.parse(change.group));
      break;
    case "delete-group":
      next.tagGroups = previous.tagGroups.filter((g) => g.id !== change.id);
      next.tags = previous.tags.map((t) => (t.groupId === change.id ? { ...t, groupId: null } : t));
      break;
    case "budget":
      next.budgets = { ...previous.budgets, [change.month]: change.amount };
      break;
  }
  next = normalizeLedger(next);
  return next;
}
