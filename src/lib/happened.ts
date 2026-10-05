import { z } from "zod";
import { calendarDay, localDate } from "./goals";

export const happenedTypes = [
  "text",
  "photo",
  "location",
  "mood",
  "music",
  "link",
  "file",
  "checklist",
  "other",
  "goal",
  "knowledge",
  "diary",
] as const;
export const happenedColors = ["blue", "pink", "purple", "yellow", "mint"] as const;
export const happenedEntrySchema = z.object({
  id: z.string().min(1).max(300),
  userId: z.string().min(1),
  date: z.string().refine((value) => calendarDay(value) !== null, "日期无效。"),
  timestamp: z.string().datetime(),
  type: z.enum(happenedTypes),
  title: z.string().max(300).default(""),
  content: z.string().max(20000).default(""),
  summary: z.string().max(600).default(""),
  images: z
    .array(
      z
        .string()
        .max(2000)
        .refine((value) => !/^(data:|blob:|javascript:)/i.test(value)),
    )
    .max(20)
    .default([]),
  location: z.string().max(500).default(""),
  mood: z.string().max(100).default(""),
  music: z
    .object({ title: z.string().max(300), artist: z.string().max(300), url: z.string().max(2000) })
    .default({ title: "", artist: "", url: "" }),
  tags: z.array(z.string().min(1).max(100)).max(30).default([]),
  links: z
    .array(
      z.object({
        title: z.string().max(300),
        url: z.string().max(2000),
        sourceApp: z.enum(["", "knowledge", "diary", "goal"]).default(""),
        sourceId: z.string().max(300).default(""),
      }),
    )
    .max(20)
    .default([]),
  files: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().max(300),
        size: z.number().min(0),
        mime: z.string().max(150),
      }),
    )
    .max(10)
    .default([]),
  sourceType: z.enum(["manual", "system"]).default("manual"),
  sourceApp: z.enum(["", "goal", "knowledge", "diary"]).default(""),
  sourceId: z.string().max(300).default(""),
  isSystemEvent: z.boolean().default(false),
  hidden: z.boolean().default(false),
  showInMemories: z.boolean().default(true),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type HappenedEntry = z.infer<typeof happenedEntrySchema>;
export type HappenedTag = { id: string; name: string; color: (typeof happenedColors)[number] };
export type HappenedSource = "goal" | "knowledge" | "diary";
export interface HappenedSettings {
  tags: HappenedTag[];
  sources: Record<HappenedSource, boolean>;
}
export function defaultHappenedSettings(): HappenedSettings {
  return {
    tags: [
      "日常",
      "学习",
      "写作",
      "K得机",
      "朋友",
      "美食",
      "旅行",
      "音乐",
      "情绪",
      "电影",
      "书籍",
      "学校",
      "照片",
      "地点",
      "工作",
    ].map((name, index) => ({
      id: `default-${index}`,
      name,
      color: happenedColors[index % happenedColors.length]!,
    })),
    sources: { goal: true, knowledge: true, diary: true },
  };
}
export function newHappenedEntry(userId: string, patch: Partial<HappenedEntry> = {}) {
  const now = new Date().toISOString();
  return happenedEntrySchema.parse({
    id: crypto.randomUUID(),
    userId,
    type: "text",
    date: localDate(),
    timestamp: now,
    createdAt: now,
    updatedAt: now,
    ...patch,
  });
}
export function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month) || calendarDay(`${month}-01`) === null)
    throw new Error("月份无效。");
  const [year, m] = month.split("-").map(Number);
  return { from: `${month}-01`, to: `${month}-${new Date(year!, m!, 0).getDate()}` };
}
export function shiftMonth(date: string, amount: number) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(year!, month! - 1 + amount, 1, 12);
  shifted.setDate(
    Math.min(day!, new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate()),
  );
  return localDate(shifted);
}
export function happenedDate(date: string, year = false) {
  const value = new Date(`${date}T12:00:00`);
  return value.toLocaleDateString("zh-CN", {
    ...(year ? { year: "numeric" as const } : {}),
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}
export function happenedTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
export function safeHappenedUrl(value: string) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
export function systemHappenedEvent(
  userId: string,
  sourceApp: HappenedSource,
  sourceId: string,
  timestamp: string,
  title: string,
  summary: string,
  patch: Partial<HappenedEntry> = {},
) {
  return newHappenedEntry(userId, {
    ...patch,
    id: `event:${sourceApp}:${sourceId}`,
    type: sourceApp,
    timestamp,
    date: localDate(new Date(timestamp)),
    title: title.slice(0, 300),
    content: summary.slice(0, 600),
    summary: summary.slice(0, 600),
    sourceType: "system",
    sourceApp,
    sourceId,
    isSystemEvent: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...patch,
  });
}
