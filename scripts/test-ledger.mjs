import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import * as goals from "../src/lib/goals.ts";
import { paginateDesktop } from "../src/lib/desktop-pages.ts";
const require = createRequire(import.meta.url),
  exports = {};
vm.runInNewContext(
  ts.transpileModule(await readFile(new URL("../src/lib/ledger.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports, require: (name) => (name === "./goals" ? goals : require(name)), Date, BigInt },
);
const {
  defaultLedger,
  parseLedgerAmount,
  ledgerMoney,
  ledgerBalances,
  ledgerTotals,
  ledgerBreakdown,
  ledgerBudget,
  ledgerLeafCategories,
  applyLedgerChange,
  normalizeLedger,
  ledgerTrend,
  ledgerMonthShift,
} = exports;
const at = "2026-10-08T00:00:00.000Z";
function entry(patch = {}) {
  return {
    id: "e",
    kind: "expense",
    amountCents: 10,
    currency: "CNY",
    categoryId: "expense-0",
    accountId: "cash",
    toAccountId: null,
    date: "2026-10-08",
    time: "12:34",
    note: "中文 English\n换行",
    tagIds: [],
    createdAt: at,
    updatedAt: at,
    ...patch,
  };
}
const save = (s, e) => applyLedgerChange(s, { type: "save-entry", entry: e });
test("decimal amounts are exact integer cents, reject invalid values and never float multiply", () => {
  assert.equal(parseLedgerAmount("0.1") + parseLedgerAmount("0.2"), 30);
  assert.equal(parseLedgerAmount("123456.78"), 12345678);
  assert.equal(parseLedgerAmount("-10.01", true), -1001);
  assert.equal(ledgerMoney(30), "¥0.30");
  for (const amount of ["-1", "1.001", "NaN", "Infinity", "1e6", "9999999999999"])
    assert.throws(() => parseLedgerAmount(amount));
  assert.throws(() => save(defaultLedger(), entry({ amountCents: 0 })));
  assert.throws(() => save(defaultLedger(), entry({ amountCents: 0.1 })));
});
test("income, expense and transfer calculate real balances and transfer is excluded from totals", () => {
  let s = applyLedgerChange(defaultLedger(), {
    type: "save-account",
    account: {
      id: "bank",
      name: "银行卡",
      type: "bank",
      currency: "CNY",
      initialCents: 100000,
      archived: false,
    },
  });
  s = save(s, entry({ id: "income", kind: "income", categoryId: "income-0", amountCents: 10000 }));
  s = save(s, entry({ id: "expense", amountCents: 1500 }));
  s = save(
    s,
    entry({
      id: "transfer",
      kind: "transfer",
      categoryId: null,
      amountCents: 2000,
      toAccountId: "bank",
    }),
  );
  assert.equal(ledgerBalances(s).get("cash"), 6500);
  assert.equal(ledgerBalances(s).get("bank"), 102000);
  assert.equal(ledgerTotals(s.entries).expense, 1500);
  assert.equal(ledgerTotals(s.entries).income, 10000);
  assert.equal(
    [...ledgerBalances(s).values()].reduce((a, b) => a + b, 0),
    108500,
  );
  assert.throws(() =>
    save(s, entry({ id: "bad", kind: "transfer", categoryId: null, toAccountId: "cash" })),
  );
  assert.throws(() => applyLedgerChange(s, { type: "delete-account", id: "bank" }));
});
test("edit and deletion update all derived balances, totals, categories and preserve creation time", () => {
  let s = save(defaultLedger(), entry({ amountCents: 1234 }));
  s = save(
    s,
    entry({ amountCents: 500, categoryId: "expense-1", createdAt: "2026-10-09T00:00:00.000Z" }),
  );
  assert.equal(s.entries.length, 1);
  assert.equal(s.entries[0].createdAt, at);
  assert.equal(ledgerBalances(s).get("cash"), -500);
  assert.equal(ledgerBreakdown(s, s.entries, "expense")[0].category.id, "expense-1");
  s = applyLedgerChange(s, { type: "delete-entry", id: "e" });
  assert.equal(ledgerBalances(s).get("cash"), 0);
  assert.equal(ledgerTotals(s.entries).expense, 0);
});
test("months, income/expense trends and budgets use real dates and transfers never spend budget", () => {
  let s = save(defaultLedger(), entry({ amountCents: 10000 }));
  s = save(s, entry({ id: "next", date: "2026-11-01", amountCents: 30000 }));
  s = applyLedgerChange(s, { type: "budget", month: "2026-10", amount: 5000 });
  assert.equal(ledgerBudget(s, "2026-10").spent, 10000);
  assert.equal(ledgerBudget(s, "2026-10").exceeded, true);
  assert.equal(ledgerBudget(s, "2026-10").remaining, -5000);
  assert.equal(ledgerBudget(s, "2026-10").percent, 100);
  assert.equal(ledgerBudget(s, "2026-11").spent, 30000);
  assert.equal(ledgerTrend(s.entries, "2026-10", "expense")[7].amount, 10000);
  assert.equal(ledgerTrend(s.entries, "2024-02", "income").length, 29);
  assert.equal(ledgerMonthShift("2026-12", 1), "2027-01");
  assert.equal(ledgerMonthShift("2026-01", -1), "2025-12");
});
test("donut percentages total 100.00%, empty/large values are safe and colors track categories", () => {
  let s = defaultLedger();
  assert.equal(ledgerBreakdown(s, [], "expense").length, 0);
  [1, 1, 1].forEach((amount, i) => {
    s = save(s, entry({ id: "row" + i, categoryId: "expense-" + i, amountCents: amount }));
  });
  const rows = ledgerBreakdown(s, s.entries, "expense");
  assert.equal(
    rows.reduce((n, r) => n + r.basisPoints, 0),
    10000,
  );
  assert.equal(rows.map((r) => r.percent).join(","), "33.34,33.33,33.33");
  assert.equal(rows[0].category.color, s.categories[0].color);
  s = save(s, entry({ id: "large", amountCents: 999999999999 }));
  assert.equal(
    ledgerBreakdown(s, s.entries, "expense").reduce((n, r) => n + r.basisPoints, 0),
    10000,
  );
});
test("category children, ordering, archive and historical entries remain compatible", () => {
  let s = save(defaultLedger(), entry());
  const child = {
    id: "food-lunch",
    name: "午餐",
    emoji: "🍱",
    parentId: "expense-0",
    kind: "expense",
    color: "#FF717C",
    order: 0,
    archived: false,
  };
  s = applyLedgerChange(s, { type: "save-category", category: child });
  assert.equal(s.entries[0].categoryId, "expense-0");
  assert.ok(!ledgerLeafCategories(s, "expense").some((c) => c.id === "expense-0"));
  assert.throws(() => save(s, entry({ id: "new" })));
  s = save(s, entry({ id: "new", categoryId: child.id }));
  s = applyLedgerChange(s, { type: "move-category", id: "expense-0", direction: 1 });
  assert.equal(s.categories.find((c) => c.id === "expense-0").order, 1);
  s = applyLedgerChange(s, {
    type: "save-category",
    category: { ...s.categories.find((c) => c.id === "expense-0"), archived: true },
  });
  assert.ok(!ledgerLeafCategories(s, "expense").some((c) => c.id === child.id));
  assert.throws(() => save(s, entry({ id: "archived", categoryId: child.id })));
  assert.doesNotThrow(() => save(s, entry({ id: "new", categoryId: child.id, amountCents: 20 })));
  assert.throws(() =>
    applyLedgerChange(s, {
      type: "save-category",
      category: { ...child, id: "third", parentId: child.id },
    }),
  );
});
test("tags/groups are independent, multi-tag filtering is possible, removals never delete bills", () => {
  let s = applyLedgerChange(defaultLedger(), {
    type: "save-group",
    group: { id: "group", name: "生活" },
  });
  for (const id of ["tag-a", "tag-b"])
    s = applyLedgerChange(s, {
      type: "save-tag",
      tag: { id, name: id, color: "#7DBBFF", groupId: "group" },
    });
  s = save(s, entry({ tagIds: ["tag-a", "tag-b"] }));
  assert.equal(s.entries.filter((e) => e.tagIds.includes("tag-b")).length, 1);
  s = applyLedgerChange(s, { type: "delete-group", id: "group" });
  assert.equal(s.tags[0].groupId, null);
  s = applyLedgerChange(s, { type: "delete-tag", id: "tag-a" });
  assert.equal(s.entries.length, 1);
  assert.equal(s.entries[0].tagIds.join(","), "tag-b");
  assert.equal(s.entries[0].categoryId, "expense-0");
});
test("saved state round-trips, corrupt input does not become defaults, currencies remain explicit", () => {
  const state = save(defaultLedger(), entry());
  const read = normalizeLedger(JSON.parse(JSON.stringify(state)));
  assert.equal(read.entries[0].note, "中文 English\n换行");
  assert.equal(read.entries[0].currency, "CNY");
  assert.throws(() => normalizeLedger({ entries: [] }));
  assert.throws(() => save(state, entry({ id: "bad", accountId: "missing" })));
  assert.throws(() => save(state, entry({ date: "2026-02-30" })));
});
test("ledger participates in unchanged 3/4/5-column automatic pages including widget occupancy", () => {
  const items = Array.from({ length: 35 }, (_, i) => (i === 34 ? "ledger" : "app-" + i));
  for (const cols of [3, 4, 5])
    for (const widget of [0, 170]) {
      const pages = paginateDesktop(items, cols, 400, 88, 18, widget);
      assert.deepEqual(pages.flat(), items);
      assert.ok(pages.length > 1);
      assert.ok(pages[0].length <= Math.floor((400 - widget) / 106) * cols + cols);
    }
});

test("desktop entry and appearance list use the existing AppIcon and ledger route", async () => {
  const desktop = await readFile(
    new URL("../src/routes/_authenticated/index.tsx", import.meta.url),
    "utf8",
  );
  const appearance = await readFile(
    new URL("../src/routes/_authenticated/appearance.tsx", import.meta.url),
    "utf8",
  );
  const route = await readFile(
    new URL("../src/routes/_authenticated/ledger.tsx", import.meta.url),
    "utf8",
  );
  assert.match(desktop, /<AppIcon\s+label="账本"[\s\S]*?tone="ledger"[\s\S]*?to: "\/ledger"/);
  assert.match(appearance, /\["ledger", "账本"\]/);
  assert.match(route, /userId=\{user\?\.id \?\? "guest"\}/);
  assert.match(route, /closeSystemApp\("ledger"/);
});
