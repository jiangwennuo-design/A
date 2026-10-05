import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Heart,
  Home,
  ImagePlus,
  Link2,
  MapPin,
  MoreHorizontal,
  Music2,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Smile,
  Tag,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useKeyboardViewport } from "@/hooks/useKeyboardViewport";
import { useGoalToday } from "@/lib/goals";
import {
  defaultHappenedSettings,
  happenedColors,
  happenedDate,
  happenedTime,
  monthRange,
  shiftMonth,
  safeHappenedUrl,
  type HappenedEntry,
  type HappenedSettings,
  type HappenedTag,
} from "@/lib/happened";
import {
  countHappenedTag,
  deleteHappenedTag,
  getHappenedEntry,
  happenedMeta,
  happenedMonthStats,
  readHappenedEntries,
  readHappenedFile,
  readHappenedSettings,
  removeHappenedEntry,
  saveHappenedEntries,
  saveHappenedMeta,
  useHappenedRevision,
} from "@/lib/happened-store";
import { syncHappenedEvents } from "@/lib/happened-events";
import { HappenedPhoto } from "./HappenedPhoto";
import { HappenedQuickAdd } from "./HappenedQuickAdd";
import "@/styles/happened.css";

export type HappenedView =
  | "home"
  | "calendar"
  | "memories"
  | "tags"
  | "day"
  | "entry"
  | "timeline"
  | "stats"
  | "search"
  | "sources"
  | "hidden";
