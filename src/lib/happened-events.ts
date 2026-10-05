import {
  monthRange,
  systemHappenedEvent,
  type HappenedEntry,
  type HappenedSource,
} from "./happened";
import {
  happenedMeta,
  readHappenedSettings,
  saveHappenedEntries,
  saveHappenedMeta,
} from "./happened-store";
import type { KnowledgeCard } from "./knowledge";
import { localDate } from "./goals";

export interface HappenedEventAdapter {
  sourceApp: HappenedSource;
  collect: (
    userId: string,
    month: string,
    since: string,
  ) => Promise<{ entries: HappenedEntry[]; cursor: string }>;
}
const knowledgeSnapshots = new Map<string, KnowledgeCard[]>();
let knowledgeChannel: BroadcastChannel | undefined;
function listenForKnowledgeChanges() {
  if (!knowledgeChannel && typeof BroadcastChannel !== "undefined") {
    knowledgeChannel = new BroadcastChannel("kdeji-knowledge-v1");
    knowledgeChannel.onmessage = (event) => {
      if (typeof event.data === "string") knowledgeSnapshots.delete(event.data);
    };
  }
}
export const happenedEventAdapters: HappenedEventAdapter[] = [
  {
    sourceApp: "goal",
    collect: async (userId, month, since) => {
      const { readGoals } = await import("./goals");
      const goals = readGoals(userId).goals.filter(
        (goal) =>
          goal.completed &&
          localDate(new Date(goal.updatedAt)).startsWith(month) &&
          goal.updatedAt >= since,
      );
      return {
        entries: goals.map((goal) =>
          systemHappenedEvent(
            userId,
            "goal",
            goal.id,
            goal.updatedAt,
            `完成「${goal.title}」`,
            goal.note,
            { tags: ["default-3"], metadata: { goalType: goal.type } },
          ),
        ),
        cursor: goals.reduce((max, goal) => (goal.updatedAt > max ? goal.updatedAt : max), since),
      };
    },
  },
  {
    sourceApp: "knowledge",
    collect: async (userId, month, since) => {
      listenForKnowledgeChanges();
      let snapshot = knowledgeSnapshots.get(userId);
      if (!snapshot) {
        const { readKnowledge } = await import("./knowledge-store");
        snapshot = (await readKnowledge(userId)).cards;
        knowledgeSnapshots.set(userId, snapshot);
      }
      const cards = snapshot.filter(
        (card) => localDate(new Date(card.createdAt)).startsWith(month) && card.updatedAt >= since,
      );
      return {
        entries: cards.map((card) =>
          systemHappenedEvent(
            userId,
            "knowledge",
            card.id,
            card.createdAt,
            `创建知识卡「${card.title || "无题"}」`,
            card.content,
            {
              tags: ["default-3"],
              images: card.images.slice(0, 20),
              metadata: { sourceUpdatedAt: card.updatedAt },
            },
          ),
        ),
        cursor: cards.reduce((max, card) => (card.updatedAt > max ? card.updatedAt : max), since),
      };
    },
  },
  {
    sourceApp: "diary",
    collect: async (userId, month, since) => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { from, to } = monthRange(month);
      const entries: HappenedEntry[] = [];
      let cursor = since;
      // Only the requested month, ordered change pages. Never read the full diary database.
      for (let offset = 0; ; offset += 50) {
        const result = await supabase
          .from("diaries")
          .select("id,title,content,diary_date,created_at,updated_at")
          .eq("user_id", userId)
          .gte("diary_date", from)
          .lte("diary_date", to)
          .gte("updated_at", since || "1970-01-01T00:00:00Z")
          .order("updated_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + 49);
        if (result.error) throw new Error("此心一笺事件暂时无法同步，手动记录仍可使用。");
        for (const diary of result.data) {
          entries.push(
            systemHappenedEvent(
              userId,
              "diary",
              diary.id,
              diary.created_at,
              `写下日记「${diary.title || "无题"}」`,
              diary.content,
              {
                date: diary.diary_date,
                tags: ["default-3"],
                metadata: { sourceUpdatedAt: diary.updated_at },
              },
            ),
          );
          if (diary.updated_at > cursor) cursor = diary.updated_at;
        }
        if (result.data.length < 50) break;
      }
      return { entries, cursor };
    },
  },
];
const inFlight = new Map<string, Promise<string[]>>();
export function syncHappenedEvents(userId: string, month: string, force = false) {
  const key = `${userId}:${month}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const work = (async () => {
    const settings = await readHappenedSettings(userId);
    const warnings: string[] = [];
    await Promise.all(
      happenedEventAdapters.map(async (adapter) => {
        if (!settings.sources[adapter.sourceApp]) return;
        const metaKey = `sync:${adapter.sourceApp}:${month}`;
        const checkpoint = await happenedMeta(userId, metaKey, { cursor: "", checkedAt: 0 });
        if (
          !force &&
          adapter.sourceApp === "diary" &&
          Date.now() - checkpoint.checkedAt < 5 * 60_000
        )
          return;
        try {
          const result = await adapter.collect(userId, month, checkpoint.cursor);
          if (result.entries.length)
            await saveHappenedEntries(
              userId,
              result.entries.map((entry) => ({
                ...entry,
                tags: entry.tags.filter((id) => settings.tags.some((tag) => tag.id === id)),
              })),
              true,
            );
          await saveHappenedMeta(userId, metaKey, { cursor: result.cursor, checkedAt: Date.now() });
        } catch (error) {
          warnings.push(
            error instanceof Error ? error.message : `${adapter.sourceApp}事件同步失败。`,
          );
        }
      }),
    );
    return warnings;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, work);
  return work;
}
