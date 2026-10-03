import { useEffect, useState, useSyncExternalStore } from "react";
import { z } from "zod";

const DAY_MS = 86_400_000;

/** Calendar-day arithmetic avoids DST and UTC/local-midnight off-by-one errors. */
export function calendarDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year!, month! - 1, day!);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10) === value ? date.getTime() / DAY_MS : null;
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const dateField = z.string().refine((value) => !value || calendarDay(value) !== null, "日期无效。");
export const goalSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(["date", "number"]),
    title: z.string().trim().min(1, "请填写标题。").max(120),
    note: z.string().max(2000).default(""),
    startDate: dateField.default(""),
    targetDate: dateField.default(""),
    currentValue: z.number().finite().min(0).default(0),
    targetValue: z.number().finite().min(0).default(0),
    unit: z.string().trim().max(30).default(""),
    completed: z.boolean().default(false),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .superRefine((goal, context) => {
    if (goal.type === "date" && !goal.targetDate)
      context.addIssue({ code: "custom", message: "请选择目标日期。", path: ["targetDate"] });
    if (goal.type === "date" && goal.startDate && goal.startDate > goal.targetDate)
      context.addIssue({
        code: "custom",
        message: "开始日期不能晚于目标日期。",
        path: ["startDate"],
      });
    if (goal.type === "number" && goal.targetValue <= 0)
      context.addIssue({ code: "custom", message: "目标数值必须大于 0。", path: ["targetValue"] });
  });

export type Goal = z.infer<typeof goalSchema>;
export interface GoalState {
  schemaVersion: 1;
  goals: Goal[];
  desktopGoalId: string | null;
}
const stateSchema = z.object({
  schemaVersion: z.literal(1),
  goals: z.array(goalSchema),
  desktopGoalId: z.string().nullable(),
});
const empty: GoalState = { schemaVersion: 1, goals: [], desktopGoalId: null };
const cache = new Map<string, GoalState>();
const listeners = new Map<string, Set<() => void>>();
export const goalStorageKey = (userId: string) => `kdeji.goals.v1:${userId || "guest"}`;

function load(key: string): GoalState {
  const raw = localStorage.getItem(key);
  return raw ? stateSchema.parse(JSON.parse(raw)) : empty;
}

export function readGoals(userId: string): GoalState {
  if (typeof window === "undefined") return empty;
  const key = goalStorageKey(userId);
  const remembered = cache.get(key);
  if (remembered) return remembered;
  try {
    const state = load(key);
    cache.set(key, state);
    return state;
  } catch {
    // Do not write defaults on mount or destroy unreadable saved data.
    cache.set(key, empty);
    return empty;
  }
}

function updateGoals(userId: string, update: (state: GoalState) => GoalState) {
  if (typeof window === "undefined") throw new Error("请在浏览器中保存规划。");
  const key = goalStorageKey(userId);
  try {
    // Read the latest durable state, not a stale page draft or another tab's snapshot.
    const next = stateSchema.parse(update(load(key)));
    localStorage.setItem(key, JSON.stringify(next));
    cache.set(key, next);
    listeners.get(key)?.forEach((listener) => listener());
  } catch (reason) {
    if (reason instanceof z.ZodError)
      throw new Error(reason.issues[0]?.message || "规划数据无效。");
    throw new Error("规划保存失败，请检查浏览器存储空间；原数据未被清空。");
  }
}

export function saveGoal(userId: string, goal: Goal) {
  const normalized = goalSchema.parse(goal);
  updateGoals(userId, (state) => ({
    ...state,
    goals: state.goals.some((item) => item.id === normalized.id)
      ? state.goals.map((item) => (item.id === normalized.id ? normalized : item))
      : [normalized, ...state.goals],
  }));
}

export function patchGoal(
  userId: string,
  id: string,
  patch: Partial<Pick<Goal, "currentValue" | "completed">>,
) {
  updateGoals(userId, (state) => ({
    ...state,
    goals: state.goals.map((goal) =>
      goal.id === id ? { ...goal, ...patch, updatedAt: new Date().toISOString() } : goal,
    ),
  }));
}

export function deleteGoal(userId: string, id: string) {
  updateGoals(userId, (state) => ({
    ...state,
    goals: state.goals.filter((goal) => goal.id !== id),
    desktopGoalId: state.desktopGoalId === id ? null : state.desktopGoalId,
  }));
}

export function setDesktopGoal(userId: string, id: string | null) {
  updateGoals(userId, (state) => ({
    ...state,
    desktopGoalId: id && state.goals.some((goal) => goal.id === id) ? id : null,
  }));
}

export function useGoals(userId: string) {
  const key = goalStorageKey(userId);
  return useSyncExternalStore(
    (listener) => {
      const group = listeners.get(key) ?? new Set();
      group.add(listener);
      listeners.set(key, group);
      const onStorage = (event: StorageEvent) => {
        if (event.key !== key && event.key !== null) return;
        cache.delete(key);
        listener();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        group.delete(listener);
        if (!group.size) listeners.delete(key);
        window.removeEventListener("storage", onStorage);
      };
    },
    () => readGoals(userId),
    () => empty,
  );
}

export function goalProgress(goal: Goal, today = localDate()) {
  const currentDay = calendarDay(today) ?? calendarDay(localDate())!;
  const targetDay = calendarDay(goal.targetDate);
  const created = new Date(goal.createdAt);
  const startDay = calendarDay(goal.startDate || localDate(created)) ?? currentDay;
  const remaining = targetDay === null ? 0 : Math.max(0, targetDay - currentDay);
  const elapsed = Math.max(0, currentDay - startDay);
  const ratio =
    goal.type === "number"
      ? goal.currentValue / goal.targetValue
      : targetDay === null
        ? 0
        : targetDay <= startDay
          ? Number(currentDay >= targetDay)
          : elapsed / (targetDay - startDay);
  const percent = goal.completed ? 100 : Math.min(100, Math.max(0, ratio * 100));
  return { remaining, elapsed, percent };
}

export function goalSummary(goal: Goal, today = localDate()) {
  const progress = goalProgress(goal, today);
  const number = (value: number) => value.toLocaleString("zh-CN", { maximumFractionDigits: 6 });
  return {
    ...progress,
    main:
      goal.type === "date"
        ? `${progress.remaining} 天`
        : `${number(goal.currentValue)}${goal.unit}`,
    detail: goal.completed
      ? "已完成"
      : goal.type === "date"
        ? `已过 ${progress.elapsed} 天 · ${Math.round(progress.percent)}%`
        : `${number(goal.currentValue)} / ${number(goal.targetValue)}${goal.unit} · ${Math.round(progress.percent)}%`,
  };
}

/** Refresh on day rollover and when a suspended Safari/PWA page resumes. */
export function useGoalToday() {
  const [today, setToday] = useState(localDate);
  useEffect(() => {
    const refresh = () => setToday(localDate());
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    refresh();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return today;
}