const icons: Record<string, LucideIcon> = {
  text: FileText,
  photo: ImagePlus,
  location: MapPin,
  mood: Smile,
  music: Music2,
  link: Link2,
  file: Paperclip,
  checklist: CheckCircle2,
  other: Heart,
  goal: CheckCircle2,
  knowledge: FileText,
  diary: FileText,
};
const sourceNames = { goal: "规划", knowledge: "知识库", diary: "此心一笺" };
const titles: Partial<Record<HappenedView, string>> = {
  calendar: "日历",
  memories: "回忆",
  tags: "标签",
  timeline: "时间轴",
  stats: "统计",
  search: "搜索记录",
  sources: "系统事件",
  hidden: "已隐藏的记录",
};
type Stats = Awaited<ReturnType<typeof happenedMonthStats>>;
const noStats: Stats = { total: 0, days: 0, photos: 0, text: 0, tags: {}, dates: {} };
export function HappenedApp({
  userId,
  view,
  selectedDate,
  selectedId,
  selectedTag,
  onNavigate,
  onHome,
  onSource,
}: {
  userId: string;
  view: HappenedView;
  selectedDate?: string | undefined;
  selectedId?: string | undefined;
  selectedTag?: string | undefined;
  onNavigate: (view: HappenedView, date?: string, id?: string, tag?: string) => void;
  onHome: () => void;
  onSource: (app: "goal" | "knowledge" | "diary", id: string) => void;
}) {
  const today = useGoalToday();
  const date = selectedDate || today;
  const month = date.slice(0, 7);
  const revision = useHappenedRevision(userId);
  const [settings, setSettings] = useState<HappenedSettings>(defaultHappenedSettings);
  const [entries, setEntries] = useState<HappenedEntry[]>([]);
  const [selected, setSelected] = useState<HappenedEntry | null>(null);
  const [stats, setStats] = useState(noStats);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [more, setMore] = useState(false);
  const [limit, setLimit] = useState(80);
  const [query, setQuery] = useState("");
  const [memory, setMemory] = useState("year-day");
  const [memoryMonth, setMemoryMonth] = useState(() => shiftMonth(today, -12).slice(0, 7));
  const [quote, setQuote] = useState("");
  const [quoteDraft, setQuoteDraft] = useState("");
  const [quoteEdit, setQuoteEdit] = useState(false);
  const [quick, setQuick] = useState<{ initial?: HappenedEntry } | null>(null);
  const [menu, setMenu] = useState(false);
  const [tagDraft, setTagDraft] = useState<HappenedTag | null>(null);
  const [image, setImage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const root = useRef<HTMLElement>(null);
  useKeyboardViewport(root);
  const syncMonth =
    view === "memories"
      ? memory === "last-year"
        ? memoryMonth
        : shiftMonth(today, memory === "three-months" ? -3 : -12).slice(0, 7)
      : month;
  const go = (next: HappenedView, nextDate = date, id?: string, tag?: string) => {
    setLimit(80);
    setMenu(false);
    setError("");
    setQuery("");
    setQuoteEdit(false);
    onNavigate(next, nextDate, id, tag);
  };
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
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void syncHappenedEvents(userId, syncMonth)
        .then((warnings) => {
          if (active) setWarning(warnings.join(" "));
        })
        .catch((reason) => {
          if (active) setWarning(reason instanceof Error ? reason.message : "事件暂未同步。");
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, [userId, syncMonth]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const prefs = await readHappenedSettings(userId);
        let bounds =
          view === "timeline" || view === "stats" || view === "search" || view === "hidden"
            ? monthRange(month)
            : { from: date, to: date };
        if (view === "tags" && selectedTag) bounds = { from: "0001-01-01", to: "9999-12-31" };
        if (view === "memories") {
          const past = shiftMonth(today, memory === "three-months" ? -3 : -12);
          bounds = memory === "last-year" ? monthRange(memoryMonth) : { from: past, to: past };
        }
        const [rows, dayQuote, entry, monthStats, counts] = await Promise.all([
          readHappenedEntries(userId, {
            ...bounds,
            limit,
            query,
            tag: selectedTag,
            sources: prefs.sources,
            memories: view === "memories",
            hidden: view === "hidden",
          }),
          happenedMeta(userId, `quote:${date}`, ""),
          selectedId ? getHappenedEntry(userId, selectedId) : Promise.resolve(null),
          ["calendar", "stats"].includes(view)
            ? happenedMonthStats(
                userId,
                monthRange(month).from,
                monthRange(month).to,
                prefs.sources,
              )
            : Promise.resolve(noStats),
          view === "tags"
            ? Promise.all(
                prefs.tags.map(
                  async (tag) =>
                    [tag.id, await countHappenedTag(userId, tag.id, prefs.sources)] as const,
                ),
              ).then(Object.fromEntries)
            : Promise.resolve({}),
        ]);
        if (active) {
          setSettings(prefs);
          setEntries(rows.entries);
          setMore(rows.more);
          setQuote(dayQuote);
          setSelected(entry);
          setStats(monthStats);
          setTagCounts(counts);
        }
      } catch (reason) {
        if (active)
          setError(reason instanceof Error ? reason.message : "读取失败，原记录未被清空。");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [
    userId,
    revision,
    view,
    date,
    month,
    selectedId,
    selectedTag,
    limit,
    query,
    memory,
    memoryMonth,
    today,
  ]);
  useEffect(() => {
    if (!image && !menu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setImage("");
        setMenu(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [image, menu]);
  const saveTag = () =>
    void run(async () => {
      if (!tagDraft?.name.trim()) throw new Error("请填写标签名称。");
      if (settings.tags.some((tag) => tag.id !== tagDraft.id && tag.name === tagDraft.name.trim()))
        throw new Error("已有同名标签。");
      const next = {
        ...settings,
        tags: settings.tags.some((tag) => tag.id === tagDraft.id)
          ? settings.tags.map((tag) =>
              tag.id === tagDraft.id ? { ...tagDraft, name: tagDraft.name.trim() } : tag,
            )
          : [...settings.tags, { ...tagDraft, name: tagDraft.name.trim() }],
      };
      await saveHappenedMeta(userId, "settings", next);
      setTagDraft(null);
    });
  const toggleHidden = (entry: HappenedEntry) =>
    void run(async () => {
      await saveHappenedEntries(userId, [{ ...entry, hidden: !entry.hidden }]);
      go(entry.hidden ? "home" : "hidden", entry.date);
    });
  const remove = (entry: HappenedEntry) => {
    if (
      !window.confirm(
        entry.isSystemEvent ? "只从手帐中移除展示，不会删除原内容。继续吗？" : "删除这条手动记录？",
      )
    )
      return;
    void run(async () => {
      await removeHappenedEntry(userId, entry.id);
      go("day", entry.date);
    });
  };
  const downloadFile = (file: HappenedEntry["files"][number]) =>
    void run(async () => {
      const blob = await readHappenedFile(userId, file.id);
      if (!blob) throw new Error("此设备没有该文件。");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  const album = (paths: string[], preview = true) =>
    !!paths.length && (
      <div className="happened-photo-grid">
        {paths.slice(0, preview ? 4 : 20).map((path, index) => (
          <HappenedPhoto key={`${path}:${index}`} path={path} onOpen={setImage} />
        ))}
        {preview && paths.length > 4 && (
          <span className="happened-album-more">+{paths.length - 4}</span>
        )}
      </div>
    );
  const tagLabel = (id: string) => settings.tags.find((tag) => tag.id === id);
  const row = (entry: HappenedEntry) => {
    const Icon = icons[entry.type] || FileText;
    return (
      <article
        key={entry.id}
        className="happened-entry"
        data-ui="happened-entry"
        data-entry-type={entry.type}
      >
        <time dateTime={entry.timestamp}>{happenedTime(entry.timestamp)}</time>
        <span className={`happened-entry-icon happened-tone-${entry.type}`}>
          <Icon size={15} />
        </span>
        <div className="happened-entry-body">
          <button
            type="button"
            className="happened-entry-open"
            onClick={() => go("entry", entry.date, entry.id)}
          >
            <strong>
              {entry.title ||
                entry.content.split("\n")[0]?.slice(0, 45) ||
                entry.music.title ||
                "这一刻"}
            </strong>
            {entry.content && (
              <p>
                {entry.content.slice(0, 160)}
                {entry.content.length > 160 ? "…" : ""}
              </p>
            )}
          </button>
          {!!entry.location && (
            <span className="happened-entry-meta">
              <MapPin size={12} />
              {entry.location}
            </span>
          )}
          {!!entry.mood && (
            <span className="happened-entry-meta">
              <Smile size={12} />
              {entry.mood}
            </span>
          )}
          {!!entry.music.title && (
            <span className="happened-entry-meta">
              <Music2 size={12} />
              {entry.music.title} {entry.music.artist}
            </span>
          )}
          {album(entry.images)}
          <div className="happened-mini-tags">
            {entry.tags
              .map(tagLabel)
              .filter(Boolean)
              .map((tag) => (
                <span key={tag!.id} className={`happened-color-${tag!.color}`}>
                  {tag!.name}
                </span>
              ))}
          </div>
          {entry.isSystemEvent && (
            <button
              type="button"
              className="happened-origin"
              onClick={() =>
                onSource(entry.sourceApp as "goal" | "knowledge" | "diary", entry.sourceId)
              }
            >
              {sourceNames[entry.sourceApp as keyof typeof sourceNames]} <ChevronRight size={11} />
            </button>
          )}
          {view === "hidden" && (
            <button type="button" className="happened-subtle" onClick={() => toggleHidden(entry)}>
              恢复展示
            </button>
          )}
        </div>
      </article>
    );
  };
  const loadMore = more && (
    <button type="button" className="happened-load" onClick={() => setLimit((value) => value + 80)}>
      继续读取
    </button>
  );
  const timeline = (rows: HappenedEntry[], empty = "还没有记录", pagination = true) => (
    <>
      <div data-ui="happened-timeline" className="happened-timeline">
        {[...rows]
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id))
          .map(row)}
      </div>
      {!rows.length && !loading && (
        <div className="happened-empty">
          <Heart size={39} strokeWidth={1} />
          <h3>{empty}</h3>
          <p>
            从一个小小的瞬间开始吧。
            <br />
            今天的痕迹，会慢慢连起来。
          </p>
          {view !== "memories" && (
            <button type="button" onClick={() => setQuick({})}>
              <Plus size={16} />
              记下这一刻
            </button>
          )}
        </div>
      )}
      {pagination && loadMore}
    </>
  );
  const todayQuote = (
    <div className="happened-daily-quote">
      {quoteEdit ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await saveHappenedMeta(userId, `quote:${date}`, quoteDraft.trim());
              setQuoteEdit(false);
            });
          }}
        >
          <textarea
            aria-label="今日一句"
            rows={2}
            maxLength={500}
            placeholder="今日一句（可留空）"
            value={quoteDraft}
            onChange={(event) => setQuoteDraft(event.target.value)}
          />
          <button type="submit" disabled={busy}>
            保存
          </button>
          <button type="button" onClick={() => setQuoteEdit(false)}>
            取消
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setQuoteDraft(quote);
            setQuoteEdit(true);
          }}
        >
          {quote || "今日一句（可留空）"}
          <Pencil size={12} />
        </button>
      )}
    </div>
  );
  const grouped = new Map<string, HappenedEntry[]>();
  entries.forEach((entry) => grouped.set(entry.date, [...(grouped.get(entry.date) ?? []), entry]));
  const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
  const first = new Date(`${month}-01T12:00:00`);
  const blanks = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return (
    <main ref={root} className="happened-app" data-app="happened">
      <header className="happened-header">
        <button
          type="button"
          aria-label={view === "home" ? "返回桌面" : "返回首页"}
          onClick={view === "home" ? onHome : () => go("home")}
        >
          <ChevronLeft size={21} />
        </button>
        <strong>
          {view === "home" || view === "day" || view === "entry"
            ? happenedDate(date)
            : titles[view]}
        </strong>
        <div>
          {view === "home" && (
            <button type="button" className="happened-today" onClick={() => go("home", today)}>
              今天
            </button>
          )}
          <button type="button" aria-label="搜索" onClick={() => go("search")}>
            <Search size={19} />
          </button>
          <button type="button" aria-label="更多" onClick={() => setMenu(true)}>
            <MoreHorizontal size={21} />
          </button>
        </div>
      </header>
      {error && (
        <p className="happened-error" role="alert">
          {error}
        </p>
      )}
      {warning && (
        <p className="happened-warning" role="status">
          {warning}
        </p>
      )}
      <div className="happened-scroll">
        {loading && <p className="happened-loading">读取记录…</p>}
        {view === "home" || view === "day" ? (
          <section data-ui="happened-home">
            <div className="happened-date-select">
              <input
                type="date"
                aria-label="查看日期"
                value={date}
                onChange={(event) => {
                  if (event.target.value) go(view, event.target.value);
                }}
              />
              <button type="button" aria-label="查看完整单日详情" onClick={() => go("day")}>
                <ChevronRight size={16} />
              </button>
            </div>
            {todayQuote}
            {timeline(entries)}
          </section>
        ) : view === "calendar" ? (
          <section data-ui="happened-calendar">
            <div className="happened-month-picker">
              <button
                type="button"
                aria-label="上个月"
                onClick={() => go("calendar", shiftMonth(`${month}-01`, -1))}
              >
                <ChevronLeft size={18} />
              </button>
              <label>
                {first.getFullYear()}年{first.getMonth() + 1}月
                <input
                  aria-label="日历月份"
                  type="month"
                  value={month}
                  onChange={(event) => {
                    if (event.target.value) go("calendar", `${event.target.value}-01`);
                  }}
                />
              </label>
              <button
                type="button"
                aria-label="下个月"
                onClick={() => go("calendar", shiftMonth(`${month}-01`, 1))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="happened-calendar-grid">
              {weekdays.map((day) => (
                <span key={day} className="happened-weekday">
                  {day}
                </span>
              ))}
              {Array.from({ length: blanks }, (_, index) => (
                <span key={`blank${index}`} />
              ))}
              {Array.from({ length: days }, (_, index) => {
                const day = `${month}-${String(index + 1).padStart(2, "0")}`;
                const info = stats.dates[day];
                return (
                  <button
                    type="button"
                    key={day}
                    aria-label={`${day}${info ? ` ${info.count}条记录` : ""}`}
                    aria-pressed={date === day}
                    className={day === today ? "happened-calendar-today" : ""}
                    onClick={() => (date === day ? go("day", day) : onNavigate("calendar", day))}
                  >
                    <span>{index + 1}</span>
                    {info?.image ? <HappenedPhoto path={info.image} /> : info ? <i /> : null}
                  </button>
                );
              })}
            </div>
            <div className="happened-day-preview">
              <button type="button" onClick={() => go("day", date)}>
                <strong>{happenedDate(date)}</strong>
                <span>
                  {stats.dates[date]?.count || 0}条记录 <ChevronRight size={14} />
                </span>
              </button>
              {todayQuote}
              {album(entries.flatMap((entry) => entry.images))}
              {timeline(entries.slice(0, 4), "还没有记录", false)}
            </div>
          </section>
        ) : view === "memories" ? (
          <section data-ui="happened-memory">
            <div className="happened-tabs">
              {[
                ["year-day", "一年前的今天"],
                ["three-months", "三个月前"],
                ["last-year", "去年"],
              ].map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={memory === key}
                  onClick={() => {
                    setMemory(key!);
                    setLimit(80);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {memory === "last-year" && (
              <label className="happened-section-actions">
                去年 · 按月回看
                <input
                  type="month"
                  aria-label="回忆月份"
                  value={memoryMonth}
                  min={`${Number(today.slice(0, 4)) - 1}-01`}
                  max={`${Number(today.slice(0, 4)) - 1}-12`}
                  onChange={(event) => {
                    if (event.target.value.startsWith(`${Number(today.slice(0, 4)) - 1}-`)) {
                      setMemoryMonth(event.target.value);
                      setLimit(80);
                    }
                  }}
                />
              </label>
            )}
            {[...grouped].map(([day, rows]) => (
              <section className="happened-memory-day" key={day}>
                <button type="button" onClick={() => go("day", day)}>
                  <h3>{happenedDate(day, true)}</h3>
                </button>
                {timeline(rows, "这个时间点没有留下记录", false)}
              </section>
            ))}
            {loadMore}
            {!entries.length && !loading && (
              <p className="happened-empty">
                这个时间点还没有留下内容。
                <br />
                回忆只展示你真实记录过的日子。
              </p>
            )}
          </section>
        ) : view === "tags" ? (
          <section data-ui="happened-tags">
            {selectedTag ? (
              <>
                <h2 className="happened-section-title">
                  {tagLabel(selectedTag)?.name || "标签记录"}
                </h2>
                {timeline(entries)}
              </>
            ) : (
              <>
                <div className="happened-section-actions">
                  <span>按标签，找到那些小瞬间</span>
                  <button
                    type="button"
                    aria-label="新建标签"
                    onClick={() =>
                      setTagDraft({ id: crypto.randomUUID(), name: "", color: "blue" })
                    }
                  >
                    <Plus size={17} />
                  </button>
                </div>
                <div className="happened-tag-list">
                  {settings.tags.map((tag) => (
                    <div key={tag.id} className={`happened-color-${tag.color}`}>
                      <button type="button" onClick={() => go("tags", date, undefined, tag.id)}>
                        <Tag size={14} />
                        <span>{tag.name}</span>
                        <small>{tagCounts[tag.id] || 0}</small>
                      </button>
                      <button
                        type="button"
                        aria-label={`编辑标签${tag.name}`}
                        onClick={() => setTagDraft({ ...tag })}
                      >
                        <Pencil size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
            {tagDraft && (
              <form
                className="happened-tag-editor"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveTag();
                }}
              >
                <input
                  autoFocus
                  aria-label="标签名称"
                  maxLength={40}
                  value={tagDraft.name}
                  placeholder="标签名称"
                  onChange={(event) => setTagDraft({ ...tagDraft, name: event.target.value })}
                />
                <div className="happened-color-picker">
                  {happenedColors.map((color) => (
                    <button
                      type="button"
                      aria-label={`${color}柔和色`}
                      aria-pressed={tagDraft.color === color}
                      key={color}
                      className={`happened-color-${color}`}
                      onClick={() => setTagDraft({ ...tagDraft, color })}
                    >
                      {tagDraft.color === color && <Check size={13} />}
                    </button>
                  ))}
                </div>
                <div>
                  <button type="button" onClick={() => setTagDraft(null)}>
                    取消
                  </button>
                  <button type="submit" disabled={busy}>
                    保存
                  </button>
                  {settings.tags.some((tag) => tag.id === tagDraft.id) && (
                    <button
                      type="button"
                      className="happened-danger"
                      onClick={() => {
                        if (window.confirm("删除这个标签？记录本身不会被删除。"))
                          void run(async () => {
                            await deleteHappenedTag(userId, tagDraft.id);
                            setTagDraft(null);
                          });
                      }}
                    >
                      删除
                    </button>
                  )}
                </div>
              </form>
            )}
          </section>
        ) : view === "entry" ? (
          selected ? (
            <article
              className="happened-detail"
              data-ui="happened-entry"
              data-entry-type={selected.type}
            >
              <p className="happened-detail-time">
                {happenedTime(selected.timestamp)} ·{" "}
                {selected.isSystemEvent ? "系统事件" : "手动记录"}
              </p>
              <h2>{selected.title || "这一刻"}</h2>
              {selected.type === "checklist" ? (
                <div className="happened-checklist">
                  {selected.content
                    .split("\n")
                    .filter(Boolean)
                    .map((item, index) => (
                      <label key={index}>
                        <input
                          type="checkbox"
                          checked={
                            Array.isArray(selected.metadata["checks"]) &&
                            selected.metadata["checks"].includes(index)
                          }
                          onChange={(event) => {
                            const checks = Array.isArray(selected.metadata["checks"])
                              ? selected.metadata["checks"]
                              : [];
                            void run(() =>
                              saveHappenedEntries(userId, [
                                {
                                  ...selected,
                                  metadata: {
                                    ...selected.metadata,
                                    checks: event.target.checked
                                      ? [...checks, index]
                                      : checks.filter((value) => value !== index),
                                  },
                                  updatedAt: new Date().toISOString(),
                                },
                              ]),
                            );
                          }}
                        />
                        {item}
                      </label>
                    ))}
                </div>
              ) : (
                <p className="happened-detail-content">{selected.content}</p>
              )}
              {album(selected.images, false)}
              {!!selected.location && (
                <a
                  className="happened-detail-meta"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MapPin size={16} />
                  {selected.location}
                  <ChevronRight size={14} />
                </a>
              )}
              {!!selected.mood && (
                <p className="happened-detail-meta">
                  <Smile size={16} />
                  {selected.mood}
                </p>
              )}
              {!!selected.music.title && (
                <div className="happened-music">
                  <Music2 size={21} />
                  <div>
                    <strong>{selected.music.title}</strong>
                    <small>{selected.music.artist}</small>
                  </div>
                  {safeHappenedUrl(selected.music.url) && (
                    <a
                      href={safeHappenedUrl(selected.music.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      打开音乐
                    </a>
                  )}
                </div>
              )}
              <div className="happened-mini-tags">
                {selected.tags
                  .map(tagLabel)
                  .filter(Boolean)
                  .map((tag) => (
                    <button
                      type="button"
                      key={tag!.id}
                      className={`happened-color-${tag!.color}`}
                      onClick={() => go("tags", date, undefined, tag!.id)}
                    >
                      {tag!.name}
                    </button>
                  ))}
              </div>
              {selected.links.map((link, index) => (
                <div className="happened-detail-meta" key={index}>
                  <Link2 size={15} />
                  {link.sourceApp ? (
                    <button
                      type="button"
                      onClick={() =>
                        onSource(link.sourceApp as "goal" | "knowledge" | "diary", link.sourceId)
                      }
                    >
                      {link.title} <ChevronRight size={13} />
                    </button>
                  ) : (
                    safeHappenedUrl(link.url) && (
                      <a href={safeHappenedUrl(link.url)} target="_blank" rel="noopener noreferrer">
                        {link.title}
                      </a>
                    )
                  )}
                </div>
              ))}
              {selected.files.map((file) => (
                <button
                  type="button"
                  className="happened-file-row"
                  key={file.id}
                  onClick={() => downloadFile(file)}
                >
                  <Paperclip size={16} />
                  {file.name}
                  <small>{Math.ceil(file.size / 1024)} KB</small>
                </button>
              ))}
              {selected.isSystemEvent ? (
                <div className="happened-detail-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      onSource(
                        selected.sourceApp as "goal" | "knowledge" | "diary",
                        selected.sourceId,
                      )
                    }
                  >
                    查看原内容
                  </button>
                  <button type="button" disabled={busy} onClick={() => toggleHidden(selected)}>
                    {selected.hidden ? "恢复展示" : "隐藏事件"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => remove(selected)}>
                    从手帐移除展示
                  </button>
                </div>
              ) : (
                <div className="happened-detail-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setQuick({ initial: selected })}
                  >
                    <Pencil size={15} />
                    编辑
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="happened-danger"
                    onClick={() => remove(selected)}
                  >
                    <Trash2 size={15} />
                    删除
                  </button>
                </div>
              )}
            </article>
          ) : (
            !loading && <p className="happened-empty">这条记录不存在或已被删除。</p>
          )
        ) : view === "timeline" ? (
          <section>
            <div className="happened-month-picker">
              <button
                type="button"
                aria-label="更早一个月"
                onClick={() => go("timeline", shiftMonth(`${month}-01`, -1))}
              >
                <ChevronLeft size={18} />
              </button>
              <h2>
                {first.getFullYear()}年{first.getMonth() + 1}月
              </h2>
              <button
                type="button"
                aria-label="后一个月"
                onClick={() => go("timeline", shiftMonth(`${month}-01`, 1))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            {[...grouped].map(([day, rows]) => (
              <section className="happened-month-day" key={day}>
                <button type="button" onClick={() => go("day", day)}>
                  {happenedDate(day)}
                </button>
                {timeline(rows, "还没有记录", false)}
              </section>
            ))}
            {loadMore}
            {!entries.length && timeline([])}
          </section>
        ) : view === "stats" ? (
          <section>
            <div className="happened-month-picker">
              <button
                type="button"
                aria-label="统计上个月"
                onClick={() => go("stats", shiftMonth(`${month}-01`, -1))}
              >
                <ChevronLeft size={18} />
              </button>
              <strong>{month}</strong>
              <button
                type="button"
                aria-label="统计下个月"
                onClick={() => go("stats", shiftMonth(`${month}-01`, 1))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="happened-stats">
              {[
                [stats.total, "本月记录"],
                [stats.days, "有记录天数"],
                [stats.photos, "照片"],
                [stats.text, "文字记录"],
              ].map(([count, label]) => (
                <div key={label}>
                  <strong>{count}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <h3 className="happened-section-title">常用标签</h3>
            <div className="happened-tag-pills">
              {Object.entries(stats.tags)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(
                  ([id, count]) =>
                    tagLabel(id) && (
                      <button
                        type="button"
                        key={id}
                        className={`happened-color-${tagLabel(id)!.color}`}
                        onClick={() => go("tags", date, undefined, id)}
                      >
                        {tagLabel(id)!.name} · {count}
                      </button>
                    ),
                )}
            </div>
            <p className="happened-note">只统计当前月份，慢慢留下自己的生活痕迹。</p>
          </section>
        ) : view === "search" ? (
          <section>
            <label className="happened-search">
              <Search size={16} />
              <input
                type="search"
                placeholder="搜索这个月的生活痕迹…"
                aria-label="搜索记录"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setLimit(80);
                }}
              />
            </label>
            <label className="happened-form-row">
              <span>查找月份</span>
              <input
                type="month"
                value={month}
                onChange={(event) => {
                  if (event.target.value) onNavigate("search", `${event.target.value}-01`);
                }}
              />
            </label>
            {timeline(entries, "没有找到记录")}
          </section>
        ) : view === "sources" ? (
          <section>
            <p className="happened-note">
              只读收集已有事件，不会改动来源 App。关闭只隐藏对应来源；也可以单独隐藏记录。
            </p>
            {(["goal", "knowledge", "diary"] as const).map((source) => (
              <label className="happened-form-row" key={source}>
                <span>{sourceNames[source]}</span>
                <input
                  type="checkbox"
                  checked={settings.sources[source]}
                  disabled={busy}
                  onChange={(event) =>
                    void run(async () => {
                      await saveHappenedMeta(userId, "settings", {
                        ...settings,
                        sources: { ...settings.sources, [source]: event.target.checked },
                      });
                      if (event.target.checked)
                        setWarning((await syncHappenedEvents(userId, month, true)).join(" "));
                    })
                  }
                />
              </label>
            ))}
            <button
              type="button"
              disabled={busy}
              className="happened-subtle"
              onClick={() =>
                void run(async () =>
                  setWarning((await syncHappenedEvents(userId, month, true)).join(" ")),
                )
              }
            >
              同步当前月份
            </button>
            <button type="button" className="happened-form-row" onClick={() => go("hidden")}>
              已隐藏记录
              <ChevronRight size={15} />
            </button>
            <p className="happened-note">
              手帐保存在此设备浏览器并按账号隔离。文件也保存在本设备；清除网站数据会移除手帐。
            </p>
          </section>
        ) : view === "hidden" ? (
          timeline(entries, "这个月没有隐藏记录")
        ) : null}
      </div>
      <nav className="happened-bottom-nav" data-ui="happened-bottom-nav" aria-label="发生过导航">
        {[
          ["home", "首页", Home],
          ["calendar", "日历", CalendarDays],
          ["add", "记录", Plus],
          ["memories", "回忆", Heart],
          ["tags", "标签", Tag],
        ].map(([key, label, Icon]) => {
          const Glyph = Icon as LucideIcon;
          return (
            <button
              type="button"
              key={key as string}
              aria-label={label as string}
              aria-current={view === key ? "page" : undefined}
              className={key === "add" ? "happened-add-button" : ""}
              onClick={() =>
                key === "add"
                  ? setQuick({})
                  : go(key as HappenedView, key === "home" ? today : date)
              }
            >
              <Glyph size={key === "add" ? 24 : 20} strokeWidth={1.5} />
              {key !== "add" && <span>{label as string}</span>}
            </button>
          );
        })}
      </nav>
      {quick && (
        <HappenedQuickAdd
          key={quick.initial?.id || "new"}
          userId={userId}
          date={date}
          initial={quick.initial}
          settings={settings}
          onClose={() => setQuick(null)}
          onSaved={(entry) => {
            setQuick(null);
            go("home", entry.date);
          }}
        />
      )}
      {menu && (
        <div className="happened-overlay" role="presentation" onPointerDown={() => setMenu(false)}>
          <section
            className="happened-menu"
            role="dialog"
            aria-modal="true"
            aria-label="更多功能"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button type="button" onClick={() => go("timeline")}>
              <Clock3 size={18} />
              时间轴
            </button>
            <button type="button" onClick={() => go("stats")}>
              <CalendarDays size={18} />
              统计
            </button>
            <button type="button" onClick={() => go("sources")}>
              <Link2 size={18} />
              系统事件
            </button>
            <button type="button" onClick={() => setMenu(false)}>
              取消
            </button>
          </section>
        </div>
      )}
      {image && (
        <div
          className="happened-image-viewer"
          role="dialog"
          aria-modal="true"
          aria-label="照片预览"
          onClick={() => setImage("")}
        >
          <button type="button" aria-label="关闭照片" onClick={() => setImage("")}>
            <X size={24} />
          </button>
          <img src={image} alt="记录照片" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </main>
  );
}
