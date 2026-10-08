import { useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  PieChart,
  List,
  Wallet,
  Plus,
  Search,
  Settings2,
  Tag,
  Pencil,
  Trash2,
  CreditCard,
  Banknote,
} from "lucide-react";
import { SystemSheet } from "@/components/system-ui";
import { useKeyboardViewport } from "@/hooks/useKeyboardViewport";
import { localDate } from "@/lib/goals";
import { changeLedger, useLedger } from "@/lib/ledger-store";
import {
  ledgerBalances,
  ledgerBreakdown,
  ledgerBudget,
  ledgerCategoryMatches,
  ledgerMoney,
  ledgerMonthShift,
  ledgerTotals,
  ledgerTrend,
  ledgerAmountInput,
  parseLedgerAmount,
  type LedgerAccount,
  type LedgerEntry,
  type LedgerKind,
  type LedgerState,
} from "@/lib/ledger";
import { LedgerEntryRow, LedgerEmoji } from "./LedgerShared";
import { LedgerEntryEditor } from "./LedgerEntryEditor";
import { LedgerAccountEditor, LedgerManagement } from "./LedgerManagement";
import "@/styles/ledger.css";

type TabView = "overview" | "details" | "assets";
export function LedgerApp({ userId, onHome }: { userId: string; onHome: () => void }) {
  const root = useRef<HTMLElement>(null);
  useKeyboardViewport(root);
  const { state, loading, error, reload } = useLedger(userId);
  const [tab, setTab] = useState<TabView>("overview"),
    [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [kind, setKind] = useState<LedgerKind>("expense"),
    [statTag, setStatTag] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [editor, setEditor] = useState<{ initial?: LedgerEntry; transfer?: boolean } | null>(null);
  const [manager, setManager] = useState<"categories" | "tags" | null>(null),
    [more, setMore] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false),
    [accountEditor, setAccountEditor] = useState<{ initial?: LedgerAccount } | null>(null);
  const [accountDetail, setAccountDetail] = useState("");
  const [entryDetail, setEntryDetail] = useState("");
  const [search, setSearch] = useState(""),
    [filterKind, setFilterKind] = useState(""),
    [filterCategory, setFilterCategory] = useState(""),
    [filterTag, setFilterTag] = useState(""),
    [filterAccount, setFilterAccount] = useState("");
  const [limit, setLimit] = useState(80);
  const ready = !loading && !error;
  const monthEntries = useMemo(
    () => state.entries.filter((e) => e.date.startsWith(month)),
    [state.entries, month],
  );
  const statEntries = useMemo(
    () => monthEntries.filter((e) => !statTag || e.tagIds.includes(statTag)),
    [monthEntries, statTag],
  );
  const totals = useMemo(() => ledgerTotals(statEntries), [statEntries]);
  const breakdown = useMemo(
    () => ledgerBreakdown(state, statEntries, kind),
    [state, statEntries, kind],
  );
  const chosen = breakdown.find((row) => row.category.id === selectedCategory);
  const balances = useMemo(() => ledgerBalances(state), [state]);
  const budget = useMemo(() => ledgerBudget(state, month), [state, month]);
  const trend = useMemo(() => ledgerTrend(statEntries, month, kind), [statEntries, month, kind]);
  const sorted = (entries: LedgerEntry[]) =>
    [...entries].sort((a, b) =>
      `${b.date} ${b.time} ${b.createdAt}`.localeCompare(`${a.date} ${a.time} ${a.createdAt}`),
    );
  const matching = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return sorted(
      monthEntries.filter(
        (e) =>
          (!filterKind || e.kind === filterKind) &&
          (!filterCategory || ledgerCategoryMatches(state, e, filterCategory)) &&
          (!filterTag || e.tagIds.includes(filterTag)) &&
          (!filterAccount || e.accountId === filterAccount || e.toAccountId === filterAccount) &&
          (!term ||
            [
              e.note,
              e.date,
              e.time,
              ledgerAmountInput(e.amountCents),
              state.categories.find((c) => c.id === e.categoryId)?.name,
              state.accounts.find((a) => a.id === e.accountId)?.name,
              ...e.tagIds.map((id) => state.tags.find((t) => t.id === id)?.name),
            ]
              .join(" ")
              .toLocaleLowerCase()
              .includes(term)),
      ),
    );
  }, [monthEntries, state, search, filterKind, filterCategory, filterTag, filterAccount]);
  const groups = new Map<string, LedgerEntry[]>();
  matching.slice(0, limit).forEach((e) => groups.set(e.date, [...(groups.get(e.date) ?? []), e]));
  const detailsTotals = ledgerTotals(matching);
  const selectedEntry = state.entries.find((e) => e.id === entryDetail);
  const selectedAccount = state.accounts.find((a) => a.id === accountDetail);
  const recent = sorted(
    chosen
      ? statEntries.filter((e) => e.categoryId === chosen.category.id && e.kind === kind)
      : monthEntries,
  ).slice(0, 5);
  const setOverviewMonth = (value: string) => {
    if (/^\d{4}-\d{2}$/.test(value)) {
      setMonth(value);
      setSelectedCategory("");
      setLimit(80);
    }
  };
  const openMatching = (categoryId: string) => {
    setTab("details");
    setFilterKind(kind);
    setFilterCategory(categoryId);
    setFilterTag(statTag);
    setFilterAccount("");
    setSearch("");
    setLimit(80);
  };
  const openEntry = (entry: LedgerEntry) => setEntryDetail(entry.id);
  const monthNav = (
    <div className="ledger-month-nav">
      <button
        type="button"
        aria-label="上个月"
        onClick={() => setOverviewMonth(ledgerMonthShift(month, -1))}
      >
        <ChevronLeft size={17} />
      </button>
      <label>
        <span>{month.replace("-", "年")}月</span>
        <input
          type="month"
          aria-label="账本月份"
          value={month}
          onChange={(e) => setOverviewMonth(e.target.value)}
        />
      </label>
      <button
        type="button"
        aria-label="下个月"
        onClick={() => setOverviewMonth(ledgerMonthShift(month, 1))}
      >
        <ChevronRight size={17} />
      </button>
    </div>
  );
  return (
    <main className="ledger-app" data-app="ledger" ref={root}>
      <header className="ledger-header">
        <button type="button" aria-label="返回桌面" onClick={onHome}>
          <ChevronLeft size={23} />
        </button>
        <h1>
          账本<span>{tab === "overview" ? "总览" : tab === "details" ? "明细" : "资产"}</span>
        </h1>
        <button type="button" aria-label="账本管理" onClick={() => setMore(true)} disabled={!ready}>
          <MoreHorizontal size={23} />
        </button>
      </header>
      <div className="ledger-scroll" data-ui="ledger-scroll">
        {error && (
          <p role="alert" className="ledger-error">
            {error}
            <button type="button" onClick={reload}>
              重新读取
            </button>
          </p>
        )}
        {tab !== "assets" && monthNav}
        {tab === "overview" && (
          <>
            <div className="ledger-summary" data-ui="ledger-summary">
              <div>
                <small>本月支出</small>
                <strong>{ledgerMoney(totals.expense)}</strong>
              </div>
              <div>
                <small>本月收入</small>
                <strong>{ledgerMoney(totals.income)}</strong>
              </div>
              <div>
                <small>结余</small>
                <strong>{ledgerMoney(totals.balance)}</strong>
              </div>
            </div>
            <section className="ledger-panel ledger-chart-panel" data-ui="ledger-overview">
              <div className="ledger-chart-heading">
                <div className="ledger-segment">
                  <button
                    type="button"
                    aria-pressed={kind === "expense"}
                    onClick={() => {
                      setKind("expense");
                      setSelectedCategory("");
                    }}
                  >
                    支出
                  </button>
                  <button
                    type="button"
                    aria-pressed={kind === "income"}
                    onClick={() => {
                      setKind("income");
                      setSelectedCategory("");
                    }}
                  >
                    收入
                  </button>
                </div>
                <label className="ledger-stat-tag">
                  <Tag size={14} />
                  <select
                    aria-label="统计标签筛选"
                    value={statTag}
                    onChange={(e) => {
                      setStatTag(e.target.value);
                      setSelectedCategory("");
                    }}
                  >
                    <option value="">全部标签</option>
                    {state.tags.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <LedgerDonut
                rows={breakdown}
                total={kind === "expense" ? totals.expense : totals.income}
                kind={kind}
                loading={loading}
                selected={chosen?.category.id ?? ""}
                onSelect={(id) => setSelectedCategory(id === selectedCategory ? "" : id)}
              />
              {chosen && (
                <div className="ledger-selected-category">
                  <LedgerEmoji emoji={chosen.category.emoji} color={chosen.category.color} />
                  <div>
                    <strong>
                      {chosen.category.name} · {ledgerMoney(chosen.amount)}
                    </strong>
                    <small>
                      {chosen.percent.toFixed(2)}% · {chosen.count} 笔
                    </small>
                  </div>
                  <button type="button" onClick={() => openMatching(chosen.category.id)}>
                    查看账单
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
              {!breakdown.length && !loading && (
                <div className="ledger-chart-empty">
                  <p>这个月还没有{kind === "expense" ? "支出" : "收入"}记录</p>
                  <button
                    type="button"
                    className="ledger-icon-link"
                    disabled={!ready}
                    onClick={() => setEditor({})}
                  >
                    <Plus size={15} />
                    记下第一笔
                  </button>
                </div>
              )}
              {breakdown.map((row) => (
                <button
                  type="button"
                  key={row.category.id}
                  className="ledger-breakdown-row"
                  aria-pressed={chosen?.category.id === row.category.id}
                  onClick={() =>
                    setSelectedCategory(row.category.id === selectedCategory ? "" : row.category.id)
                  }
                >
                  <LedgerEmoji emoji={row.category.emoji} color={row.category.color} />
                  <span>
                    <span className="ledger-breakdown-copy">
                      <strong>
                        {row.category.name}
                        <small>{row.count} 笔</small>
                      </strong>
                      <strong>
                        {ledgerMoney(row.amount)}
                        <small>{row.percent.toFixed(2)}%</small>
                      </strong>
                    </span>
                    <span className="ledger-progress">
                      <span style={{ width: `${row.percent}%`, background: row.category.color }} />
                    </span>
                  </span>
                </button>
              ))}
            </section>
            <section className="ledger-panel ledger-budget" data-ui="ledger-budget">
              <div className="ledger-section-heading">
                <h2>本月预算</h2>
                <button type="button" onClick={() => setBudgetOpen(true)} disabled={!ready}>
                  {budget.budget ? "调整" : "设置"}
                  <ChevronRight size={15} />
                </button>
              </div>
              {budget.budget ? (
                <>
                  <div className="ledger-budget-copy">
                    <strong>
                      {ledgerMoney(budget.spent)}
                      <small> / {ledgerMoney(budget.budget)}</small>
                    </strong>
                    <span className={budget.exceeded ? "ledger-danger" : "ledger-muted"}>
                      {budget.exceeded
                        ? `已超出 ${ledgerMoney(-budget.remaining)}`
                        : `剩余 ${ledgerMoney(budget.remaining)}`}
                    </span>
                  </div>
                  <div className={`ledger-progress ${budget.exceeded ? "is-exceeded" : ""}`}>
                    <span style={{ width: `${budget.percent}%` }} />
                  </div>
                  {statTag && (
                    <small className="ledger-muted">预算按全月支出计算，不受标签筛选影响。</small>
                  )}
                </>
              ) : (
                <p className="ledger-muted">给这个月留一点从容，设置你的月预算。</p>
              )}
            </section>
            <section className="ledger-panel">
              <div className="ledger-section-heading">
                <h2>{chosen ? `${chosen.category.name}账单` : "最近账单"}</h2>
                <button
                  type="button"
                  onClick={() => (chosen ? openMatching(chosen.category.id) : setTab("details"))}
                >
                  查看全部
                  <ChevronRight size={15} />
                </button>
              </div>
              {recent.length ? (
                recent.map((e) => (
                  <LedgerEntryRow key={e.id} entry={e} state={state} onOpen={openEntry} />
                ))
              ) : (
                <p className="ledger-muted">{loading ? "正在读取账本…" : "暂无账单"}</p>
              )}
            </section>
            <section className="ledger-panel ledger-trend">
              <div className="ledger-section-heading">
                <h2>{kind === "expense" ? "支出" : "收入"}趋势</h2>
                <small>{month}</small>
              </div>
              <svg
                viewBox="0 0 320 110"
                role="img"
                aria-label={`${month}每日${kind === "expense" ? "支出" : "收入"}趋势`}
              >
                <line x1="5" y1="84" x2="315" y2="84" stroke="#E9ECF2" />
                {trend.map((d, i) => {
                  const height = d.amount
                    ? Math.max(2, (d.amount / Math.max(1, ...trend.map((t) => t.amount))) * 68)
                    : 0;
                  const width = 300 / trend.length;
                  return (
                    <g key={d.day}>
                      <rect
                        x={10 + i * width}
                        y={84 - height}
                        width={Math.max(2, width - 3)}
                        height={height}
                        rx="2"
                        fill={kind === "expense" ? "#7DBBFF" : "#B8A1F5"}
                      >
                        <title>
                          {d.day}日 {ledgerMoney(d.amount)}
                        </title>
                      </rect>
                      {(i === 0 || i === trend.length - 1 || d.day === 15) && (
                        <text
                          x={12 + i * width}
                          y="102"
                          fill="#9CA3AF"
                          textAnchor="middle"
                          fontSize="9"
                        >
                          {d.day}日
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </section>
          </>
        )}
        {tab === "details" && (
          <>
            <label className="ledger-search">
              <Search size={17} />
              <input
                aria-label="搜索账单"
                placeholder="搜索备注、分类、金额…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setLimit(80);
                }}
              />
            </label>
            <div className="ledger-filters">
              <select
                aria-label="收支筛选"
                value={filterKind}
                onChange={(e) => {
                  setFilterKind(e.target.value);
                  setLimit(80);
                }}
              >
                <option value="">全部收支</option>
                <option value="expense">支出</option>
                <option value="income">收入</option>
                <option value="transfer">转账</option>
              </select>
              <select
                aria-label="分类筛选"
                value={filterCategory}
                onChange={(e) => {
                  setFilterCategory(e.target.value);
                  setLimit(80);
                }}
              >
                <option value="">全部分类</option>
                {state.categories.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.parentId ? "　" : ""}
                    {c.emoji} {c.name}
                    {c.archived ? "（归档）" : ""}
                  </option>
                ))}
              </select>
              <select
                aria-label="标签筛选"
                value={filterTag}
                onChange={(e) => {
                  setFilterTag(e.target.value);
                  setLimit(80);
                }}
              >
                <option value="">全部标签</option>
                {state.tags.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="账户筛选"
                value={filterAccount}
                onChange={(e) => {
                  setFilterAccount(e.target.value);
                  setLimit(80);
                }}
              >
                <option value="">全部账户</option>
                {state.accounts.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="ledger-details-total">
              <span>
                支出 <strong>{ledgerMoney(detailsTotals.expense)}</strong>
              </span>
              <span>
                收入 <strong>{ledgerMoney(detailsTotals.income)}</strong>
              </span>
            </div>
            {[...groups].map(([date, entries]) => {
              const day = ledgerTotals(matching.filter((e) => e.date === date));
              return (
                <section className="ledger-panel ledger-day" key={date}>
                  <header>
                    <h2>
                      {new Date(`${date}T12:00:00`).toLocaleDateString("zh-CN", {
                        month: "long",
                        day: "numeric",
                        weekday: "short",
                      })}
                    </h2>
                    <small>
                      支 {ledgerMoney(day.expense)} · 收 {ledgerMoney(day.income)}
                    </small>
                  </header>
                  {entries.map((e) => (
                    <LedgerEntryRow key={e.id} entry={e} state={state} onOpen={openEntry} />
                  ))}
                </section>
              );
            })}
            {!matching.length && (
              <div className="ledger-empty">
                <span>🧾</span>
                <h2>没有找到账单</h2>
                <p>换一个月份或筛选条件试试。</p>
                <button
                  type="button"
                  className="ledger-icon-link"
                  onClick={() => {
                    setSearch("");
                    setFilterKind("");
                    setFilterCategory("");
                    setFilterTag("");
                    setFilterAccount("");
                  }}
                >
                  清除筛选
                </button>
              </div>
            )}
            {matching.length > limit && (
              <button
                type="button"
                className="ledger-add-row"
                onClick={() => setLimit((n) => n + 80)}
              >
                加载更多（还有 {matching.length - limit} 笔）
              </button>
            )}
          </>
        )}
        {tab === "assets" && (
          <>
            <section className="ledger-assets-total ledger-panel">
              <small>总资产 · 人民币</small>
              <strong>
                {ledgerMoney([...balances.values()].reduce((n, amount) => n + amount, 0))}
              </strong>
              <div>
                <button type="button" onClick={() => setAccountEditor({})} disabled={!ready}>
                  <Plus size={17} />
                  新增账户
                </button>
                <button
                  type="button"
                  onClick={() => setEditor({ transfer: true })}
                  disabled={!ready || state.accounts.filter((a) => !a.archived).length < 2}
                >
                  <ArrowLeftRight size={17} />
                  账户转账
                </button>
              </div>
            </section>
            <section className="ledger-panel ledger-accounts">
              <h2>我的账户</h2>
              {state.accounts
                .filter((a) => !a.archived)
                .map((a) => (
                  <LedgerAccountRow
                    key={a.id}
                    account={a}
                    balance={balances.get(a.id) ?? 0}
                    onOpen={() => setAccountDetail(a.id)}
                  />
                ))}
              {!state.accounts.some((a) => !a.archived) && (
                <p className="ledger-muted">暂无启用账户，请先新增或恢复账户。</p>
              )}
            </section>
            {state.accounts.some((a) => a.archived) && (
              <details className="ledger-panel">
                <summary>已归档账户</summary>
                <p className="ledger-muted">归档账户仍计入总资产，历史流水完整保留。</p>
                {state.accounts
                  .filter((a) => a.archived)
                  .map((a) => (
                    <LedgerAccountRow
                      key={a.id}
                      account={a}
                      balance={balances.get(a.id) ?? 0}
                      onOpen={() => setAccountDetail(a.id)}
                    />
                  ))}
              </details>
            )}
            <p className="ledger-assets-note">
              余额由初始余额和实际账目计算。账户间转账不会计入收入或支出。
            </p>
          </>
        )}
      </div>
      <nav className="ledger-bottom-nav" aria-label="账本导航" data-ui="ledger-bottom-nav">
        <button
          type="button"
          aria-current={tab === "overview" ? "page" : undefined}
          onClick={() => setTab("overview")}
        >
          <PieChart size={23} />
          <span>总览</span>
        </button>
        <button
          type="button"
          aria-current={tab === "details" ? "page" : undefined}
          onClick={() => setTab("details")}
        >
          <List size={23} />
          <span>明细</span>
        </button>
        <button
          type="button"
          className="ledger-add-button"
          aria-label="记一笔"
          disabled={!ready}
          onClick={() => setEditor({})}
        >
          <Plus size={28} />
        </button>
        <button
          type="button"
          aria-current={tab === "assets" ? "page" : undefined}
          onClick={() => setTab("assets")}
        >
          <Wallet size={23} />
          <span>资产</span>
        </button>
      </nav>
      {more && (
        <SystemSheet open title="账本管理" onClose={() => setMore(false)}>
          <div className="ledger-more">
            <button
              type="button"
              onClick={() => {
                setMore(false);
                setManager("categories");
              }}
            >
              <Settings2 size={19} />
              分类管理
              <ChevronRight size={17} />
            </button>
            <button
              type="button"
              onClick={() => {
                setMore(false);
                setManager("tags");
              }}
            >
              <Tag size={19} />
              标签管理
              <ChevronRight size={17} />
            </button>
            <button
              type="button"
              onClick={() => {
                setMore(false);
                setBudgetOpen(true);
              }}
            >
              <PieChart size={19} />
              月预算
              <ChevronRight size={17} />
            </button>
            <p className="ledger-muted">
              账本按当前账号独立保存在此设备。清理网站数据会删除本设备账本。
            </p>
          </div>
        </SystemSheet>
      )}
      {editor && (
        <div hidden={Boolean(manager)}>
          <LedgerEntryEditor
            userId={userId}
            state={state}
            initial={editor.initial}
            transfer={editor.transfer ?? false}
            onClose={() => setEditor(null)}
            onManage={() => setManager("categories")}
            onSaved={(entry) => {
              setEditor(null);
              setMonth(entry.date.slice(0, 7));
              setSelectedCategory("");
            }}
          />
        </div>
      )}
      {manager && (
        <LedgerManagement
          userId={userId}
          state={state}
          view={manager}
          onClose={() => setManager(null)}
        />
      )}
      {budgetOpen && (
        <LedgerBudgetEditor
          key={month}
          userId={userId}
          state={state}
          month={month}
          onClose={() => setBudgetOpen(false)}
        />
      )}
      {accountEditor && (
        <LedgerAccountEditor
          userId={userId}
          initial={accountEditor.initial}
          onClose={() => setAccountEditor(null)}
        />
      )}
      {selectedEntry && (
        <LedgerEntryDetail
          key={selectedEntry.id}
          userId={userId}
          entry={selectedEntry}
          state={state}
          onClose={() => setEntryDetail("")}
          onEdit={() => {
            setEntryDetail("");
            setAccountDetail("");
            setEditor({ initial: selectedEntry });
          }}
        />
      )}
      {selectedAccount && !selectedEntry && (
        <LedgerAccountDetail
          key={selectedAccount.id}
          userId={userId}
          account={selectedAccount}
          state={state}
          balance={balances.get(selectedAccount.id) ?? 0}
          onOpen={openEntry}
          onClose={() => setAccountDetail("")}
          onEdit={() => {
            setAccountDetail("");
            setAccountEditor({ initial: selectedAccount });
          }}
        />
      )}
    </main>
  );
}

function LedgerDonut({
  rows,
  total,
  selected,
  kind,
  loading,
  onSelect,
}: {
  rows: ReturnType<typeof ledgerBreakdown>;
  total: number;
  selected: string;
  kind: LedgerKind;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const circumference = 2 * Math.PI * 92;
  let offset = 0;
  return (
    <div
      className="ledger-donut"
      data-ui="ledger-donut"
      aria-label={`${kind === "expense" ? "支出" : "收入"}分类环形图`}
    >
      <svg viewBox="0 0 240 240">
        <circle cx="120" cy="120" r="92" fill="none" stroke="#EFF1F5" strokeWidth="28" />
        {rows.map((row) => {
          const length = (row.amount / total) * circumference;
          const start = offset;
          offset += length;
          return (
            <circle
              key={row.category.id}
              cx="120"
              cy="120"
              r="92"
              fill="none"
              stroke={row.category.color}
              strokeWidth={selected === row.category.id ? 34 : 28}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-start}
              transform="rotate(-90 120 120)"
              className="ledger-donut-sector"
              opacity={selected && selected !== row.category.id ? 0.35 : 1}
              tabIndex={0}
              role="button"
              aria-label={`${row.category.name} ${ledgerMoney(row.amount)} ${row.percent.toFixed(2)}% ${row.count}笔`}
              aria-pressed={selected === row.category.id}
              onClick={() => onSelect(row.category.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(row.category.id);
                }
              }}
            >
              <title>
                {row.category.name} {ledgerMoney(row.amount)}
              </title>
            </circle>
          );
        })}
      </svg>
      <div className="ledger-donut-center">
        <small>{loading ? "正在读取…" : kind === "expense" ? "总支出" : "总收入"}</small>
        <strong>{ledgerMoney(total)}</strong>
        <span>{rows.reduce((n, row) => n + row.count, 0)} 笔账单</span>
      </div>
    </div>
  );
}
function LedgerAccountRow({
  account,
  balance,
  onOpen,
}: {
  account: LedgerAccount;
  balance: number;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="ledger-account-row" onClick={onOpen}>
      <span className="ledger-account-icon">
        {account.type === "cash" ? (
          <Banknote size={21} />
        ) : account.type === "bank" ? (
          <CreditCard size={21} />
        ) : (
          <Wallet size={21} />
        )}
      </span>
      <span>
        <strong>{account.name}</strong>
        <small>
          {account.type === "cash" ? "现金" : account.type === "bank" ? "银行卡" : "电子钱包"}
        </small>
      </span>
      <strong>{ledgerMoney(balance)}</strong>
      <ChevronRight size={16} />
    </button>
  );
}
function LedgerBudgetEditor({
  userId,
  state,
  month,
  onClose,
}: {
  userId: string;
  state: LedgerState;
  month: string;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(ledgerAmountInput(state.budgets[month] ?? 0)),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <SystemSheet
      open
      title={`${month} 月预算`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="ledger-form"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void (async () => {
            try {
              await changeLedger(userId, {
                type: "budget",
                month,
                amount: parseLedgerAmount(amount),
              });
              onClose();
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "预算保存失败。");
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <label>
          月预算（¥）
          <input
            aria-label="月预算金额"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <p className="ledger-muted">输入 0 可关闭本月预算。超出预算只会提醒，不限制记账。</p>
        {error && (
          <p role="alert" className="ledger-error">
            {error}
          </p>
        )}
        <button type="submit" className="ledger-primary" disabled={busy}>
          {busy ? "保存中…" : "保存预算"}
        </button>
      </form>
    </SystemSheet>
  );
}
function LedgerEntryDetail({
  userId,
  entry,
  state,
  onClose,
  onEdit,
}: {
  userId: string;
  entry: LedgerEntry;
  state: LedgerState;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [confirm, setConfirm] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const category = state.categories.find((c) => c.id === entry.categoryId);
  const account = state.accounts.find((a) => a.id === entry.accountId);
  return (
    <SystemSheet
      open
      title="账单详情"
      onClose={() => {
        if (!busy) onClose();
      }}
      scrollable
    >
      <div className="ledger-entry-detail">
        <span>
          {category?.emoji ?? "↔️"} {category?.name ?? "账户转账"}
        </span>
        <strong>
          {entry.kind === "income" ? "+" : entry.kind === "expense" ? "−" : ""}
          {ledgerMoney(entry.amountCents)}
        </strong>
        <dl>
          <dt>类型</dt>
          <dd>
            {entry.kind === "expense"
              ? "支出"
              : entry.kind === "income"
                ? "收入"
                : "转账（不计入收支）"}
          </dd>
          <dt>时间</dt>
          <dd>
            {entry.date} {entry.time}
          </dd>
          <dt>账户</dt>
          <dd>
            {account?.name}
            {entry.toAccountId &&
              ` → ${state.accounts.find((a) => a.id === entry.toAccountId)?.name}`}
          </dd>
          <dt>备注</dt>
          <dd>{entry.note || "无"}</dd>
          <dt>标签</dt>
          <dd>
            {entry.tagIds
              .map((id) => state.tags.find((t) => t.id === id)?.name)
              .filter(Boolean)
              .join("、") || "无"}
          </dd>
        </dl>
        <div className="ledger-form-row">
          <button type="button" className="ledger-primary" onClick={onEdit}>
            <Pencil size={16} />
            编辑账单
          </button>
          <button type="button" className="ledger-danger" onClick={() => setConfirm(true)}>
            <Trash2 size={16} />
            删除
          </button>
        </div>
        {confirm && (
          <div className="ledger-inline-confirm">
            <p>删除这笔账单？账户余额和统计会同步重新计算。</p>
            <button type="button" onClick={() => setConfirm(false)} disabled={busy}>
              取消
            </button>
            <button
              type="button"
              className="ledger-danger"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void changeLedger(userId, { type: "delete-entry", id: entry.id })
                  .then(onClose)
                  .catch((reason) =>
                    setError(reason instanceof Error ? reason.message : "删除失败。"),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              确认删除
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="ledger-error">
            {error}
          </p>
        )}
      </div>
    </SystemSheet>
  );
}
function LedgerAccountDetail({
  userId,
  account,
  state,
  balance,
  onOpen,
  onClose,
  onEdit,
}: {
  userId: string;
  account: LedgerAccount;
  state: LedgerState;
  balance: number;
  onOpen: (entry: LedgerEntry) => void;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [limit, setLimit] = useState(60),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  const entries = state.entries
    .filter((e) => e.accountId === account.id || e.toAccountId === account.id)
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  return (
    <SystemSheet
      open
      title={account.name}
      onClose={() => {
        if (!busy) onClose();
      }}
      scrollable
    >
      <div className="ledger-account-detail">
        <small>当前余额</small>
        <strong>{ledgerMoney(balance)}</strong>
        <p className="ledger-muted">
          初始余额 {ledgerMoney(account.initialCents)} · {entries.length} 笔流水
        </p>
        <button type="button" className="ledger-icon-link" onClick={onEdit}>
          <Pencil size={16} />
          编辑账户 / 归档
        </button>
        <h3>账户流水</h3>
        {entries.slice(0, limit).map((e) => (
          <div key={e.id}>
            <small className="ledger-muted">
              {e.date}
              {e.kind === "transfer" ? (e.accountId === account.id ? " · 转出" : " · 转入") : ""}
            </small>
            <LedgerEntryRow entry={e} state={state} onOpen={onOpen} />
          </div>
        ))}
        {entries.length > limit && (
          <button type="button" className="ledger-add-row" onClick={() => setLimit((n) => n + 60)}>
            更多流水
          </button>
        )}
        {!entries.length && (
          <>
            <p className="ledger-muted">还没有流水</p>
            <button type="button" className="ledger-danger" onClick={() => setConfirm(true)}>
              删除空账户
            </button>
          </>
        )}
        {confirm && (
          <div className="ledger-inline-confirm">
            <p>确认删除此空账户？</p>
            <button type="button" onClick={() => setConfirm(false)}>
              取消
            </button>
            <button
              type="button"
              className="ledger-danger"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void changeLedger(userId, { type: "delete-account", id: account.id })
                  .then(onClose)
                  .catch((reason) =>
                    setError(reason instanceof Error ? reason.message : "删除失败。"),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              确认删除
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="ledger-error">
            {error}
          </p>
        )}
      </div>
    </SystemSheet>
  );
}
